import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateProvincialForecast,validateEnergyForecastEvaluation} from '../provincial-forecast-model.mjs';
const data=JSON.parse(readFileSync(new URL('../data/provincial-forecasts.json',import.meta.url)));

test('energy experiment reproduces the incumbent and fails the precommitted release threshold',()=>{
  const e=validateEnergyForecastEvaluation(data);
  assert.equal(e.adopted,false);
  for(const h of e.horizons){
    assert.equal(h.baseline.count,30);assert.equal(h.passed,false);assert.equal(h.gates.mae,false);
    assert.equal(h.byYear.length,3);assert.equal(h.byProvince.length,10);
  }
  assert.ok(e.horizons[0].maeGainPct>0&&e.horizons[0].maeGainPct<1);
  assert.equal(e.horizons[0].changedCount,3);
  assert.equal(e.horizons[1].changedCount,0);
  for(const r of data.forecasts){
    const replay=e.records.find(x=>x.region===r.region&&x.horizon===r.horizon&&x.originYear===data.forecastOriginYear);
    assert.equal(r.predictionPct,replay.baselinePct);
  }
});

test('saved workspaces without experimental evidence remain compatible',()=>{
  const legacy=structuredClone(data);delete legacy.energyEvaluation;
  assert.equal(validateProvincialForecast(legacy),legacy);
});

test('tampered energy scores, selection, features and future inputs are rejected',()=>{
  const correction=e=>e.records.find(r=>r.corrections.oil!==null);
  for(const mutate of [
    e=>e.horizons[0].maeGainPct=20,
    e=>e.horizons[0].experiment.mae-=.1,
    e=>e.horizons[0].byProvince[0].experiment.mae-=.1,
    e=>e.horizons[0].passed=true,
    e=>e.horizons[0].gates.mae=true,
    e=>e.horizons[0].changedCount=30,
    e=>e.horizons[0].periods[0].experiment.rmse+=1,
    e=>e.horizons[0].eligibleOnly.baseline.count+=1,
    e=>e.horizons[0].byYear[1].year=e.horizons[0].byYear[0].year,
    e=>e.features.find(f=>f.status==='available').growthPct+=10,
    e=>e.features.find(f=>f.status==='available').currentTotal=null,
    e=>e.records.push(e.records[0]),
    e=>correction(e).corrections.oil.trainingMaxTargetYear=2050,
    e=>correction(e).corrections.oil.deltaPp=2,
    e=>correction(e).candidatePredictions['oil-residual']+=1,
    e=>e.records.find(r=>Object.keys(r.selectionScores).length).selectionScores={'oil-residual':{mae:0,count:3,maxTargetYear:2050}},
    e=>e.sources[0].releaseTime='2050-01-01',
    e=>e.protocol.energyCutoffMonth=9,
    e=>e.adopted=true,
    e=>e.status='outside-tested-cutoff',
  ]){
    const changed=structuredClone(data);mutate(changed.energyEvaluation);
    assert.throws(()=>validateEnergyForecastEvaluation(changed),mutate.toString());
  }
});

test('an unadopted challenger cannot replace the current point forecast',()=>{
  const changed=structuredClone(data),e=changed.energyEvaluation;
  const row=e.records.find(r=>r.originYear===data.forecastOriginYear&&r.selected!=='incumbent');
  assert.ok(row);
  changed.forecasts.find(r=>r.region===row.region&&r.horizon===row.horizon).predictionPct=row.experimentalPct;
  assert.throws(()=>validateEnergyForecastEvaluation(changed),/promoted/);
});
