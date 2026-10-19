import {AnalysisError, createEnergyAnalyzer, createOpenAIProvider, createCloudflareProvider, DEFAULT_MODEL, FREE_MODEL, validateAnalysisRequest} from './energy-analysis.mjs';
import {normalizeEconomyState, summarizeEconomy, validateEconomy} from '../economy-model.mjs';
import {createJevDecider,JevError,JEV_ATTEMPT_RESERVE_USD} from './jev-decisions.mjs';

const SITE_ORIGIN = 'https://the-prairie.github.io';
const DATA_ROOT = SITE_ORIGIN + '/canada-in-motion/data/';
const DAY = 86400000;
const LIMITS = Object.freeze({daily:10, monthly:100, visitorDaily:3, minute:6, concurrent:2});
const encoder = new TextEncoder();
const unavailable = () => new AnalysisError('unavailable', 'Live analysis is temporarily unavailable. The data and scenario calculations still work.', 503);
const json = (value, status=200, headers={}) => new Response(JSON.stringify(value), {status, headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'none'",...headers}});

export async function boundedJSON(request, maximum=8192, timeoutMs=5000) {
  if(Number(request.headers.get('Content-Length')) > maximum) throw new AnalysisError('body_too_large','The question is too long.',413);
  if(!request.body) throw new AnalysisError('invalid_request','Enter a question.',400);
  const reader=request.body.getReader();
  let timer;
  const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>{void reader.cancel().catch(()=>{});reject(new AnalysisError('request_timeout','The request took too long. Try again.',408));},timeoutMs);});
  const read=async()=>{
    const chunks=[];let size=0;
    while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>maximum){void reader.cancel();throw new AnalysisError('body_too_large','The question is too long.',413);}chunks.push(value);}
    const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
    try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{throw new AnalysisError('invalid_request','The request could not be read.',400);}
  };
  try{return await Promise.race([read(),timeout]);}finally{clearTimeout(timer);}
}

export function providerConfig(env) {
  if(env.AI_PROVIDER==='cloudflare')return {provider:'cloudflare',model:FREE_MODEL,ready:typeof env.AI?.run==='function'};
  if(env.AI_PROVIDER==='openai')return {provider:'openai',model:DEFAULT_MODEL,ready:Boolean(env.OPENAI_API_KEY)};
  return {provider:null,model:null,ready:false};
}
function jevBudget(env) {
  const value=env.JEV_BUDGET_MICRO_USD;
  return typeof value==='string'&&/^[1-9][0-9]{0,9}$/.test(value)&&Number.isSafeInteger(Number(value))?Number(value):0;
}
export function workspaceConfig(env) {
  const workspaceEnabled=env.WORKSPACE_ENABLED==='1';
  return {workspaceEnabled,jevEnabled:workspaceEnabled&&env.JEV_ENABLED==='1'&&typeof env.TYPESAFE_API_KEY==='string'&&env.TYPESAFE_API_KEY.length>0&&jevBudget(env)>0};
}
function configured(env) {
  const testKey=value=>/^[123]x0{10,}/.test(value||'');
  return env.AI_ENABLED==='1' && providerConfig(env).ready && Boolean(env.TURNSTILE_SECRET_KEY && env.VISITOR_HASH_KEY?.length>=32 && env.TURNSTILE_SITE_KEY && env.AI_QUOTA) && !testKey(env.TURNSTILE_SITE_KEY) && !testKey(env.TURNSTILE_SECRET_KEY);
}

export async function verifyVisitor(token, ip, env, fetchImpl=fetch) {
  if(typeof token!=='string'||!token.length||token.length>2048)throw new AnalysisError('verification_required','Complete the security check and try again.',403);
  let response, result;
  try {
    response=await fetchImpl('https://challenges.cloudflare.com/turnstile/v0/siteverify',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({secret:env.TURNSTILE_SECRET_KEY,response:token,remoteip:ip}),signal:AbortSignal.timeout(8000)});
    result=await boundedJSON(response,16384,8000);
  } catch {throw new AnalysisError('verification_unavailable','The security check is unavailable. Try again in a moment.',503);}
  if(!response.ok || result.success!==true || result.hostname!=='the-prairie.github.io' || result.action!=='energy_analysis')throw new AnalysisError('verification_failed','The security check expired or could not be verified. Try again.',403);
}

