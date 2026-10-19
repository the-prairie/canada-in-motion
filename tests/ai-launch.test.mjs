import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {AnalysisQuota,boundedJSON,verifyVisitor} from '../server/cloudflare-worker.mjs';
import {loadAnalysisStatus} from '../ai-client.mjs';
import {publicAIConfig,cspForAI,CSP} from '../scripts/build-public.mjs';
import {createOpenAIProvider} from '../server/energy-analysis.mjs';

function quotaFixture(t) {
  const db=new DatabaseSync(':memory:');t.after(()=>db.close());
  const sql={exec(query,...values){const statement=db.prepare(query);const rows=statement.columns().length?statement.all(...values):[];if(!statement.columns().length)statement.run(...values);return {toArray:()=>rows,one:()=>{assert.equal(rows.length,1);return rows[0];}};}};
  const quota=new AnalysisQuota({storage:{sql,setAlarm:async()=>{},transactionSync:fn=>{db.exec('BEGIN');try{const result=fn();db.exec('COMMIT');return result;}catch(error){db.exec('ROLLBACK');throw error;}}}});
  const call=body=>quota.fetch(new Request('https://quota/',{method:'POST',body:JSON.stringify(body)})).then(r=>r.json());
  return {reserve:visitor=>call({action:'reserve',visitor:visitor.toString(16).padStart(64,'0')}),release:id=>call({action:'release',id})};
}

test('global daily and monthly limits survive changing visitors and reset only at UTC boundaries',async t=>{
  const f=quotaFixture(t);const realNow=Date.now;let time=Date.parse('2026-10-01T00:00:00Z');Date.now=()=>time;t.after(()=>{Date.now=realNow;});
  for(let day=0;day<5;day++){
    time=Date.parse(`2026-10-0${day+1}T00:00:00Z`);
    for(let i=0;i<20;i++){
      time+=61000;const result=await f.reserve(day*100+i);assert.equal(result.allowed,true);await f.release(result.id);
    }
    const result=await f.reserve(999);assert.equal(result.code,day===4?'monthly_limit':'daily_limit');
  }
  time=Date.parse('2026-10-31T23:59:00Z');assert.equal((await f.reserve(999)).code,'monthly_limit');
  time=Date.parse('2026-11-01T00:00:00Z');assert.equal((await f.reserve(999)).allowed,true);
});

test('minute limits and abandoned leases recover without clearing paid request counts',async t=>{
  const f=quotaFixture(t);const realNow=Date.now;let time=Date.parse('2026-10-01T12:00:00Z');Date.now=()=>time;t.after(()=>{Date.now=realNow;});
  for(let i=0;i<6;i++){const result=await f.reserve(i);assert.equal(result.allowed,true);await f.release(result.id);}
  assert.equal((await f.reserve(7)).code,'rate_limit');time+=60001;
  assert.equal((await f.reserve(8)).allowed,true);assert.equal((await f.reserve(9)).allowed,true);assert.equal((await f.reserve(10)).code,'busy');
  time+=120001;assert.equal((await f.reserve(10)).allowed,true);
});

test('public configuration permits one exact HTTPS origin and leaves the default CSP closed',()=>{
  assert.deepEqual(publicAIConfig({apiOrigin:null}),{apiOrigin:null});assert.equal(cspForAI({apiOrigin:null}),CSP);
  for(const origin of ['http://worker.example','https://worker.example/path','https://user:password@worker.example','https://worker.example/?x=1'])assert.throws(()=>publicAIConfig({apiOrigin:origin}));
  assert.throws(()=>publicAIConfig({apiOrigin:null,OPENAI_API_KEY:'secret'}));
  const policy=cspForAI(publicAIConfig({apiOrigin:'https://worker.example'}));assert.ok(policy.includes("connect-src 'self' https://worker.example"));assert.ok(policy.includes('frame-src https://challenges.cloudflare.com'));assert.ok(!policy.includes('*'));
});

test('browser client discovers its endpoint without sending credentials',async()=>{
  const calls=[];
  const status=await loadAnalysisStatus(async(url,options)=>{calls.push({url,options});return Response.json(url==='ai-config.json'?{apiOrigin:'https://worker.example'}:{available:true,turnstileSiteKey:'public'});});
  assert.equal(status.endpoint,'https://worker.example/api/analysis');assert.equal(calls[1].options.credentials,'omit');
  await assert.rejects(loadAnalysisStatus(async()=>Response.json({apiOrigin:'https://worker.example/path'})),/Invalid analysis/);
});

test('streaming JSON read rejects excess bytes, malformed UTF-8 and a stalled body',async()=>{
  await assert.rejects(boundedJSON(new Response('a'.repeat(9000))),error=>error.status===413);
  await assert.rejects(boundedJSON(new Response(new Uint8Array([0xff,0xff]))),error=>error.status===400);
  await assert.rejects(boundedJSON(new Response(new ReadableStream({pull(){return new Promise(()=>{});}})),100,5),error=>error.status===408);
});

test('verification failure and provider input limits stop before a paid request',async()=>{
  let calls=0;
  await assert.rejects(verifyVisitor('', '192.0.2.1',{},async()=>{calls++;}),error=>error.status===403);assert.equal(calls,0);
  const provider=createOpenAIProvider({apiKey:'fixture',fetchImpl:async()=>{calls++;}});
  await assert.rejects(provider({input:{text:'a'.repeat(51000)},schema:{},name:'large'}),error=>error.code==='evidence_too_large');assert.equal(calls,0);
});
