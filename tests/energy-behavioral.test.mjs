import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {inspectEnergyTradeQuestion} from '../server/energy-trade-request.mjs';
import {createEnergyAnalyzer} from '../server/energy-analysis.mjs';
import {normalizeEconomyState,summarizeEconomy} from '../economy-model.mjs';
import {validateWorkspace} from '../workspace-contract.mjs';
import {interpretationFamilies,rejectionCases,regionalCases} from './fixtures/energy-behavioral-cases.mjs';

const read=name=>JSON.parse(readFileSync(new URL(`../data/${name}.json`,import.meta.url)));
const data=read('economy'),flows=read('energy-flows'),fiscal=read('provincial-impacts');
const state={region:'CA',scenario:'Current Measures',year:2030,oilShock:10,duration:'persistent'};
// An intentionally mistaken but schema-valid planner. Explicit user requests
// must survive regardless of this proposal or the second model's approval.
const wrongPlan={regions:['NU'],topics:['energy-flows'],metricIds:[],includeMap:true,requestedMeasure:'available',energyTrade:{commodity:'gas',year:2022,shockPct:15,linkScope:'touching'}};
function analyzer(plan=wrongPlan) {
  let calls=0,decisions=0;
  const analyze=createEnergyAnalyzer({data,flows,fiscal,normalizeState:normalizeEconomyState,summarize:summarizeEconomy,workspaceEnabled:true,
    provider:async()=>{calls++;return {state:{...state},investigation:structuredClone(plan)};},
    decider:async()=>{decisions++;return {answers:{presentation:{choice:'comparison'},coverage:{choice:'supported'}}};},
  });
  return {analyze,get calls(){return calls;},get decisions(){return decisions;}};
}

for(const family of interpretationFamilies)for(const [index,question] of family.questions.entries()){
  test(`behavior/${family.capability}/${family.id}/${index+1}`,()=>{
    const result=inspectEnergyTradeQuestion(question,flows,wrongPlan.energyTrade,[],fiscal);
    assert.ok(result,question);
    for(const [key,value] of Object.entries(family.expect))assert.deepEqual(result[key],value,`${question} — ${key}`);
  });
}

for(const [capability,question,code] of rejectionCases){
  test(`behavior/${capability}/reject: ${question}`,async()=>{
    assert.throws(()=>inspectEnergyTradeQuestion(question,flows,undefined,[],fiscal),error=>error.code===code);
    const f=analyzer();
    await assert.rejects(f.analyze({question,state}),error=>error.status===422);
    assert.equal(f.calls,0,'unsupported requests must not spend inference quota');
    assert.equal(f.decisions,0);
  });
}

for(const entry of regionalCases)test(`behavior/regions: ${entry.question}`,async()=>{
  const result=await analyzer({...wrongPlan,regions:['CA']}).analyze({question:entry.question,state});
  if(entry.regions)assert.deepEqual(result.workspace.plan.regions,entry.regions);
  if(entry.exclude){
    assert.equal(result.workspace.plan.regions.length,entry.count);
    for(const code of entry.exclude)assert.ok(!result.workspace.plan.regions.includes(code));
  }
  validateWorkspace(result.workspace);
});

test('behavior/metamorphic: paraphrases and province ordering preserve every selected source record',async()=>{
  const questions=[
    'Compare the value of electricity trade between Alberta and British Columbia in 2023.',
    'How much was electricity traded between British Columbia and Alberta worth in 2023?',
    'Montrez la valeur des échanges d’électricité entre l’Alberta et la Colombie-Britannique en 2023.',
  ];
  let reference;
  for(const question of questions){
    const result=await analyzer().analyze({question,state});
    validateWorkspace(result.workspace);
    const trade=result.workspace.panels.find(panel=>panel.type==='energy-trade');
    assert.equal(trade.summary.links.length,2);
    const observed=trade.summary.links.map(row=>[row.origin,row.destination,row.year,row.value]).sort();
    reference??=observed;
    assert.deepEqual(observed,reference);
    assert.equal(result.workspace.plan.tradeYear,2023);
    assert.deepEqual(result.workspace.plan.regions,['AB','BC']);
  }
});

test('behavior/metamorphic: price sign reversal reverses every available result and zero is identity',async()=>{
  const results=new Map();
  for(const shock of [-10,0,10]){
    const result=await analyzer({...wrongPlan,topics:['provincial-impact']}).analyze({question:`Apply a ${shock}% natural gas price change across Canada.`,state});
    validateWorkspace(result.workspace);
    const impact=result.workspace.panels.find(panel=>panel.type==='provincial-impact').result;
    assert.equal(impact.shockPct,shock);
    assert.equal(impact.trade.national.netChange,0,'domestic counterparties must cancel');
    assert.ok(!('gdpChange' in impact));
    results.set(shock,impact);
  }
  for(const row of results.get(10).trade.rows){
    const down=results.get(-10).trade.rows.find(other=>other.region===row.region);
    const zero=results.get(0).trade.rows.find(other=>other.region===row.region);
    for(const key of ['netChange','receiptsChange','purchasesChange']){
      assert.ok(key in row);
      if(row[key]===null){assert.equal(down[key],null);assert.equal(zero[key],null);}
      else{assert.ok(Math.abs(row[key]+down[key])<1e-8);assert.equal(Math.abs(zero[key]),0);}
    }
  }
  for(const row of results.get(10).fiscal.rows.filter(row=>row.available)){
    const down=results.get(-10).fiscal.rows.find(other=>other.region===row.region);
    assert.ok(Math.abs(row.revenueChangeLow+down.revenueChangeHigh)<1e-8);
    assert.ok(Math.abs(row.revenueChangeHigh+down.revenueChangeLow)<1e-8);
  }
});

