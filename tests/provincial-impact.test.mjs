import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { IMPACT_REGIONS, summarizeProvincialImpacts, validateProvincialImpacts } from '../provincial-impact-model.mjs';
const flows = JSON.parse(fs.readFileSync(new URL('../data/energy-flows.json', import.meta.url)));
const fiscal = JSON.parse(fs.readFileSync(new URL('../data/provincial-impacts.json', import.meta.url)));
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);
const summarize = options => summarizeProvincialImpacts(flows, fiscal, options);

test('reviewed fiscal calibrations retain source identity, benchmark and dated basis', () => {
  assert.equal(validateProvincialImpacts(fiscal), fiscal);
  assert.ok(Number.isFinite(Date.parse(fiscal.retrievedAt)));
  const undated = structuredClone(fiscal); delete undated.retrievedAt;
  assert.throws(() => validateProvincialImpacts(undated), /publisher verification date/);
  assert.deepEqual([...new Set(fiscal.calibrations.map(row => row.region))].sort(), ['AB', 'BC', 'SK']);
  for (const row of fiscal.calibrations) {
    assert.equal(row.fiscalYear, '2026-27');
    assert.equal(row.horizonMonths, 12);
    assert.ok(row.outcomeLabel);
  }
});

test('all 13 jurisdictions use the same bilateral ledger; internal transfers cancel nationally', () => {
  for (const commodity of ['oil', 'gas', 'electricity']) {
    const result = summarize({ commodity, shockPct: 10 });
    assert.equal(result.trade.rows.length, 13);
    assert.equal(result.trade.national.complete, true);
    close(result.trade.national.exports, result.trade.national.imports);
    close(result.trade.national.receiptsChange, result.trade.national.purchasesChange);
    assert.equal(result.trade.national.netChange, 0);
    assert.equal(result.year, 2024);
    for (const row of result.trade.rows) {
      close(row.receiptsChange, row.exports * 0.1);
      close(row.purchasesChange, row.imports * 0.1);
      close(row.netChange, (row.exports - row.imports) * 0.1);
    }
  }
});

test('fiscal baseline scaling uses native units once, keeping published outcome scope', () => {
  const oil = summarize({ commodity: 'oil', shockPct: 10 });
  const ab = oil.fiscal.rows.find(row => row.region === 'AB');
  const sk = oil.fiscal.rows.find(row => row.region === 'SK');
  close(ab.priceChange, 6.05); close(ab.revenueChangeLow, 4114); close(ab.revenueChangeHigh, 4114);
  close(sk.priceChange, 5.975); close(sk.revenueChangeLow, 95.6);
  assert.equal(sk.outcomeLabel, 'Provincial oil revenue');
  const gas = summarize({ commodity: 'gas', shockPct: 10 });
  const abGas = gas.fiscal.rows.find(row => row.region === 'AB');
  const bc = gas.fiscal.rows.find(row => row.region === 'BC');
  close(abGas.priceChange, 0.3); close(abGas.revenueChangeLow, 45);
  close(bc.priceChange, 0.218); close(bc.revenueChangeLow, 130.8); close(bc.revenueChangeHigh, 218);
  assert.equal(bc.priceUnit, 'CAD/GJ');
  assert.match(bc.assumptions, /production-volume and royalty-credit/);
  assert.match(bc.assumptions, /excludes changes in natural gas liquids/);
  assert.ok(bc.limitations.some(text => text.includes('not a fixed-quantity')));
  assert.equal(oil.fiscal.rows.find(row => row.region === 'NL').available, false);
});

test('negative shocks reverse and reorder the BC interval; zero shock is identity', () => {
  const row = summarize({ commodity: 'gas', shockPct: -10 }).fiscal.rows.find(row => row.region === 'BC');
  close(row.revenueChangeLow, -218); close(row.revenueChangeHigh, -130.8);
  for (const commodity of ['oil', 'gas', 'electricity']) {
    const result = summarize({ commodity, shockPct: 0 });
    for (const item of result.trade.rows) assert.equal(item.netChange, 0);
    for (const item of result.fiscal.rows.filter(item => item.available)) {
      assert.equal(item.revenueChangeLow, 0); assert.equal(item.revenueChangeHigh, 0);
    }
  }
});

