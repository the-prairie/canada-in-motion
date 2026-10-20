/** Official economic trade estimates and physical balances are distinct measures. */
export const FLOW_REGIONS = Object.freeze(['NL','PE','NS','NB','QC','ON','MB','SK','AB','BC','YT','NT','NU']);
export const FLOW_COMMODITIES = Object.freeze(['oil','gas','electricity']);
const statuses = new Set(['available','missing','suppressed','unreliable','not-applicable','not-published']);
const products = { oil:['ENE211104','ENE211106','ENE211107'], gas:['ENE211102'], electricity:['ENE221100'] };
const finite = value => typeof value === 'number' && Number.isFinite(value);
const fail = message => { throw new Error(`Invalid energy flow data: ${message}`); };

export function validateEnergyFlows(data) {
  if (!data || data.schemaVersion !== 1 || !/^[a-f0-9]{20}$/.test(data.dataVersion || '')) fail('schema or version');
  if (!Array.isArray(data.regions) || data.regions.length !== 13 || FLOW_REGIONS.some(code => data.regions.filter(row => row.code === code && typeof row.name === 'string').length !== 1)) fail('regions');
  if (!Array.isArray(data.sources) || new Set(data.sources.map(source => source.id)).size !== data.sources.length) fail('sources');
  const sourceIds = new Set(data.sources.map(source => source.id));
  for (const source of data.sources) {
    if (!/^https:\/\/www150\.statcan\.gc\.ca\//.test(source.url || '') || !/^[a-f0-9]{64}$/.test(source.sha256 || '')) fail('source provenance');
  }
  const trade = data.trade;
  if (!trade || trade.measure !== 'modelled-trade-value' || trade.unit !== 'million current CAD' || !sourceIds.has(trade.sourceId)) fail('trade measure');
  if (!Array.isArray(trade.years) || !trade.years.length || trade.years.length > 3 || trade.years.some(year => !Number.isInteger(year) || year < 1980 || year > 2100) || new Set(trade.years).size !== trade.years.length || trade.latestYear !== Math.max(...trade.years)) fail('trade periods');
  if (!Array.isArray(trade.observations)) fail('trade observations');
  const codes = new Set([...FLOW_REGIONS,'ROW']);
  const seen = new Set();
  for (const row of trade.observations) {
    if (!trade.years.includes(row.year) || !codes.has(row.origin) || !codes.has(row.destination) || row.origin === row.destination || !FLOW_COMMODITIES.includes(row.commodity)) fail('trade dimensions');
    const key = `${row.year}/${row.origin}/${row.destination}/${row.commodity}`;
    if (seen.has(key)) fail('duplicate trade row');
    seen.add(key);
    if (!statuses.has(row.status) || (row.status === 'available' ? (!finite(row.value) || row.value < 0) : row.value !== null)) fail('trade missingness');
    if (!Array.isArray(row.components) || row.components.length !== products[row.commodity].length || products[row.commodity].some(code => row.components.filter(component => component.productCode === code).length !== 1)) fail('product components');
    for (const component of row.components) {
      if (!statuses.has(component.status) || (component.status === 'available' ? (!finite(component.value) || component.value < 0 || !/^v\d+$/.test(component.vector || '')) : component.value !== null)) fail('component observation');
    }
    const available = row.components.every(component => component.value !== null);
    if (available !== (row.value !== null) || (available && Math.abs(row.value - row.components.reduce((sum,item) => sum + item.value,0)) > 1e-6)) fail('component sum');
  }
  // 13 jurisdictions plus ROW, every off-diagonal pair. Explicit null rows are required.
  if (seen.size !== trade.years.length * 14 * 13 * FLOW_COMMODITIES.length) fail('incomplete trade matrix');
  if (!Array.isArray(data.physical?.series) || data.physical.series.length !== 4) fail('physical series');
  const physicalIds = new Set();
  const contracts={
    'electricity-annual':['electricity','annual','receipts-deliveries','statcan-25100021'],
    'electricity-monthly':['electricity','monthly','receipts-deliveries','statcan-25100016'],
    'oil-net-annual':['oil','annual','net-receipts','statcan-25100029'],
    'gas-net-annual':['gas','annual','net-receipts','statcan-25100029'],
  };
  for (const series of data.physical.series) {
    if (physicalIds.has(series.id)) fail('duplicate physical series');
    physicalIds.add(series.id);
    const contract=contracts[series.id];
    if(!contract||[series.commodity,series.frequency,series.measure,series.sourceId].some((value,index)=>value!==contract[index]))fail('physical source contract');
    if (!FLOW_COMMODITIES.includes(series.commodity) || !sourceIds.has(series.sourceId) || !['annual','monthly'].includes(series.frequency) || !['receipts-deliveries','net-receipts'].includes(series.measure)) fail('physical metadata');
    if (!(series.frequency === 'annual' ? /^\d{4}$/ : /^\d{4}-(0[1-9]|1[0-2])$/).test(series.period || '')) fail('physical period');
    if (series.commodity === 'electricity' ? series.unit !== 'MWh' : series.unit !== 'TJ') fail('physical unit');
    if (!Array.isArray(series.observations) || series.observations.length !== 13 || FLOW_REGIONS.some(region => series.observations.filter(row => row.region === region).length !== 1)) fail('physical regions');
    for (const row of series.observations) {
      for (const key of ['receipts','deliveries','netReceipts']) {
        if (!statuses.has(row.statuses?.[key]) || (row.statuses[key] === 'available' ? !finite(row[key]) : row[key] !== null)) fail('physical missingness');
        if (key !== 'netReceipts' && row[key] !== null && row[key] < 0) fail('negative gross physical flow');
      }
      if (series.measure === 'receipts-deliveries') {
        const complete = row.receipts !== null && row.deliveries !== null;
        if (complete !== (row.netReceipts !== null) || (complete && Math.abs(row.netReceipts - (row.receipts-row.deliveries)) > 1e-6)) fail('physical net calculation');
      } else if (row.receipts !== null || row.deliveries !== null) fail('gross flows invented from net');
    }
  }
  return data;
}

function sumRows(rows) {
  const availableValue = rows.reduce((sum,row) => sum + (row.value ?? 0),0);
  const missingRecords = rows.filter(row => row.value === null).length;
  return { value:missingRecords ? null : availableValue, availableValue, missingRecords, recordCount:rows.length };
}

export function summarizeEnergyFlows(data, options = {}) {
  validateEnergyFlows(data);
  const { year=data.trade.latestYear, commodity='oil', includeInternational=false } = options;
  if (!data.trade.years.includes(year)) throw new Error('Choose a published trade year.');
  if (!FLOW_COMMODITIES.includes(commodity)) throw new Error('Choose crude oil, natural gas or electricity.');
  if (options.regions !== undefined && !Array.isArray(options.regions)) throw new Error('Invalid province selection.');
  const requested = options.regions?.filter(code => code !== 'CA') || [];
  if (requested.some(code => !FLOW_REGIONS.includes(code))) throw new Error('Unknown province or territory.');
  const regions = requested.length ? FLOW_REGIONS.filter(code => requested.includes(code)) : [...FLOW_REGIONS];
  const selected = new Set(regions);
  const linkScope = options.linkScope === 'between' && regions.length >= 2 ? 'between' : 'touching';
  if (options.linkScope !== undefined && !['between','touching'].includes(options.linkScope)) throw new Error('Invalid trade link scope.');
  const records = data.trade.observations.filter(row => row.year === year && row.commodity === commodity && (includeInternational || (row.origin !== 'ROW' && row.destination !== 'ROW')));
  const links = records.filter(row => linkScope === 'between'
    ? selected.has(row.origin) && selected.has(row.destination)
    : selected.has(row.origin) || selected.has(row.destination));
  const balances = regions.map(region => {
    const outbound = sumRows(records.filter(row => row.origin === region));
    const inbound = sumRows(records.filter(row => row.destination === region));
    return { region, name:data.regions.find(row => row.code === region).name,
      exports:outbound.value, imports:inbound.value,
      netExports:outbound.value !== null && inbound.value !== null ? outbound.value-inbound.value : null,
      availableExports:outbound.availableValue, availableImports:inbound.availableValue,
      missingExports:outbound.missingRecords, missingImports:inbound.missingRecords };
  });
  return { year, commodity, unit:data.trade.unit, sourceId:data.trade.sourceId,
    scope:includeInternational ? 'domestic-and-international' : 'interprovincial', linkScope, regions,
    links, balances, totals:sumRows(links),
    valuation:includeInternational?{basis:'mixed',interprovincial:data.trade.valuation.interprovincial,international:data.trade.valuation.international,note:'Domestic basic-price values and international FOB values use different valuation bases. Inspect the separate totals.'}:{basis:'basic-prices',description:data.trade.valuation.interprovincial},
    totalsByScope:{interprovincial:sumRows(links.filter(row=>row.origin!=='ROW'&&row.destination!=='ROW')),international:sumRows(links.filter(row=>row.origin==='ROW'||row.destination==='ROW'))},
    balanceScope:'All counterparties in the chosen trade scope, including provinces outside the selected map.',
    physical:data.physical.series.filter(series => series.commodity === commodity).map(series => ({...series,observations:series.observations.filter(row => selected.has(row.region))})),
  };
}
