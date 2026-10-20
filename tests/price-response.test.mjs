import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validateProvincialPriceResponse,validateHouseholdEnergyCosts,summarizeProvincialPriceResponse,summarizeHouseholdEnergyCosts} from '../price-response-model.mjs';
import {summarizeEnergyStory,exportEnergyStory} from '../energy-story-model.mjs';

const read=async name=>JSON.parse(await readFile(new URL(`../data/${name}.json`,import.meta.url),'utf8'));
const [gdp,households]=await Promise.all(['provincial-price-response','household-energy-costs'].map(read));
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} differs from ${b}`);
const gdpRow=(region='QC',shockPct=10,horizonYears=0,commodity='oil')=>summarizeProvincialPriceResponse(gdp,{regions:[region],shockPct,horizonYears,commodity}).rows[0];
const householdRow=(region='AB',commodity='oil',shockPct=10,basis='benchmark')=>summarizeHouseholdEnergyCosts(households,{regions:[region],commodity,shockPct,basis}).rows[0];

test('published model snapshots pass boundary validation and preserve their source identity',()=>{
  assert.equal(validateProvincialPriceResponse(gdp),gdp);
  assert.equal(validateHouseholdEnergyCosts(households),households);
  assert.equal(gdp.models.length,52);
  assert.equal(households.spendingBaselines.length,30);
  for(const row of gdp.models)assert.equal(row.validation.passesScreen,Object.values(row.validation.criteria).every(Boolean));
});

test('GDP sensitivity uses the fitted log elasticity and orders negative-price bounds',()=>{
  for(const region of ['AB','QC','BC'])for(const shock of [-20,-10,0,10,20]){
    const fit=gdp.models.find(m=>m.region===region&&m.commodity==='oil'&&m.horizonYears===0),row=gdpRow(region,shock);
    near(row.estimatePct,(Math.pow(1+shock/100,fit.coefficient)-1)*100);
    assert.ok(row.lowerPct<=row.upperPct);
    if(shock===0){assert.equal(row.estimatePct,0);assert.equal(row.lowerPct,0);assert.equal(row.upperPct,0);}
    assert.match(row.rangeLabel,/not a forecast-error range/);
  }
});

test('failed GDP screens remain exploratory and cannot silently become supported',()=>{
  assert.equal(gdpRow('AB').status,'exploratory');
  assert.match(gdpRow('AB').reasons.join(' '),/sign/);
  assert.equal(gdpRow('QC').status,'supported');
  const tampered=structuredClone(gdp);
  tampered.models.find(m=>m.region==='AB'&&m.commodity==='oil'&&m.horizonYears===0).validation.passesScreen=true;
  assert.throws(()=>validateProvincialPriceResponse(tampered),/acceptance screen/);
});

test('unsupported electricity GDP and missing snapshots stay null rather than zero',()=>{
  assert.equal(gdpRow('AB',10,0,'electricity').estimatePct,null);
  const absent=summarizeProvincialPriceResponse(null,{regions:['AB']});
  assert.equal(absent.available,false);assert.equal(absent.rows[0].status,'unavailable');
  assert.deepEqual(JSON.parse(JSON.stringify(absent)),absent);
});

test('future-trained GDP and household records and altered validation results are rejected',()=>{
  const futureGDP=structuredClone(gdp);futureGDP.models[0].heldout[0].trainingEnd=futureGDP.models[0].heldout[0].year;
  assert.throws(()=>validateProvincialPriceResponse(futureGDP),/historical boundary/);
  const scoreGDP=structuredClone(gdp);scoreGDP.models[0].heldout[0].modelPct+=2;
  assert.throws(()=>validateProvincialPriceResponse(scoreGDP),/historical score/);
  const futureHousehold=structuredClone(households);const fit=futureHousehold.calibrations.find(r=>r.status==='supported');
  fit.validation.monthlyPredictions[0].trainingEnd=fit.validation.monthlyPredictions[0].month;
  assert.throws(()=>validateHouseholdEnergyCosts(futureHousehold),/historical boundary/);
});

test('motor-fuel spending integrates twelve nonlinear monthly price responses at fixed consumption',()=>{
  const fit=households.calibrations.find(r=>r.region==='AB'&&r.commodity==='oil');
  const base=households.spendingBaselines.find(r=>r.region==='AB'&&r.commodity==='oil').currentAnnualCad;
  for(const shock of [-20,-10,0,10,20]){
    const row=householdRow('AB','oil',shock);
    const expected=base*fit.responseElasticities.persistent.slice(0,12).reduce((sum,e)=>sum+Math.pow(1+shock/100,e)-1,0)/12;
    near(row.annualChangeCad,expected);near(row.monthlyEquivalentCad,expected/12);
    assert.equal(row.status,'supported');assert.ok(row.lowerAnnualCad<=row.upperAnnualCad);
    assert.equal(row.annualCheck.mae,fit.validation.annual.audit.mae);
    if(shock===0){assert.equal(row.annualChangeCad,0);assert.equal(row.lowerAnnualCad,0);assert.equal(row.upperAnnualCad,0);}
  }
});

test('retail scenarios use the stated retail percentage without wholesale inference',()=>{
  for(const commodity of ['oil','gas','electricity'])for(const shock of [-20,0,20]){
    const row=householdRow('AB',commodity,shock,'retail');
    const base=households.spendingBaselines.find(r=>r.region==='AB'&&r.commodity===commodity).currentAnnualCad;
    assert.equal(row.status,'retail-scenario');near(row.annualChangeCad,base*shock/100);
    assert.equal(row.lowerAnnualCad,null);assert.equal(row.validation,null);
  }
  assert.equal(householdRow('AB','gas').annualChangeCad,null);
  assert.equal(householdRow('AB','electricity').annualChangeCad,null);
});

test('missing index coverage and suppressed spending remain different from zero',()=>{
  for(const region of ['NS','NB'])assert.match(householdRow(region,'gas',10,'retail').reasons.join(' '),/survey reports.*index is unavailable/);
  for(const region of ['NL','PE','NU']){
    const row=householdRow(region,'gas',10,'retail');
    assert.equal(row.annualChangeCad,null);assert.equal(row.baselineAnnualCad,null);
  }
  const absent=summarizeHouseholdEnergyCosts(null,{regions:['AB']});
  assert.deepEqual(JSON.parse(JSON.stringify(absent)),absent);
  assert.match(absent.rows[0].reasons[0],/could not be loaded/);
});

test('invalid shared selections cannot become new model assumptions',()=>{
  for(const patch of [{shockPct:21},{shockPct:'10'},{shockPct:NaN},{horizonYears:2},{basis:'wholesale'},{regions:['AB','AB']},{regions:['CA']},{commodity:'coal'}]){
    assert.throws(()=>summarizeProvincialPriceResponse(gdp,patch));
    assert.throws(()=>summarizeHouseholdEnergyCosts(households,patch));
  }
});

test('connected investigation updates both channels and exports exact replay below the upload limit',async()=>{
  const snapshots=Object.fromEntries(await Promise.all([['economy','economy'],['flows','energy-flows'],['fiscal','provincial-impacts'],['forecast','provincial-forecasts']].map(async([key,name])=>[key,await read(name)])));
  snapshots.priceResponses=gdp;snapshots.householdCosts=households;
  const input={focus:'AB',compare:'QC',shockPct:10,chapter:'households',responseHorizon:1,householdBasis:'retail'};
  const result=summarizeEnergyStory(snapshots,input);
  assert.equal(result.channels.priceResponse.horizonYears,1);
  assert.equal(result.channels.households.rows[0].status,'retail-scenario');
  near(result.channels.households.rows[0].annualChangeCad,householdRow('AB','oil',10,'retail').annualChangeCad);
  const exported=exportEnergyStory(snapshots,input),serialized=JSON.stringify(exported),restored=JSON.parse(serialized);
  assert.ok(Buffer.byteLength(serialized)<12_000_000,'download must fit its own import limit');
  assert.deepEqual(summarizeEnergyStory(restored.snapshots,restored.selection),restored.result);
  for(const source of [...gdp.sources,...households.sources])assert.equal(exported.sourceHashes[source.id],source.sha256);
  assert.equal(result.channels.outlook.changesWithPrice,false);
});
