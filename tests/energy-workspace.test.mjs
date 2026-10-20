import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {AnalysisError,createEnergyAnalyzer} from '../server/energy-analysis.mjs';
import {createEnergyWorkspace,buildWorkspaceAnalysis,buildWorkspacePanels,requestedScenarioYears,validateInvestigation} from '../server/energy-workspace.mjs';
import {JEV_MODEL,JevError} from '../server/jev-decisions.mjs';
import {normalizeEconomyState,summarizeEconomy} from '../economy-model.mjs';
const data=JSON.parse(await readFile(new URL('../data/economy.json',import.meta.url)));
const debate=JSON.parse(await readFile(new URL('../data/energy-debate.json',import.meta.url)));
const network=JSON.parse(await readFile(new URL('../data/network.json',import.meta.url)));
const state=normalizeEconomyState({region:'AB',scenario:'Higher',year:2030,oilShock:-10});
const investigation={regions:['AB','QC'],topics:['gdp'],metricIds:[],includeMap:true,requestedMeasure:'available'};
const input={data,debate,network,state,summary:summarizeEconomy(data,state),summarize:summarizeEconomy,investigation,question:'Compare Alberta and Québec energy GDP.'};

test('a question selects both named provinces and compares sourced GDP with all regions on the map',()=>{
  const workspace=buildWorkspacePanels({...input,investigation:{...investigation,regions:['AB']}});
  assert.deepEqual(workspace.plan.regions,['AB','QC']);
  const [comparison,map]=workspace.panels;
  assert.deepEqual(comparison.rows.map(row=>[row.code,row.value]),[['AB',163605.9],['QC',18248.5]]);
  assert.equal(comparison.period,'2022');assert.equal(comparison.unit,'million current CAD at basic prices');
  assert.equal(map.rows.length,13);assert.deepEqual(map.regions,['AB','QC']);
  assert.equal(workspace.sources[0].id,'statcan-36100711');assert.equal(workspace.sources[0].sha256,workspace.sourceHashes['statcan-36100711']);
  assert.equal(comparison.rows[0].energyVector,'v1793287731');
  assert.ok(!Object.hasOwn(workspace,'question'));
});

test('national comparisons preserve emphasis and apply explicit exclusions',()=>{
  const national={...investigation,regions:['CA']};
  const all=buildWorkspacePanels({...input,question:'Compare energy GDP across all provinces, especially Alberta.',investigation:national});
  assert.deepEqual(all.plan.regions,['CA']);assert.equal(all.panels[0].rows.length,13);
  const emphasized=buildWorkspacePanels({...input,question:"Compare Canada's energy GDP, with particular attention to Alberta.",investigation:national});
  assert.deepEqual(emphasized.plan.regions,['CA']);assert.equal(emphasized.panels[0].rows.length,13);
  for(const question of ['Compare energy GDP across all provinces except Alberta.','Compare energy GDP across Canada, excluding Alberta, especially Ontario.']){
    const result=buildWorkspacePanels({...input,question,investigation:national});
    assert.equal(result.panels[0].rows.length,12);assert.ok(!result.plan.regions.includes('AB'));assert.ok(result.panels[0].rows.some(row=>row.code==='ON'));
  }
  const several=buildWorkspacePanels({...input,question:'Compare energy GDP across all provinces except Alberta, Ontario and BC.',investigation:national});
  assert.equal(several.panels[0].rows.length,10);assert.ok(several.panels[0].rows.every(row=>!['AB','ON','BC'].includes(row.code)));
  const limited=buildWorkspacePanels({...input,question:'Compare energy GDP in Ontario and Quebec, not Alberta.',investigation:{...investigation,regions:['AB','ON','QC']}});
  assert.deepEqual(limited.plan.regions,['ON','QC']);
});

