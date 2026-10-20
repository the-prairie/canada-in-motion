import { validateEconomy, summarizeEconomy } from './economy-model.mjs';
import { FLOW_COMMODITIES, FLOW_REGIONS } from './energy-flow-model.mjs';
import { summarizeProvincialImpacts } from './provincial-impact-model.mjs';
import { summarizeProvincialForecast } from './provincial-forecast-model.mjs';

export const ENERGY_STORY_CHAPTERS = Object.freeze(['overview', 'trade', 'public-finances', 'national', 'outlook', 'households']);
const commodityNames = { oil: 'crude oil', gas: 'natural gas', electricity: 'electricity' };
const finite = value => typeof value === 'number' && Number.isFinite(value);
const require = (condition, message) => { if (!condition) throw new Error(`Invalid energy story input: ${message}`); };
const cleanZero = value => Math.abs(value) < 1e-10 ? 0 : value;
const decimal = value => new Intl.NumberFormat('en-CA', { maximumFractionDigits: 3 }).format(value);
const money = value => {
  const absolute = Math.abs(value);
  return absolute >= 1000 ? `$${decimal(absolute / 1000)} billion` : `$${decimal(absolute)} million`;
};
const movement = value => value === 0 ? 'does not change' : `${value < 0 ? 'falls' : 'rises'} by ${money(value)}`;

export function normalizeEnergyStorySelection(snapshots, input = {}) {
  require(input !== null && typeof input === 'object' && !Array.isArray(input), 'selection must be an object');
  const years = snapshots?.flows?.trade?.years;
  require(Array.isArray(years) && years.length > 0 && years.every(Number.isInteger), 'published trade years are required');
  const read = (key, fallback) => input[key] === undefined ? fallback : input[key];
  const selection = {
    commodity: read('commodity', 'oil'),
    focus: read('focus', 'AB'),
    compare: read('compare', null),
    shockPct: read('shockPct', -10),
    tradeYear: read('tradeYear', snapshots.flows.trade.latestYear),
    duration: read('duration', 'persistent'),
    chapter: read('chapter', 'overview'),
  };
  require(FLOW_COMMODITIES.includes(selection.commodity), 'choose oil, gas or electricity');
  require(FLOW_REGIONS.includes(selection.focus), 'choose a province or territory');
  require(selection.compare === null || FLOW_REGIONS.includes(selection.compare), 'unknown comparison province or territory');
  require(finite(selection.shockPct) && Math.abs(selection.shockPct) <= 20, 'price change must be between -20% and +20%');
  require(Number.isInteger(selection.tradeYear) && years.includes(selection.tradeYear), 'trade year is unavailable');
  require(['persistent', 'temporary'].includes(selection.duration), 'unknown national oil shock duration');
  require(ENERGY_STORY_CHAPTERS.includes(selection.chapter), 'unknown chapter');
  if (selection.compare === selection.focus) selection.compare = null;
  selection.shockPct = cleanZero(selection.shockPct);
  return selection;
}

function sumRestOfCanada(rows, focus) {
  const other = rows.filter(row => row.region !== focus);
  const complete = other.every(row => row.complete);
  const fields = ['exports', 'imports', 'netExports', 'receiptsChange', 'purchasesChange', 'netChange'];
  return {
    region: 'ROC',
    excluding: focus,
    scope: 'Sum of the other 12 provincial and territorial balances, including their trade with one another.',
    complete,
    missingCount: other.reduce((sum, row) => sum + row.missingCount, 0),
    ...Object.fromEntries(fields.map(field => [field, complete ? cleanZero(other.reduce((sum, row) => sum + row[field], 0)) : null])),
  };
}

