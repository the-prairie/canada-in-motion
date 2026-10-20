import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validateWorkspace,compileWorkspace,initialSelection,resolveWorkspace,summarizeWorkspaceFindings} from '../workspace-contract.mjs';
import {buildWorkspacePanels} from '../server/energy-workspace.mjs';
import {summarizeEconomy,normalizeEconomyState} from '../economy-model.mjs';
import {createTradeWorkspace} from '../trade-workspace-model.mjs';
import {summarizeProvincialForecast} from '../provincial-forecast-model.mjs';
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
  const workspace=make();delete workspace.economySnapshot;workspace.dataVersion='2020-01-01';
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


test('answer-pinned data keeps controls accurate when browser data is stale or newer',()=>{
  const workspace=make(['gdp','scenario'],['electricity-generation']);
  workspace.economySnapshot=structuredClone(data);
  for(const date of ['2020-01-01T00:00:00Z','2030-01-01T00:00:00Z']){
    const other=structuredClone(data);other.generatedAt=date;other.gdp.regions.find(row=>row.code==='ON').energy=1;
    const selection={...initialSelection(workspace),regions:['ON'],year:2050,scenario:'Lower'};
    const result=resolveWorkspace(workspace,selection,other);
    assert.equal(result.panels.find(p=>p.type==='province-comparison').rows[0].value,data.gdp.regions.find(row=>row.code==='ON').energy);
    const scenario=result.panels.find(p=>p.type==='scenario-comparison');
    assert.equal(scenario.rows[0].selected,summarizeEconomy(data,{...selection,region:'ON'}).metrics.find(m=>m.id==='electricity-generation').selected);
    assert.equal(result.economySnapshot.generatedAt,workspace.dataVersion);
  }
});
test('malformed or mismatched pinned economic snapshots are rejected',()=>{
  const workspace=make();workspace.economySnapshot=structuredClone(data);
  workspace.economySnapshot.generatedAt='2020-01-01T00:00:00Z';assert.throws(()=>validateWorkspace(workspace));
  workspace.economySnapshot=structuredClone(data);workspace.economySnapshot.gdp.regions[0].energy=Infinity;assert.throws(()=>validateWorkspace(workspace));
});

test('oil controls recalculate national results without allocating them to a selected province',()=>{
  const workspace=make(['oil-sensitivity']);
  const initial=initialSelection(workspace);
  const original=workspace.panels.find(panel=>panel.type==='oil-sensitivity');
  assert.equal(resolveWorkspace(workspace,initial,data).panels.find(panel=>panel.type==='oil-sensitivity'),original);
  const selection={...initial,regions:['AB'],oilShock:-15,duration:'temporary',panelId:original.id};
  const resolved=resolveWorkspace(workspace,selection,data);
  const panel=resolved.panels.find(row=>row.id===original.id);
  const expected=summarizeEconomy(data,{...selection,region:'CA'}).publishedOilSensitivity;
  assert.equal(panel.scope,'CA');
  assert.equal(panel.shockPct,-15);
  assert.equal(panel.duration,'temporary');
  assert.equal(panel.rows.find(row=>row.id==='oil-nominalGdpPct-1').value,expected.years[0].nominalGdpPct);
  assert.equal(panel.rows.find(row=>row.id==='oil-federalRevenueBillionCad-2').value,expected.years[1].federalRevenueBillionCad);
  assert.notDeepEqual(panel.rows,original.rows);
  const finding=summarizeWorkspaceFindings(resolved,selection)[0];
  assert.match(finding.text,/Canada-wide.*-15% WTI change, lasting two quarters/);
  assert.match(finding.text,/does not estimate effects for individual provinces/);
  assert.doesNotMatch(finding.text,/Alberta/);
  assert.deepEqual(finding.sourceIds,expected.sourceIds);
  const unavailable=structuredClone(resolved);
  unavailable.panels.find(row=>row.id===original.id).rows.find(row=>row.id==='oil-nominalGdpPct-1').value=null;
  assert.match(summarizeWorkspaceFindings(unavailable,selection)[0].text,/year 1 nominal GDP unavailable/);
  for(const invalid of [{oilShock:21},{oilShock:null},{oilShock:NaN},{duration:'forever'}]){
    assert.throws(()=>resolveWorkspace(workspace,{...selection,...invalid},data));
  }
});

test('saved oil findings retain the original shock when old selection state omits it',()=>{
  const workspace=make(['oil-sensitivity']);
  const initial=initialSelection(workspace);
  const saved=resolveWorkspace(workspace,{...initial,oilShock:-15,duration:'temporary'},data);
  delete saved.plan.oilShock;delete saved.plan.duration;
  const restored=resolveWorkspace(saved,initialSelection(saved),data);
  assert.deepEqual(restored.panels.find(p=>p.type==='oil-sensitivity'),saved.panels.find(p=>p.type==='oil-sensitivity'));
});