test('economic controls receive the exact detached source snapshot used to build the answer',()=>{
  const source=structuredClone(data);
  const workspace=buildWorkspacePanels({...input,data:source,summary:summarizeEconomy(source,state),investigation:{...investigation,topics:['gdp','scenario'],metricIds:['electricity-generation']}});
  assert.deepEqual(workspace.economySnapshot,data);
  assert.equal(workspace.economySnapshot.generatedAt,workspace.dataVersion);
  const snapshotGDP=workspace.economySnapshot.gdp.regions.find(row=>row.code==='AB');
  assert.equal(snapshotGDP.energy,workspace.panels.find(panel=>panel.type==='province-comparison').rows.find(row=>row.code==='AB').value);
  const scenario=workspace.panels.find(panel=>panel.type==='scenario-comparison');
  const snapshotScenario=summarizeEconomy(workspace.economySnapshot,state).metrics.find(metric=>metric.id===scenario.metricId);
  assert.equal(snapshotScenario.selected,scenario.rows.find(row=>row.code==='AB').selected);
  source.generatedAt='replacement';source.gdp.regions.find(row=>row.code==='AB').energy=-1;
  source.metrics[0].series[0].values[0]=-1;
  assert.deepEqual(JSON.parse(JSON.stringify(workspace.economySnapshot)),data);
});

test('the exact live GDP and generation questions repair a false measured-flow classification',()=>{
  const examples=[
    {question:'Compare energy GDP in Alberta, Ontario and Québec. Include a map.',topics:['gdp'],metricIds:['gas-production','oil-production','electricity-generation'],type:'province-comparison'},
    {question:'Compare electricity generation in Alberta, Ontario and Québec in the Higher scenario in 2040.',topics:['scenario'],metricIds:['electricity-generation'],type:'scenario-comparison'},
  ];
  for(const example of examples){
    const result=buildWorkspacePanels({...input,question:example.question,investigation:{...investigation,regions:['AB','ON','QC'],topics:example.topics,metricIds:example.metricIds,requestedMeasure:'measured-flow'}});
    assert.equal(result.plan.requestedMeasure,'available');assert.ok(result.panels.every(panel=>panel.type!=='coverage-note'));
    const panel=result.panels.find(item=>item.type===example.type);assert.equal(panel.role,'answer');assert.equal(panel.rows.length,3);
  }
});

test('repairing a false flow classification does not erase missing evidence in compound questions',()=>{
  for(const question of [
    'Compare electricity generation in Alberta and Québec, and how much electricity flows between them.',
    'Compare energy GDP in Alberta and Québec, then measure how much oil they trade.',
    'Compare electricity generation in Alberta and Québec and identify which investors receive the income.',
    'Compare energy GDP in Alberta and Québec in 2040.',
    'Compare electricity generation in Alberta and Québec and quantify household bill impacts from price changes.',
  ]){
    const result=buildWorkspacePanels({...input,question,investigation:{...investigation,topics:['gdp','scenario'],metricIds:['electricity-generation'],requestedMeasure:'measured-flow'}});
    assert.notEqual(result.plan.requestedMeasure,'available');assert.equal(result.panels[0].type,'coverage-note');
  }
});

test('published scenario comparisons preserve unavailable data instead of inventing zero',()=>{
  const workspace=buildWorkspacePanels({...input,question:'Compare Québec and Alberta gas production in the Higher scenario.',investigation:{...investigation,topics:['scenario'],metricIds:['gas-production']}});
  const panel=workspace.panels[0];
  assert.equal(panel.type,'scenario-comparison');assert.equal(panel.scenario,'Higher');assert.equal(panel.baselineScenario,'Current Measures');
  const ab=panel.rows.find(row=>row.code==='AB'),qc=panel.rows.find(row=>row.code==='QC');
  const metric=data.metrics.find(item=>item.id==='gas-production'),index=data.years.indexOf(2030);
  assert.equal(ab.selected,metric.series.find(item=>item.region==='AB'&&item.scenario==='Higher').values[index]);
  assert.equal(qc.selected,null);assert.equal(qc.baseline,null);assert.equal(qc.delta,null);assert.equal(qc.status,'unavailable');assert.ok(qc.reason);
  assert.match(panel.note,/not the isolated effect/);
});

