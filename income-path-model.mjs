/** Official final-demand multipliers. No price-to-demand or bilateral-path inference. */
export const INCOME_METRICS = [
  { id: 'gdp', label: 'GDP at basic prices', unit: 'million reference-year CAD' },
  { id: 'labour', label: 'Labour income', unit: 'million reference-year CAD' },
  { id: 'jobs', label: 'Jobs supported', unit: 'jobs' },
  { id: 'output', label: 'Gross output', unit: 'million reference-year CAD' },
];
const REGIONS = ['NL','PE','NS','NB','QC','ON','MB','SK','AB','BC','YT','NT','NU'];
const INDUSTRIES = ['oil-gas','oil-sands','electricity','gas-distribution','refining','oil-pipelines','gas-pipelines','oil-gas-services','oil-gas-construction','electricity-construction'];
const EFFECTS = ['direct','indirect','induced','simple','total'];
const SCOPES = ['withinProvince','canada'];
const STAGE_LABELS = { direct: 'Selected industry', indirect: 'Its supply chain', induced: 'Household spending' };
const finite = value => typeof value === 'number' && Number.isFinite(value);
const require = (condition, message) => { if (!condition) throw new Error(`Invalid income-path input: ${message}`); };
const clean = value => Math.abs(value) < 1e-10 ? 0 : value;
const difference = (all, inside) => all === null || inside === null ? null : clean(all - inside);
const fullSum = values => values.some(value => value === null) ? null : clean(values.reduce((a,b) => a+b,0));

export function validateIncomePaths(data) {
  require(data?.schemaVersion === 1 && data.method === 'published-input-output-final-demand', 'unsupported schema');
  require(/^[a-f0-9]{20}$/.test(data.dataVersion) && typeof data.retrievedAt === 'string' && Number.isFinite(Date.parse(data.retrievedAt)), 'snapshot identity');
  require(data.coefficientDecimals === 3 && data.maxDemandMillion === 10000, 'precision or scenario bounds');
  require(Array.isArray(data.years) && data.years.length > 0 && data.years.every((year,i) => Number.isInteger(year) && year >= 2010 && (!i || year > data.years[i-1])) && data.latestYear === data.years.at(-1), 'reference years');
  require(Array.isArray(data.regions) && data.regions.length === 13 && REGIONS.every(code => data.regions.filter(row => row.code === code && row.name).length === 1), 'jurisdiction coverage');
  require(Array.isArray(data.industries) && data.industries.length === INDUSTRIES.length && INDUSTRIES.every(id => data.industries.filter(row => row.id === id && row.label && /^BS[A-Z0-9]{6}$/.test(row.code) && ['construction','production'].includes(row.kind)).length === 1), 'industry definitions');
  require(Array.isArray(data.sources) && data.sources.length === 1, 'source count');
  const source = data.sources[0];
  require(source.id === 'statcan-36100595' && source.publisher === 'Statistics Canada' && source.url === 'https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=3610059501' && /^[a-f0-9]{64}$/.test(source.sha256) && /^[a-f0-9]{64}$/.test(source.metadataSha256) && source.retrievedAt === data.retrievedAt && Number.isFinite(Date.parse(source.releasedAt)), 'source provenance');
  require(data.coverage?.bilateralRecipients === false && data.coverage?.supplierIndustryPaths === false && data.coverage?.priceResponse === false && Array.isArray(data.limitations) && data.limitations.length >= 5, 'scope');
  require(Array.isArray(data.observations) && data.observations.length === data.years.length * REGIONS.length * INDUSTRIES.length, 'complete observation grid');
  const seen = new Set();
  for (const row of data.observations) {
    const key = `${row.year}/${row.region}/${row.industry}`;
    require(data.years.includes(row.year) && REGIONS.includes(row.region) && INDUSTRIES.includes(row.industry) && !seen.has(key), 'observation identity');
    seen.add(key);
    for (const effect of EFFECTS) for (const scope of SCOPES) for (const {id} of INCOME_METRICS) {
      const cell = row.effects?.[effect]?.[scope]?.[id];
      require(cell && ['available','missing','not-published','not-applicable','suppressed','unreliable'].includes(cell.status), 'coefficient missingness');
      require(cell.status === 'available' ? finite(cell.value) && cell.value >= 0 && /^v\d+$/.test(cell.vector) : cell.value === null, 'coefficient value or vector');
      require(cell.vector === null || /^v\d+$/.test(cell.vector), 'coefficient provenance');
    }
    for (const scope of SCOPES) for (const {id} of INCOME_METRICS) {
      const values = Object.fromEntries(EFFECTS.map(effect => [effect,row.effects[effect][scope][id].value]));
      for (const [total,parts] of [['simple',['direct','indirect']],['total',['direct','indirect','induced']]]) {
        if ([total,...parts].every(key => values[key] !== null)) {
          require(Math.abs(values[total] - fullSum(parts.map(key => values[key]))) <= (parts.length+1)*0.0005+1e-10, 'rounded component reconciliation');
        }
      }
    }
    for (const effect of EFFECTS) for (const {id} of INCOME_METRICS) {
      const inside = row.effects[effect].withinProvince[id].value;
      const all = row.effects[effect].canada[id].value;
      require(inside === null || all === null || inside <= all + 0.001 + 1e-10, 'within-province versus all-provinces reconciliation');
    }
  }
  return data;
}

