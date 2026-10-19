import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {Miniflare,convertV4MiniflareOptions,Response as EdgeResponse} from 'miniflare';
import {JEV_MODEL} from '../../server/jev-decisions.mjs';
const SITE='https://the-prairie.github.io';
const economy=JSON.parse(await readFile(new URL('../../data/economy.json',import.meta.url)));
const debate=JSON.parse(await readFile(new URL('../../data/energy-debate.json',import.meta.url)));
const network=JSON.parse(await readFile(new URL('../../data/network.json',import.meta.url)));
const body={question:'Compare Alberta and Québec energy GDP.',state:{region:'AB',scenario:'Current Measures',year:2030,oilShock:10,duration:'persistent'}};
const output=value=>new EdgeResponse(JSON.stringify(value),{headers:{'Content-Type':'application/json'}});
const model=`import {WorkerEntrypoint} from 'cloudflare:workers';
export class Model extends WorkerEntrypoint {
  async run(_model,body){
    const input=JSON.parse(body.messages[1].content);
    if(input.claims)return {response:{answerability:'supported',claimIds:['observed-contribution']}};
    const result={state:input.state};
    if(body.response_format.json_schema.properties.investigation)result.investigation={regions:['AB','QC'],topics:['gdp'],metricIds:[],includeMap:true,requestedMeasure:'available'};
    return {response:result};
  }
}`;
async function fixture(t,{workspace=true,jev=true,budget='2688',missingKey=false,failJev=false,failNetwork=false}={}) {
  const persistence=await mkdtemp(path.join(os.tmpdir(),'hybrid-workspace-'));
  let calls=0,networkCalls=0,paidFallbacks=0,mf;
  const outbound=async request=>{
    const url=new URL(request.url);
    if(url.hostname==='api.openai.com'||url.hostname==='openrouter.ai'){paidFallbacks++;throw Error('Unapproved provider');}
    if(url.hostname==='challenges.cloudflare.com')return output({success:true,hostname:'the-prairie.github.io',action:'energy_analysis'});
    if(url.pathname.endsWith('/economy.json'))return output({...economy,generatedAt:new Date().toISOString()});
    if(url.pathname.endsWith('/energy-debate.json'))return output(debate);
    if(url.pathname.endsWith('/network.json')){networkCalls++;return failNetwork?new EdgeResponse('missing',{status:503}):output(network);}
    assert.equal(url.href,'https://api.typesafe.ai/v1/systemone');calls++;
    assert.equal(request.headers.get('Authorization'),'Bearer fixture-jev-secret');
    const input=await request.json();assert.equal(input.model,JEV_MODEL);assert.deepEqual(Object.keys(input.questions),['presentation','coverage']);
    if(failJev)return new EdgeResponse('private upstream message',{status:503});
    return output({model:JEV_MODEL,answers:{presentation:{type:'choice',choice:'comparison',confidence:0.8,probabilities:{geographic:0.1,comparison:0.8,scenario:0.05,evidence:0.05}},coverage:{type:'choice',choice:'supported',confidence:0.8,probabilities:{supported:0.8,partial:0.1,unsupported:0.1}}},usage:{input_tokens:2000}});
  };
  const start=()=>new Miniflare({...convertV4MiniflareOptions({workers:[
    {name:'api',modules:true,scriptPath:new URL('../../.worker-build/cloudflare-worker.js',import.meta.url).pathname,compatibilityDate:'2026-10-18',bindings:{AI_PROVIDER:'cloudflare',AI_ENABLED:'1',WORKSPACE_ENABLED:workspace?'1':'0',JEV_ENABLED:jev?'1':'0',JEV_BUDGET_MICRO_USD:budget,...(!missingKey?{TYPESAFE_API_KEY:'fixture-jev-secret'}:{}),TURNSTILE_SECRET_KEY:'fixture-secret',TURNSTILE_SITE_KEY:'fixture-site',VISITOR_HASH_KEY:'x'.repeat(40)},durableObjects:{AI_QUOTA:{className:'AnalysisQuota',useSQLite:true}},serviceBindings:{AI:{name:'model',entrypoint:'Model'}},outboundService:outbound,stripCfConnectingIp:false},
    {name:'model',modules:true,script:model,compatibilityDate:'2026-10-18'}
  ],cf:false}),resourcePersistencePath:persistence});
  mf=start();await mf.ready;
  t.after(async()=>{await mf.dispose();await rm(persistence,{recursive:true,force:true});});
  return {get calls(){return calls;},get networkCalls(){return networkCalls;},get paidFallbacks(){return paidFallbacks;},restart:async()=>{await mf.dispose();mf=start();await mf.ready;},status:async()=>{const response=await mf.dispatchFetch('https://api.example/api/analysis/status');return response.json();},post:(ip='203.0.113.1')=>mf.dispatchFetch('https://api.example/api/analysis',{method:'POST',headers:{Origin:SITE,'Content-Type':'application/json','CF-Connecting-IP':ip,'X-Turnstile-Token':'fixture-token'},body:JSON.stringify(body)})};
}

