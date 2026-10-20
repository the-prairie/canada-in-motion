import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createEnergyAnalyzer} from '../server/energy-analysis.mjs';
import {validateInvestigation,requestedScenarioYears} from '../server/energy-workspace.mjs';
import {inspectEnergyTradeQuestion} from '../server/energy-trade-request.mjs';
import {normalizeEconomyState,summarizeEconomy} from '../economy-model.mjs';
import {validateWorkspace} from '../workspace-contract.mjs';

const read=name=>readFile(new URL(`../data/${name}.json`,import.meta.url),'utf8').then(JSON.parse);
const [data,flows,fiscal,network,debate]=await Promise.all(['economy','energy-flows','provincial-impacts','network','energy-debate'].map(read));
const state={region:'AB',scenario:'Current Measures',year:2030,oilShock:10,duration:'persistent'};
const initialPlan={regions:['AB'],topics:['energy-flows'],metricIds:[],includeMap:true,requestedMeasure:'measured-flow',energyTrade:{commodity:'oil',year:2023,shockPct:10,linkScope:'touching'}};
function analyzer(settings={}) {
  let calls=0,decisions=0;
  const analyze=createEnergyAnalyzer({data,flows,fiscal,network,debate,normalizeState:normalizeEconomyState,summarize:summarizeEconomy,
    workspaceEnabled:true,provider:async input=>{calls++;return {state:{...state,...settings.modelState},investigation:structuredClone(settings.plan||initialPlan)};},
    decider:async({state:decision})=>{decisions++;assert.ok(JSON.stringify(decision).length<14000);assert.ok(!JSON.stringify(decision).includes('components'));assert.ok(!JSON.stringify(decision).includes('v177538'));return {answers:{presentation:{choice:'comparison'},coverage:{choice:'supported'}}};},...settings});
  return {analyze,get calls(){return calls;},get decisions(){return decisions;}};
}

test('historical monetary trade overrides wrong model fuel, year, scope and regional selection',async()=>{
  const f=analyzer();
  const result=await f.analyze({question:'Map the value of electricity trade between Alberta and British Columbia in 2024.',state});
  const workspace=result.workspace;
  assert.equal(workspace.plan.tradeCommodity,'electricity');assert.equal(workspace.plan.tradeYear,2024);assert.equal(workspace.plan.linkScope,'between');
  assert.deepEqual(workspace.plan.regions,['AB','BC']);assert.equal(workspace.plan.requestedMeasure,'available');
  assert.equal(workspace.panels.some(panel=>panel.type==='coverage-note'),false);
  const trade=workspace.panels.find(panel=>panel.type==='energy-trade');
  assert.equal(trade.summary.links.length,2);assert.equal(trade.summary.totals.value,481.012);
  assert.equal(workspace.panels.find(panel=>panel.type==='energy-transfers').period,'2025');
  assert.deepEqual(workspace.tradeSnapshot,flows);assert.deepEqual(workspace.fiscalSnapshot,fiscal);
  assert.doesNotThrow(()=>validateWorkspace(workspace));
  for(const source of [...flows.sources,...fiscal.sources])assert.ok(workspace.sources.some(row=>row.id===source.id));
  assert.ok(result.analysis.blocks.every(block=>typeof block.text==='string'&&block.text.length>10));
  assert.equal(f.calls,1);assert.equal(f.decisions,1);
});

test('2022 trade is independent of the CER scenario year even when a model copies it there',async()=>{
  assert.deepEqual(requestedScenarioYears('Compare natural gas trade between Alberta and Ontario in 2022.'),[]);
  const result=await analyzer({modelState:{year:2022}}).analyze({question:'Compare natural gas trade between Alberta and Ontario in 2022.',state});
  assert.equal(result.state.year,2030);assert.equal(result.workspace.plan.tradeYear,2022);assert.equal(result.workspace.plan.tradeCommodity,'gas');
});

test('a physical bilateral request preserves a gap despite two approving models',async()=>{
  const result=await analyzer().analyze({question:'How many MWh physically flowed between Alberta and British Columbia in 2025?',state});
  assert.equal(result.workspace.plan.requestedMeasure,'measured-flow');
  assert.equal(result.workspace.plan.tradeCommodity,'electricity');
  assert.equal(result.workspace.decision.coverage,'partial');
  assert.equal(result.workspace.panels[0].type,'coverage-note');
  assert.match(result.workspace.panels[0].message,/without identifying the partner/);
  assert.ok(result.workspace.panels.filter(panel=>panel.type!=='coverage-note').every(panel=>panel.role==='context'));
});