export function summarizeIncomePaths(data, input = {}) {
  validateIncomePaths(data);
  return summarizeValidated(data,input);
}

function summarizeValidated(data, input) {
  require(input && typeof input === 'object' && !Array.isArray(input), 'scenario must be an object');
  const allowed = new Set(['region','industry','year','demandMillion','includeInduced']);
  require(Object.keys(input).every(key => allowed.has(key)), 'unsupported scenario field; this model accepts final demand, not price or recipient assumptions');
  const region = input.region ?? 'AB';
  const industry = input.industry ?? 'oil-gas';
  const year = input.year ?? data.latestYear;
  const demandMillion = input.demandMillion ?? 100;
  const includeInduced = input.includeInduced ?? false;
  require(REGIONS.includes(region), 'choose one originating province or territory');
  require(INDUSTRIES.includes(industry), 'unknown industry');
  require(data.years.includes(year), 'reference year unavailable');
  require(finite(demandMillion) && demandMillion >= 0 && demandMillion <= data.maxDemandMillion, 'additional final demand must be between 0 and 10,000 million reference-year CAD');
  require(typeof includeInduced === 'boolean', 'household-spending option must be boolean');
  const row = data.observations.find(item => item.region === region && item.industry === industry && item.year === year);
  const totalEffect = includeInduced ? 'total' : 'simple';
  const stageIds = includeInduced ? ['direct','indirect','induced'] : ['direct','indirect'];
  const metrics = INCOME_METRICS.map(metric => {
    // A dollar/dollar coefficient multiplied by million dollars produces million
    // dollars; jobs/million-dollar coefficients produce a job requirement.
    const scaled = effect => {
      const withinProvince = row.effects[effect].withinProvince[metric.id].value;
      const canada = row.effects[effect].canada[metric.id].value;
      const multiply = value => value === null ? null : clean(value*demandMillion);
      return { withinProvince: multiply(withinProvince), canada: multiply(canada), restOfCanada: multiply(difference(canada,withinProvince)) };
    };
    const totals = scaled(totalEffect);
    const stages = stageIds.map(id => ({id,label:STAGE_LABELS[id],...scaled(id)}));
    const roundingResidual = Object.fromEntries(['withinProvince','restOfCanada','canada'].map(scope => [scope,
      difference(totals[scope],fullSum(stages.map(stage => stage[scope])))]));
    return {...metric,...totals,available: totals.withinProvince !== null && totals.canada !== null,
      stages,roundingResidual,
      coefficients:Object.fromEntries([...stageIds,totalEffect].map(effect => [effect,Object.fromEntries(SCOPES.map(scope => [scope,{...row.effects[effect][scope][metric.id]}]))])),
      formula: metric.id === 'jobs' ? 'Final demand in million reference-year CAD × published jobs per million dollars of output' : 'Final demand in million reference-year CAD × published dollars per dollar of output',
      spilloverFormula:'All-provinces coefficient minus within-province coefficient, multiplied by final demand',
    };
  });
  const selected = {region,industry,year,demandMillion,includeInduced};
  return {input:selected,region: data.regions.find(item => item.code === region),industry:data.industries.find(item => item.id === industry),
    year,demandMillion,includeInduced,metrics,available:metrics.some(metric => metric.available),
    demandUnit:`million ${year} CAD of industry output delivered to final demand`,
    method:'Published input-output final-demand multipliers',
    resultType:'modelled-final-demand-requirements',
    coverage:{...data.coverage,missingMetrics:metrics.filter(metric => !metric.available).map(metric => metric.id),
      recipientDetail:'Rest of Canada is an aggregate. Individual recipient provinces and supplier industries are unavailable in this table.'},
    sources:data.sources,limitations:data.limitations,dataVersion:data.dataVersion,retrievedAt:data.retrievedAt,
    accounting:{totals:'Published simple multipliers, or total multipliers when household spending is included.',
      geography:'Within province + rest of Canada = all provinces.',
      rounding:'Rounded components may differ from the published total; the difference is retained as a rounding residual.',
      overlap:'Labour income is part of GDP; GDP, labour income and output are separate measures, not additive flows.'},
  };
}

/** Same-sized final-demand scenarios, never a national sum of province multipliers. */
export function compareIncomePaths(data, input = {}) {
  validateIncomePaths(data);
  return data.regions.map(region => summarizeValidated(data,{...input,region:region.code}));
}