test('a measured pipeline flow request cannot become an answered location map even if both models approve it',async()=>{
  let calls=0;
  const workspace=await createEnergyWorkspace({...input,question:'Show pipeline volumes flowing between Alberta and Ontario.',investigation:{...investigation,regions:['AB','ON'],topics:['infrastructure'],requestedMeasure:'available'},decider:async({questions})=>{calls++;assert.deepEqual(Object.keys(questions),['presentation','coverage']);return {answers:{presentation:{choice:'geographic'},coverage:{choice:'supported'}}};}});
  assert.equal(calls,1);assert.equal(workspace.panels[0].type,'coverage-note');
  assert.equal(workspace.plan.requestedMeasure,'measured-flow');assert.equal(workspace.decision.coverage,'partial');
  const map=workspace.panels.find(panel=>panel.type==='infrastructure-map');
  assert.equal(map.role,'context');assert.equal(map.geometryStatus,'indicative');
  assert.ok(map.routeIds.includes('enbridge-mainline'));assert.ok(!Object.hasOwn(map,'volumes'));
});

test('route flow questions and explicit map requests retain their meaning when a planner misses them',()=>{
  for(const question of ['Map energy routes between Alberta and BC. Can we measure how much flows between them?','How much energy does Alberta send to British Columbia?','Combien d’energie circule entre Alberta et Quebec par les routes?']){
    const workspace=buildWorkspacePanels({...input,question,investigation:{...investigation,topics:['infrastructure'],requestedMeasure:'available',includeMap:false}});
    assert.equal(workspace.plan.requestedMeasure,'measured-flow');
    assert.equal(workspace.panels[0].type,'coverage-note');assert.equal(workspace.panels[1].role,'context');
  }
  const mapped=buildWorkspacePanels({...input,question:'Map the energy GDP of Alberta and Quebec',investigation:{...investigation,includeMap:false}});
  assert.equal(mapped.panels.find(panel=>panel.type==='province-map').rows.length,13);
  const production=buildWorkspacePanels({...input,question:'Compare oil production volumes in Alberta and Saskatchewan.',investigation:{...investigation,topics:['scenario'],metricIds:['oil-production']}});
  assert.equal(production.plan.requestedMeasure,'available');assert.equal(production.panels[0].type,'scenario-comparison');
});

test('national oil sensitivity remains scoped to Canada alongside provincial exposure',()=>{
  const workspace=buildWorkspacePanels({...input,question:'What happens in Alberta and Québec when the oil price falls 10%?',investigation:{...investigation,topics:['oil-sensitivity'],requestedMeasure:'provincial-price-impact'}});
  const panel=workspace.panels.find(item=>item.type==='oil-sensitivity');
  assert.equal(panel.scope,'CA');assert.equal(panel.role,'context');assert.equal(panel.shockPct,-10);
  assert.equal(panel.rows.length,10);assert.equal(panel.rows.find(row=>row.id==='oil-nominalGdpPct-1').value,-data.oilSensitivity.persistent.nominalGdpPct[0]);
  assert.equal(panel.rows.find(row=>row.id==='oil-nominalGdpPct-1').unit,'% change');
  assert.match(panel.note,/does not estimate provincial effects/);
});

test('Jev unavailable and exhausted budgets preserve the same sourced panels',async()=>{
  for(const error of [new Error('private provider failure'),new JevError('budget_exhausted')]){
    const workspace=await createEnergyWorkspace({...input,decider:async()=>{throw error;}});
    assert.equal(workspace.decision.provider,'rules');assert.equal(workspace.decision.status,error.code==='budget_exhausted'?'budget-exhausted':'unavailable');
    assert.deepEqual(workspace.panels[0].rows.map(row=>row.value),[163605.9,18248.5]);
    assert.ok(!JSON.stringify(workspace).includes('private provider'));
  }
});

