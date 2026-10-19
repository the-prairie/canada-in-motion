import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {Miniflare,convertV4MiniflareOptions,Response as EdgeResponse} from 'miniflare';

const SITE='https://the-prairie.github.io';
const state={region:'AB',scenario:'Current Measures',year:2030,oilShock:10,duration:'persistent'};
const payload={question:'How does Alberta contribute to energy income?',state};
const economy=JSON.parse(await readFile(new URL('../../data/economy.json',import.meta.url),'utf8'));
const debate=JSON.parse(await readFile(new URL('../../data/energy-debate.json',import.meta.url),'utf8'));
const output=value=>new EdgeResponse(JSON.stringify(value),{headers:{'Content-Type':'application/json'}});
let tokenCounter=0;

async function fixture(t,{enabled=true,providerFailure=false,testKey=false,stale=false,onProvider=async()=>{}}={}) {
  const persist=await mkdtemp(path.join(os.tmpdir(),'energy-edge-'));
  const used=new Set();let calls=0,verifications=0,mf;
  const outbound=async request=>{
    const url=new URL(request.url);
    if(url.hostname==='challenges.cloudflare.com'){
      verifications++;const value=await request.json();const replay=used.has(value.response);used.add(value.response);
      return output({success:!replay&&value.response!=='invalid',hostname:value.response==='wrong-host'?'attacker.example':'the-prairie.github.io',action:value.response==='wrong-action'?'other':'energy_analysis'});
    }
    if(url.pathname.endsWith('/economy.json'))return output({...economy,generatedAt:new Date(Date.now()-(stale?10*86400000:0)).toISOString()});
    if(url.pathname.endsWith('/energy-debate.json'))return output(debate);
    assert.equal(url.href,'https://api.openai.com/v1/responses');calls++;
    await onProvider(calls);
    if(providerFailure)return new EdgeResponse('private provider message',{status:401});
    const body=await request.json();
    assert.equal(body.store,false);assert.equal(body.reasoning.effort,'low');assert.equal(body.max_output_tokens,2200);
    const input=JSON.parse(body.input);
    const value=body.text.format.name==='energy_scenario'?{state:input.state}:{headline:'Energy income depends on place',blocks:[{text:'The selected economy records [[n1]] million CAD in energy-sector value added.',sourceIds:[input.evidence.numbers[1].sourceIds[0]],evidenceIds:['n1']}]};
    return output({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(value)}]}]});
  };
  const start=()=>new Miniflare({...convertV4MiniflareOptions({name:'test-api',modules:true,scriptPath:new URL('../../.worker-build/cloudflare-worker.js',import.meta.url).pathname,compatibilityDate:'2026-10-18',bindings:{AI_ENABLED:enabled?'1':'0',OPENAI_API_KEY:'fixture-openai-secret',TURNSTILE_SECRET_KEY:'fixture-turnstile-secret',TURNSTILE_SITE_KEY:'fixture-sitekey',VISITOR_HASH_KEY:'fixture-private-hash-key-at-least-32-characters'},durableObjects:{AI_QUOTA:{className:'AnalysisQuota',useSQLite:true}},outboundService:outbound,stripCfConnectingIp:false,cf:false}),resourcePersistencePath:persist});
  mf=start();
  if(testKey){const options=convertV4MiniflareOptions({name:'test-api',modules:true,scriptPath:new URL('../../.worker-build/cloudflare-worker.js',import.meta.url).pathname,compatibilityDate:'2026-10-18',bindings:{AI_ENABLED:'1',OPENAI_API_KEY:'fixture',TURNSTILE_SECRET_KEY:'1x0000000000000000000000000000000AA',TURNSTILE_SITE_KEY:'1x00000000000000000000AA',VISITOR_HASH_KEY:'fixture-private-hash-key-at-least-32-characters'},durableObjects:{AI_QUOTA:{className:'AnalysisQuota',useSQLite:true}},outboundService:outbound,cf:false});await mf.setOptions(options);}
  await mf.ready;
  t.after(async()=>{await mf.dispose();await rm(persist,{recursive:true,force:true});});
  return {
    get mf(){return mf;},get calls(){return calls;},get verifications(){return verifications;},
    restart:async()=>{await mf.dispose();mf=start();await mf.ready;},
    post:(body=payload,headers={})=>mf.dispatchFetch('https://worker.example/api/analysis',{method:'POST',headers:{Origin:SITE,'Content-Type':'application/json','CF-Connecting-IP':'203.0.113.2','X-Turnstile-Token':`valid-${++tokenCounter}`,...headers},body:JSON.stringify(body)}),
  };
}