test('public Worker returns source-backed hybrid panels and reserves the Jev budget across restarts',async t=>{
  const f=await fixture(t);
  const status=await f.status();assert.equal(status.workspaceEnabled,true);assert.equal(status.jevEnabled,true);assert.ok(!JSON.stringify(status).includes('2688'));assert.ok(!JSON.stringify(status).includes('fixture-jev'));
  const first=await f.post();assert.equal(first.status,200);const firstResult=await first.json();
  assert.equal(firstResult.workspace.decision.provider,'jev');assert.equal(firstResult.workspace.panels[0].rows[0].value,163605.9);assert.equal(f.calls,1);assert.ok(firstResult.analysis.sources.length);
  assert.ok(!JSON.stringify(firstResult).includes('fixture-jev-secret'));
  await f.restart();
  const second=await f.post();assert.equal(second.status,200);const result=await second.json();
  assert.equal(result.workspace.decision.status,'budget-exhausted');assert.equal(result.workspace.panels[0].rows[0].value,163605.9);assert.equal(f.calls,1);assert.equal(f.paidFallbacks,0);
});

test('concurrent public questions cannot exceed one authorized Jev reservation',async t=>{
  const f=await fixture(t);
  const replies=await Promise.all([f.post('203.0.113.10'),f.post('203.0.113.11')]);
  assert.deepEqual(replies.map(response=>response.status),[200,200]);
  const results=await Promise.all(replies.map(response=>response.json()));
  assert.deepEqual(results.map(result=>result.workspace.decision.status).sort(),['accepted','budget-exhausted']);assert.equal(f.calls,1);
});

test('disabled Jev, absent credentials and absent budget all use the free workspace path',async t=>{
  for(const settings of [{jev:false},{missingKey:true},{budget:'0'},{budget:'invalid'}]){
    const f=await fixture(t,settings);const status=await f.status();assert.equal(status.workspaceEnabled,true);assert.equal(status.jevEnabled,false);
    const response=await f.post();assert.equal(response.status,200);const result=await response.json();assert.equal(result.workspace.decision.provider,'rules');assert.equal(result.workspace.decision.status,'disabled');assert.equal(f.calls,0);assert.equal(f.paidFallbacks,0);
  }
});

test('failed Jev consumes its reservation, returns the checked workspace and hides upstream details',async t=>{
  const f=await fixture(t,{failJev:true});
  const first=await f.post();assert.equal(first.status,200);const result=await first.json();assert.equal(result.workspace.decision.status,'unavailable');assert.ok(result.analysis.sources.length);assert.ok(!JSON.stringify(result).includes('private upstream'));
  const second=await f.post();assert.equal(second.status,200);assert.equal((await second.json()).workspace.decision.status,'budget-exhausted');assert.equal(f.calls,1);
});

test('the disabled workspace makes no Jev or infrastructure requests and preserves existing analysis',async t=>{
  const f=await fixture(t,{workspace:false});const status=await f.status();assert.equal(status.workspaceEnabled,false);assert.equal(status.jevEnabled,false);
  const response=await f.post();assert.equal(response.status,200);const result=await response.json();assert.ok(!Object.hasOwn(result,'workspace'));assert.ok(result.analysis.sources.length);assert.equal(f.calls,0);assert.equal(f.networkCalls,0);
});

test('an infrastructure fetch failure cannot disable economic comparisons',async t=>{
  const f=await fixture(t,{failNetwork:true,jev:false});const response=await f.post();assert.equal(response.status,200);const result=await response.json();assert.equal(result.workspace.panels[0].rows.length,2);assert.equal(f.calls,0);
});