test('current GDP and scenario findings follow the selected region and data, including missing values',()=>{
  const workspace=make(['gdp','scenario'],['electricity-generation']);
  const initial=initialSelection(workspace);
  const selection={...initial,regions:['AB'],panelId:'gdp-comparison'};
  const ab=resolveWorkspace(workspace,selection,data);
  const first=summarizeWorkspaceFindings(ab,selection)[0];
  assert.match(first.text,/Alberta generated CA\$163.61 billion/);
  assert.doesNotMatch(first.text,/Québec/);
  const changed={...selection,regions:['QC']};
  const qc=summarizeWorkspaceFindings(resolveWorkspace(workspace,changed,data),changed)[0];
  assert.match(qc.text,/Quebec generated/);
  assert.doesNotMatch(qc.text,/Alberta|163.61/);
  const scenario={...changed,year:2050,scenario:'Lower',panelId:'scenario-electricity-generation'};
  const resolved=resolveWorkspace(workspace,scenario,data);
  const finding=summarizeWorkspaceFindings(resolved,scenario)[0];
  assert.match(finding.text,/2050 under Lower/);
  const value=resolved.panels.find(p=>p.id===scenario.panelId).rows[0].selected;
  assert.ok(finding.text.includes(new Intl.NumberFormat('en-CA',{maximumFractionDigits:2}).format(value)));
  const missing=structuredClone(resolved);
  missing.panels.find(p=>p.id===scenario.panelId).rows[0].selected=null;
  assert.match(summarizeWorkspaceFindings(missing,scenario)[0].text,/Quebec has no published value/);
  const mapSelection={...selection,panelId:'gdp-map'};
  assert.doesNotMatch(summarizeWorkspaceFindings(ab,mapSelection)[0].text,/Quebec|Ontario/);
});

test('current trade, physical and price findings change with the commodity, period and shock',async()=>{
  const flows=JSON.parse(await readFile(new URL('../data/energy-flows.json',import.meta.url)));
  const fiscal=JSON.parse(await readFile(new URL('../data/provincial-impacts.json',import.meta.url)));
  const workspace=createTradeWorkspace({economy:data,flows,fiscal,regions:['AB'],selection:{commodity:'oil',year:flows.trade.latestYear,shockPct:-10}});
  const selection={...initialSelection(workspace),panelId:'provincial-impact'};
  const original=resolveWorkspace(workspace,selection,data);
  const findings=summarizeWorkspaceFindings(original,selection);
  assert.match(findings[0].text,/-10% crude oil price change/);
  assert.match(findings[0].text,/trade repricing, not a GDP forecast/);
  assert.match(findings[0].text,/cannot be added/);
  const changed={...selection,priceShock:10};
  const updated=summarizeWorkspaceFindings(resolveWorkspace(workspace,changed,data),changed)[0];
  assert.match(updated.text,/\+10% crude oil price change/);
  assert.notEqual(updated.text,findings[0].text);
  const gas={...selection,tradeCommodity:'gas',panelId:'energy-trade'};
  const gasResult=resolveWorkspace(workspace,gas,data);
  assert.match(summarizeWorkspaceFindings(gasResult,gas)[0].text,/Natural gas trade/);
  assert.match(summarizeWorkspaceFindings(gasResult,gas)[0].text,new RegExp(String(flows.trade.latestYear)));
  const physical=summarizeWorkspaceFindings(gasResult,{...gas,panelId:'energy-transfers'})[0];
  assert.match(physical.text,/Natural gas transfers/);
  assert.match(physical.text,/does not identify the partner province/);
  for(const block of summarizeWorkspaceFindings(gasResult,{...gas,viewMode:'all'})){
    assert.ok(block.sourceIds.length>0);
    assert.ok(block.sourceIds.every(id=>workspace.sources.some(source=>source.id===id)));
  }
  const suppressed=structuredClone(gasResult);
  const panel=suppressed.panels.find(p=>p.type==='energy-trade');
  panel.summary.totals={...panel.summary.totals,value:null,missingRecords:1};
  assert.match(summarizeWorkspaceFindings(suppressed,gas)[0].text,/1 unavailable record/);
});

test('forecast findings preserve the forecast target and do not turn oil changes into provincial GDP effects',async()=>{
  const forecast=JSON.parse(await readFile(new URL('../data/provincial-forecasts.json',import.meta.url)));
  const year=forecast.forecastOriginYear;
  const workspace={schemaVersion:1,dataVersion:data.generatedAt,economySnapshot:data,forecastSnapshot:forecast,sources:forecast.sources,
    plan:{regions:['AB'],year:2030,scenario:'Higher',oilShock:10,duration:'persistent'},panels:[{
      id:'outlook',type:'gdp-forecast',title:'Provincial GDP outlook',role:'answer',sourceIds:forecast.sources.map(source=>source.id),
      unit:forecast.information.forecastUnit,period:String(year),year,regions:['AB'],summary:summarizeProvincialForecast(forecast,{regions:['AB'],year}),
    }]};
  const selection=initialSelection(workspace);
  const original=resolveWorkspace(workspace,selection,data);
  const shock=resolveWorkspace(workspace,{...selection,oilShock:-20},data);
  assert.deepEqual(shock.panels,original.panels);
  const first=summarizeWorkspaceFindings(original,selection)[0];
  assert.match(first.text,new RegExp(`${year} real GDP growth outlook`));
  assert.match(first.text,/historical-error range/);
  assert.match(first.text,/Changing energy-price assumptions does not change this forecast/);
  const changed={...selection,regions:['NU'],forecastYearsByPanel:{outlook:year+1}};
  const unavailable=summarizeWorkspaceFindings(resolveWorkspace(workspace,changed,data),changed)[0];
  assert.match(unavailable.text,/No forecast is available/);
  assert.match(unavailable.text,/Nunavut/);
  assert.doesNotMatch(unavailable.text,/0%/);
});
