import path from 'node:path';
import { promises as fs } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createPublicServer } from '../scripts/serve-public.mjs';
import { ROOT } from '../scripts/build-public.mjs';
import { AnalysisError, DEFAULT_MODEL, createEnergyAnalyzer, createOpenAIProvider, validateAnalysisRequest } from './energy-analysis.mjs';
const JSON_HEADERS={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'none'; frame-ancestors 'none'"};
const LOCAL_HOSTS=new Set(['127.0.0.1','localhost','[::1]']);
function reply(response,status,payload) { response.writeHead(status,JSON_HEADERS);response.end(JSON.stringify(payload)); }
async function readBody(request,maxBytes) {
  if(request.headers['content-type']?.split(';')[0].trim()!=='application/json')throw new AnalysisError('content_type','Send an application/json request.',415);
  if(Number(request.headers['content-length'])>maxBytes)throw new AnalysisError('request_too_large','The request is too large.',413);
  let timer;
  const read=async()=>{
    let size=0;const chunks=[];
    for await(const chunk of request){size+=chunk.length;if(size>maxBytes)throw new AnalysisError('request_too_large','The request is too large.',413);chunks.push(chunk);}
    try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new AnalysisError('invalid_json','The request must contain valid JSON.',400);}
  };
  try{return await Promise.race([read(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new AnalysisError('request_timeout','The request body took too long.',408)),5000);})]);}
  finally{clearTimeout(timer);}
}
export async function createAnalysisServer({directory=path.join(ROOT,'dist'),analyze,model=DEFAULT_MODEL,provider='openai',workspaceEnabled=false,jevEnabled=false,available=Boolean(analyze),publicOrigin=null,maxConcurrent=2,perMinute=6,dailyLimit=20,maxBodyBytes=8192,now=Date.now}={}) {
  if(publicOrigin) { const url=new URL(publicOrigin);if(url.protocol!=='https:'||url.origin!==publicOrigin)throw new Error('PUBLIC_ORIGIN must be an HTTPS origin without a path'); }
  for(const value of [maxConcurrent,perMinute,dailyLimit,maxBodyBytes])if(!Number.isInteger(value)||value<1)throw new Error('Limits must be positive integers');
  const server=await createPublicServer(directory);
  const serve=server.listeners('request')[0];server.removeAllListeners('request');
  let active=0,day='',dailyCount=0;let recent=[];
  server.on('request',async(request,response)=>{
    let origin;
    try {
      const host=request.headers.host;
      if(!host||host.includes('@')||/[\s\\]/.test(host))throw new Error();
      origin=new URL(`${publicOrigin?'https':'http'}://${host}`).origin;
      const parsed=new URL(origin);
      if(publicOrigin ? origin!==publicOrigin : !LOCAL_HOSTS.has(parsed.hostname)||Number(parsed.port||80)!==request.socket.localPort)throw new Error();
    } catch {reply(response,403,{error:{code:'host_forbidden',message:'This host is not allowed.'}});return;}
    const requestPath=request.url.split('?')[0];
    if(!requestPath.startsWith('/api/')){serve(request,response);return;}
    if(request.headers.origin&&request.headers.origin!==origin){reply(response,403,{error:{code:'origin_forbidden',message:'Use the app on the same origin.'}});return;}
    if(requestPath==='/api/analysis/status'&&request.method==='GET'){reply(response,200,{available,model,provider,workspaceEnabled,jevEnabled:workspaceEnabled&&jevEnabled});return;}
    if(requestPath!=='/api/analysis'){reply(response,404,{error:{code:'not_found',message:'Not found.'}});return;}
    if(request.method!=='POST'){response.setHeader('Allow','POST');reply(response,405,{error:{code:'method_not_allowed',message:'Use POST.'}});return;}
    if(request.headers.origin!==origin||request.headers['sec-fetch-site']==='cross-site'){reply(response,403,{error:{code:'origin_forbidden',message:'Use the app on the same origin.'}});return;}
    if(!available){reply(response,503,{error:{code:'analysis_disabled',message:'AI analysis is not configured on this server. The data and scenario calculations still work.'}});return;}
    let admitted=false;
    try {
      const input=validateAnalysisRequest(await readBody(request,maxBodyBytes));
      const time=now(),currentDay=new Date(time).toISOString().slice(0,10);
      if(day!==currentDay){day=currentDay;dailyCount=0;}
      recent=recent.filter(stamp=>stamp>time-60000);
      if(active>=maxConcurrent||recent.length>=perMinute||dailyCount>=dailyLimit)throw new AnalysisError('analysis_limit','The analysis limit has been reached. Try again later.',429);
      active++;dailyCount++;recent.push(time);admitted=true;
      reply(response,200,await analyze(input));
    } catch(error) {
      const safe=error instanceof AnalysisError?error:new AnalysisError('analysis_unavailable','AI analysis is unavailable. The data and scenario calculations still work.',503);
      if(!response.headersSent&&!response.destroyed)reply(response,safe.status,{error:{code:safe.code,message:safe.message}});
    } finally {if(admitted)active--;}
  });
  return server;
}
async function main() {
  try{process.loadEnvFile(path.join(ROOT,'.env.local'));}catch(error){if(error.code!=='ENOENT')throw new Error('Could not load the local environment file');}
  const host=process.env.HOST||'127.0.0.1';
  const local=['127.0.0.1','localhost','::1'].includes(host);
  const publicOrigin=process.env.PUBLIC_ORIGIN||null;
  if(!local&&(!publicOrigin||process.env.AI_PUBLIC_GATEWAY_READY!=='1'))throw new Error('Public binding requires PUBLIC_ORIGIN and AI_PUBLIC_GATEWAY_READY=1 after gateway access and quota controls are configured');
  const model=process.env.OPENAI_MODEL||DEFAULT_MODEL;
  const port=Number(process.env.PORT||4175);
  if(!Number.isInteger(port)||port<1||port>65535)throw new Error('Invalid PORT');
  const limit=(name,fallback)=>{const value=Number(process.env[name]||fallback);if(!Number.isInteger(value)||value<1)throw new Error(`Invalid ${name}`);return value;};
  let analyze;
  const workspaceEnabled=process.env.WORKSPACE_ENABLED==='1';
  if(process.env.OPENAI_API_KEY) {
    const {validateEconomy,normalizeEconomyState,summarizeEconomy}=await import('../economy-model.mjs');
    const data=JSON.parse(await fs.readFile(path.join(ROOT,'data/economy.json'),'utf8'));
    validateEconomy(data);
    const debate=JSON.parse(await fs.readFile(new URL('../data/energy-debate.json',import.meta.url),'utf8'));
    const network=workspaceEnabled?JSON.parse(await fs.readFile(new URL('../data/network.json',import.meta.url),'utf8')):undefined;
    const flows=workspaceEnabled?JSON.parse(await fs.readFile(path.join(ROOT,'data/energy-flows.json'),'utf8')):undefined;
    const fiscal=workspaceEnabled?JSON.parse(await fs.readFile(path.join(ROOT,'data/provincial-impacts.json'),'utf8')):undefined;
    let forecast;
    if(workspaceEnabled){
      try{
        const {validateProvincialForecast}=await import('../provincial-forecast-model.mjs');
        forecast=JSON.parse(await fs.readFile(path.join(ROOT,'data/provincial-forecasts.json'),'utf8'));
        validateProvincialForecast(forecast);
      }catch{forecast=undefined;}
    }
    analyze=createEnergyAnalyzer({data,network,flows,fiscal,forecast,workspaceEnabled,normalizeState:normalizeEconomyState,summarize:summarizeEconomy,debate,model,provider:createOpenAIProvider({apiKey:process.env.OPENAI_API_KEY,model}),timeoutMs:limit('AI_TIMEOUT_MS',60000)});
  }
  const server=await createAnalysisServer({analyze,model,workspaceEnabled,publicOrigin,maxConcurrent:limit('AI_CONCURRENCY',2),perMinute:limit('AI_PER_MINUTE',6),dailyLimit:limit('AI_DAILY_LIMIT',20)});
  server.listen(port,host,()=>console.log(`Canada in Motion: http://${host}:${port}/. AI ${analyze?'configured':'disabled'}.`));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(()=>{console.error('The analysis server could not start. Check the build, data, environment and hosting settings.');process.exitCode=1;});
