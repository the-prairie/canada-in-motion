import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {GUIDE_DEFAULTS,loadGuidedSnapshot,summarizeGuidedConnection,validateGuidedSnapshot} from '../guided-scenario-model.mjs';
import {createTradeWorkspace} from '../trade-workspace-model.mjs';
import {initialSelection,normalizeWorkspaceTradeSelection,resolveWorkspace,validateWorkspace} from '../workspace-contract.mjs';
import {captureInvestigation,validateInvestigation} from '../investigation-model.mjs';
import {normalizeEconomyState} from '../economy-model.mjs';

const read=name=>JSON.parse(readFileSync(new URL(`../data/${name}.json`,import.meta.url)));
const flows=read('energy-flows'),economy=read('economy');
const snapshot={fiscal:read('provincial-impacts'),priceResponses:read('provincial-price-response'),householdCosts:read('household-energy-costs')};
const input={...GUIDE_DEFAULTS,tradeConnection:'AB-BC',tradeCommodity:'oil',tradeYear:2024,priceShock:10,guideStep:'exchange'};
const run=(patch={},data=flows,sources=snapshot)=>summarizeGuidedConnection(data,sources,{...input,...patch});
const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-8,`${actual} differs from ${expected}`);
const rowFor=(data,commodity='oil')=>data.trade.observations.find(row=>row.year===2024&&row.commodity===commodity&&row.origin==='AB'&&row.destination==='BC');
const workspaceWithGuide=()=>({...createTradeWorkspace({economy,flows,fiscal:snapshot.fiscal,regions:['AB','BC']}),guidedSnapshot:snapshot});

test('one bilateral exchange has equal seller receipts and buyer purchase changes',()=>{
  for(const priceShock of [-20,0,20]){
    const result=run({priceShock}),value=rowFor(flows).value;
    near(result.exchange.change,value*priceShock/100);
    near(result.exchange.scenarioValue,value*(1+priceShock/100));
    assert.equal(result.exchange.sellerReceiptsChange,result.exchange.buyerCostsChange);
    assert.deepEqual(result.provinces.map(row=>[row.region,row.role]),[['AB','seller'],['BC','buyer']]);
    assert.match(result.exchange.unit,/million current CAD at basic prices/);
    assert.match(result.interpretation,/not effects attributable to this single transaction/);
  }
});

test('link size and direction cannot allocate provincial GDP, fiscal revenue or household spending',()=>{
  const original=run(),modified=structuredClone(flows),link=rowFor(modified);
  link.value*=2;
  for(const component of link.components)component.value*=2;
  const doubled=run({},modified),reversed=run({tradeConnection:'BC-AB'});
  near(doubled.exchange.change,2*original.exchange.change);
  for(const row of original.provinces)for(const channel of ['gdp','fiscal','household']){
    assert.deepEqual(doubled.provinces.find(p=>p.region===row.region)[channel],row[channel]);
    assert.deepEqual(reversed.provinces.find(p=>p.region===row.region)[channel],row[channel]);
  }
});

test('failed GDP screens suppress their point estimate while accepted fits retain uncertainty',()=>{
  const original=run(),ab=original.provinces.find(row=>row.region==='AB'),bc=original.provinces.find(row=>row.region==='BC');
  assert.equal(ab.gdp.status,'exploratory');
  assert.equal(ab.gdp.estimatePct,null);
  assert.equal(ab.gdp.lowerPct,null);
  assert.equal(ab.gdp.upperPct,null);
  assert.ok(ab.gdp.validation.n>0);
  assert.equal(bc.gdp.status,'supported');
  assert.ok(Number.isFinite(bc.gdp.estimatePct));
  assert.ok(bc.gdp.lowerPct<=bc.gdp.upperPct);
  assert.match(bc.gdp.rangeLabel,/not a forecast-error range/);
  for(const row of run({tradeCommodity:'electricity'}).provinces){
    assert.equal(row.gdp.status,'unavailable');
    assert.equal(row.gdp.estimatePct,null);
  }
});

