import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateEconomy, normalizeEconomyState, summarizeEconomy } from '../economy-model.mjs';
const data = JSON.parse(readFileSync(new URL('../data/economy.json', import.meta.url), 'utf8'));
const copy = () => structuredClone(data);

test('economic snapshot covers every jurisdiction with matching GDP valuation and attributed sources', () => {
  assert.equal(validateEconomy(data), data);
  const result = summarizeEconomy(data, {});
  assert.equal(result.gdp.ranking.length, 13);
  assert.equal(result.gdp.national.energy, result.gdp.ranking.reduce((sum, row) => sum + row.energy, 0));
  assert.ok(Math.abs(result.gdp.ranking.reduce((sum, row) => sum + row.nationalEnergySharePct, 0) - 100) < 1e-10);
  const ab = summarizeEconomy(data, { region: 'AB' }).gdp.selected;
  assert.equal(ab.energy, 163605.9);
  assert.equal(data.gdp.year, 2022);
  assert.ok(Math.abs(ab.sharePct - 163605.9 / 456439.6 * 100) < 1e-10);
});

test('Current Measures compares to itself without inventing unavailable provincial output', () => {
  for (const region of data.regions) {
    const result = summarizeEconomy(data, { region: region.code });
    for (const metric of result.metrics) {
      if (metric.selected !== null) assert.equal(metric.delta, 0);
      else assert.equal(metric.delta, null);
    }
  }
  const result = summarizeEconomy(data, { region: 'NU', scenario: 'Higher' });
  assert.equal(result.metrics.find(m => m.id === 'oil-production').selected, null);
  assert.equal(result.metrics.find(m => m.id === 'gas-production').status, 'unavailable');
  assert.ok(result.metrics.find(m => m.id === 'electricity-generation').selected > 0);
  assert.equal(summarizeEconomy(data, {}).metrics.find(m => m.id === 'electricity-price').selected, null);
});

test('scenario prices and physical output retain their basis and differ from the baseline', () => {
  const result = summarizeEconomy(data, { region: 'AB', scenario: 'Higher', year: 2030 });
  const oil = result.metrics.find(m => m.id === 'wti');
  assert.equal(oil.unit, '2025 US$/barrel');
  assert.ok(oil.selected > oil.baseline);
  assert.equal(oil.region, 'CA');
  const price = result.metrics.find(m => m.id === 'electricity-price');
  assert.equal(price.baseline, 100);
  assert.equal(price.sector, 'Residential');
  assert.equal(result.publishedOilSensitivity.available, false);
  assert.deepEqual(result.publishedOilSensitivity.years, []);
});

test('national sensitivity preserves published rounding and isolates the 2026 calibration', () => {
  const persistent = summarizeEconomy(data, { oilShock: 10 }).publishedOilSensitivity;
  assert.equal(persistent.exactPublishedPreset, true);
  assert.equal(persistent.years[0].nominalGdpPct, 0.5);
  assert.equal(persistent.years[1].nominalGdpBillionCad, 22);
  const temporary = summarizeEconomy(data, { oilShock: 10, duration: 'temporary', year: 2050 }).publishedOilSensitivity;
  assert.equal(temporary.years[1].nominalGdpPct, 0);
  assert.equal(temporary.years[1].nominalGdpBillionCad, 1);
  assert.equal(temporary.years[1].yearAfterShock, 2);
  assert.match(temporary.baseline, /2026/);
});

test('zero shock is identity and negative shocks are labelled bounded approximations', () => {
  const zero = summarizeEconomy(data, { oilShock: 0 }).publishedOilSensitivity;
  for (const year of zero.years) for (const [key, value] of Object.entries(year)) if (key !== 'yearAfterShock') assert.equal(value, 0);
  const negative = summarizeEconomy(data, { oilShock: -10 }).publishedOilSensitivity;
  assert.equal(negative.years[0].nominalGdpPct, -0.5);
  assert.match(negative.method, /Local linear approximation/);
  assert.equal(negative.exactPublishedPreset, false);
  assert.equal(normalizeEconomyState({ oilShock: 200 }).oilShock, 20);
  assert.deepEqual(normalizeEconomyState(null), normalizeEconomyState({}));
  assert.equal(normalizeEconomyState({ year: 'bad', region: 'USA', scenario: 'invented' }).region, 'CA');
});