test('invalid view requests use the safe fallback and cannot supply code, URLs, numbers or arbitrary metrics',async()=>{
  for(const plan of [{...investigation,metricIds:['invented']},{...investigation,regions:['XX']},{...investigation,html:'<script>'},{...investigation,topics:['gdp','gdp']}])assert.throws(()=>validateInvestigation(plan));
  const workspace=await createEnergyWorkspace({...input,investigation:{metricIds:['https://attacker.example/']}});
  assert.equal(workspace.decision.planStatus,'rules-fallback');assert.deepEqual(workspace.plan.regions,['AB','QC']);
  assert.ok(!JSON.stringify(workspace).includes('attacker'));
  const outside=await createEnergyWorkspace({...input,question:'What is the weather today?',investigation:null});
  assert.equal(outside.panels.length,1);assert.equal(outside.panels[0].type,'coverage-note');
});

test('compound investigations stay bounded and retain exact sources and rows',()=>{
  const workspace=buildWorkspacePanels({...input,investigation:{...investigation,topics:['gdp','scenario','infrastructure'],metricIds:['oil-production','gas-production','electricity-generation']}});
  assert.equal(workspace.panels.length,6);assert.equal(new Set(workspace.panels.map(panel=>panel.id)).size,6);
  for(const panel of workspace.panels)for(const sourceId of panel.sourceIds)assert.ok(workspace.sources.some(source=>source.id===sourceId));
});

test('bounded compound investigations retain requested topics before optional GDP context maps',()=>{
  for(const topics of [['gdp','scenario','infrastructure'],['oil-sensitivity','scenario','infrastructure']]){
    const workspace=buildWorkspacePanels({...input,question:'Compare GDP, generation and pipeline volumes for Alberta and Québec.',investigation:{...investigation,topics,metricIds:['oil-production','gas-production','electricity-generation'],requestedMeasure:'measured-flow'}});
    assert.equal(workspace.panels.length,6);assert.equal(workspace.panels[0].type,'coverage-note');
    assert.ok(workspace.panels.some(panel=>panel.type==='infrastructure-map'));assert.equal(workspace.panels.filter(panel=>panel.type==='scenario-comparison').length,3);
    assert.ok(workspace.panels.some(panel=>panel.type===(topics[0]==='gdp'?'province-comparison':'oil-sensitivity')));
    assert.ok(!workspace.panels.some(panel=>panel.type==='province-map'));assert.ok(workspace.limitations.some(note=>note.includes('omitted')));
  }
});

test('infrastructure answers preserve the complete source snapshot for later geographic expansion',()=>{
  const workspace=buildWorkspacePanels({...input,question:'Map infrastructure in Prince Edward Island.',investigation:{...investigation,topics:['infrastructure'],regions:['PE']}});
  const panel=workspace.panels[0];assert.deepEqual(panel.routeIds,[]);assert.deepEqual(panel.facilityIds,[]);
  assert.deepEqual(panel.sourceIds,network.sources.map(source=>source.id));
  assert.deepEqual(workspace.networkSnapshot,{routes:network.routes,facilities:network.facilities,sources:network.sources});
  assert.deepEqual(workspace.sources.map(source=>source.id),network.sources.map(source=>source.id));
});