test('retail scenarios start at zero and remain independent of the commodity-price slider',()=>{
  const unchanged=run({guideHouseholdBasis:'retail'});
  for(const row of unchanged.provinces)assert.equal(row.household.annualChangeCad,0);
  for(const tradeCommodity of ['oil','gas','electricity']){
    const first=run({tradeCommodity,guideHouseholdBasis:'retail',guideRetailShock:-7});
    const second=run({tradeCommodity,priceShock:-20,guideHouseholdBasis:'retail',guideRetailShock:-7});
    for(const row of first.provinces){
      const base=snapshot.householdCosts.spendingBaselines.find(b=>b.region===row.region&&b.commodity===tradeCommodity);
      assert.equal(row.household.status,'retail-scenario');
      near(row.household.annualChangeCad,base.currentAnnualCad*-.07);
      assert.equal(row.household.lowerAnnualCad,null);
      assert.deepEqual(second.provinces.find(p=>p.region===row.region).household,row.household);
    }
  }
});

test('unsupported benchmark transmission and missing retail references never become zero bills',()=>{
  for(const tradeCommodity of ['gas','electricity'])for(const row of run({tradeCommodity,priceShock:0}).provinces){
    assert.equal(row.household.annualChangeCad,null);
    assert.equal(row.household.monthlyEquivalentCad,null);
  }
  for(const tradeConnection of ['NL-PE','NS-NB'])for(const row of run({tradeConnection,tradeCommodity:'gas',guideHouseholdBasis:'retail'}).provinces){
    assert.equal(row.household.annualChangeCad,null);
    assert.ok(row.household.reasons.length>0);
  }
});

test('suppressed trade remains unavailable while a source-published zero remains zero',()=>{
  const missing=structuredClone(flows),link=rowFor(missing);
  link.value=null;link.status='suppressed';
  for(const component of link.components){component.value=null;component.status='suppressed';}
  const result=run({},missing);
  assert.equal(result.exchange.available,false);
  assert.equal(result.exchange.scenarioValue,null);
  assert.equal(result.exchange.change,null);
  const zero=flows.trade.observations.find(row=>row.year===2024&&row.commodity==='oil'&&row.origin!=='ROW'&&row.destination!=='ROW'&&row.status==='available'&&row.value===0);
  const publishedZero=run({tradeConnection:`${zero.origin}-${zero.destination}`});
  assert.equal(publishedZero.exchange.available,true);
  assert.equal(publishedZero.exchange.scenarioValue,0);
  assert.equal(publishedZero.exchange.change,0);
});

test('source failure retains the known exchange without substituting unsupported model results',()=>{
  const first=run(),unavailable=run({},flows,null);
  assert.deepEqual(unavailable.exchange,first.exchange);
  for(const row of unavailable.provinces){
    assert.equal(row.gdp.estimatePct,null);
    assert.equal(row.household.annualChangeCad,null);
    assert.equal(row.fiscal,null);
    assert.equal(row.trade,null);
  }
  assert.deepEqual(unavailable.versions,{trade:flows.dataVersion});
});

test('guided source loading reuses the fiscal snapshot and propagates network and abort failures',async()=>{
  const requested=[];
  const fetchSnapshot=async path=>{
    requested.push(path);
    return Response.json(path.includes('provincial-price-response')?snapshot.priceResponses:snapshot.householdCosts);
  };
  const loaded=await loadGuidedSnapshot(snapshot.fiscal,fetchSnapshot);
  assert.equal(loaded.fiscal,snapshot.fiscal);
  assert.deepEqual(requested.sort(),['data/household-energy-costs.json','data/provincial-price-response.json']);
  await assert.rejects(loadGuidedSnapshot(snapshot.fiscal,async()=>new Response(null,{status:503})),/could not load/);
  const controller=new AbortController();controller.abort();
  await assert.rejects(loadGuidedSnapshot(snapshot.fiscal,fetchSnapshot,controller.signal),{name:'AbortError'});
});

