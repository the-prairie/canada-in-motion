import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { normalizeEnergyStorySelection, summarizeEnergyStory, exportEnergyStory, ENERGY_STORY_CHAPTERS } from '../energy-story-model.mjs';

const snapshots = Object.fromEntries(await Promise.all(
  [['economy', 'economy'], ['flows', 'energy-flows'], ['fiscal', 'provincial-impacts'], ['forecast', 'provincial-forecasts']]
    .map(async ([key, name]) => [key, JSON.parse(await readFile(new URL(`../data/${name}.json`, import.meta.url), 'utf8'))]),
));
const base = { commodity: 'oil', focus: 'AB', compare: 'ON', shockPct: -10, tradeYear: 2024, duration: 'persistent', chapter: 'overview' };
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-7, `${actual} differs from ${expected}`);
const run = input => summarizeEnergyStory(snapshots, { ...base, ...input });

test('absent selections use explicit defaults and duplicate comparison becomes no comparison', () => {
  assert.deepEqual(normalizeEnergyStorySelection(snapshots), {
    commodity: 'oil', focus: 'AB', compare: null, shockPct: -10,
    tradeYear: snapshots.flows.trade.latestYear, duration: 'persistent', chapter: 'overview', responseHorizon: 0, householdBasis: 'benchmark',
  });
  assert.equal(normalizeEnergyStorySelection(snapshots, { focus: 'ON', compare: 'ON' }).compare, null);
  for (const chapter of ENERGY_STORY_CHAPTERS) {
    assert.equal(normalizeEnergyStorySelection(snapshots, { chapter }).chapter, chapter);
  }
});

test('explicit invalid computations are rejected instead of coerced or clamped', () => {
  for (const patch of [
    { shockPct: 40 }, { shockPct: -21 }, { shockPct: NaN }, { shockPct: Infinity },
    { shockPct: '-10' }, { shockPct: null }, { commodity: 'coal' }, { commodity: null },
    { focus: 'CA' }, { focus: 'XX' }, { compare: 'XX' }, { compare: false },
    { tradeYear: 2090 }, { tradeYear: '2024' }, { tradeYear: 2024.5 },
    { duration: 'forever' }, { chapter: 'invented' },
  ]) assert.throws(() => run(patch));
  assert.throws(() => normalizeEnergyStorySelection(snapshots, null));
  assert.throws(() => normalizeEnergyStorySelection(snapshots, []));
  assert.throws(() => normalizeEnergyStorySelection({}, {}));
});

test('Alberta minus ten percent keeps domestic basic-price values separate from international FOB values', () => {
  const { channels } = run();
  const domestic = channels.domestic.focus;
  near(domestic.exports, 21896.713);
  near(domestic.imports, 894.037);
  near(domestic.receiptsChange, -2189.6713);
  near(domestic.purchasesChange, -89.4037);
  near(domestic.netChange, -2100.2676);
  near(channels.international.focus.receiptsChange, -11640.9124);
  assert.match(channels.domestic.unit, /basic prices/);
  assert.match(channels.international.unit, /FOB/);
  assert.equal(channels.domestic.allRegions.length, 13);
  assert.equal(channels.domestic.comparison.region, 'ON');
  near(channels.domestic.comparison.netChange, 1143.4935);
  assert.deepEqual(channels.international.comparison, channels.domestic.comparison.international);
});

test('domestic trade conserves national balances and the rest-of-Canada sum offsets the focus', () => {
  for (const commodity of ['oil', 'gas', 'electricity']) {
    const { domestic } = run({ commodity }).channels;
    near(domestic.national.exports, domestic.national.imports);
    assert.equal(domestic.national.netChange, 0);
    near(domestic.allRegions.reduce((sum, row) => sum + row.netChange, 0), 0);
    near(domestic.restOfCanada.netChange, -domestic.focus.netChange);
    assert.equal(domestic.restOfCanada.excluding, 'AB');
    assert.match(domestic.restOfCanada.scope, /including their trade with one another/);
  }
});

test('partners retain source components, missingness and direction and exclude international links', () => {
  const partners = run().channels.domestic.partners;
  assert.equal(partners.length, 24);
  assert.ok(partners.every(row => row.origin === 'AB' || row.destination === 'AB'));
  assert.ok(partners.every(row => row.origin !== 'ROW' && row.destination !== 'ROW'));
  for (let index = 1; index < partners.length; index++) assert.ok(partners[index - 1].value >= partners[index].value);
  const quebec = partners.find(row => row.origin === 'AB' && row.destination === 'QC');
  near(quebec.value, 8762.307);
  near(quebec.change, -876.2307);
  assert.equal(quebec.status, 'available');
  assert.equal(quebec.components.length, 3);
  assert.ok(quebec.components.every(component => /^v\d+$/.test(component.vector)));
});