test('workspace analysis uses one LLM planning call and one batched Jev call',async()=>{
  let calls=0,decisions=0;
  const provider=async({name,input,schema})=>{
    calls++;
    if(name==='energy_scenario'){assert.ok(schema.properties.investigation);assert.deepEqual(Object.keys(input).sort(),['capabilities','question','regions','scenarios','state']);return {state:input.state,investigation};}
    return {answerability:'supported',claimIds:['observed-contribution']};
  };
  const analyze=createEnergyAnalyzer({data,debate,network,workspaceEnabled:true,normalizeState:normalizeEconomyState,summarize:summarizeEconomy,provider,answerMode:'claims',decider:async({state:decisionState})=>{decisions++;assert.deepEqual(Object.keys(decisionState).sort(),['panels','plan','question']);assert.ok(!JSON.stringify(decisionState).includes(data.generatedAt));return {answers:{presentation:{choice:'comparison'},coverage:{choice:'supported'}}};}});
  const result=await analyze({question:input.question,state:{region:'AB',scenario:'Higher',year:2030,oilShock:-10,duration:'persistent'}});
  assert.equal(calls,1);assert.equal(decisions,1);assert.equal(result.workspace.decision.model,JEV_MODEL);
  assert.deepEqual(result.workspace.economySnapshot,data);
  assert.equal(result.workspace.panels[0].rows[0].value,163605.9);assert.ok(result.analysis.sources.length);
  assert.equal(result.answerMode,'source-backed-workspace');assert.equal(result.analysis.blocks.length,1);
  assert.match(result.analysis.blocks[0].text,/163,605\.9 for Alberta/);assert.match(result.analysis.blocks[0].text,/18,248\.5 for Quebec/);assert.match(result.analysis.blocks[0].text,/2022/);
});

test('an electricity comparison cannot receive an unrelated legacy GDP or unsupported answer',async()=>{
  let calls=0;
  const requested={regions:['AB','ON','QC'],topics:['scenario'],metricIds:['electricity-generation'],includeMap:false,requestedMeasure:'available'};
  const analyze=createEnergyAnalyzer({data,debate,network,workspaceEnabled:true,normalizeState:normalizeEconomyState,summarize:summarizeEconomy,provider:async({input,name})=>{
    calls++;assert.equal(name,'energy_scenario');return {state:{...input.state,scenario:'Higher',year:2040},investigation:requested};
  },answerMode:'claims'});
  const result=await analyze({question:'Compare electricity generation in Alberta, Ontario and Québec in the Higher scenario in 2040.',state:{region:'AB',scenario:'Current Measures',year:2030,oilShock:10,duration:'persistent'}});
  assert.equal(calls,1);assert.equal(result.answerMode,'source-backed-workspace');assert.equal(result.analysis.blocks.length,1);
  const text=result.analysis.blocks[0].text;
  for(const phrase of ['2040','electricity generation','Alberta','Ontario','Quebec','Current Measures','Higher'])assert.ok(text.includes(phrase));
  const panel=result.workspace.panels[0];
  assert.ok(text.includes(panel.unit));
  for(const row of panel.rows){assert.ok(text.includes(new Intl.NumberFormat('en-CA',{maximumFractionDigits:2}).format(row.baseline)));assert.ok(text.includes(new Intl.NumberFormat('en-CA',{maximumFractionDigits:2}).format(row.selected)));}
  assert.doesNotMatch(text,/beyond|outside|GDP|not available/i);assert.deepEqual(result.analysis.blocks[0].sourceIds,panel.sourceIds);
});

test('workspace findings keep missing evidence first and national and regional results separate',()=>{
  const workspace=buildWorkspacePanels({...input,question:'How would a lower oil price affect GDP in Alberta and Québec?',investigation:{...investigation,topics:['oil-sensitivity'],requestedMeasure:'provincial-price-impact'}});
  const analysis=buildWorkspaceAnalysis(workspace);
  assert.match(analysis.blocks[0].text,/No calibrated model/);
  const oil=analysis.blocks.find(block=>block.text.includes('oil-price change'));
  assert.match(oil.text,/-10% persistent/);assert.match(oil.text,/national changes/);assert.match(oil.text,/2026/);assert.match(oil.text,/year 1/);assert.match(oil.text,/year 2/);
  assert.ok(analysis.blocks.length<=6);assert.ok(analysis.blocks.every(block=>typeof block.text==='string'&&!block.text.includes('undefined')));
  const national=buildWorkspaceAnalysis(buildWorkspacePanels({...input,question:'Compare energy GDP across all provinces.',investigation:{...investigation,regions:['CA']}}));
  assert.match(national.blocks[0].text,/all 13 selected provinces and territories/);assert.ok(national.blocks[0].text.length<700);
});

