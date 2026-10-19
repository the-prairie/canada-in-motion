import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validateWorkspace,compileWorkspace,initialSelection,resolveWorkspace} from '../workspace-contract.mjs';
import {buildWorkspacePanels} from '../server/energy-workspace.mjs';
import {summarizeEconomy,normalizeEconomyState} from '../economy-model.mjs';
const data=JSON.parse(await readFile(new URL('../data/economy.json',import.meta.url)));
const network=JSON.parse(await readFile(new URL('../data/network.json',import.meta.url)));
const state=normalizeEconomyState({region:'AB',scenario:'Higher',year:2040});
const make=(topics=['gdp'],metricIds=[])=>buildWorkspacePanels({data,network,summary:summarizeEconomy(data,state),summarize:summarizeEconomy,state,question:'Compare Alberta and Québec; show a map.',investigation:{regions:['AB','QC'],topics,metricIds,includeMap:true,requestedMeasure:'available'}});
test('every supported server panel compiles to a bounded OpenUI layout',()=>{
  for(const topics of [['gdp'],['scenario'],['infrastructure'],['oil-sensitivity']]){
    const workspace=make(topics,['electricity-generation']);
    assert.equal(validateWorkspace(workspace),workspace);
    const dsl=compileWorkspace(workspace);
    assert.match(dsl,/^root = EnergyWorkspace\(\[/);
    assert.doesNotMatch(dsl,/fetch|https:|163605/);
  }
});
test('unsafe layouts, missing citations and invalid numbers are rejected',()=>{
  for(const mutate of [w=>{w.panels[0].type='HTML'},w=>{w.panels[0].id='x\")\nroot=Unsafe('},w=>{w.sources[0].url='javascript:alert(1)'},w=>{w.panels[0].sourceIds=['invented']},w=>{w.panels[0].rows[0].value=Infinity}]){
    const workspace=structuredClone(make());mutate(workspace);assert.throws(()=>compileWorkspace(workspace),/could not be verified/);
  }
});
test('local selection resolves real GDP values and a complete national map',()=>{
  const workspace=make();const initial=initialSelection(workspace);
  const resolved=resolveWorkspace(workspace,{...initial,regions:['AB','ON','QC']},data);
  assert.deepEqual(resolved.panels.find(p=>p.type==='province-comparison').rows.map(r=>r.code),['QC','ON','AB']);
  const ab=resolved.panels[0].rows.find(r=>r.code==='AB');assert.equal(ab.value,163605.9);
  assert.equal(resolved.panels.find(p=>p.type==='province-map').rows.length,13);
  assert.equal(workspace.panels[0].rows.length,2);
});
test('changing scenario or year reads published series and retains missing data',()=>{
  const workspace=make(['scenario'],['electricity-generation','electricity-price']);
  const selection={...initialSelection(workspace),regions:['AB','QC','NU'],year:2050,scenario:'Lower'};
  const resolved=resolveWorkspace(workspace,selection,data);
  const panel=resolved.panels.find(p=>p.metricId==='electricity-generation');
  assert.equal(panel.year,2050);assert.equal(panel.scenario,'Lower');
  for(const row of panel.rows){
    const actual=summarizeEconomy(data,{...selection,region:row.code}).metrics.find(m=>m.id==='electricity-generation');
    assert.equal(row.selected,actual.selected);assert.equal(row.baseline,actual.baseline);
  }
  assert.throws(()=>resolveWorkspace(workspace,{...selection,year:2999},data));
});
test('an older answer is preserved when current data cannot reproduce its snapshot',()=>{
  const workspace=make();workspace.dataVersion='2020-01-01';
  assert.equal(resolveWorkspace(workspace,{...initialSelection(workspace),regions:['ON']},data),workspace);
});
test('linked infrastructure selection uses the pinned network snapshot and exports those records',()=>{
  const workspace=make(['gdp','infrastructure']);
  const selected=resolveWorkspace(workspace,{...initialSelection(workspace),regions:['QC']},data);
  const panel=selected.panels.find(p=>p.type==='infrastructure-map');
  assert.deepEqual(panel.regions,['QC']);assert.deepEqual(panel.routeIds,['canadian-mainline']);
  assert.deepEqual(panel.facilityIds,['montreal-suncor']);
  assert.deepEqual(selected.networkSnapshot.facilities,network.facilities);
  assert.ok(!panel.facilityIds.includes('imperial-strathcona'));
});