test('real Worker runtime returns checked evidence through exact-origin CORS',async t=>{
  const f=await fixture(t);
  const status=await f.mf.dispatchFetch('https://worker.example/api/analysis/status',{headers:{Origin:SITE}});
  assert.equal((await status.json()).available,true);
  const response=await f.post();assert.equal(response.status,200);assert.equal(response.headers.get('Access-Control-Allow-Origin'),SITE);assert.equal(response.headers.get('Cache-Control'),'no-store');
  const value=await response.json();assert.ok(value.analysis.blocks[0].text.includes('million CAD'));assert.ok(value.dataVersion);assert.equal(f.calls,2);
  const preflight=await f.mf.dispatchFetch('https://worker.example/api/analysis',{method:'OPTIONS',headers:{Origin:SITE,'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'content-type,x-turnstile-token'}});
  assert.equal(preflight.status,204);assert.equal(preflight.headers.get('Access-Control-Allow-Credentials'),null);
});

test('origin, malformed input and oversized body are rejected before verification or paid calls',async t=>{
  const f=await fixture(t);
  assert.equal((await f.post(payload,{Origin:'https://evil.example'})).status,403);
  assert.equal((await f.post(payload,{Origin:''})).status,403);
  assert.equal((await f.post(payload,{'Content-Type':'text/plain'})).status,415);
  assert.equal((await f.post({...payload,state:{region:'unknown'}})).status,400);
  assert.equal((await f.post({...payload,question:'a'.repeat(9000)})).status,413);
  assert.equal(f.calls,0);assert.equal(f.verifications,0);
  assert.equal((await f.mf.dispatchFetch('https://worker.example/.env.local')).status,404);
});

test('Turnstile rejects replay, hostname mismatch and action mismatch',async t=>{
  const f=await fixture(t);
  for(const token of ['invalid','wrong-host','wrong-action'])assert.equal((await f.post(payload,{'X-Turnstile-Token':token})).status,403);
  assert.equal(f.calls,0);
  assert.equal((await f.post(payload,{'X-Turnstile-Token':'once'})).status,200);
  assert.equal((await f.post(payload,{'X-Turnstile-Token':'once'})).status,403);
  assert.equal(f.calls,2);
});

test('visitor quota persists across an actual Worker runtime restart',async t=>{
  const f=await fixture(t);
  assert.equal((await f.post()).status,200);
  await f.restart();
  assert.equal((await f.post()).status,200);assert.equal((await f.post()).status,200);
  const blocked=await f.post();assert.equal(blocked.status,429);assert.equal((await blocked.json()).error.code,'visitor_limit');assert.ok(Number(blocked.headers.get('Retry-After'))>0);assert.equal(f.calls,6);
});

test('atomic concurrency admission allows only two reservations and releases only the named lease',async t=>{
  const f=await fixture(t);
  const namespace=await f.mf.getDurableObjectNamespace('AI_QUOTA');
  const quota=namespace.get(namespace.idFromName('concurrency-test'));
  const reserve=visitor=>quota.fetch('https://quota/reserve',{method:'POST',body:JSON.stringify({action:'reserve',visitor:visitor.repeat(64)})}).then(r=>r.json());
  const results=await Promise.all([reserve('a'),reserve('b'),reserve('c'),reserve('d')]);
  const admitted=results.filter(r=>r.allowed);assert.equal(admitted.length,2);assert.equal(results.filter(r=>r.code==='busy').length,2);
  await quota.fetch('https://quota/release',{method:'POST',body:JSON.stringify({action:'release',id:admitted[0].id})});
  assert.equal((await reserve('e')).allowed,true);
  assert.equal((await reserve('f')).code,'busy');
});

test('two public analyses overlap while a third is rejected and internal quota routes stay private',async t=>{
  let release,ready,timer;
  const held=new Promise(resolve=>{release=resolve;});
  const entered=new Promise(resolve=>{ready=resolve;});
  const f=await fixture(t,{onProvider:async count=>{if(count===2)ready();if(count<=2)await held;}});
  for(const route of ['/reserve','/release','/api/reserve','/api/release']){
    const response=await f.mf.dispatchFetch('https://worker.example'+route,{method:'POST',headers:{Origin:SITE},body:JSON.stringify({action:'release',id:'any'})});
    assert.equal(response.status,404);
  }
  const first=f.post(payload,{'CF-Connecting-IP':'203.0.113.11'});
  const second=f.post(payload,{'CF-Connecting-IP':'203.0.113.12'});
  try {
    await Promise.race([entered,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('The second analysis was serialized behind the first')),3000);})]);
    const third=await f.post(payload,{'CF-Connecting-IP':'203.0.113.13'});
    assert.equal(third.status,429);assert.equal((await third.json()).error.code,'busy');assert.equal(f.calls,2);
  } finally {clearTimeout(timer);release();}
  const results=await Promise.all([first,second]);assert.deepEqual(results.map(response=>response.status),[200,200]);
  assert.equal((await f.post(payload,{'CF-Connecting-IP':'203.0.113.13'})).status,200);assert.equal(f.calls,6);
});

test('failed provider calls consume allowance, release concurrency and never expose provider details',async t=>{
  const f=await fixture(t,{providerFailure:true});
  for(let i=0;i<3;i++){const response=await f.post();assert.equal(response.status,503);assert.ok(!(await response.text()).includes('private provider'));}
  assert.equal((await f.post()).status,429);assert.equal(f.calls,3);
});

test('disabled deployment reports unavailable and makes no outbound calls',async t=>{
  const f=await fixture(t,{enabled:false});
  const response=await f.mf.dispatchFetch('https://worker.example/api/analysis/status');assert.equal((await response.json()).available,false);
  assert.equal((await f.post()).status,503);assert.equal(f.calls,0);assert.equal(f.verifications,0);
});

test('public deployment refuses known Turnstile test keys',async t=>{
  const f=await fixture(t,{testKey:true});
  const response=await f.mf.dispatchFetch('https://worker.example/api/analysis/status');assert.equal((await response.json()).available,false);
  assert.equal((await f.post()).status,503);assert.equal(f.calls,0);assert.equal(f.verifications,0);
});

test('stale published economics stop before a paid call',async t=>{
  const f=await fixture(t,{stale:true});
  const response=await f.post();assert.equal(response.status,503);assert.equal((await response.json()).error.code,'data_unavailable');assert.equal(f.calls,0);
});