function provenanceFor(snapshots, sourceIds) {
  const registry = new Map();
  for (const data of Object.values(snapshots).filter(Boolean)) {
    for (const source of data.sources) {
      if (!sourceIds.has(source.id)) continue;
      const previous = registry.get(source.id);
      require(!previous || previous.sha256 === source.sha256 && previous.url === source.url, `conflicting source ${source.id}`);
      registry.set(source.id, source);
    }
  }
  require([...sourceIds].every(id => registry.has(id)), 'a result has no source record');
  return {
    snapshots: Object.fromEntries(Object.entries(snapshots).filter(([, data]) => data).map(([key, data]) => [key, {
      dataVersion: data.dataVersion ?? null,
      asOf: data.asOf ?? data.retrievedAt ?? data.generatedAt ?? null,
      sourceHashes: Object.fromEntries(data.sources.map(source => [source.id, source.sha256])),
    }])),
    sources: [...registry.values()],
  };
}

function storyNarrative(channels, selection, names) {
  const { domestic, international, fiscal, national, gdpContext, outlook } = channels;
  const name = names.get(selection.focus);
  const commodity = commodityNames[selection.commodity];
  const change = selection.shockPct === 0 ? 'unchanged prices' : `${Math.abs(selection.shockPct)}% ${selection.shockPct < 0 ? 'lower' : 'higher'} prices`;
  const narrative = [];
  const add = (id, text, channel, sourceIds = channels[channel].sourceIds) => narrative.push({ id, text, channel, sourceIds: [...sourceIds] });
  if (domestic.focus.complete) {
    add('domestic-receipts', `With ${change} and ${selection.tradeYear} quantities held fixed, the value of ${name}'s ${commodity} sales to other provinces and territories ${movement(domestic.focus.receiptsChange)}.`, 'domestic');
    add('domestic-purchases', `The cost of ${name}'s ${commodity} purchases from other provinces and territories ${movement(domestic.focus.purchasesChange)} under the same assumption.`, 'domestic');
    add('domestic-balance', `${name}'s domestic ${commodity} trade balance ${movement(domestic.focus.netChange)}. This measures sales less purchases at basic prices. It does not measure GDP, profit or household income.`, 'domestic');
  } else {
    add('domestic-incomplete', `Some ${selection.tradeYear} ${commodity} trade values for ${name} are unavailable. A complete provincial trade change cannot be calculated.`, 'domestic');
  }
  if (domestic.comparison?.complete) {
    add('domestic-comparison', `${names.get(selection.compare)}'s domestic ${commodity} trade balance ${movement(domestic.comparison.netChange)} with the same price change and fixed quantities.`, 'domestic');
  }
  if (domestic.national.complete) {
    add('domestic-national-balance', 'Across Canada, every interprovincial purchase is another jurisdiction\'s sale. The domestic trade-balance changes sum to $0. This accounting identity does not establish that Canada has no economic gain or loss.', 'domestic');
  }
  if (international.focus.complete) {
    add('international-receipts', `Separately, the value of ${name}'s international ${commodity} sales ${movement(international.focus.receiptsChange)}. These export values use FOB prices and exclude taxes and duties.`, 'international');
  } else {
    add('international-incomplete', `A complete international ${commodity} trade change for ${name} is unavailable.`, 'international');
  }
  for (const row of fiscal.rows) {
    if (row.available) {
      const effect = row.revenueChangeLow === row.revenueChangeHigh
        ? movement(row.revenueChangeLow)
        : `${row.revenueChangeHigh <= 0 ? 'falls' : 'rises'} by ${money(Math.min(Math.abs(row.revenueChangeLow), Math.abs(row.revenueChangeHigh)))} to ${money(Math.max(Math.abs(row.revenueChangeLow), Math.abs(row.revenueChangeHigh)))}`;
      add(`fiscal-${row.region}`, `On ${names.get(row.region)}'s ${row.fiscalYear} budget assumptions, ${row.benchmark} changes from ${decimal(row.baselinePrice)} to ${decimal(row.scenarioPrice)} ${row.priceUnit}. The ${row.outcomeLabel.toLowerCase()} ${effect} using ${row.exactPublishedShock ? 'the published sensitivity step' : 'linear scaling of the published sensitivity'}. It assumes the benchmark change lasts the full fiscal year.`, 'fiscal', [row.sourceId]);
    } else {
      add(`fiscal-${row.region}`, `A ${commodity} fiscal sensitivity for ${names.get(row.region)} is unavailable. This is not an estimate of zero impact.`, 'fiscal');
    }
  }
  if (national.available) {
    const first = national.years[0];
    add('national-oil', `For Canada as a whole, the ${selection.duration === 'temporary' ? 'two-quarter' : 'persistent'} WTI illustration changes first-year nominal GDP by ${decimal(first.nominalGdpPct)}% and real GDP by ${decimal(first.realGdpPct)}%. This is ${national.exactPublishedPreset ? 'the published +10% illustration' : selection.shockPct === 0 ? 'the zero-change identity' : 'a local linear approximation of Finance Canada\'s published +10% illustration'}. It does not assign a GDP effect to any province.`, 'national');
  }
  add('observed-gdp', `In ${gdpContext.year}, the energy sector accounted for ${decimal(gdpContext.focus.sharePct)}% of ${name}'s GDP at basic prices. This observed share covers the full energy sector and stays unchanged when the price assumption changes.`, 'gdpContext');
  if (outlook.available) {
    const row = outlook.rows.find(item => item.region === selection.focus);
    if (row?.status === 'available') {
      add('independent-outlook', `${name}'s separate ${outlook.year} real GDP growth forecast is ${decimal(row.predictionPct)}%. It uses observed economic indicators and does not change with this energy-price experiment.`, 'outlook');
    } else {
      add('independent-outlook-unavailable', `The economic-indicator model has insufficient coverage to forecast ${name}'s real GDP growth.`, 'outlook');
    }
  }
  return narrative;
}