async function visitorID(ip, secret, now) {
  const key=await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const digest=await crypto.subtle.sign('HMAC',key,encoder.encode(`${new Date(now).toISOString().slice(0,10)}:${ip}`));
  return [...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
}

let evidenceCache;
let networkCache;
export async function loadPublishedNetwork(fetchImpl=fetch,now=Date.now()) {
  if(networkCache?.expires>now)return networkCache.data;
  try{
    const response=await fetchImpl(DATA_ROOT+'network.json',{signal:AbortSignal.timeout(8000),redirect:'manual',headers:{Accept:'application/json'}});
    if(!response.ok)return null;
    const data=await boundedJSON(response,1048576,8000);
    if(!Array.isArray(data.routes)||!Array.isArray(data.facilities)||!Array.isArray(data.sources)||data.routes.length>1000||data.facilities.length>1000||data.sources.length>50)return null;
    const sources=new Set(data.sources.map(source=>source.id));
    if(sources.size!==data.sources.length||data.sources.some(source=>typeof source.id!=='string'||typeof source.title!=='string'||!/^https:\/\//.test(source.url)))return null;
    const validRecord=record=>typeof record.id==='string'&&/^[a-z0-9-]{1,100}$/.test(record.id)&&sources.has(record.sourceId);
    if([...data.routes,...data.facilities].some(record=>!validRecord(record))||data.routes.some(route=>!Array.isArray(route.provinces)||route.provinces.some(code=>!['AB','BC','SK','MB','ON','QC','NB','NS','PE','NL','YT','NT','NU'].includes(code))))return null;
    networkCache={data,expires:now+300000};
    return data;
  }catch{return null;}
}
export async function loadPublishedEvidence(fetchImpl=fetch, now=Date.now()) {
  if(evidenceCache?.expires>now)return evidenceCache;
  const read=async file=>{
    const response=await fetchImpl(DATA_ROOT+file,{signal:AbortSignal.timeout(8000),redirect:'manual',headers:{Accept:'application/json'}});
    if(!response.ok)throw unavailable();
    return boundedJSON(response,1048576,8000);
  };
  const [data,debate]=await Promise.all([read('economy.json'),read('energy-debate.json')]);
  validateEconomy(data);
  const age=now-Date.parse(data.generatedAt);
  if(!Number.isFinite(age)||age>8*DAY||age < -DAY)throw new AnalysisError('data_unavailable','The economic data needs a fresh update before live analysis can run.',503);
  if(!Array.isArray(debate.sources)||!Array.isArray(debate.facts)||debate.sources.length>100||debate.facts.length>100)throw unavailable();
  for(const source of debate.sources)if(typeof source.id!=='string'||typeof source.title!=='string'||!/^https:\/\//.test(source.url))throw unavailable();
  for(const fact of debate.facts)if(typeof fact.id!=='string'||typeof fact.text!=='string'||fact.text.length>6000||!Array.isArray(fact.sourceIds)||fact.sourceIds.some(id=>!debate.sources.some(source=>source.id===id)))throw unavailable();
  evidenceCache={data,debate,expires:now+300000};
  return evidenceCache;
}

export class AnalysisQuota {
  constructor(ctx,env) {
    this.ctx=ctx;this.env=env;
    this.sql=ctx.storage.sql;
    this.sql.exec('CREATE TABLE IF NOT EXISTS counters (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires INTEGER NOT NULL)');
    this.sql.exec('CREATE TABLE IF NOT EXISTS leases (id TEXT PRIMARY KEY, expires INTEGER NOT NULL)');
    this.sql.exec('CREATE TABLE IF NOT EXISTS inference_spend (provider TEXT PRIMARY KEY, reserved_micro_usd INTEGER NOT NULL)');
  }
  async fetch(request) {
    if(new URL(request.url).pathname==='/api/analysis')return this.analyze(request);
    const input=await request.json();
    if(input.action==='release'){
      this.release(input.id);
      return json({ok:true});
    }
    if(input.action!=='reserve'||typeof input.visitor!=='string'||!/^[a-f0-9]{64}$/.test(input.visitor))return json({error:'Invalid reservation'},400);
    return json(await this.reserve(input.visitor));
  }
  release(id) {this.sql.exec('DELETE FROM leases WHERE id = ?',id);}
  reserveJev(amount) {
    const reservation=Math.round(amount*1e6);
    if(reservation!==Math.round(JEV_ATTEMPT_RESERVE_USD*1e6)||!workspaceConfig(this.env).jevEnabled)throw new JevError('budget_exhausted');
    this.ctx.storage.transactionSync(()=>{
      const spent=this.sql.exec('SELECT reserved_micro_usd FROM inference_spend WHERE provider = ?','jev').toArray()[0]?.reserved_micro_usd||0;
      if(spent+reservation>jevBudget(this.env))throw new JevError('budget_exhausted');
      this.sql.exec('INSERT INTO inference_spend (provider,reserved_micro_usd) VALUES (?,?) ON CONFLICT(provider) DO UPDATE SET reserved_micro_usd=reserved_micro_usd+excluded.reserved_micro_usd','jev',reservation);
    });
  }
  async reserve(visitor) {
    const now=Date.now();
    const date=new Date(now).toISOString();
    const day=date.slice(0,10),month=date.slice(0,7),minute=Math.floor(now/60000);
    const nextDay=Date.parse(day)+DAY;
    const nextMonth=Date.UTC(Number(date.slice(0,4)),Number(date.slice(5,7)),1);
    const result=this.ctx.storage.transactionSync(()=>{
      this.sql.exec('DELETE FROM leases WHERE expires <= ?',now);
      this.sql.exec('DELETE FROM counters WHERE expires <= ?',now);
      const active=this.sql.exec('SELECT count(*) AS count FROM leases').one().count;
      if(active>=LIMITS.concurrent)return {allowed:false,code:'busy',message:'Other questions are being answered. Try again in a minute.',retryAfter:60};
      const checks=[
        [`month:${month}`,LIMITS.monthly,nextMonth,'monthly_limit','The public analysis allowance has been used for this month. It resets on the first day of next month.'],
        [`day:${day}`,LIMITS.daily,nextDay,'daily_limit','The public analysis allowance has been used for today. It resets at midnight UTC.'],
        [`visitor:${day}:${visitor}`,LIMITS.visitorDaily,nextDay,'visitor_limit','This network has reached its daily allowance of three questions. It resets at midnight UTC.'],
        [`minute:${minute}`,LIMITS.minute,(minute+1)*60000,'rate_limit','Too many questions arrived at once. Try again in a minute.'],
      ];
      for(const [key,limit,expires,code,message] of checks){const rows=this.sql.exec('SELECT count FROM counters WHERE key = ?',key).toArray();if((rows[0]?.count||0)>=limit)return {allowed:false,code,message,retryAfter:Math.max(1,Math.ceil((expires-now)/1000))};}
      for(const [key,,expires] of checks)this.sql.exec('INSERT INTO counters (key,count,expires) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1',key,expires);
      const id=crypto.randomUUID();
      this.sql.exec('INSERT INTO leases (id,expires) VALUES (?,?)',id,now+120000);
      return {allowed:true,id};
    });
    await this.ctx.storage.setAlarm(now+DAY);
    return result;
  }
  async analyze(request) {
    const env=this.env;
    let reservation;
    if(request.method!=='POST'||request.headers.get('Origin')!==SITE_ORIGIN)return json({error:{message:'Open the public app to ask a question.'}},403);
    try {
      if(!configured(env))throw unavailable();
      if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type')||''))throw new AnalysisError('content_type','Send a JSON request.',415);
      const input=validateAnalysisRequest(await boundedJSON(request));
      const ip=request.headers.get('CF-Connecting-IP');
      if(!ip)throw unavailable();
      await verifyVisitor(request.headers.get('X-Turnstile-Token'),ip,env);
      const {data,debate}=await loadPublishedEvidence();
      const visitor=await visitorID(ip,env.VISITOR_HASH_KEY,Date.now());
      const admission=await this.reserve(visitor);
      if(!admission.allowed)return json({error:{code:admission.code,message:admission.message}},429,{'Retry-After':String(admission.retryAfter)});
      reservation=admission.id;
      const selected=providerConfig(env);
      const workspace=workspaceConfig(env);
      const provider=selected.provider==='cloudflare'?createCloudflareProvider({ai:env.AI}):createOpenAIProvider({apiKey:env.OPENAI_API_KEY});
      const network=workspace.workspaceEnabled?await loadPublishedNetwork():undefined;
      const decider=workspace.jevEnabled?createJevDecider({apiKey:env.TYPESAFE_API_KEY,reserveAttempt:amount=>this.reserveJev(amount)}):undefined;
      const analyze=createEnergyAnalyzer({data,debate,network,decider,workspaceEnabled:workspace.workspaceEnabled,normalizeState:normalizeEconomyState,summarize:summarizeEconomy,provider,model:selected.model,timeoutMs:60000,answerMode:selected.provider==='cloudflare'?'claims':'prose'});
      const result=await analyze(input);
      return json({...result,provider:selected.provider,dataVersion:data.generatedAt});
    } catch(error) {
      const failure=error instanceof AnalysisError?error:unavailable();
      return json({error:{code:failure.code,message:failure.message}},failure.status);
    } finally {
      if(reservation){try{this.release(reservation);}catch{/* Expiring leases recover interrupted storage writes. */}}
    }
  }
  async alarm() {
    const now=Date.now();
    this.sql.exec('DELETE FROM leases WHERE expires <= ?',now);
    this.sql.exec('DELETE FROM counters WHERE expires <= ?',now);
    if(this.sql.exec('SELECT count(*) AS count FROM counters').one().count)await this.ctx.storage.setAlarm(now+DAY);
  }
}

export default {
  async fetch(request,env) {
    const origin=request.headers.get('Origin');
    const cors=origin===SITE_ORIGIN?{'Access-Control-Allow-Origin':SITE_ORIGIN,Vary:'Origin'}:{Vary:'Origin'};
    const reply=(value,status=200,headers={})=>json(value,status,{...cors,...headers});
    const path=new URL(request.url).pathname;
    if(!['/api/analysis','/api/analysis/status'].includes(path))return reply({error:{message:'Not found.'}},404);
    if(origin && origin!==SITE_ORIGIN)return reply({error:{message:'Origin not allowed.'}},403);
    if(request.method==='OPTIONS'){
      const headers=(request.headers.get('Access-Control-Request-Headers')||'').toLowerCase().split(',').map(value=>value.trim()).filter(Boolean);
      if(origin!==SITE_ORIGIN||request.headers.get('Access-Control-Request-Method')!=='POST'||headers.some(header=>!['content-type','x-turnstile-token'].includes(header)))return reply({error:{message:'Origin not allowed.'}},403);
      return new Response(null,{status:204,headers:{...cors,'Access-Control-Allow-Methods':'POST','Access-Control-Allow-Headers':'Content-Type, X-Turnstile-Token','Access-Control-Max-Age':'600'}});
    }
    if(path==='/api/analysis/status'&&request.method==='GET'){
      const selected=providerConfig(env);
      return reply({available:configured(env),model:selected.model,provider:selected.provider,turnstileSiteKey:configured(env)?env.TURNSTILE_SITE_KEY:null,limits:LIMITS,...workspaceConfig(env)});
    }
    if(path!=='/api/analysis'||request.method!=='POST')return reply({error:{message:'Method not allowed.'}},405);
    if(origin!==SITE_ORIGIN)return reply({error:{message:'Open the public app to ask a question.'}},403);
    if(!configured(env))return reply({error:{code:'unavailable',message:unavailable().message}},503);
    try {
      // Keep the public Free-plan Worker within its small CPU budget. The SQLite
      // Durable Object owns validation, inference and transactional accounting.
      const service=env.AI_QUOTA.get(env.AI_QUOTA.idFromName('public-analysis-v1'));
      const response=await service.fetch(request);
      const headers=new Headers(response.headers);
      for(const [key,value] of Object.entries(cors))headers.set(key,value);
      return new Response(response.body,{status:response.status,headers});
    } catch {return reply({error:{code:'unavailable',message:unavailable().message}},503);}
  },
};