test('behavior/metamorphic: adding unsupported outcomes preserves context values but changes answer coverage',async()=>{
  const base='Compare the value of oil trade between Alberta and Ontario in 2024';
  const direct=await analyzer().analyze({question:base,state});
  const directRows=direct.workspace.panels.find(panel=>panel.type==='energy-trade').summary.links;
  for(const suffix of [' and estimate jobs it supports.',' and forecast its emissions.',' and predict household bills.']){
    const result=await analyzer().analyze({question:base+suffix,state});
    assert.equal(result.workspace.panels[0].type,'coverage-note');
    assert.notEqual(result.workspace.plan.requestedMeasure,'available');
    assert.deepEqual(result.workspace.panels.find(panel=>panel.type==='energy-trade').summary.links,directRows);
    assert.equal(result.workspace.decision.coverage,'partial');
  }
});

test('behavior/corpus: each required behavioral capability remains represented',()=>{
  const capabilities=new Set([...interpretationFamilies.map(row=>row.capability),...rejectionCases.map(row=>row[0])]);
  for(const expected of ['paraphrases','French','direction','numbers','exclusions','units','periods','scope','coverage','negation','ambiguity','bounds','quantity-shock'])assert.ok(capabilities.has(expected),expected);
  assert.ok(interpretationFamilies.reduce((sum,row)=>sum+row.questions.length,0)+rejectionCases.length>=60);
});


test('behavior/negation: unchanged prices override the planner with an exact zero scenario',async()=>{
  for(const question of ['Keep oil prices unchanged across Canada.','Hold oil prices constant across Canada.','Do not change oil prices across Canada.','Oil prices remain flat across Canada.','Les prix du pétrole restent inchangés au Canada.']){
    const parsed=inspectEnergyTradeQuestion(question,flows,wrongPlan.energyTrade,[],fiscal);
    assert.equal(parsed.shockPct,0,question);
    assert.equal(parsed.includeImpacts,true,question);
    const result=await analyzer({...wrongPlan,topics:['provincial-impact']}).analyze({question,state});
    const impact=result.workspace.panels.find(panel=>panel.type==='provincial-impact').result;
    assert.equal(impact.shockPct,0,question);
    assert.ok(impact.trade.rows.every(row=>row.netChange===null||row.netChange===0),question);
  }
});

test('behavior/exclusions: monetary trade excludes expressly unwanted physical views',async()=>{
  for(const question of ['Compare oil trade value, not physical volumes, between Alberta and Ontario in 2024.','Compare electricity trade value between Alberta and British Columbia in 2024, excluding physical flows.','Compare the value of natural gas trade between Alberta and Ontario in 2024, not physical gas volumes.']){
    const parsed=inspectEnergyTradeQuestion(question,flows,wrongPlan.energyTrade,[],fiscal);
    assert.equal(parsed.includePhysical,false,question);
    assert.equal(parsed.physicalBilateral,false,question);
    const result=await analyzer().analyze({question,state});
    assert.ok(result.workspace.panels.some(panel=>panel.type==='energy-trade'),question);
    assert.ok(result.workspace.panels.every(panel=>panel.type!=='physical-transfers'),question);
    assert.ok(result.workspace.panels.every(panel=>panel.type!=='coverage-note'),question);
  }
});

test('behavior/ambiguity: unchanged price plus a nonzero price change is rejected before inference',async()=>{
  const question='Keep oil prices unchanged but raise them 10% across Canada.';
  assert.throws(()=>inspectEnergyTradeQuestion(question,flows,wrongPlan.energyTrade,[],fiscal),error=>error.code==='ambiguous_price_change');
  const f=analyzer();
  await assert.rejects(f.analyze({question,state}),error=>error.status===422);
  assert.equal(f.calls,0);
  const valid=inspectEnergyTradeQuestion('Oil prices rise 10% while production stays unchanged.',flows,wrongPlan.energyTrade,[],fiscal);
  assert.equal(valid.shockPct,10,'unchanged production must not become an unchanged price');
});


test('behavior/numbers: leading-dot percentages preserve the explicit period and computed sign end to end',async()=>{
  for(const [question,shockPct] of [['Oil prices rise .5% in Alberta in 2023.',0.5],['Apply a −.5% oil price change in Alberta in 2023.',-0.5]]){
    const parsed=inspectEnergyTradeQuestion(question,flows,wrongPlan.energyTrade,[],fiscal);
    assert.equal(parsed.shockPct,shockPct);
    assert.equal(parsed.year,2023);
    const result=await analyzer({...wrongPlan,topics:['provincial-impact']}).analyze({question,state});
    const impact=result.workspace.panels.find(panel=>panel.type==='provincial-impact').result;
    assert.equal(impact.shockPct,shockPct);
    assert.equal(impact.year,2023);
    assert.ok(impact.trade.rows.every(row=>row.receiptsChange===null||row.exports===0||Math.sign(row.receiptsChange)===Math.sign(shockPct)));
  }
});
