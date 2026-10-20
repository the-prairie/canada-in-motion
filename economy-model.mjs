export const ECONOMY_REGIONS = ['CA', 'NL', 'PE', 'NS', 'NB', 'QC', 'ON', 'MB', 'SK', 'AB', 'BC', 'YT', 'NT', 'NU'];
export const ECONOMY_SCENARIOS = ['Current Measures', 'Higher', 'Lower', 'Canada Net-zero'];
const METRICS = ['wti', 'wcs', 'brent', 'cls', 'henry-hub', 'nit', 'oil-production', 'gas-production', 'electricity-generation', 'end-use-demand', 'electricity-price', 'gas-price'];
const number = (value, fallback) => value !== null && value !== '' && Number.isFinite(Number(value)) ? Number(value) : fallback;
const bounded = (value, low, high) => Math.min(high, Math.max(low, value));

export function normalizeEconomyState(input = {}) {
  const raw = input && typeof input === 'object' ? input : {};
  const storyInput=raw.story&&typeof raw.story==='object'?raw.story:{};
  const story=Object.fromEntries(['commodity','focus','compare','shockPct','tradeYear','duration','chapter','responseHorizon','householdBasis'].filter(key=>Object.hasOwn(storyInput,key)).map(key=>[key,['string','number','boolean'].includes(typeof storyInput[key])?storyInput[key]:null]));
  return {
    section: ['explore', 'income', 'trade', 'supply', 'futures', 'oil', 'outlook'].includes(raw.section) ? raw.section : 'explore',
    story,
    display: ['bars', 'map', 'table'].includes(raw.display) ? raw.display : 'bars',
    futureIndicator: ['wti','henry-hub','oil-production','gas-production','electricity-generation','end-use-demand'].includes(raw.futureIndicator)?raw.futureIndicator:'electricity-generation',
    metric: raw.metric === 'retail' ? 'retail' : 'production',
    region: raw.section==='supply'&&(!ECONOMY_REGIONS.includes(raw.region)||raw.region==='CA')?'AB':ECONOMY_REGIONS.includes(raw.region)?raw.region:'CA',
    scenario: ECONOMY_SCENARIOS.includes(raw.scenario) ? raw.scenario : 'Current Measures',
    year: bounded(Math.round(number(raw.year, 2030)), 2023, 2050),
    oilShock: bounded(number(raw.oilShock, 10), -20, 20),
    duration: raw.duration === 'temporary' ? 'temporary' : 'persistent',
    tradePanelId: typeof raw.tradePanelId==='string'&&/^[a-zA-Z0-9_-]{1,80}$/.test(raw.tradePanelId)?raw.tradePanelId:null,
    tradeViewMode: raw.tradeViewMode==='all'?'all':'focus',
    tradeCommodity: ['oil','gas','electricity'].includes(raw.tradeCommodity)?raw.tradeCommodity:'oil',
    tradeYear: bounded(Math.round(number(raw.tradeYear,2024)),2000,2100),
    priceShock: bounded(number(raw.priceShock,10),-20,20),
    linkScope: raw.linkScope==='between'?'between':'touching',
    tradeRegions: Array.isArray(raw.tradeRegions)?[...new Set(raw.tradeRegions.filter(code=>ECONOMY_REGIONS.includes(code)&&code!=='CA'))]:[],
    incomeIndustry: ['oil-gas','oil-sands','electricity','gas-distribution','refining','oil-pipelines','gas-pipelines','oil-gas-services','oil-gas-construction','electricity-construction'].includes(raw.incomeIndustry)?raw.incomeIndustry:'oil-gas',
    incomeYear: bounded(Math.round(number(raw.incomeYear,2022)),2010,2100),
    demandMillion: bounded(number(raw.demandMillion,100),0,10000),
    includeInduced: raw.includeInduced===true,
    historyRegions: Array.isArray(raw.historyRegions)&&raw.historyRegions.some(c=>ECONOMY_REGIONS.includes(c))?[...new Set(raw.historyRegions.filter(c=>ECONOMY_REGIONS.includes(c)))]:['AB','ON','QC'],
    historyOilChange: [-60,-40,-20,-10,0,10,20,40,60,100].includes(raw.historyOilChange)?raw.historyOilChange:10,
    historyYear: Number.isInteger(raw.historyYear)&&raw.historyYear>=1980&&raw.historyYear<=2100?raw.historyYear:null,
    historyHorizon: [0,1,2].includes(raw.historyHorizon)?raw.historyHorizon:2,
    forecastYear: Number.isInteger(raw.forecastYear)&&raw.forecastYear>=2000&&raw.forecastYear<=2100?raw.forecastYear:null,
    forecastRegions: Array.isArray(raw.forecastRegions)?[...new Set(raw.forecastRegions.filter(code=>ECONOMY_REGIONS.includes(code)&&code!=='CA'))]:[],
    forecastFocus: ECONOMY_REGIONS.includes(raw.forecastFocus)&&raw.forecastFocus!=='CA'?raw.forecastFocus:'AB',
    transferSet: typeof raw.transferSet==='string'&&/^[a-z0-9-]{1,80}$/.test(raw.transferSet)?raw.transferSet:null,
  };
}