export function summarizeEnergyStory(snapshots, input = {}) {
  require(snapshots && typeof snapshots === 'object' && !Array.isArray(snapshots), 'source snapshots are required');
  const selection = normalizeEnergyStorySelection(snapshots, input);
  const { economy, flows, fiscal, forecast } = snapshots;
  validateEconomy(economy);
  const impacts = summarizeProvincialImpacts(flows, fiscal, {
    commodity: selection.commodity, shockPct: selection.shockPct, year: selection.tradeYear,
  });
  const economySummary = summarizeEconomy(economy, { region: 'CA', oilShock: selection.shockPct, duration: selection.duration });
  const names = new Map(flows.regions.map(row => [row.code, row.name]));
  const focus = impacts.trade.rows.find(row => row.region === selection.focus);
  const comparison = impacts.trade.rows.find(row => row.region === selection.compare) ?? null;
  const selectedRegions = [selection.focus, ...(selection.compare ? [selection.compare] : [])];
  const fiscalRows = selectedRegions.map(region => impacts.fiscal.rows.find(row => row.region === region));
  const partnerRows = flows.trade.observations
    .filter(row => row.year === selection.tradeYear && row.commodity === selection.commodity
      && row.origin !== 'ROW' && row.destination !== 'ROW'
      && (row.origin === selection.focus || row.destination === selection.focus))
    .map(row => ({ ...row, change: row.value === null ? null : cleanZero(row.value * selection.shockPct / 100) }))
    .sort((a, b) => (b.value ?? -1) - (a.value ?? -1) || a.origin.localeCompare(b.origin) || a.destination.localeCompare(b.destination));
  const outlook = forecast === undefined || forecast === null
    ? { available: false, year: null, rows: [], asOf: null, sourceIds: [], changesWithPrice: false, unavailableReason: 'The provincial forecast snapshot is unavailable.' }
    : { ...summarizeProvincialForecast(forecast, { regions: selectedRegions }), available: true, sourceIds: forecast.sources.map(source => source.id), changesWithPrice: false };
  const channels = {
    domestic: {
      available: focus.complete, year: selection.tradeYear, unit: impacts.unit,
      focus, comparison, allRegions: impacts.trade.rows, partners: partnerRows,
      restOfCanada: sumRestOfCanada(impacts.trade.rows, selection.focus),
      national: impacts.trade.national, sourceIds: [flows.trade.sourceId],
      valuation: flows.trade.valuation.interprovincial,
      interpretation: impacts.trade.interpretation,
    },
    international: {
      available: focus.international.complete, year: selection.tradeYear, unit: focus.international.unit,
      focus: focus.international, comparison: comparison?.international ?? null,
      sourceIds: [flows.trade.sourceId], valuation: flows.trade.valuation.international,
    },
    fiscal: {
      available: fiscalRows.some(row => row.available), rows: fiscalRows, unit: impacts.fiscal.unit,
      sourceIds: [...new Set(fiscalRows.filter(row => row.available).map(row => row.sourceId))],
      interpretation: impacts.fiscal.interpretation,
    },
    national: selection.commodity === 'oil'
      ? { ...economySummary.publishedOilSensitivity, unavailableReason: null }
      : {
        available: false, scope: 'CA', shockPct: selection.shockPct, duration: selection.duration,
        years: [], method: null, sourceIds: [],
        unavailableReason: `No national GDP sensitivity to ${commodityNames[selection.commodity]} prices is calibrated in this experiment.`,
      },
    gdpContext: {
      year: economySummary.gdp.year, unit: economySummary.gdp.unit,
      focus: economySummary.gdp.ranking.find(row => row.code === selection.focus),
      comparison: economySummary.gdp.ranking.find(row => row.code === selection.compare) ?? null,
      sourceIds: [economySummary.gdp.sourceId], changesWithPrice: false,
    },
    outlook,
  };
  const gaps = [
    { id: 'households', text: 'Household bills are not estimated.', reason: 'The experiment has no calibrated link from commodity prices to retail tariffs, taxes, household consumption or household income.' },
    { id: 'provincial-gdp', text: 'Provincial GDP changes are not estimated.', reason: 'Trade repricing and budget sensitivities cannot establish provincial GDP, employment or investment effects.' },
    { id: 'separate-channels', text: 'These channels cannot be added together.', reason: 'Trade values, fiscal sensitivities and national GDP use different periods and scopes and overlap economically.' },
    { id: 'price-pass-through', text: 'Each price is assumed to change by the same percentage.', reason: 'The experiment does not estimate how WTI, local natural gas benchmarks or wholesale electricity pass through to other prices.' },
  ];
  const sourceIds = new Set(Object.values(channels).flatMap(channel => channel.sourceIds));
  return {
    schemaVersion: 1, selection,
    title: selection.shockPct === 0
      ? `${names.get(selection.focus)} with unchanged ${commodityNames[selection.commodity]} prices`
      : `${names.get(selection.focus)} with ${Math.abs(selection.shockPct)}% ${selection.shockPct < 0 ? 'lower' : 'higher'} ${commodityNames[selection.commodity]} prices`,
    channels, narrative: storyNarrative(channels, selection, names), gaps,
    provenance: provenanceFor({ economy, flows, fiscal, ...(forecast ? { forecast } : {}) }, sourceIds),
  };
}

export function exportEnergyStory(snapshots, input = {}, now = new Date()) {
  require(now instanceof Date && finite(now.getTime()), 'export time must be a valid Date');
  const result = summarizeEnergyStory(snapshots, input);
  return structuredClone({
    schemaVersion: 1,
    kind: 'canada-in-motion-energy-story',
    exportedAt: now.toISOString(),
    selection: result.selection,
    snapshots,
    result,
    sourceHashes: Object.fromEntries(result.provenance.sources.map(source => [source.id, source.sha256])),
  });
}
