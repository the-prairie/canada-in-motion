import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {Miniflare,convertV4MiniflareOptions,Response as EdgeResponse} from 'miniflare';
import {FREE_MODEL} from '../../server/energy-analysis.mjs';
const SITE='https://the-prairie.github.io';
const data=JSON.parse(await readFile(new URL('../../data/economy.json',import.meta.url)));
const debate=JSON.parse(await readFile(new URL('../../data/energy-debate.json',import.meta.url)));
const fakeAI=`import {WorkerEntrypoint} from 'cloudflare:workers';
export class Model extends WorkerEntrypoint {
  async run(model,body){
    if(this.env.FAIL)throw Error('private upstream error');
    if(model!==${JSON.stringify(FREE_MODEL)})throw Error('Wrong model');
    if(body.response_format.type!=='json_schema'||body.stream!==false)throw Error('Wrong schema mode');
    const input=JSON.parse(body.messages[1].content);
    if(!input.evidence){if(body.max_tokens!==256)throw Error('Planner budget');return {response:{state:input.state}};}
    if(body.max_tokens!==1200||!input.evidence.contexts)throw Error('Explanation contract');
    return {response:JSON.stringify({headline:'Energy contributes to provincial income',blocks:[{text:'Observed energy value added is [[n1]] million CAD.',sourceIds:input.evidence.numbers[1].sourceIds,evidenceIds:['n1']}]})};
  }
}`;
async function fixture(t,{fail=false,missing=false}={}){
  const persist=await mkdtemp(path.join(os.tmpdir(),'free-ai-edge-'));let paidCalls=0;
  const outbound=async req=>{
    const u=new URL(req.url);let body;
    if(u.hostname==='api.openai.com'){paidCalls++;throw Error('Unexpected paid fallback');}
    if(u.hostname==='challenges.cloudflare.com')body={success:true,hostname:'the-prairie.github.io',action:'energy_analysis'};
    else if(u.pathname.endsWith('/economy.json'))body={...data,generatedAt:new Date().toISOString()};
    else if(u.pathname.endsWith('/energy-debate.json'))body=debate;
    else throw Error('Unexpected network request');
    return new EdgeResponse(JSON.stringify(body),{headers:{'Content-Type':'application/json'}});
  };
  const mf=new Miniflare({...convertV4MiniflareOptions({workers:[
    {name:'api',modules:true,scriptPath:new URL('../../.worker-build/cloudflare-worker.js',import.meta.url).pathname,compatibilityDate:'2026-10-18',bindings:{AI_PROVIDER:'cloudflare',AI_ENABLED:'1',OPENAI_API_KEY:'must-never-be-used',TURNSTILE_SECRET_KEY:'fixture-secret',TURNSTILE_SITE_KEY:'fixture-sitekey',VISITOR_HASH_KEY:'x'.repeat(40)},durableObjects:{AI_QUOTA:{className:'AnalysisQuota',useSQLite:true}},serviceBindings:missing?{}:{AI:{name:'free-model',entrypoint:'Model'}},outboundService:outbound,stripCfConnectingIp:false},
    {name:'free-model',modules:true,script:fakeAI,compatibilityDate:'2026-10-18',bindings:{FAIL:fail}}
  ],cf:false}),resourcePersistencePath:persist});
  await mf.ready;t.after(async()=>{await mf.dispose();await rm(persist,{recursive:true,force:true});});
  return {mf,get paidCalls(){return paidCalls;},post:()=>mf.dispatchFetch('https://api.example/api/analysis',{method:'POST',headers:{Origin:SITE,'Content-Type':'application/json','CF-Connecting-IP':'203.0.113.9','X-Turnstile-Token':'verified-fixture'},body:JSON.stringify({question:'How does Alberta contribute?',state:{region:'AB',scenario:'Current Measures',year:2030,oilShock:-10,duration:'persistent'}})})};
}
test('free binding completes both stages in workerd and identifies provider consistently',async t=>{
  const f=await fixture(t);
  const status=await(await f.mf.dispatchFetch('https://api.example/api/analysis/status')).json();
  assert.equal(status.available,true);assert.equal(status.provider,'cloudflare');assert.equal(status.model,FREE_MODEL);assert.equal(status.limits.daily,10);
  const response=await f.post();assert.equal(response.status,200);const result=await response.json();
  assert.equal(result.provider,status.provider);assert.equal(result.model,status.model);assert.ok(result.analysis.sources.length);assert.equal(f.paidCalls,0);
});
test('free binding failure or absence never invokes OpenAI',async t=>{
  for(const options of [{fail:true},{missing:true}]){
    const f=await fixture(t,options);const response=await f.post();assert.equal(response.status,503);assert.ok(!(await response.text()).includes('private'));assert.equal(f.paidCalls,0);
  }
});