test('missing forecast evidence and unavailable historical years stay unavailable even if the planner approves',()=>{
  for(const question of ['Forecast energy GDP across Canada in 2040.','Compare GDP in Alberta and Ontario in 2030.','Show Alberta GDP for 2024.','Show Alberta GDP for 1990.','Show Alberta GDP for 1999.','Show Alberta GDP for 2100.']){
    const workspace=buildWorkspacePanels({...input,question,investigation:{...investigation,regions:['CA'],requestedMeasure:'available'}});
    assert.equal(workspace.plan.requestedMeasure,'other-unavailable');assert.equal(workspace.panels[0].type,'coverage-note');
    assert.ok(workspace.panels.filter(panel=>panel.type!=='coverage-note').every(panel=>panel.role==='context'));
    const analysis=buildWorkspaceAnalysis(workspace);
    if(question.startsWith('Forecast')){
      assert.match(analysis.blocks[0].text,/GDP forecast data could not be loaded/);
      assert.ok(!workspace.panels.some(panel=>panel.type==='gdp-forecast'));
    }else{
      assert.match(analysis.blocks[0].text,/GDP data cover 2022/);assert.match(analysis.blocks[1].text,/Observed energy-sector GDP in 2022/);
    }
  }
  const current=buildWorkspacePanels({...input,question:'Compare energy GDP across Canada for 2022.',investigation:{...investigation,regions:['CA']}});
  assert.equal(current.plan.requestedMeasure,'available');
  const oil=buildWorkspacePanels({...input,question:'How would a 10% oil price rise change Canada GDP?',investigation:{...investigation,regions:['CA'],topics:['oil-sensitivity']}});
  assert.equal(oil.plan.requestedMeasure,'available');assert.equal(oil.panels[0].type,'oil-sensitivity');
});

test('GDP observation dates do not inherit years or forecast adjectives from a separate electricity topic',()=>{
  for(const question of ['Compare Alberta energy GDP in 2022 with electricity generation in 2040','Compare observed GDP in Alberta and projected electricity generation in 2040']){
    for(const requestedMeasure of ['available','measured-flow']){
      const workspace=buildWorkspacePanels({...input,state:{...state,year:2040},question,investigation:{...investigation,regions:['AB'],topics:['gdp','scenario'],metricIds:['electricity-generation'],requestedMeasure}});
      assert.equal(workspace.plan.requestedMeasure,'available');assert.ok(workspace.panels.every(panel=>panel.type!=='coverage-note'));
      assert.equal(workspace.panels.find(panel=>panel.type==='province-comparison').period,'2022');assert.equal(workspace.panels.find(panel=>panel.type==='scenario-comparison').period,'2040');
    }
  }
});

