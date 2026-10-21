import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {buildLocalInvestigation,loadLocalInvestigation,LOCAL_INVESTIGATIONS} from '../local-investigations.mjs';
import {validateWorkspace} from '../workspace-contract.mjs';
const read=async name=>JSON.parse(await readFile(new URL(`../data/${name}.json`,import.meta.url),'utf8'));
const [data,forecast,flows,fiscal]=await Promise.all(['economy','provincial-forecasts','energy-flows','provincial-impacts'].map(read));
const inputs={data,forecast,flows,fiscal,state:{region:'AB'}};
for(const preset of LOCAL_INVESTIGATIONS)test(`local ${preset.id} produces validated, source-backed comparisons without inference`,()=>{
  const result=buildLocalInvestigation(preset.id,inputs);
  validateWorkspace(result.workspace);
  assert.equal(result.model,null);
  assert.equal(result.answerMode,'local-data-workspace');
  assert.ok(result.workspace.panels.some(panel=>panel.role==='answer'));
  assert.equal(result.workspace.panels.some(panel=>panel.type==='coverage-note'),false);
  if(preset.id==='outlook'){
    assert.deepEqual(result.workspace.panels.map(p=>p.year),[forecast.forecastOriginYear,forecast.forecastOriginYear+1]);
    assert.deepEqual(result.workspace.panels[0].summary.rows.map(r=>r.region),['AB','ON','QC']);
  }
  if(preset.id==='electricity')assert.equal(result.state.year,2040);
  if(preset.id==='trade')assert.equal(result.workspace.plan.linkScope,'between');
  if(preset.id==='prices')assert.equal(result.workspace.plan.priceShock,10);
});
test('local comparisons fetch only their source datasets and fail without substituting data',async()=>{
  const calls=[];
  await loadLocalInvestigation('outlook',inputs,async url=>{calls.push(url);return Response.json(forecast);});
  assert.deepEqual(calls,['data/provincial-forecasts.json']);
  await assert.rejects(loadLocalInvestigation('outlook',inputs,async()=>new Response(null,{status:503})),/could not load/);
  const controller=new AbortController();controller.abort();
  await assert.rejects(loadLocalInvestigation('contributions',inputs,async()=>{throw Error('No fetch expected');},controller.signal),{name:'AbortError'});
});
