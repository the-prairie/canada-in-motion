import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validateDynamicPriceHistory, summarizeDynamicPriceHistory } from '../dynamic-price-model.mjs';
const data = JSON.parse(fs.readFileSync(new URL('../data/dynamic-price-history.json', import.meta.url)));
const copy = () => structuredClone(data);

test('history contains Canada and all jurisdictions with explicit missing territorial history', () => {
  assert.equal(validateDynamicPriceHistory(data), data);
  assert.equal(new Set(data.gdp.observations.map(row => row.region)).size, 14);
  assert.equal(data.gdp.observations.find(row => row.region === 'NU' && row.year === 1998).value, null);
  assert.ok(data.gdp.observations.find(row => row.region === 'NU' && row.year === 1999).value > 0);
});

test('2015 episode uses published price and GDP levels without a causal multiplier', () => {
  const r = summarizeDynamicPriceHistory(data, {regions: ['AB', 'ON'], oilChangePct: -48, horizonYears: 2, selectedYear: 2015});
  assert.equal(r.selected.oilPrice, 48.66);
  assert.equal(r.selected.previousOilPrice, 93.17);
  assert.ok(Math.abs(r.selected.oilChangePct - (48.66 / 93.17 - 1) * 100) < 1e-10);
  for (const region of r.selected.gdp) {
    const source = year => data.gdp.observations.find(row => row.region === region.region && row.year === year).value;
    assert.equal(region.baselineGDP, source(2014));
    assert.equal(region.path[0].changePct, 0);
    for (const point of region.path) assert.ok(Math.abs(point.changePct - (source(point.year) / source(2014) - 1) * 100) < 1e-10);
  }
  assert.equal(r.forecastGate.enabled, false);
  assert.match(r.interpretation, /do not isolate/);
});

test('matching depends on oil change and complete coverage, not favourable GDP outcomes', () => {
  const opts = {regions: ['AB', 'ON'], oilChangePct: -20, horizonYears: 2};
  const first = summarizeDynamicPriceHistory(data, opts);
  const changed = copy();
  for (const row of changed.gdp.observations) if (row.region === 'AB' && row.value !== null) row.value *= row.year % 2 ? 2 : 0.5;
  const second = summarizeDynamicPriceHistory(changed, opts);
  assert.deepEqual(first.episodes.map(row => row.year), second.episodes.map(row => row.year));
  assert.ok(first.episodes.every(row => row.oilChangePct < 0));
  assert.ok(first.episodes.every((row, i, rows) => !i || rows[i - 1].distancePctPoints <= row.distancePctPoints));
});

test('horizons retain full observed paths and do not extrapolate the last year', () => {
  const zero = summarizeDynamicPriceHistory(data, {horizonYears: 0});
  const two = summarizeDynamicPriceHistory(data, {horizonYears: 2});
  assert.equal(Math.max(...zero.years) - Math.max(...two.years), 2);
  assert.equal(zero.selected.gdp[0].path.length, 2);
  assert.equal(two.selected.gdp[0].path.length, 4);
  assert.throws(() => summarizeDynamicPriceHistory(data, {selectedYear: Math.max(...zero.years), horizonYears: 2}), /unavailable/);
});

test('territory selection never assigns pre-division GDP or skips missing years', () => {
  const r = summarizeDynamicPriceHistory(data, {regions: ['NT', 'NU'], horizonYears: 2});
  assert.equal(Math.min(...r.years), 2000);
  assert.ok(r.selected.gdp.every(row => row.baselineYear >= 1999));
});

test('heldout outcomes are later than every training outcome and all candidates share the comparison sample', () => {
  for (const row of data.experiments) {
    assert.ok(row.heldout.every(t => t.latestTrainingOutcomeYear < t.year));
    const peers = data.experiments.filter(other => other.region === row.region && other.horizonYears === row.horizonYears);
    for (const peer of peers) {
      assert.deepEqual(peer.heldout.map(t => t.year), row.heldout.map(t => t.year));
      assert.equal(peer.baselineMaePctPoints, row.baselineMaePctPoints);
    }
  }
});

test('candidate validation remains research-only when an error screen passes', () => {
  assert.ok(data.experiments.some(row => row.passesErrorScreen));
  assert.ok(data.experiments.every(row => row.publicScenarioEnabled === false));
  const r = summarizeDynamicPriceHistory(data, {regions: ['AB'], horizonYears: 0});
  assert.ok(r.validation.some(row => row.passesErrorScreen));
  assert.equal(r.forecastGate.enabled, false);
});

test('validator catches score manipulation and temporal leakage', () => {
  const score = copy(); score.experiments[0].maePctPoints += 1;
  assert.throws(() => validateDynamicPriceHistory(score), /score mismatch/);
  const leaked = copy(); const first = leaked.experiments.find(r => r.heldout.length).heldout[0];
  first.latestTrainingOutcomeYear = first.year;
  assert.throws(() => validateDynamicPriceHistory(leaked), /temporal leakage/);
});

test('validator rejects fabricated causal activation, duplicate records and missing value coercion', () => {
  const enabled = copy(); enabled.forecastGate.enabled = true;
  assert.throws(() => validateDynamicPriceHistory(enabled), /gate/);
  const duplicated = copy(); duplicated.gdp.observations.push(duplicated.gdp.observations[0]);
  assert.throws(() => validateDynamicPriceHistory(duplicated), /identity/);
  const zero = copy(); zero.gdp.observations.find(row => row.status === 'not-published').value = 0;
  assert.throws(() => validateDynamicPriceHistory(zero), /observation value/);
});

test('input boundaries reject invalid regions, horizon, episode count and shock numbers', () => {
  for (const options of [null, [], {forecast: true}, {regions: []}, {regions: ['XX']}, {regions: 'AB'}, {horizonYears: 3}, {episodeCount: 0}, {oilChangePct: NaN}, {oilChangePct: -61}, {oilChangePct: 101}]) {
    assert.throws(() => summarizeDynamicPriceHistory(data, options));
  }
  for (const oilChangePct of [-60, 0, 100]) assert.equal(summarizeDynamicPriceHistory(data, {oilChangePct}).oilChangePct, oilChangePct);
});
