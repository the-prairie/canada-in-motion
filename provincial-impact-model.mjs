/**
 * Reprice published trade values at fixed quantities, and evaluate separately
 * the provinces' own dated fiscal sensitivities. Neither channel estimates GDP.
 */
import { validateEnergyFlows } from './energy-flow-model.mjs';

export const IMPACT_REGIONS = ['NL', 'PE', 'NS', 'NB', 'QC', 'ON', 'MB', 'SK', 'AB', 'BC', 'YT', 'NT', 'NU'];
export const IMPACT_COMMODITIES = ['oil', 'gas', 'electricity'];
const TRADE_UNIT = 'million current CAD at basic prices';
const require = (condition, message) => { if (!condition) throw new Error(`Invalid provincial impact input: ${message}`); };
const finite = value => typeof value === 'number' && Number.isFinite(value);
const sum = rows => rows.reduce((total, row) => total + row.value, 0);
const cleanZero = value => Math.abs(value) < 1e-10 ? 0 : value;

export function validateProvincialImpacts(data) {
  require(data?.schemaVersion === 1 && data.method === 'fixed-quantity-repricing-and-published-fiscal-sensitivity', 'unsupported schema');
  require(data.maxAbsShockPct === 20 && data.fiscalUnit === 'million CAD', 'scope and units');
  require(typeof data.generatedAt === 'string' && Number.isFinite(Date.parse(data.generatedAt)) && /^[a-f0-9]{20}$/.test(data.dataVersion), 'snapshot identity');
  require(typeof data.retrievedAt === 'string' && Number.isFinite(Date.parse(data.retrievedAt)), 'publisher verification date');
  require(Array.isArray(data.sources) && data.sources.length > 0, 'sources');
  const sources = new Set();
  for (const source of data.sources) {
    require(typeof source.id === 'string' && !sources.has(source.id) && /^https:\/\//.test(source.url) && /^[a-f0-9]{64}$/.test(source.sha256) && source.publisher && source.locator && source.publishedAt, 'source provenance');
    sources.add(source.id);
  }
  require(Array.isArray(data.calibrations) && data.calibrations.length > 0, 'calibrations');
  const keys = new Set();
  for (const row of data.calibrations) {
    const key = `${row.region}/${row.commodity}`;
    require(IMPACT_REGIONS.includes(row.region) && IMPACT_COMMODITIES.includes(row.commodity) && !keys.has(key), 'calibration identity');
    keys.add(key);
    require(row.id && row.benchmark && row.outcomeLabel && sources.has(row.sourceId), 'calibration provenance');
    require(finite(row.baselinePrice) && row.baselinePrice > 0 && ['US$/barrel', 'CAD/GJ'].includes(row.priceUnit), 'benchmark basis');
    require(finite(row.priceChangeUnit) && row.priceChangeUnit !== 0 && finite(row.publishedImpactLow) && finite(row.publishedImpactHigh) && row.publishedImpactLow <= row.publishedImpactHigh, 'calibration values');
    require(/^\d{4}-\d{2}$/.test(row.fiscalYear) && row.horizonMonths === 12, 'fiscal horizon');
    require(Array.isArray(row.limitations) && row.limitations.length > 0, 'calibration limitations');
  }
  require(Array.isArray(data.limitations) && data.limitations.length > 0, 'model limitations');
  return data;
}

function tradeTotals(observations, expectedCount) {
  const available = observations.filter(row => row.status === 'available' && finite(row.value));
  const missingCount = expectedCount - available.length;
  return { value: missingCount === 0 ? sum(available) : null, missingCount, complete: missingCount === 0 };
}

export function summarizeProvincialImpacts(flowsData, fiscalData, input = {}) {
  validateProvincialImpacts(fiscalData);
  validateEnergyFlows(flowsData);
  const trade = flowsData?.trade;
  require(trade?.unit === 'million current CAD' && trade.valuation?.interprovincial === 'Basic prices; excludes taxes and transportation costs.' && trade.valuation?.international === 'Free on Board (FOB); excludes taxes and duties.' && Array.isArray(trade.observations) && Array.isArray(trade.years), 'trade snapshot');
  const commodity = input.commodity ?? 'oil';
  const shockPct = input.shockPct ?? 10;
  const year = input.year ?? trade.latestYear;
  require(IMPACT_COMMODITIES.includes(commodity), 'choose oil, gas or electricity');
  require(finite(shockPct) && Math.abs(shockPct) <= fiscalData.maxAbsShockPct, 'price change must be between -20% and +20%');
  require(Number.isInteger(year) && trade.years.includes(year), 'trade year is unavailable');
  require(input.regions === undefined || (Array.isArray(input.regions) && input.regions.every(region => IMPACT_REGIONS.includes(region) || region === 'CA')), 'unknown region');
  const regions = !input.regions?.length || input.regions.includes('CA') ? IMPACT_REGIONS : [...new Set(input.regions)];
  const observations = trade.observations.filter(row => row.year === year && row.commodity === commodity);
  const keys = new Set();
  for (const row of observations) {
    const key = `${row.origin}/${row.destination}`;
    require([...IMPACT_REGIONS, 'ROW'].includes(row.origin) && [...IMPACT_REGIONS, 'ROW'].includes(row.destination) && row.origin !== row.destination && !keys.has(key), 'trade pair identity');
    require(['available', 'missing', 'suppressed', 'unreliable', 'not-applicable', 'not-published'].includes(row.status) && (row.status === 'available' ? finite(row.value) && row.value >= 0 : row.value === null), 'trade observation or suppression');
    keys.add(key);
  }
  const fraction = shockPct / 100;
  const delta = value => value === null ? null : cleanZero(value * fraction);
  const allRows = IMPACT_REGIONS.map(region => {
    const outgoing = tradeTotals(observations.filter(row => row.origin === region && IMPACT_REGIONS.includes(row.destination)), 12);
    const incoming = tradeTotals(observations.filter(row => row.destination === region && IMPACT_REGIONS.includes(row.origin)), 12);
    const complete = outgoing.complete && incoming.complete;
    const netExports = complete ? cleanZero(outgoing.value - incoming.value) : null;
    const internationalExports = tradeTotals(observations.filter(row => row.origin === region && row.destination === 'ROW'), 1);
    const internationalImports = tradeTotals(observations.filter(row => row.destination === region && row.origin === 'ROW'), 1);
    const internationalComplete = internationalExports.complete && internationalImports.complete;
    const internationalNet = internationalComplete ? cleanZero(internationalExports.value - internationalImports.value) : null;
    return {
      region, exports: outgoing.value, imports: incoming.value, netExports,
      receiptsChange: delta(outgoing.value), purchasesChange: delta(incoming.value), netChange: delta(netExports),
      complete, missingCount: outgoing.missingCount + incoming.missingCount,
      sourceId: trade.sourceId,
      international: {
        unit: 'million current CAD at FOB prices',
        exports: internationalExports.value, imports: internationalImports.value, netExports: internationalNet,
        receiptsChange: delta(internationalExports.value), purchasesChange: delta(internationalImports.value), netChange: delta(internationalNet),
        complete: internationalComplete, missingCount: internationalExports.missingCount + internationalImports.missingCount,
      },
    };
  });
  const complete = allRows.every(row => row.complete);
  const total = field => complete ? cleanZero(allRows.reduce((value, row) => value + row[field], 0)) : null;
  const national = { region: 'CA', scope: 'All 13 provinces and territories; interprovincial trade only',
    exports: total('exports'), imports: total('imports'), netExports: complete ? 0 : null,
    receiptsChange: total('receiptsChange'), purchasesChange: total('purchasesChange'), netChange: complete ? 0 : null,
    complete, missingCount: allRows.reduce((value, row) => value + row.missingCount, 0) / 2 };
  if (complete) require(Math.abs(national.exports - national.imports) < 1e-6, 'national internal trade does not balance');
  const fiscalRows = regions.map(region => {
    const calibration = fiscalData.calibrations.find(row => row.region === region && row.commodity === commodity);
    if (!calibration) return { region, available: false, revenueChangeLow: null, revenueChangeHigh: null,
      reason: `No ${commodity === 'gas' ? 'natural gas' : commodity} fiscal sensitivity has been calibrated for this jurisdiction. An unavailable estimate does not mean zero impact.` };
    const priceChange = cleanZero(calibration.baselinePrice * fraction);
    const scale = priceChange / calibration.priceChangeUnit;
    const range = [calibration.publishedImpactLow * scale, calibration.publishedImpactHigh * scale].map(cleanZero).sort((a, b) => a - b);
    return { ...calibration, available: true, priceChange,
      scenarioPrice: calibration.baselinePrice + priceChange,
      revenueChangeLow: range[0], revenueChangeHigh: range[1],
      exactPublishedShock: Math.abs(priceChange - calibration.priceChangeUnit) < 1e-10,
      method: shockPct === 0 ? 'Zero-shock identity' : Math.abs(priceChange - calibration.priceChangeUnit) < 1e-10 ? 'Published sensitivity step' : 'Local linear scaling of the published sensitivity',
      assumptions: calibration.assumptions || 'The stated local benchmark changes by the selected percentage for the full fiscal year. Other budget assumptions remain fixed.',
    };
  });
  const sourceIds = new Set([trade.sourceId, ...fiscalRows.filter(row => row.available).map(row => row.sourceId)]);
  const sources = [...(flowsData.sources || []), ...fiscalData.sources].filter((row, index, all) => sourceIds.has(row.id) && all.findIndex(other => other.id === row.id) === index);
  require(sources.some(source => source.id === trade.sourceId), 'trade source missing');
  return {
    commodity, shockPct, year, unit: TRADE_UNIT,
    method: 'Uniform price change with historical trade quantities and product mix held fixed',
    trade: { scope: 'interprovincial', rows: allRows.filter(row => regions.includes(row.region)), national, sourceId: trade.sourceId,
      interpretation: 'Higher receipts accrue to sellers; higher purchases are an added cost to buyers. Net change is a trade-balance revaluation, not a GDP or net-welfare estimate.' },
    fiscal: { unit: fiscalData.fiscalUnit, rows: fiscalRows,
      interpretation: 'Separate published budget sensitivities, scaled on their own fiscal-year benchmark baselines. These results cannot be added to trade repricing.' },
    sourceIds: [...sourceIds], sources, limitations: fiscalData.limitations,
    dataVersion: `${flowsData.dataVersion || flowsData.generatedAt || year}/${fiscalData.dataVersion}`,
  };
}