test('the live compound question binds observed GDP and forecast generation to their requested years',async()=>{
  const question='Compare 2022 energy GDP in Alberta and Québec, their electricity generation in the Higher scenario in 2040, and map their pipeline routes and facilities.';
  let calls=0,decisions=0;
  const analyze=createEnergyAnalyzer({data,debate,network,workspaceEnabled:true,normalizeState:normalizeEconomyState,summarize:summarizeEconomy,provider:async({input,name})=>{
    calls++;assert.equal(name,'energy_scenario');return {state:{...input.state,year:2024,scenario:'Higher'},investigation:{...investigation,topics:['gdp','scenario','infrastructure'],metricIds:['electricity-generation']}};
  },decider:async({state:decisionState})=>{decisions++;assert.equal(decisionState.plan.year,2040);return {answers:{presentation:{choice:'comparison'},coverage:{choice:'supported'}}};}});
  const result=await analyze({question,state:{region:'AB',scenario:'Higher',year:2030,oilShock:-10,duration:'persistent'}});
  assert.equal(calls,1);assert.equal(decisions,1);
  assert.equal(result.state.year,2040);assert.equal(result.summary.state.year,2040);assert.equal(result.workspace.plan.year,2040);
  assert.equal(result.workspace.plan.requestedMeasure,'available');assert.ok(result.workspace.panels.every(panel=>panel.type!=='coverage-note'));
  assert.equal(result.workspace.panels.find(panel=>panel.type==='province-comparison').period,'2022');
  const generation=result.workspace.panels.find(panel=>panel.type==='scenario-comparison');
  assert.equal(generation.period,'2040');assert.equal(generation.scenario,'Higher');
  assert.deepEqual(generation.rows.map(row=>row.code),['AB','QC']);
  for(const row of generation.rows){
    const expected=summarizeEconomy(data,{...result.state,region:row.code}).metrics.find(metric=>metric.id==='electricity-generation');
    assert.equal(expected.year,2040);assert.equal(row.selected,expected.selected);assert.equal(row.baseline,expected.baseline);
  }
  assert.equal(result.summary.metrics.find(metric=>metric.id==='electricity-generation').selected,generation.rows.find(row=>row.code==='AB').selected);
  assert.ok(result.workspace.panels.some(panel=>panel.type==='infrastructure-map'));assert.doesNotMatch(JSON.stringify(result.analysis),/GDP is unavailable for the requested period/);
});

test('forecast-year reconciliation excludes GDP dates while preserving unsupported GDP coverage',async()=>{
  const analyze=createEnergyAnalyzer({data,debate,network,workspaceEnabled:true,normalizeState:normalizeEconomyState,summarize:summarizeEconomy,provider:async({input})=>({state:{...input.state,year:2024},investigation:{...investigation,topics:['gdp','scenario'],metricIds:['electricity-generation']}})});
  for(const gdpYear of [1990,2030]){
    const question=`Compare ${gdpYear} energy GDP in Alberta and Québec, their electricity generation in 2040.`;
    assert.deepEqual(requestedScenarioYears(question),[2040]);
    const {state:corrected,workspace}=await analyze({question,state:{region:'AB',scenario:'Higher',year:2030,oilShock:-10,duration:'persistent'}});
    assert.equal(corrected.year,2040);
    assert.equal(workspace.plan.requestedMeasure,'other-unavailable');assert.equal(workspace.panels[0].type,'coverage-note');
    assert.equal(workspace.panels.find(panel=>panel.type==='scenario-comparison').period,'2040');
  }
  assert.deepEqual(requestedScenarioYears('Compare GDP in Alberta in 2030.'),[]);
});

test('multiple or unavailable scenario years fail before model calls or calculations',async()=>{
  let calls=0,decisions=0,calculations=0;
  const analyze=createEnergyAnalyzer({data,debate,network,workspaceEnabled:true,normalizeState:normalizeEconomyState,summarize:(...args)=>{calculations++;return summarizeEconomy(...args);},provider:async({input})=>{calls++;return {state:{...input.state,year:2024},investigation:{...investigation,topics:['scenario'],metricIds:['electricity-generation']}};},decider:async()=>{decisions++;return {answers:{presentation:{choice:'scenario'},coverage:{choice:'supported'}}};}});
  for(const question of ['Compare electricity generation in 2030 and 2040.','Compare electricity generation in 2040 with gas production in 2030.','Compare electricity generation in 2060.']){
    await assert.rejects(analyze({question,state:{region:'AB',scenario:'Higher',year:2030,oilShock:-10,duration:'persistent'}}),error=>{
      assert.ok(error instanceof AnalysisError);assert.equal(error.code,'unsupported_period');assert.equal(error.status,422);
      assert.match(error.message,/one scenario year per analysis/);assert.match(error.message,/2023 to 2050/);return true;
    });
  }
  assert.equal(calls,0);assert.equal(decisions,0);assert.equal(calculations,0);
});