test('explicit natural-gas price decline drives checked provincial channels instead of a model oil increase',async()=>{
  const result=await analyzer({plan:{...initialPlan,topics:['provincial-impact'],requestedMeasure:'provincial-price-impact'}}).analyze({question:'How would a 10% decrease in natural gas prices affect Alberta and British Columbia?',state});
  const panel=result.workspace.panels.find(panel=>panel.type==='provincial-impact');
  assert.equal(result.workspace.plan.priceShock,-10);assert.equal(panel.result.commodity,'gas');
  assert.equal(panel.result.shockPct,-10);assert.equal(panel.result.trade.national.netChange,0);
  assert.ok(panel.result.fiscal.rows.every(row=>row.available));
  assert.ok(panel.result.fiscal.rows.every(row=>row.revenueChangeLow<0));
  assert.equal(result.workspace.plan.requestedMeasure,'available');
});

test('GDP price requests show supported trade and fiscal channels but never invent GDP',async()=>{
  const result=await analyzer({plan:{...initialPlan,topics:['provincial-impact'],requestedMeasure:'available'}}).analyze({question:'How would a 10% oil price increase affect Alberta GDP and jobs?',state});
  assert.equal(result.workspace.plan.requestedMeasure,'provincial-price-impact');
  assert.equal(result.workspace.panels[0].type,'coverage-note');
  assert.match(result.workspace.panels[0].message,/do not predict provincial GDP/);
  assert.ok(result.workspace.panels.some(panel=>panel.type==='provincial-impact'));
  assert.ok(!JSON.stringify(result.workspace.panels.find(panel=>panel.type==='provincial-impact').result).includes('gdpChange'));
});

test('ambiguous, unbounded and unpublished requests make no inference calls',async()=>{
  for(const question of [
    'Raise natural gas prices by 40% in Alberta.',
    'Raise oil and gas prices by 10% in Alberta.',
    'Raise electricity prices by 10% and lower them by 5% in Ontario.',
    'Compare oil trade between Alberta and Ontario in 2035.',
    'Compare electricity trade in 2022 and 2024.',
    'What if natural gas prices double in Alberta?',
    'What if WTI oil prices fall to $60 in Alberta?',
  ]) {
    const f=analyzer();
    await assert.rejects(f.analyze({question,state}),error=>error.status===422);
    assert.equal(f.calls,0,question);assert.equal(f.decisions,0,question);
  }
});

test('legacy investigations remain accepted while executable or invalid trade fields fail',()=>{
  const legacy={...initialPlan};delete legacy.energyTrade;assert.doesNotThrow(()=>validateInvestigation(legacy));
  for(const energyTrade of [null,{...initialPlan.energyTrade,shockPct:99},{...initialPlan.energyTrade,html:'<script>'},{...initialPlan.energyTrade,commodity:'coal'}])assert.throws(()=>validateInvestigation({...initialPlan,energyTrade}));
});

test('physical year selectors preserve annual source dates and do not become historical trade years',()=>{
  const request=inspectEnergyTradeQuestion('Show physical electricity imports and deliveries for Alberta in 2025.',flows);
  assert.equal(request.transferSet,'electricity-annual');assert.equal(request.year,flows.trade.latestYear);
});

test('live route question cannot treat measuring how much flows as available monetary trade',async()=>{
  const result=await analyzer({plan:{...initialPlan,topics:['energy-flows','infrastructure'],requestedMeasure:'available'}}).analyze({question:'Map the energy routes between Alberta and British Columbia. Can we measure how much flows between them?',state});
  assert.equal(result.workspace.plan.requestedMeasure,'measured-flow');
  assert.equal(result.workspace.panels[0].type,'coverage-note');
  assert.match(result.workspace.panels[0].message,/cannot establish a physical route or bilateral shipment volume/);
  assert.ok(result.workspace.panels.filter(panel=>panel.type!=='coverage-note').every(panel=>panel.role==='context'));
  assert.equal(result.workspace.decision.coverage,'partial');
});