test('the Alberta fiscal sensitivity names its WTI baseline and full fiscal year', () => {
  const fiscal = run().channels.fiscal;
  const alberta = fiscal.rows.find(row => row.region === 'AB');
  assert.equal(alberta.benchmark, 'WTI');
  assert.equal(alberta.baselinePrice, 60.5);
  near(alberta.scenarioPrice, 54.45);
  near(alberta.revenueChangeLow, -4114);
  near(alberta.revenueChangeHigh, -4114);
  assert.equal(alberta.fiscalYear, '2026-27');
  assert.equal(alberta.horizonMonths, 12);
  const ontario = fiscal.rows.find(row => row.region === 'ON');
  assert.equal(ontario.available, false);
  assert.equal(ontario.revenueChangeLow, null);
  assert.equal(ontario.revenueChangeHigh, null);
  assert.match(fiscal.interpretation, /cannot be added/);
});

test('negative fiscal ranges retain ordering and local gas benchmarks remain distinct', () => {
  const result = run({ commodity: 'gas', compare: 'BC' });
  const rows = result.channels.fiscal.rows;
  const alberta = rows.find(row => row.region === 'AB');
  const bc = rows.find(row => row.region === 'BC');
  assert.equal(alberta.benchmark, 'Alberta Reference Price');
  assert.equal(bc.benchmark, 'BC plant-inlet natural gas');
  near(alberta.revenueChangeLow, -45);
  near(bc.revenueChangeLow, -218);
  near(bc.revenueChangeHigh, -130.8);
  assert.ok(bc.revenueChangeLow < bc.revenueChangeHigh);
});

test('only oil gets the national GDP illustration and duration changes only that channel', () => {
  const persistent = run();
  const temporary = run({ duration: 'temporary' });
  assert.equal(persistent.channels.national.scope, 'CA');
  assert.equal(persistent.channels.national.available, true);
  assert.equal(persistent.channels.national.years[0].nominalGdpBillionCad, -18);
  assert.equal(persistent.channels.national.years[1].nominalGdpBillionCad, -22);
  assert.ok(persistent.channels.national.years.every(row => row.realGdpPct === -0.1));
  assert.equal(temporary.channels.national.years[0].nominalGdpBillionCad, -9);
  for (const channel of ['domestic', 'international', 'fiscal', 'gdpContext', 'outlook']) {
    assert.deepEqual(temporary.channels[channel], persistent.channels[channel]);
  }
  for (const commodity of ['gas', 'electricity']) {
    const national = run({ commodity }).channels.national;
    assert.equal(national.available, false);
    assert.equal(national.years.length, 0);
    assert.equal(national.sourceIds.length, 0);
    assert.match(national.unavailableReason, /No national GDP sensitivity/);
  }
});

test('observed GDP context and independent forecasts never move with the price experiment', () => {
  const lower = run();
  const higher = run({ shockPct: 20 });
  assert.deepEqual(lower.channels.gdpContext, higher.channels.gdpContext);
  assert.deepEqual(lower.channels.outlook, higher.channels.outlook);
  assert.equal(lower.channels.gdpContext.changesWithPrice, false);
  assert.equal(lower.channels.outlook.changesWithPrice, false);
  assert.equal(lower.channels.gdpContext.year, 2022);
  assert.equal(lower.channels.gdpContext.focus.energy, 163605.9);
  assert.equal(lower.channels.outlook.year, snapshots.forecast.forecastOriginYear);
  assert.deepEqual(new Set(lower.channels.outlook.rows.map(row => row.region)), new Set(['AB', 'ON']));
  assert.match(lower.channels.outlook.interpretation, /do not estimate the causal effect/);
});

test('zero price changes produce zero supported effects while unavailable estimates remain null', () => {
  for (const commodity of ['oil', 'gas', 'electricity']) {
    const { channels } = run({ commodity, shockPct: 0 });
    for (const row of channels.domestic.allRegions) {
      assert.equal(row.receiptsChange, 0);
      assert.equal(row.purchasesChange, 0);
      assert.equal(row.netChange, 0);
    }
    for (const row of channels.fiscal.rows) {
      assert.equal(row.revenueChangeLow, row.available ? 0 : null);
      assert.equal(row.revenueChangeHigh, row.available ? 0 : null);
    }
  }
});

