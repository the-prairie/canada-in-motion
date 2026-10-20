import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {Miniflare,convertV4MiniflareOptions,Response as EdgeResponse} from 'miniflare';
import {validateWorkspace} from '../../workspace-contract.mjs';

const [economy,debate,forecast]=await Promise.all(['economy','energy-debate','provincial-forecasts'].map(name=>readFile(new URL(`../../data/${name}.json`,import.meta.url),'utf8').then(JSON.parse)));
const state={region:'AB',scenario:'Current Measures',year:2030,oilShock:10,duration:'persistent'};
const output=value=>new EdgeResponse(JSON.stringify(value),{headers:{'Content-Type':'application/json'}});
const model=`import {WorkerEntrypoint} from 'cloudflare:workers';
export class Model extends WorkerEntrypoint { async run(_model,body){
const input=JSON.parse(body.messages[1].content);
return {response:{state:input.state,investigation:{regions:['AB'],topics:['gdp'],metricIds:[],includeMap:false,requestedMeasure:'available'}}};
}}`;
async function fixture(t,{stale=false,invalid=false,missing=false}={}) {
  const persistence=await mkdtemp(path.join(os.tmpdir(),'forecast-edge-'));
  let reads=0;
  const outbound=async request=>{
    const url=new URL(request.url);
    if(url.hostname==='challenges.cloudflare.com')return output({success:true,hostname:'the-prairie.github.io',action:'energy_analysis'});
    if(url.pathname.endsWith('/economy.json'))return output({...economy,generatedAt:new Date().toISOString()});
    if(url.pathname.endsWith('/energy-debate.json'))return output(debate);
    if(url.pathname.endsWith('/provincial-forecasts.json')){
      reads++;
      return missing?new EdgeResponse('unavailable',{status:503}):output({...forecast,asOf:new Date(Date.now()-(stale?10*86400000:0)).toISOString().slice(0,10),...(invalid?{schemaVersion:999}:{})});
    }
    if(['/network.json','/energy-flows.json','/provincial-impacts.json'].some(file=>url.pathname.endsWith(file)))return new EdgeResponse('optional source unavailable',{status:503});
    throw Error('Unexpected external request');
  };
  const mf=new Miniflare({...convertV4MiniflareOptions({workers:[
    {name:'api',modules:true,scriptPath:new URL('../../.worker-build/cloudflare-worker.js',import.meta.url).pathname,compatibilityDate:'2026-10-18',bindings:{AI_PROVIDER:'cloudflare',AI_ENABLED:'1',WORKSPACE_ENABLED:'1',JEV_ENABLED:'0',TURNSTILE_SECRET_KEY:'fixture-secret',TURNSTILE_SITE_KEY:'fixture-site',VISITOR_HASH_KEY:'x'.repeat(40)},durableObjects:{AI_QUOTA:{className:'AnalysisQuota',useSQLite:true}},serviceBindings:{AI:{name:'model',entrypoint:'Model'}},outboundService:outbound,stripCfConnectingIp:false},
    {name:'model',modules:true,script:model,compatibilityDate:'2026-10-18'},
  ],cf:false}),resourcePersistencePath:persistence});
  await mf.ready;
  t.after(async()=>{await mf.dispose();await rm(persistence,{recursive:true,force:true});});
  return {get reads(){return reads;},post:question=>mf.dispatchFetch('https://api.example/api/analysis',{method:'POST',headers:{Origin:'https://the-prairie.github.io','Content-Type':'application/json','CF-Connecting-IP':'203.0.113.52','X-Turnstile-Token':'fixture'},body:JSON.stringify({question,state})})};
}

test('Worker loads the published snapshot and serves both source-backed GDP horizons through the public request path',async t=>{
  const f=await fixture(t);
  const response=await f.post(`Compare Alberta and Ontario real GDP growth forecasts for ${forecast.forecastOriginYear} and ${forecast.forecastOriginYear+1}.`);
  assert.equal(response.status,200);
  const result=await response.json();
  const panels=result.workspace.panels.filter(p=>p.type==='gdp-forecast');
  assert.deepEqual(panels.map(p=>p.year),[forecast.forecastOriginYear,forecast.forecastOriginYear+1]);
  assert.ok(panels.every(p=>p.summary.rows.length===2));
  assert.equal(result.workspace.forecastSnapshot.dataVersion,forecast.dataVersion);
  assert.doesNotThrow(()=>validateWorkspace(result.workspace));
  const next=await f.post('Forecast Yukon GDP growth next year.');
  assert.equal(next.status,200);
  const territory=await next.json();
  assert.equal(territory.workspace.panels[0].summary.rows[0].predictionPct,null);
  assert.equal(f.reads,1);
});

test('stale, invalid or missing forecasts return coverage and leave observed GDP available',async t=>{
  for(const settings of [{stale:true},{invalid:true},{missing:true}]){
    const f=await fixture(t,settings);
    const response=await f.post('Forecast Alberta GDP next year.');
    assert.equal(response.status,200);
    const result=await response.json();
    assert.equal(result.workspace.panels[0].type,'coverage-note');
    assert.match(result.workspace.panels[0].message,/could not be loaded/);
    assert.equal(result.workspace.forecastSnapshot,undefined);
    const historical=await f.post('Compare observed energy GDP for Alberta and Ontario.');
    assert.equal(historical.status,200);
    assert.ok((await historical.json()).workspace.panels.some(p=>p.type==='province-comparison'));
  }
});
