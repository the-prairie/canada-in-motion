/** Deterministic scope checks for predictive GDP outlooks. No numeric inference. */
export function inspectProvincialForecastQuestion(question, snapshot) {
  const text=question.normalize('NFD').replace(/\p{M}/gu,'').toLowerCase();
  const clauses=text.split(/[;!?]|\.(?!\d)|(?:,\s*|\b(?:and|with|et)\s+)(?=(?:(?:the|their|observed|published|historical|future|forecast|projected)\s+)*(?:oil|natural gas|gas|electricity|production|generation)\b)/);
  const gdpClauses=clauses.filter(clause=>/\b(gdp|pib|gross domestic product|economic growth|economic outlook|economy grow)\b/.test(clause));
  if(!gdpClauses.length)return null;
  const relevant=gdpClauses.join(' ');
  const origin=snapshot?.forecastOriginYear;
  const explicitYears=[...new Set([...relevant.matchAll(/\b((?:19|20|21)\d{2})\b/g)].map(match=>Number(match[1])))];
  const outlook=/\b(forecast\w*|predict\w*|project\w*|outlook|future|next year|this year|current year|prevision\w*|an prochain|annee prochaine|cette annee)\b/.test(relevant)
    ||Number.isInteger(origin)&&explicitYears.some(year=>year>=origin);
  if(!outlook)return null;
  const causal=/\b(?:if|assuming|suppose|with|under)\b.{0,35}\b(?:oil|gas|electricity|energy|wti|wcs|brent)\b.{0,20}\b(?:prices?|shock)\b/.test(text)||gdpClauses.some(clause=>
    /\b(oil|gas|electricity|energy|wti|wcs|brent|petrole|gaz|electricite)\b/.test(clause)
    &&/\b(price|prices|prix|shock)\b/.test(clause)
    &&(/\b(if|assuming|suppose|because|caused|due to|impact|effect|affect|shock|si|hausse|baisse)\b/.test(clause)
      ||/\b(price|prices|prix)\b.{0,45}\b(rise|rises|fall|falls|increase|increases|decrease|decreases|up|down|double|halve|change)\b/.test(clause)));
  const sector=/\b(?:energy|oil|gas|electricity|sector\w*|industry)\s+(?:sector\s+)?(?:gdp|pib)\b|\b(?:gdp|pib)\s+(?:of|for|from)\s+(?:the\s+)?(?:energy|oil|gas|electricity)\b/.test(relevant);
  const level=/\b(?:gdp|pib)\s+(?:level|in dollars|in cad)|\b(?:absolute|nominal|dollar)\s+(?:(?:provincial|real|annual)\s+)*(?:gdp|pib|economic growth)\b/.test(relevant);
  const nationalAggregateRequested=/\b(canada|canadian|national)\b/.test(relevant)
    &&!/\b(provincial|provinces?|territories|territorial|across canada|by region|each region)\b/.test(relevant);
  let years=explicitYears;
  if(Number.isInteger(origin)){
    const calendarYear=Number(snapshot.asOf.slice(0,4));
    if(/\b(next year|an prochain|annee prochaine)\b/.test(relevant))years=[...years,calendarYear+1];
    if(/\b(this year|current year|cette annee)\b/.test(relevant))years=[...years,calendarYear];
    const distance=relevant.match(/\bin\s+(\d+)\s+years?\b/);
    if(distance)years=[...years,calendarYear+Number(distance[1])];
    years=[...new Set(years.length?years:[origin])].sort();
  }
  let reason=null;
  if(!snapshot)reason='The provincial GDP forecast data could not be loaded. Try again after the next data refresh.';
  else if(causal)reason='The GDP outlook predicts growth from observed economic indicators. It cannot estimate how a change in oil, gas or electricity prices would cause provincial GDP to change.';
  else if(sector)reason='The GDP outlook covers each province’s whole economy. It does not forecast GDP for the energy sector or individual industries.';
  else if(level)reason='The provincial outlook predicts annual real GDP growth. It does not provide nominal GDP or dollar-level forecasts.';
  else if(years.some(year=>![origin,origin+1].includes(year)))reason=`The provincial GDP outlook covers ${origin} and ${origin+1}. A forecast for the requested period is not available.`;
  return {requested:true,years,causal,sector,level,nationalAggregateRequested,supported:!reason,reason};
}

export const FORECAST_PLANNING_INSTRUCTIONS=' When provincialGDPForecast capability is supplied, use gdp-forecast for annual whole-economy real GDP growth outlooks for its supported years. These are predictive forecasts from observed indicators, not causal effects of changing oil, gas or electricity prices. GDP forecast years are independent of the CER state.year. Never create numeric forecasts; the server selects verified forecast rows. Historical energy-sector GDP remains topic gdp. Energy-sector forecasts, nominal GDP, dollar-level forecasts, unsupported years and price interventions remain unavailable.';