test('malformed source metadata, historical boundaries and out-of-domain controls are rejected',()=>{
  for(const patch of [{priceShock:21},{priceShock:NaN},{priceShock:'10'},{guideRetailShock:-21},{guideHorizon:2},{guideStep:'invented'},{guideHouseholdBasis:'automatic'},{tradeConnection:'AB-ROW'},{tradeConnection:'AB-AB'},{tradeYear:1900},{tradeCommodity:'coal'}])assert.throws(()=>run(patch));
  const unsafe=structuredClone(snapshot);unsafe.householdCosts.sources[0].url='javascript:alert(1)';
  assert.throws(()=>validateGuidedSnapshot(unsafe));
  const future=structuredClone(snapshot);future.priceResponses.models[0].heldout[0].trainingEnd=future.priceResponses.models[0].heldout[0].year;
  assert.throws(()=>validateGuidedSnapshot(future));
});

test('leaving a selected scope closes the guide rather than retaining a hidden connection',()=>{
  const workspace=workspaceWithGuide();
  const first={...initialSelection(workspace),...input,regions:['AB','BC'],linkScope:'between'};
  const retained=normalizeWorkspaceTradeSelection(workspace,first);
  assert.equal(retained.guideStep,'exchange');
  const changed=normalizeWorkspaceTradeSelection(workspace,{...first,regions:['QC','ON']});
  assert.equal(changed.tradeConnection,null);
  assert.equal(changed.guideStep,null);
});

test('saved investigations replay the guided scenario using pinned sources and all control values',()=>{
  const workspace=workspaceWithGuide(),selection={...initialSelection(workspace),...input,guideStep:'households',guideHorizon:1,guideHouseholdBasis:'retail',guideRetailShock:-7};
  const expected=resolveWorkspace(workspace,selection,economy).guidedResult;
  const captured=captureInvestigation({workspace,selection,question:'Oil and household costs'});
  const restored=validateInvestigation(JSON.parse(JSON.stringify(captured)));
  assert.deepEqual(restored.selection,selection);
  assert.notEqual(restored.workspace.guidedSnapshot,snapshot);
  const newer=structuredClone(economy);newer.generatedAt='2030-01-01T00:00:00Z';
  const result=resolveWorkspace(restored.workspace,restored.selection,newer).guidedResult;
  assert.deepEqual(result,expected);
  assert.deepEqual(result.versions,{trade:flows.dataVersion,fiscal:snapshot.fiscal.dataVersion,priceResponses:snapshot.priceResponses.dataVersion,householdCosts:snapshot.householdCosts.dataVersion});
  for(const data of Object.values(snapshot))for(const source of data.sources){
    assert.ok(result.sources.some(row=>row.id===source.id&&row.sha256===source.sha256&&row.url===source.url));
  }
  const invalid=structuredClone(captured);invalid.selection.guideRetailShock=99;
  assert.throws(()=>validateInvestigation(invalid));
  assert.equal(validateWorkspace(restored.workspace),restored.workspace);
});

test('URL state restores the guide and safely normalizes unsupported control values',()=>{
  const state=normalizeEconomyState({section:'trade',tradeConnection:'AB-BC',guideStep:'households',guideHorizon:1,guideHouseholdBasis:'retail',guideRetailShock:-7});
  assert.equal(state.guideStep,'households');assert.equal(state.guideHorizon,1);
  assert.equal(state.guideHouseholdBasis,'retail');assert.equal(state.guideRetailShock,-7);
  const malformed=normalizeEconomyState({guideStep:'script',guideHorizon:8,guideHouseholdBasis:'wholesale',guideRetailShock:100});
  assert.equal(malformed.guideStep,null);assert.equal(malformed.guideHorizon,0);
  assert.equal(malformed.guideHouseholdBasis,'benchmark');assert.equal(malformed.guideRetailShock,20);
});