test('oil stress is not silently applied to CER scenario paths or provincial GDP', () => {
  const before = summarizeEconomy(data, { oilShock: 0, scenario: 'Lower' });
  const after = summarizeEconomy(data, { oilShock: 20, scenario: 'Lower' });
  assert.deepEqual(before.metrics, after.metrics);
  assert.deepEqual(before.gdp, after.gdp);
});

test('invalid accounting, source provenance, duplicates and physical totals block a snapshot', () => {
  const mutations = [
    d => { d.gdp.regions[0].sharePct += 1; },
    d => { d.sources.pop(); },
    d => { d.metrics[0].series.push(d.metrics[0].series[0]); },
    d => { d.metrics.find(m => m.id === 'electricity-generation').series.find(s => s.region === 'CA').values[0] += 1000; },
    d => { d.metrics[0].series[0].values[0] = Infinity; },
    d => { d.gdp.regions.pop(); },
    d => { d.sources[0].sha256 = 'unverified'; },
  ];
  for (const mutate of mutations) {
    const altered = copy(); mutate(altered);
    assert.throws(() => validateEconomy(altered), /Invalid economy data/);
  }
});

test('shared analysis preserves presentation and separates observed accounts from scenario horizons', async () => {
  const { encodeState, decodeState, normalizeState } = await import('../model.mjs');
  const state = normalizeState({ view: 'economy', economy: { region: 'BC', section: 'futures', display: 'table', metric: 'retail', scenario: 'Lower', year: 2050 } });
  assert.deepEqual(decodeState(encodeState(state)).economy, state.economy);
  const summary = summarizeEconomy(data, state.economy);
  assert.equal(summary.gdp.year, 2022);
  assert.equal(summary.metrics.find(m => m.id === 'electricity-price').year, 2050);
  assert.equal(normalizeEconomyState({ section: 'invented', display: '3d', metric: 'GDP forecast' }).section, 'income');
  assert.equal(normalizeEconomyState({ display: '3d' }).display, 'bars');
  assert.match(summarizeEconomy(data, {}).metrics.find(m => m.id === 'electricity-price').unavailableReason, /not for Canada/);
});

test('rounded zero in a temporary negative oil shock is not a negative-zero claim', () => {
  const years = summarizeEconomy(data, {oilShock:-20,duration:'temporary'}).publishedOilSensitivity.years;
  assert.equal(years[0].realGdpPct, 0);
  assert.equal(years[1].nominalGdpPct, 0);
});

test('public debate notes retain dated, attributable primary sources', () => {
  const context = JSON.parse(readFileSync(new URL('../data/energy-debate.json',import.meta.url),'utf8'));
  assert.match(context.reviewDate,/^\d{4}-\d{2}-\d{2}$/);
  const sources = new Map(context.sources.map(source=>[source.id,source]));
  assert.equal(sources.size,context.sources.length);
  for(const source of context.sources) assert.equal(new URL(source.url).protocol,'https:');
  for(const fact of context.facts) {
    assert.ok(fact.text.length>0 && fact.sourceIds.length>0);
    assert.ok(fact.sourceIds.every(id=>sources.has(id)));
  }
});

test('historical boundaries distinguish observed prices from projected electricity in mixed years', () => {
  const history = summarizeEconomy(data, {region:'AB',scenario:'Higher',year:2023});
  assert.ok(history.metrics.filter(m=>m.selected!==null).every(m=>m.status==='observed'));
  const mixed = summarizeEconomy(data, {region:'AB',scenario:'Higher',year:2024});
  assert.equal(mixed.metrics.find(m=>m.id==='wti').status,'observed');
  assert.equal(mixed.metrics.find(m=>m.id==='oil-production').status,'observed');
  assert.equal(mixed.metrics.find(m=>m.id==='electricity-generation').status,'projected');
  assert.equal(mixed.metrics.find(m=>m.id==='electricity-price').status,'projected');
});
