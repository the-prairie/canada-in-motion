import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateIncomePaths, summarizeIncomePaths, compareIncomePaths } from '../income-path-model.mjs';

const data = JSON.parse(await readFile(new URL('../data/income-paths.json',import.meta.url),'utf8'));
const close = (actual,expected) => assert.ok(Math.abs(actual-expected)<1e-8,`${actual} ≠ ${expected}`);
const value = (summary,id) => summary.metrics.find(metric => metric.id === id);

test('official snapshot covers 13 jurisdictions and ten industries without inventing missing coefficients', () => {
  assert.equal(validateIncomePaths(data),data);
  assert.deepEqual(data.years,[2020,2021,2022]);
  assert.equal(data.observations.length,390);
  assert.equal(data.sources[0].releasedAt,'2025-11-19T08:30');
  assert.equal(data.coverage.bilateralRecipients,false);
  assert.equal(data.coverage.priceResponse,false);
});

test('Alberta final demand reproduces official GDP, labour income and employment multipliers', () => {
  const result = summarizeIncomePaths(data,{region:'AB',industry:'oil-gas',year:2022,demandMillion:100});
  const gdp = value(result,'gdp');
  close(gdp.withinProvince,85.5); close(gdp.canada,90.6); close(gdp.restOfCanada,5.1);
  close(value(result,'labour').withinProvince,19); close(value(result,'labour').canada,21.9);
  close(value(result,'jobs').withinProvince,147.9); close(value(result,'jobs').canada,185);
  close(gdp.stages[0].canada,67); close(gdp.stages[1].canada,23.7);
  close(gdp.roundingResidual.canada,-0.1);
  assert.match(gdp.coefficients.simple.canada.vector,/^v\d+$/);
  assert.equal(result.resultType,'modelled-final-demand-requirements');
  assert.equal(result.includeInduced,false);
});

test('all regional scenarios reconcile geography and retain published rounding', () => {
  for (const industry of data.industries) for (const includeInduced of [false,true]) {
    for (const result of compareIncomePaths(data,{industry:industry.id,demandMillion:73.5,includeInduced})) {
      for (const metric of result.metrics) {
        if (!metric.available) continue;
        close(metric.withinProvince+metric.restOfCanada,metric.canada);
        for (const scope of ['withinProvince','restOfCanada','canada']) {
          close(metric.stages.reduce((sum,row)=>sum+row[scope],0)+metric.roundingResidual[scope],metric[scope]);
        }
      }
    }
  }
});

test('missing oil-sands coefficients remain null even for a zero-demand scenario', () => {
  for (const demandMillion of [0,100]) {
    const result = summarizeIncomePaths(data,{region:'ON',industry:'oil-sands',demandMillion});
    assert.equal(result.available,false);
    assert.ok(result.metrics.every(metric=>metric.withinProvince===null && metric.canada===null && metric.restOfCanada===null));
  }
});

test('demand scales linearly and optional induced effects use their distinct published total', () => {
  const zero = summarizeIncomePaths(data,{demandMillion:0});
  assert.ok(zero.metrics.every(metric=>metric.canada===0 && metric.restOfCanada===0));
  const first = summarizeIncomePaths(data,{demandMillion:100});
  const twice = summarizeIncomePaths(data,{demandMillion:200});
  const induced = summarizeIncomePaths(data,{demandMillion:100,includeInduced:true});
  first.metrics.forEach((metric,i)=>close(twice.metrics[i].canada,metric.canada*2));
  assert.equal(induced.metrics[0].stages.length,3);
  assert.equal(induced.metrics[0].coefficients.total.canada.value*100,induced.metrics[0].canada);
  assert.ok(induced.metrics[0].canada>first.metrics[0].canada);
});

test('rejects price shocks, bilateral assumptions, incorrect types and unsupported input', () => {
  for (const input of [null,'100',[],{price:10},{shockPct:10},{priceShock:10},{recipient:'ON'},{destination:'QC'},
    {region:'CA'},{industry:'oil'},{year:2024},{demandMillion:-1},{demandMillion:Infinity},
    {demandMillion:10001},{demandMillion:'100'},{includeInduced:'false'}]) {
    assert.throws(()=>summarizeIncomePaths(data,input),/Invalid income-path input/);
  }
});

test('rejects changed units/precision, suppressed values, duplicates and broken accounting', () => {
  for (const mutate of [
    copy=>{copy.coefficientDecimals=2;},
    copy=>{copy.observations[1]=copy.observations[0];},
    copy=>{copy.coverage.priceResponse=true;},
    copy=>{const row=copy.observations.find(r=>r.region==='AB'&&r.industry==='oil-gas');row.effects.simple.canada.gdp.value+=0.1;},
    copy=>{const row=copy.observations.find(r=>r.region==='AB'&&r.industry==='oil-gas');row.effects.direct.canada.gdp.status='suppressed';},
  ]) {
    const copy=structuredClone(data);mutate(copy);assert.throws(()=>validateIncomePaths(copy),/Invalid income-path input/);
  }
});