export function validateEconomy(data) {
  const require = (condition, message) => { if (!condition) throw new Error(`Invalid economy data: ${message}`); };
  require(data && data.schemaVersion === 1, 'unsupported schema');
  require(Array.isArray(data.years) && data.years.length === 28 && data.years.every((year, i) => year === 2023 + i), 'annual horizon');
  require(Array.isArray(data.scenarios) && data.scenarios.length === 4 && ECONOMY_SCENARIOS.every(s => data.scenarios.includes(s)), 'scenario set');
  require(Array.isArray(data.regions) && data.regions.length === 14 && ECONOMY_REGIONS.every(code => data.regions.filter(r => r.code === code).length === 1), 'region set');
  require(Array.isArray(data.sources), 'source registry');
  const sourceIds = new Set(data.sources.map(source => source.id));
  require(sourceIds.size === data.sources.length, 'duplicate sources');
  for (const source of data.sources) {
    require(typeof source.id === 'string' && /^https:\/\//.test(source.url) && /^[a-f0-9]{64}$/.test(source.sha256) && source.license && source.retrievedAt, 'source provenance');
  }
  const gdp = data.gdp;
  require(gdp && Number.isInteger(gdp.year) && sourceIds.has(gdp.sourceId) && gdp.unit === 'million current CAD at basic prices', 'GDP basis');
  require(Array.isArray(gdp.regions) && gdp.regions.length === 13 && ECONOMY_REGIONS.slice(1).every(code => gdp.regions.filter(row => row.code === code).length === 1), 'GDP coverage');
  for (const row of gdp.regions) {
    require(Number.isFinite(row.energy) && Number.isFinite(row.total) && row.energy >= 0 && row.total > 0 && row.energy <= row.total, 'GDP values');
    require(Number.isFinite(row.sharePct) && Math.abs(row.sharePct - row.energy / row.total * 100) < 1e-8, 'GDP share');
    require(row.energyVector && row.totalVector, 'GDP source vectors');
  }
  require(Array.isArray(data.metrics) && data.metrics.length === METRICS.length && METRICS.every(id => data.metrics.filter(m => m.id === id).length === 1), 'metric set');
  for (const metric of data.metrics) {
    require(sourceIds.has(metric.sourceId) && metric.unit && ['benchmark', 'quantity', 'priceIndex'].includes(metric.kind), 'metric provenance');
    if (metric.kind === 'benchmark') require(sourceIds.has(metric.basisSourceId) && metric.unit.startsWith('2025 US$'), 'benchmark price basis');
    require(Array.isArray(metric.series) && metric.series.length > 0, 'empty metric');
    const keys = new Set();
    for (const series of metric.series) {
      const key = `${series.region}/${series.scenario}`;
      require(!keys.has(key) && ECONOMY_REGIONS.includes(series.region) && ECONOMY_SCENARIOS.includes(series.scenario), 'series identity');
      keys.add(key);
      require(Array.isArray(series.values) && series.values.length === data.years.length && series.values.every(value => value === null || (Number.isFinite(value) && value >= 0)), 'series values');
    }
    if (['electricity-generation', 'end-use-demand'].includes(metric.id)) {
      require(keys.size === 56, 'physical coverage');
      for (const scenario of ECONOMY_SCENARIOS) {
        const country = metric.series.find(s => s.region === 'CA' && s.scenario === scenario).values;
        const provinces = metric.series.filter(s => s.region !== 'CA' && s.scenario === scenario);
        country.forEach((total, i) => require(total !== null && provinces.every(s => s.values[i] !== null) && Math.abs(provinces.reduce((sum, s) => sum + s.values[i], 0) - total) <= Math.max(0.02, total * 0.00001), 'physical national reconciliation'));
      }
    }
    if (metric.kind === 'priceIndex') {
      require(metric.unit === 'Current Measures in the same year = 100' && metric.sector === 'Residential', 'delivered price index basis');
      require(metric.series.filter(s => s.scenario === 'Current Measures').every(s => s.values.every(v => v === null || Math.abs(v - 100) < 1e-8)), 'price index baseline');
    }
  }
  const sensitivity = data.oilSensitivity;
  require(sensitivity && sensitivity.scope === 'CA' && sensitivity.publishedShockPct === 10 && sourceIds.has(sensitivity.sourceId), 'national calibration');
  for (const duration of ['persistent', 'temporary']) {
    for (const key of ['nominalGdpPct', 'realGdpPct', 'nominalGdpBillionCad', 'federalRevenueBillionCad', 'federalBalanceBillionCad']) {
      require(Array.isArray(sensitivity[duration]?.[key]) && sensitivity[duration][key].length === 2 && sensitivity[duration][key].every(Number.isFinite), 'oil calibration values');
    }
  }
  require(Array.isArray(data.limitations) && data.limitations.length > 0, 'model limitations');
  return data;
}

export function summarizeEconomy(data, input) {
  const state = normalizeEconomyState(input);
  const index = data.years.indexOf(state.year);
  const energy = data.gdp.regions.reduce((sum, row) => sum + row.energy, 0);
  const total = data.gdp.regions.reduce((sum, row) => sum + row.total, 0);
  const national = { code: 'CA', name: 'Canada', energy, total, sharePct: energy / total * 100, nationalEnergySharePct: 100, aggregation: 'Sum of 13 provinces and territories' };
  const ranking = data.gdp.regions.map(row => ({ ...row, nationalEnergySharePct: row.energy / energy * 100 })).sort((a, b) => b.energy - a.energy);
  const selected = state.region === 'CA' ? national : ranking.find(row => row.code === state.region);
  const metrics = data.metrics.map(metric => {
    const region = metric.kind === 'benchmark' ? 'CA' : state.region;
    const read = scenario => metric.series.find(series => series.region === region && series.scenario === scenario)?.values[index] ?? null;
    const baseline = read('Current Measures');
    const selectedValue = read(state.scenario);
    const available = baseline !== null && selectedValue !== null;
    return {
      id: metric.id, label: metric.label, unit: metric.unit, kind: metric.kind, region,
      year: state.year, baseline, selected: selectedValue,
      delta: available ? selectedValue - baseline : null,
      deltaPct: available && baseline !== 0 ? (selectedValue / baseline - 1) * 100 : null,
      ...(!available ? {unavailableReason: metric.kind === 'priceIndex' && region === 'CA' ? 'Residential price indices are published by province and territory, not for Canada as a whole.' : 'This source does not publish the selected region, scenario and year.'} : {}),
      status: !available ? 'unavailable' : state.year <= metric.historicalThrough ? 'observed' : 'projected',
      sourceIds: [metric.sourceId, ...(metric.basisSourceId ? [metric.basisSourceId] : [])],
      ...(metric.basisNote ? { basisNote: metric.basisNote } : {}),
      ...(metric.sector ? { sector: metric.sector } : {}),
    };
  });
  const calibration = data.oilSensitivity;
  const method = state.oilShock === 10 ? 'Published +10% WTI illustration' : state.oilShock === 0 ? 'Zero-shock identity' : 'Local linear approximation of the published +10% WTI illustration';
  const available = state.region === 'CA';
  const factor = state.oilShock / calibration.publishedShockPct;
  const years = available ? [0, 1].map(i => ({
    yearAfterShock: i + 1,
    ...Object.fromEntries(Object.entries(calibration[state.duration]).map(([key, values]) => [key, factor === 0 || values[i] === 0 ? 0 : values[i] * factor])),
  })) : [];
  return {
    state,
    gdp: { year: data.gdp.year, unit: data.gdp.unit, selected, national, ranking, sourceId: data.gdp.sourceId },
    metrics,
    publishedOilSensitivity: {
      available, scope: 'CA', shockPct: state.oilShock, duration: state.duration,
      method, exactPublishedPreset: state.oilShock === 10,
      baseline: calibration.baseline, temporaryDuration: calibration.temporaryDuration,
      years, sourceIds: [calibration.sourceId],
      limitations: [
        ...(available ? [] : ['No provincial GDP response has been calibrated. Select Canada to see the published national illustration.']),
        'First and second year after the shock on the 2026 Finance Canada baseline. These are not GDP forecasts for the selected CER scenario year.',
        'Published values are rounded. A displayed 0.0% can coexist with a nonzero dollar effect.',
        'The result depends on the cause and duration of the oil-price change. Approximate scaling is limited to changes between -20% and +20%.',
        'The oil sensitivity does not alter CER price or production paths. Do not add the two model results.',
      ],
    },
    sources: data.sources,
    limitations: data.limitations,
  };
}
