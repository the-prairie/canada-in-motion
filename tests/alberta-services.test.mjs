import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ALBERTA_STAGES, validateAlbertaServices, normalizeAlbertaStorySelection, computeAlbertaServices} from '../alberta-services-model.mjs';
const data = JSON.parse(readFileSync(new URL('../alberta-services-data.json', import.meta.url)));
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);
const metric = (d, stage, id) => d.chapters[stage].metrics.find(item => item.id === id);

test('published snapshot retains four chapters, source attribution and per-metric periods', () => {
  assert.equal(validateAlbertaServices(data), true);
  assert.deepEqual(Object.keys(data.chapters), ALBERTA_STAGES);
  assert.equal(data.reviewedAt, '2026-10-21');
  assert.deepEqual(metric(data, 'health', 'hospital-spending').periods, ['2015', '2025']);
  assert.deepEqual(metric(data, 'health', 'hospital-beds').periods, ['2014–15', '2023–24']);
  assert.deepEqual(metric(data, 'schools', 'school-spending').periods, ['2023–24']);
});

test('growth and resource ratios use multiplicative denominators, not subtraction', () => {
  const result = computeAlbertaServices(data);
  close(result.derived.realInstructionalCompensationPerStudentChangePct, (1.032 / 1.036 - 1) * 100);
  close(result.derived.studentsPerEducatorChangePct, (1.036 / 1.03 - 1) * 100);
  close(result.derived.schoolSpendingDifferencePct, (13607 / 15867 - 1) * 100);
  assert.match(metric(data, 'schools', 'school-spending').note, /including Alberta/);
  assert.equal(metric(result, 'schools', 'school-spending').series[0].change, null);
});

test('nominal hospital spending is forecast and preserves published changes despite rounded endpoints', () => {
  const spending = metric(computeAlbertaServices(data), 'health', 'hospital-spending');
  assert.match(spending.note, /not inflation-adjusted/);
  assert.deepEqual(spending.series.map(row => row.forecast), [[false, true], [false, true]]);
  assert.deepEqual(spending.series.map(row => row.changePct), [15.4, 43.1]);
  assert.equal(spending.series[1].changeBasis, 'published-percentage-change');
  assert.notEqual(spending.series[1].changePct, (2262 / 1580 - 1) * 100);
});

test('capacity, waits, access and city rent changes retain the correct units and scope', () => {
  const result = computeAlbertaServices(data);
  close(metric(result, 'health', 'hospital-beds').series[1].changePct, -9);
  const ed = metric(result, 'health', 'emergency-wait');
  close(ed.series[0].change, .5);
  assert.equal(ed.changeKind, 'absolute');
  const hip = metric(result, 'health', 'hip-access');
  close(hip.series[0].change, 7.7);
  assert.equal(hip.changeKind, 'percentage-points');
  const rent = metric(result, 'housing', 'turnover-rent');
  close(rent.series[0].change, -91);
  close(rent.series[1].change, 40);
  assert.match(rent.note, /not every tenant/);
});

test('nulls do not become zero and zero baselines do not create infinite growth', () => {
  const changed = structuredClone(data);
  const rent = metric(changed, 'housing', 'turnover-rent');
  rent.series[0].values = [1927, null];
  rent.series[1].values = [0, 1600];
  const rows = metric(computeAlbertaServices(changed), 'housing', 'turnover-rent').series;
  assert.equal(rows[0].values[1], null);
  assert.equal(rows[0].change, null);
  assert.equal(rows[0].changePct, null);
  assert.equal(rows[1].change, 1600);
  assert.equal(rows[1].changePct, null);
});

test('data validation rejects missing evidence, changed units, malformed observations and forecast loss', () => {
  for (const mutate of [
    d => {d.sources[1].id = d.sources[0].id;},
    d => {d.chapters.health.metrics[0].sourceId = 'missing';},
    d => {d.chapters.health.metrics[0].series[0].forecast = [];},
    d => {d.chapters.health.metrics[0].series[1].reportedChangePct = 90;},
    d => {d.chapters.population.metrics[0].series[0].values[0] = 0;},
    d => {d.chapters.schools.metrics[0].series[0].values[1] = Infinity;},
    d => {d.chapters.schools.metrics[0].series[0].values.pop();},
    d => {d.chapters.schools.metrics[0].unit = 'million CAD';},
    d => {d.chapters.health.metrics[3].series[0].values[1] = 101;},
    d => {d.chapters.schools.policy.sourceId = 'unknown';},
  ]) {
    const changed = structuredClone(data); mutate(changed);
    assert.throws(() => validateAlbertaServices(changed), /Alberta services/);
  }
});

test('selection normalizes invalid and legacy input without importing unrelated state', () => {
  for (const stage of ALBERTA_STAGES) assert.deepEqual(normalizeAlbertaStorySelection({stage,shockPct:20}), {stage});
  for (const raw of [null, undefined, {}, {stage:'referendum'}, {stage:2}, 'health']) assert.deepEqual(normalizeAlbertaStorySelection(raw), {stage:'population'});
  const before = JSON.stringify(data);
  computeAlbertaServices(data);
  assert.equal(JSON.stringify(data), before);
});