test('monthly physical requests keep exact months and cannot substitute annual totals',()=>{
  for(const period of ['July 2026','2026-07']){
    const request=inspectEnergyTradeQuestion(`Show measured electricity imports for Alberta in ${period}.`,flows);
    assert.equal(request.transferSet,'electricity-monthly');
  }
  for(const period of ['June 2026','2026-06','monthly 2025'])assert.throws(()=>inspectEnergyTradeQuestion(`Show measured electricity imports for Alberta in ${period}.`,flows),error=>error.code==='unsupported_transfer_period');
});

test('price direction is attached to its own percentage and extra quantity shocks are rejected',async()=>{
  for(const [question,shock] of [
    ['Oil prices rise 10%; compare provincial effects.',10],
    ['How would a 10% decrease in oil prices affect Alberta?',-10],
    ['How would a 10% oil price drop affect Alberta?',-10],
    ['What if oil prices were 10% higher?',10],
    ['What if oil prices were 10% lower?',-10],
    ['Compare the fiscal risks of falling revenue when oil prices rise 10%.',10],
  ])assert.equal(inspectEnergyTradeQuestion(question,flows).shockPct,shock,question);
  for(const question of [
    'If oil prices rise 10% while demand drops, show provincial effects.',
    'If gas prices rise 10% and production falls, show provincial effects.',
    'What if oil prices do not increase by 10%?',
    'What if oil prices have not a 10% drop?',
    'What if oil prices fall +10%?',
  ]){
    const f=analyzer();await assert.rejects(f.analyze({question,state}),error=>error.status===422);
    assert.equal(f.calls,0);assert.equal(f.decisions,0);
  }
});

test('money and fiscal clauses cannot erase explicitly requested physical volumes',async()=>{
  for(const question of [
    'Compare the value and physical volume of electricity sent from Quebec to Ontario in 2024.',
    'Compare physical electricity volumes between Quebec and Ontario and government revenue.',
    'How much oil flows from Alberta to Ontario?',
    'How much natural gas flows from Alberta to Ontario?',
  ]){
    const request=inspectEnergyTradeQuestion(question,flows);
    assert.equal(request.physicalBilateral,true,question);
    const result=await analyzer({plan:{...initialPlan,requestedMeasure:'available'}}).analyze({question,state});
    assert.equal(result.workspace.plan.requestedMeasure,'measured-flow');
    assert.equal(result.workspace.panels[0].type,'coverage-note');
  }
  const monthly=inspectEnergyTradeQuestion('Show monthly electricity imports in July 2026.',flows);
  assert.equal(monthly.transferSet,'electricity-monthly');
});

test('compound trade questions retain missing jobs and emissions even when the planner marks them available',async()=>{
  for(const requestedMeasure of ['available','other-unavailable'])for(const question of [
    'Compare oil trade between Alberta and Ontario, and tell me how many jobs it supports.',
    'Compare oil trade between Alberta and Ontario, and forecast the emissions it generates.',
  ]){
    const result=await analyzer({plan:{...initialPlan,topics:['energy-flows','unavailable'],requestedMeasure}}).analyze({question,state});
    assert.equal(result.workspace.plan.requestedMeasure,'other-unavailable');
    assert.equal(result.workspace.panels[0].type,'coverage-note');
    assert.match(result.workspace.panels[0].message,/jobs, emissions/);
    assert.ok(result.workspace.panels.some(panel=>panel.type==='energy-trade'));
  }
});

test('observed GDP comparison in a separate clause is not classified as a causal price effect',async()=>{
  const question='Compare observed energy GDP in Alberta and Ontario in 2022, and calculate a 10% oil price increase.';
  assert.equal(inspectEnergyTradeQuestion(question,flows).unsupportedOutcome,false);
  const result=await analyzer({plan:{...initialPlan,topics:['gdp','provincial-impact'],requestedMeasure:'provincial-price-impact'}}).analyze({question,state});
  assert.equal(result.workspace.plan.requestedMeasure,'available');
  assert.ok(result.workspace.panels.some(panel=>panel.type==='province-comparison'));
  assert.ok(result.workspace.panels.some(panel=>panel.type==='provincial-impact'));
  assert.ok(result.workspace.panels.every(panel=>panel.type!=='coverage-note'));
});

test('provincial income and electricity bills remain outside trade and fiscal channels',()=>{
  for(const question of ['If oil prices rise 10%, does provincial income fall?','If electricity prices rise 10%, what happens to electricity bills?'])assert.equal(inspectEnergyTradeQuestion(question,flows).unsupportedOutcome,true);
});
