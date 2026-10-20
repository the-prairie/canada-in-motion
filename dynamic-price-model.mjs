/** Actual oil/GDP episodes and inspectable model checks. No GDP forecast API. */
export const DYNAMIC_PRICE_REGIONS = ['CA', 'NL', 'PE', 'NS', 'NB', 'QC', 'ON', 'MB', 'SK', 'AB', 'BC', 'YT', 'NT', 'NU'];
const finite = value => typeof value === 'number' && Number.isFinite(value);
const require = (condition, message) => { if (!condition) throw new Error(`Invalid oil-price history: ${message}`); };
const pct = (now, before) => (now / before - 1) * 100;

export function validateDynamicPriceHistory(data) {
  require(data?.schemaVersion === 1 && data.method === 'historical-oil-gdp-paths-and-latest-vintage-local-projection-checks', 'schema');
  require(/^[a-f0-9]{20}$/.test(data.dataVersion) && Number.isFinite(Date.parse(data.generatedAt)) && Number.isFinite(Date.parse(data.retrievedAt)), 'snapshot identity');
  require(data.forecastGate?.enabled === false && data.forecastGate.status === 'research-only', 'forecast gate must remain closed');
  require(Array.isArray(data.forecastGate.requirements) && data.forecastGate.requirements.length >= 3, 'forecast release criteria');
  require(data.gdp?.unit === 'million chained 2017 CAD' && data.gdp.basis === 'GDP at market prices', 'GDP basis');
  require(data.oil?.unit === 'nominal US$/barrel' && data.oil.benchmark === 'WTI spot FOB' && data.oil.frequency === 'calendar-year average', 'oil basis');
  require(data.validation?.kind === 'expanding-window-latest-vintage-conditional-holdout', 'validation method');
  require(Array.isArray(data.sources) && data.sources.length >= 5, 'sources');
  const sources = new Set();
  for (const source of data.sources) {
    require(source.id && !sources.has(source.id) && /^https:\/\//.test(source.url) && /^[a-f0-9]{64}$/.test(source.sha256), 'source identity');
    sources.add(source.id);
  }
  require(Array.isArray(data.gdp.observations) && data.gdp.observations.length >= 500, 'GDP history');
  const gdpKeys = new Set(), gdpRegions = new Set();
  for (const row of data.gdp.observations) {
    const key = `${row.region}/${row.year}`;
    require(DYNAMIC_PRICE_REGIONS.includes(row.region) && Number.isInteger(row.year) && !gdpKeys.has(key), 'GDP observation identity');
    require(sources.has(row.sourceId), 'GDP provenance');
    require(row.status === 'available' ? finite(row.value) && row.value > 0 : row.status === 'not-published' && row.value === null, 'GDP observation value');
    gdpKeys.add(key); gdpRegions.add(row.region);
  }
  require(gdpRegions.size === DYNAMIC_PRICE_REGIONS.length, 'jurisdiction coverage');
  require(Array.isArray(data.oil.observations) && data.oil.observations.length >= 35, 'oil history');
  const oilYears = new Set();
  for (const row of data.oil.observations) {
    require(Number.isInteger(row.year) && !oilYears.has(row.year) && finite(row.value) && row.value > 0 && sources.has(row.sourceId), 'oil observation');
    oilYears.add(row.year);
  }
  require(Array.isArray(data.structuralShocks?.observations) && data.structuralShocks.observations.length >= 45, 'structural shock inputs');
  const shockYears = new Set();
  for (const row of data.structuralShocks.observations) {
    require(Number.isInteger(row.year) && !shockYears.has(row.year), 'structural shock year');
    for (const [key, value] of Object.entries(row)) if (key !== 'year') {
      require(['supply', 'activity', 'consumption', 'inventory', 'news'].includes(key) && finite(value) && sources.has(data.structuralShocks.sourceIds[key]), 'structural shock value');
    }
    shockYears.add(row.year);
  }
  require(Array.isArray(data.experiments) && data.experiments.length === DYNAMIC_PRICE_REGIONS.length * 9, 'candidate model coverage');
  const experimentKeys = new Set();
  for (const row of data.experiments) {
    const key = `${row.region}/${row.horizonYears}/${row.model}`;
    require(DYNAMIC_PRICE_REGIONS.includes(row.region) && [0, 1, 2].includes(row.horizonYears) && ['price', 'structural', 'news'].includes(row.model) && !experimentKeys.has(key), 'candidate identity');
    require(row.publicScenarioEnabled === false && Array.isArray(row.heldout) && row.heldoutCount === row.heldout.length, 'candidate scope');
    require(Number.isInteger(row.observations) && row.observations > 0 && Number.isInteger(row.minimumTrainingRows) && row.minimumTrainingRows >= 16, 'training sample');
    for (const test of row.heldout) {
      require(Number.isInteger(test.year) && test.outcomeYear === test.year + row.horizonYears && test.latestTrainingOutcomeYear < test.year, 'temporal leakage');
      require(test.trainingRows >= row.minimumTrainingRows && ['actualPct', 'modelPct', 'baselinePct'].every(k => finite(test[k])), 'heldout observation');
    }
    if (row.heldoutCount) {
      const mae = row.heldout.reduce((sum, r) => sum + Math.abs(r.modelPct - r.actualPct), 0) / row.heldoutCount;
      const baseline = row.heldout.reduce((sum, r) => sum + Math.abs(r.baselinePct - r.actualPct), 0) / row.heldoutCount;
      require(finite(row.maePctPoints) && finite(row.baselineMaePctPoints) && Math.abs(mae - row.maePctPoints) < 1e-9 && Math.abs(baseline - row.baselineMaePctPoints) < 1e-9, 'heldout score mismatch');
      require(finite(row.improvementPct) && Math.abs(row.improvementPct - 100 * (1 - mae / baseline)) < 1e-8, 'improvement score');
    } else require(row.maePctPoints === null && row.baselineMaePctPoints === null && row.improvementPct === null, 'empty holdout is unavailable, not zero');
    require(row.passesErrorScreen === (row.heldoutCount >= 12 && row.improvementPct >= 10), 'error screen');
    experimentKeys.add(key);
  }
  require(Array.isArray(data.limitations) && data.limitations.length > 0, 'limitations');
  return data;
}

export function summarizeDynamicPriceHistory(data, input = {}) {
  validateDynamicPriceHistory(data);
  require(input !== null && typeof input === 'object' && !Array.isArray(input), 'input must be an object');
  require(Object.keys(input).every(key => ['regions', 'oilChangePct', 'horizonYears', 'episodeCount', 'selectedYear'].includes(key)), 'unknown history option');
  require(input.regions === undefined || Array.isArray(input.regions), 'regions must be an array');
  const regions = input.regions === undefined ? ['AB', 'ON'] : [...new Set(input.regions)];
  const oilChangePct = input.oilChangePct ?? 10;
  const horizonYears = input.horizonYears ?? 2;
  const episodeCount = input.episodeCount ?? 5;
  require(regions.length > 0 && regions.every(region => DYNAMIC_PRICE_REGIONS.includes(region)), 'select known jurisdictions');
  require(finite(oilChangePct) && oilChangePct >= -60 && oilChangePct <= 100, 'oil change must be -60% to +100%');
  require([0, 1, 2].includes(horizonYears), 'horizon must be 0, 1 or 2 years after the price-change year');
  require(Number.isInteger(episodeCount) && episodeCount >= 1 && episodeCount <= 10, 'episode count');
  const oil = new Map(data.oil.observations.map(row => [row.year, row.value]));
  const gdp = new Map(data.gdp.observations.filter(row => row.status === 'available').map(row => [`${row.region}/${row.year}`, row.value]));
  const years = [...oil.keys()].filter(year => oil.has(year - 1) && regions.every(region =>
    Array.from({length: horizonYears + 2}, (_, i) => year + i - 1).every(y => gdp.has(`${region}/${y}`)))).sort((a, b) => a - b);
  const episode = year => {
    const oilMove = pct(oil.get(year), oil.get(year - 1));
    return { year, oilPrice: oil.get(year), previousOilPrice: oil.get(year - 1), oilChangePct: oilMove,
      distancePctPoints: Math.abs(oilMove - oilChangePct),
      gdp: regions.map(region => {
        const baselineGDP = gdp.get(`${region}/${year - 1}`);
        const path = Array.from({length: horizonYears + 2}, (_, i) => {
          const offset = i - 1, value = gdp.get(`${region}/${year + offset}`);
          return { offset, year: year + offset, value, changePct: pct(value, baselineGDP) };
        });
        return { region, baselineYear: year - 1, baselineGDP, path, endChangePct: path.at(-1).changePct };
      }) };
  };
  // No GDP outcome enters matching or ordering; use exact observed price moves.
  const eligible = years.map(episode).filter(row => oilChangePct === 0 || Math.sign(row.oilChangePct) === Math.sign(oilChangePct));
  const episodes = eligible.sort((a, b) => a.distancePctPoints - b.distancePctPoints || b.year - a.year).slice(0, episodeCount);
  require(input.selectedYear === undefined || years.includes(input.selectedYear), 'selected episode year is unavailable for these jurisdictions and horizon');
  const selected = input.selectedYear !== undefined ? episode(input.selectedYear) : episodes[0] ?? null;
  const modelLabels = new Map(data.validation.models.map(row => [row.id, row.label]));
  const validation = data.experiments.filter(row => regions.includes(row.region) && row.horizonYears === horizonYears)
    .map(row => ({...row, label: modelLabels.get(row.model), heldout: row.heldout.map(test => ({...test}))}))
    .sort((a, b) => regions.indexOf(a.region) - regions.indexOf(b.region));
  return { title: 'Past oil-price changes', regions, oilChangePct, horizonYears, years, episodes, selected,
    gdpUnit: data.gdp.unit, gdpBasis: data.gdp.basis, oilUnit: data.oil.unit,
    outcomeLabel: horizonYears === 0 ? 'Real GDP change during the price-change year' : `Real GDP change through ${horizonYears} ${horizonYears === 1 ? 'year' : 'years'} after the price-change year`,
    interpretation: 'These are observed historical paths. They include all economic influences and do not isolate the effect of oil.',
    matchMethod: 'Closest annual WTI percentage changes in the same direction, with complete GDP paths for the selected jurisdictions.',
    validation, validationMethod: data.validation, forecastGate: data.forecastGate,
    limitations: data.limitations, sources: data.sources, literature: data.literature,
    dataVersion: data.dataVersion, generatedAt: data.generatedAt, retrievedAt: data.retrievedAt };
}