test('region selection filters display but retains trade with every other jurisdiction', () => {
  const result = summarize({ commodity: 'oil', shockPct: 10, regions: ['AB', 'AB'] });
  assert.equal(result.trade.rows.length, 1);
  const expected = flows.trade.observations.filter(row => row.year === 2024 && row.commodity === 'oil' && row.origin === 'AB' && IMPACT_REGIONS.includes(row.destination)).reduce((sum, row) => sum + row.value, 0);
  close(result.trade.rows[0].exports, expected);
  assert.equal(result.trade.national.netChange, 0);
  assert.equal(summarize({ regions: ['CA'] }).trade.rows.length, 13);
});

test('international exposure is separately scoped and never folded into the zero-sum domestic total', () => {
  const result = summarize({ commodity: 'oil', shockPct: 10, regions: ['AB'] });
  const ab = result.trade.rows[0];
  const published = flows.trade.observations.find(row => row.year === 2024 && row.commodity === 'oil' && row.origin === 'AB' && row.destination === 'ROW');
  close(ab.international.exports, published.value);
  close(ab.international.receiptsChange, published.value * 0.1);
  assert.equal(ab.international.unit, 'million current CAD at FOB prices');
  assert.equal(result.trade.scope, 'interprovincial');
  assert.equal(result.trade.national.netChange, 0);
});

test('suppression and absent pairs remain missing rather than invented zero exposure', () => {
  const copy = structuredClone(flows);
  const row = copy.trade.observations.find(row => row.year === 2024 && row.commodity === 'oil' && row.origin === 'AB' && row.destination === 'ON');
  row.value = null; row.status = 'suppressed'; row.components[0].value = null; row.components[0].status = 'suppressed';
  const result = summarizeProvincialImpacts(copy, fiscal, { commodity: 'oil', shockPct: 10 });
  const ab = result.trade.rows.find(row => row.region === 'AB');
  const on = result.trade.rows.find(row => row.region === 'ON');
  assert.equal(ab.exports, null); assert.equal(ab.netChange, null); assert.equal(ab.missingCount, 1);
  assert.equal(on.imports, null); assert.equal(on.netChange, null);
  assert.equal(result.trade.national.netChange, null); assert.equal(result.trade.national.missingCount, 1);
  copy.trade.observations = copy.trade.observations.filter(item => item !== row);
  assert.throws(() => summarizeProvincialImpacts(copy, fiscal, {}), /incomplete trade matrix/);
});

test('unsupported assumptions fail instead of silently clamping, converting or substituting years', () => {
  for (const options of [{shockPct: 21}, {shockPct: -21}, {shockPct: Infinity}, {shockPct: '10'}, {year: 2040}, {year: '2024'}, {commodity:'gasoline'}, {regions:['XX']}]) {
    assert.throws(() => summarize(options), /Invalid provincial impact input/);
  }
  const previous = summarize({ year: 2022, commodity: 'gas' });
  assert.equal(previous.year, 2022);
  assert.equal(previous.fiscal.rows.find(row => row.available).fiscalYear, '2026-27');
});

test('duplicates, altered calibration units and invalid source identifiers are rejected', () => {
  const duplicate = structuredClone(flows);
  duplicate.trade.observations.push(structuredClone(duplicate.trade.observations.find(row => row.year === 2024 && row.commodity === 'oil')));
  assert.throws(() => summarizeProvincialImpacts(duplicate, fiscal), /duplicate trade row/);
  for (const alter of [row => row.sourceId = 'missing', row => row.baselinePrice = null, row => row.priceUnit = 'US$/MMBtu', row => row.horizonMonths = 1]) {
    const broken = structuredClone(fiscal); alter(broken.calibrations[0]);
    assert.throws(() => validateProvincialImpacts(broken));
  }
});