test('suppressed trade cannot become a zero or an apparently complete provincial result', () => {
  const copy = structuredClone(snapshots);
  const row = copy.flows.trade.observations.find(item => item.year === 2024 && item.commodity === 'oil' && item.origin === 'AB' && item.destination === 'QC');
  Object.assign(row, { status: 'suppressed', value: null });
  Object.assign(row.components[0], { status: 'suppressed', value: null, sourceStatus: 'x' });
  const result = summarizeEnergyStory(copy, base);
  assert.equal(result.channels.domestic.available, false);
  assert.equal(result.channels.domestic.focus.exports, null);
  assert.equal(result.channels.domestic.focus.netChange, null);
  assert.equal(result.channels.domestic.national.netChange, null);
  assert.equal(result.channels.domestic.restOfCanada.netChange, null);
  const partner = result.channels.domestic.partners.find(item => item.destination === 'QC' && item.origin === 'AB');
  assert.equal(partner.change, null);
  assert.equal(partner.status, 'suppressed');
  assert.equal(result.channels.domestic.partners.at(-1), partner);
  assert.match(result.narrative.find(item => item.id === 'domestic-incomplete').text, /unavailable/);
  assert.equal(result.narrative.some(item => item.id === 'domestic-national-balance'), false);
});

test('every narrative updates from the same selected numbers and resolves to verified sources', () => {
  const lower = run();
  const higher = run({ shockPct: 10 });
  const read = (result, id) => result.narrative.find(item => item.id === id).text;
  assert.match(read(lower, 'domestic-receipts'), /falls by \$2\.19 billion/);
  assert.match(read(higher, 'domestic-receipts'), /rises by \$2\.19 billion/);
  assert.match(read(lower, 'fiscal-AB'), /54\.45 US\$\/barrel/);
  assert.match(read(higher, 'fiscal-AB'), /66\.55 US\$\/barrel/);
  assert.match(read(lower, 'fiscal-AB'), /\$4\.114 billion/);
  for (const result of [lower, higher]) {
    const sources = new Set(result.provenance.sources.map(source => source.id));
    for (const item of result.narrative) {
      assert.ok(item.text.endsWith('.'));
      assert.ok(Object.hasOwn(result.channels, item.channel));
      assert.ok(item.sourceIds.every(id => sources.has(id)));
    }
    assert.ok(result.provenance.sources.every(source => /^[a-f0-9]{64}$/.test(source.sha256)));
    assert.ok(result.gaps.some(gap => gap.id === 'households'));
    assert.ok(result.gaps.some(gap => gap.id === 'provincial-gdp'));
  }
});

test('a comparison changes only the selected comparison and never the focus trade balances', () => {
  const alone = run({ compare: null });
  const compared = run({ compare: 'BC' });
  assert.equal(alone.channels.domestic.comparison, null);
  assert.equal(alone.channels.international.comparison, null);
  assert.equal(alone.channels.gdpContext.comparison, null);
  assert.deepEqual(alone.channels.domestic.focus, compared.channels.domestic.focus);
  assert.deepEqual(alone.channels.domestic.allRegions, compared.channels.domestic.allRegions);
  assert.deepEqual(alone.channels.domestic.partners, compared.channels.domestic.partners);
});

test('missing forecasts remain unavailable while invalid supplied source snapshots fail validation', () => {
  const withoutForecast = { ...snapshots };
  delete withoutForecast.forecast;
  const result = summarizeEnergyStory(withoutForecast, base);
  assert.equal(result.channels.outlook.available, false);
  assert.equal(result.channels.outlook.year, null);
  assert.deepEqual(result.channels.outlook.rows, []);
  for (const mutate of [
    copy => { copy.economy.gdp.unit = 'GDP dollars'; },
    copy => { copy.flows.trade.observations.pop(); },
    copy => { copy.fiscal.calibrations[0].baselinePrice = 0; },
    copy => { copy.forecast.forecasts[0].predictionPct = NaN; },
  ]) {
    const copy = structuredClone(snapshots);
    mutate(copy);
    assert.throws(() => summarizeEnergyStory(copy, base));
  }
  const territory = run({ focus: 'NU', compare: null });
  assert.equal(territory.channels.outlook.rows[0].predictionPct, null);
  assert.equal(territory.channels.outlook.rows[0].status, 'insufficient-indicator-coverage');
});

test('a portable export preserves complete inputs, canonical selections, source hashes and exact replay', () => {
  const before = JSON.stringify(snapshots);
  const exported = exportEnergyStory(snapshots, { ...base, compare: 'AB' }, new Date('2026-10-20T12:00:00Z'));
  assert.equal(exported.exportedAt, '2026-10-20T12:00:00.000Z');
  assert.equal(exported.selection.compare, null);
  assert.deepEqual(exported.snapshots, snapshots);
  assert.deepEqual(exported.result, summarizeEnergyStory(exported.snapshots, exported.selection));
  for (const source of exported.result.provenance.sources) assert.equal(exported.sourceHashes[source.id], source.sha256);
  assert.deepEqual(JSON.parse(JSON.stringify(exported)), exported);
  exported.snapshots.flows.trade.observations[0].value = -1;
  assert.equal(JSON.stringify(snapshots), before);
  assert.throws(() => exportEnergyStory(snapshots, base, new Date('invalid')));
});
