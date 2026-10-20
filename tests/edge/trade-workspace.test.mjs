import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {Miniflare,convertV4MiniflareOptions,Response as EdgeResponse} from 'miniflare';

const [economy,debate,network,flows,fiscal]=await Promise.all(['economy','energy-debate','network','energy-flows','provincial-impacts'].map(name=>readFile(new URL(`../../data/${name}.json`,import.meta.url),'utf8').then(JSON.parse)));
const state={region:'AB',scenario:'Current Measures',year:2030,oilShock:10,duration:'persistent'};
const output=value=>new EdgeResponse(JSON.stringify(value),{headers:{'Content-Type':'application/json'}});
const model=`import {WorkerEntrypoint} from 'cloudflare:workers';
export class Model extends WorkerEntrypoint { async run(_model,body){
const input=JSON.parse(body.messages[1].content); const gdp=input.question.includes('GDP');
return {response:{state:input.state,investigation:{regions:['AB','BC'],topics:[gdp?'gdp':'energy-flows'],metricIds:[],includeMap:true,requestedMeasure:'available',energyTrade:{commodity:'oil',year:null,shockPct:10,linkScope:'touching'}}}};
}}`;
async function fixture(t,{badFlows=false,badFiscal=false,staleFlows=false}={}) {
  const persistence=await mkdtemp(path.join(os.tmpdir(),'trade-edge-'));
  let flowReads=0,fiscalReads=0;
  const outbound=async request=>{
    const url=new URL(request.url);
    if(url.hostname==='challenges.cloudflare.com')return output({success:true,hostname:'the-prairie.github.io',action:'energy_analysis'});
    if(url.pathname.endsWith('/economy.json'))return output({...economy,generatedAt:new Date().toISOString()});
    if(url.pathname.endsWith('/energy-debate.json'))return output(debate);
    if(url.pathname.endsWith('/network.json'))return output(network);
    if(url.pathname.endsWith('/energy-flows.json')){flowReads++;return output({...flows,retrievedAt:new Date(Date.now()-(staleFlows?10*86400000:0)).toISOString(),...(badFlows?{schemaVersion:999}:{})});}
    if(url.pathname.endsWith('/provincial-impacts.json')){fiscalReads++;return badFiscal?new EdgeResponse('unavailable',{status:503}):output({...fiscal,generatedAt:new Date().toISOString()});}
    throw Error('No additional provider or arbitrary URL is authorized');
  };
  const mf=new Miniflare({...convertV4MiniflareOptions({workers:[
    {name:'api',modules:true,scriptPath:new URL('../../.worker-build/cloudflare-worker.js',import.meta.url).pathname,compatibilityDate:'2026-10-18',bindings:{AI_PROVIDER:'cloudflare',AI_ENABLED:'1',WORKSPACE_ENABLED:'1',JEV_ENABLED:'0',TURNSTILE_SECRET_KEY:'fixture-secret',TURNSTILE_SITE_KEY:'fixture-site',VISITOR_HASH_KEY:'x'.repeat(40)},durableObjects:{AI_QUOTA:{className:'AnalysisQuota',useSQLite:true}},serviceBindings:{AI:{name:'model',entrypoint:'Model'}},outboundService:outbound,stripCfConnectingIp:false},
    {name:'model',modules:true,script:model,compatibilityDate:'2026-10-18'},
  ],cf:false}),resourcePersistencePath:persistence});
  await mf.ready;t.after(async()=>{await mf.dispose();await rm(persistence,{recursive:true,force:true});});
  return {get flowReads(){return flowReads;},get fiscalReads(){return fiscalReads;},post:question=>mf.dispatchFetch('https://api.example/api/analysis',{method:'POST',headers:{Origin:'https://the-prairie.github.io','Content-Type':'application/json','CF-Connecting-IP':'203.0.113.24','X-Turnstile-Token':'fixture'},body:JSON.stringify({question,state})})};
}

test('Worker serves question-driven trade and price panels with exact pinned public snapshots and cached sources',async t=>{
  const f=await fixture(t);
  const first=await f.post('Map the value of electricity trade between Alberta and British Columbia in 2024.');
  assert.equal(first.status,200);const a=await first.json();
  assert.equal(a.workspace.plan.tradeCommodity,'electricity');assert.equal(a.workspace.plan.tradeYear,2024);
  assert.equal(a.workspace.panels.find(panel=>panel.type==='energy-trade').summary.totals.value,481.012);
  assert.equal(a.workspace.tradeSnapshot.dataVersion,flows.dataVersion);assert.equal(a.workspace.fiscalSnapshot.dataVersion,fiscal.dataVersion);
  const second=await f.post('What if natural gas prices fall by 10% in Alberta and British Columbia?');
  assert.equal(second.status,200);const b=await second.json();
  assert.equal(b.workspace.panels.find(panel=>panel.type==='provincial-impact').result.shockPct,-10);
  assert.equal(f.flowReads,1);assert.equal(f.fiscalReads,1);
});

test('invalid or stale optional flow datasets cannot disable existing GDP analysis',async t=>{
  for(const settings of [{badFlows:true},{staleFlows:true},{badFiscal:true}]){
    const f=await fixture(t,settings);const response=await f.post('Compare Alberta and British Columbia energy GDP.');
    assert.equal(response.status,200);const value=await response.json();
    assert.equal(value.workspace.panels[0].type,'province-comparison');
    assert.equal(value.workspace.tradeSnapshot,undefined);
  }
});

test('missing fiscal evidence leaves trade available and reports the missing price calculation',async t=>{
  const f=await fixture(t,{badFiscal:true});const response=await f.post('How would a 10% natural gas price fall affect Alberta and British Columbia?');
  assert.equal(response.status,200);const value=await response.json();
  assert.ok(value.workspace.panels.some(panel=>panel.type==='energy-trade'));
  assert.ok(value.workspace.panels.some(panel=>panel.id==='price-data-unavailable'));
  assert.ok(!value.workspace.panels.some(panel=>panel.type==='provincial-impact'));
});
