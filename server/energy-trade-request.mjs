/** Bounded question interpretation. Models select views; explicit scope wins. */
const distinct = values => [...new Set(values)];
const normalized = value => value.normalize('NFD').replace(/\p{M}/gu,'').toLowerCase();
const flowWords = /\b(trade|traded|trading|exports?|imports?|interprovincial|interregional|inter-regional|transfers?|flow(?:s|ed|ing)?|shipments?|throughput|receipts|deliveries|sends?|sent|received?|echanges?)\b/;
const priceWords = /\b(prices?|prix|wti|wcs|brent|henry hub|aeco|benchmark)\b/;
const changeWords = /%|\b(percent|percentage|increase|decrease|rise|rises|rising|fall|falls|falling|drop|drops|change|changes|shock|shocks|impact|impacts|affect|effects?|up|down|double|halve|hausse|baisse)\b/;
const explicitPhysicalWords = /\b(physical(?:ly)?|volumes?|barrels|tonnes|m3|mwh|gwh|tj|throughput|shipments?|quantit\w*)\b/;
const implicitPhysicalWords = /\b(measur(?:e|ed|ing|ements?)|how (?:much|many) (?:(?:crude|natural) )?(?:energy|electricity|oil|gas|flows?|flowed|is flowing|is shipped))\b/;
const moneyWords = /\b(value|worth|sales|dollars|cad|monetary|revenues?)\b|\$/;
function fail(code,message) { const error=new Error(message);error.code=code;throw error; }
function questionClauses(text) {
  return text.split(/[.;!?]|\bwhile\b|(?:,\s*(?:and\s+)?|\band\s+)(?=(?:(?:their|the|its|observed|published|historical)\s+)*(?:compare|show|tell|explain|calculate|estimate|how|what|energy gdp|gdp|electricity|oil|gas|natural gas|trade|flows|physical|imports|exports)\b)/);
}

export function isEnergyTradeClause(text) {
  const plain=normalized(text);
  return flowWords.test(plain)||(priceWords.test(plain)&&changeWords.test(plain)&&!/\b(scenario|higher|lower|net.zero)\b/.test(plain));
}

export function inspectEnergyTradeQuestion(question, flows, proposed, topics=[], fiscal) {
  if(!flows)return null;
  const text=normalized(question);
  const commodityNames=[['oil',/\b(oil|crude|bitumen|petrole|wti|wcs|brent|barrels)\b/],['gas',/\b(natural gas|gas|gaz|henry hub|aeco)\b/],['electricity',/\b(electricity|electric|electricite|power|mwh|gwh)\b/]];
  const named=commodityNames.filter(([,pattern])=>pattern.test(text)).map(([id])=>id);
  const impact=topics.includes('provincial-impact')||(priceWords.test(text)&&changeWords.test(text)&&named.length>0&&!/\b(higher|lower|net.zero)\s+scenario\b/.test(text));
  const flowsRequested=topics.includes('energy-flows')||(flowWords.test(text)&&named.length>0)||(/\b(energy|energie)\b/.test(text)&&flowWords.test(text))||(named.length>0&&explicitPhysicalWords.test(text)&&!/\b(generation|production|demand|consumption)\b/.test(text))||(named.length>0&&implicitPhysicalWords.test(text)&&/\b(between|from|entre)\b/.test(text));
  if(!impact&&!flowsRequested)return null;
  if(impact&&named.length>1)fail('ambiguous_price_change','Choose one commodity price change per analysis: crude oil, natural gas or electricity. The comparison can include every province.');
  const numeric=[...text.matchAll(/([+−–-]?\d+(?:\.\d+)?)\s*(?:%|percent\b|per cent\b)/g)];
  if(impact&&numeric.length>1)fail('ambiguous_price_change','Use one percentage price change per analysis. You can adjust the result afterwards.');
  if(impact&&/\b(double\w*|halve\w*)\b/.test(text))fail('unsupported_price_change','The provincial calculation supports price changes from −20% to +20%.');
  if(impact&&(/\b(?:demand|quantities|quantity|output|supply|consumption|production)\s+(?:\w+\s+){0,2}(?:rise\w*|fall\w*|drop\w*|increas\w*|decreas\w*|declin\w*|grow\w*|shrink\w*|chang\w*)\b/.test(text)||/\b(?:ris\w*|fall\w*|lower|higher|reduc\w*|increas\w*)\s+(?:demand|quantities|output|supply|consumption|production)\b/.test(text)))fail('unsupported_price_change','The price calculation holds quantities and product mix fixed. It cannot combine a price change with a change in demand, production or shipment quantities.');
  if(impact&&!numeric.length&&/\b(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|hundred)\s+(?:percent|per cent)\b/.test(text))fail('unsupported_price_change','Write the price change as a number from −20% to +20%, such as −10%.');
  let shockPct=Number.isFinite(proposed?.shockPct)&&Math.abs(proposed.shockPct)<=20?proposed.shockPct:10;
  if(impact&&numeric.length){
    const match=numeric[0];
    shockPct=Number(match[1].replace(/[−–]/g,'-'));
    const prefix=text.slice(Math.max(0,match.index-85),match.index).split(/[.;!?]|\b(?:while|but|then)\b/).at(-1);
    const suffix=text.slice(match.index+match[0].length,match.index+match[0].length+35);
    const directions=[...prefix.matchAll(/\b(fall\w*|drop\w*|decreas\w*|declin\w*|down|lower\w*|cut|reduc\w*|baisse|rise\w*|ris\w*|increas\w*|up|higher|rais\w*|hausse)\b/g)];
    const nearest=directions.at(-1)?.[1];
    const after=suffix.match(/^\s*(?:(?:crude oil|natural gas|oil|gas|electricity)\s+)?(?:prices?\s+)?(fall\w*|drop\w*|decreas\w*|declin\w*|down|lower\w*|cut|reduc\w*|baisse|rise\w*|ris\w*|increas\w*|up|higher|rais\w*|hausse)\b/)?.[1];
    const word=nearest||after;
    const direction=word&&/^(fall|drop|decreas|declin|down|lower|cut|reduc|baisse)/.test(word)?-1:1;
    if(/\b(?:not|never|no)\s+(?:\w+\s+){0,2}(?:rise\w*|ris\w*|fall\w*|increas\w*|decreas\w*|drop\w*|change\w*)\b/.test(prefix)||/\b(?:not|never|no)\s+(?:(?:a|an|the)\s+)?$/.test(prefix))fail('ambiguous_price_change','Specify the actual price change. Negating a percentage change does not identify a replacement scenario.');
    if(/\b(?:at least|at most|less than|more than|up to|between)\s*$/.test(prefix))fail('ambiguous_price_change','Specify one actual percentage price change. A bound or range does not define a single scenario.');
    if(/^[+−–-]/.test(match[1])&&word&&shockPct!==0&&Math.sign(shockPct)!==direction)fail('ambiguous_price_change','The signed percentage and the stated direction disagree. Use one price change, such as −10% or a 10% decrease.');
    if(!/^[+−–-]/.test(match[1]))shockPct*=direction;
    if(Math.abs(shockPct)>20)fail('unsupported_price_change','The provincial calculation supports price changes from −20% to +20%. This request is outside that range.');
  }
  if(impact&&!numeric.length&&/\$\s*\d|\d\s*(?:dollars?|usd|cad)\b/.test(text))fail('unsupported_price_change','Specify a percentage price change from −20% to +20%. Published provincial budget sensitivities use their own dated benchmark prices.');
  const commodity=named.length===1?named[0]:['oil','gas','electricity'].includes(proposed?.commodity)?proposed.commodity:'oil';
  // GDP and CER comparison periods belong to their own clauses, never the trade year.
  const clauses=questionClauses(text);
  const fiscalClauses=clauses.filter(clause=>impact&&/\b(budget|fiscal|royalties|government revenue)\b/.test(clause));
  if(fiscal&&fiscalClauses.length){
    const fiscalYears=distinct(fiscalClauses.flatMap(clause=>[...clause.matchAll(/\b((?:19|20|21)\d{2})(?:-\d{2})?\b/g)].map(match=>Number(match[1]))));
    const supported=distinct(fiscal.calibrations.filter(row=>row.commodity===commodity).map(row=>Number(row.fiscalYear.slice(0,4))));
    if(fiscalYears.length>1||fiscalYears.some(year=>!supported.includes(year)))fail('unsupported_fiscal_period','The loaded fiscal sensitivities use their own published budget baselines'+(supported.length?` beginning in ${supported.join(', ')}`:'')+'. They do not forecast another fiscal year.');
  }
  const relevant=clauses.filter(clause=>isEnergyTradeClause(clause)&&!/\b(gdp|pib|generation|production|scenario|budget|fiscal|royalties|government revenue)\b/.test(clause));
  const explicitYears=distinct(relevant.flatMap(clause=>[...clause.matchAll(/\b((?:19|20|21)\d{2})\b/g)].map(match=>Number(match[1]))));
  const physical=flowsRequested&&(explicitPhysicalWords.test(text)||(implicitPhysicalWords.test(text)&&!moneyWords.test(text))||(commodity==='electricity'&&/\bmonthly\b/.test(text)&&!moneyWords.test(text)));
  const physicalOnly=physical&&!impact&&!moneyWords.test(text);
  const physicalSets=flows.physical.series.filter(series=>series.commodity===commodity);
  let transferSet=null;
  if(explicitYears.length>1)fail('unsupported_trade_period','Choose one published period per analysis. Trade comparisons cover '+flows.trade.years.join(', ')+'.');
  let year=!physicalOnly&&flows.trade.years.includes(proposed?.year)?proposed.year:flows.trade.latestYear;
  const monthNames=['january','february','march','april','may','june','july','august','september','october','november','december'];
  const explicitMonths=distinct([
    ...[...text.matchAll(/\b((?:19|20|21)\d{2})-(0[1-9]|1[0-2])\b/g)].map(match=>`${match[1]}-${match[2]}`),
    ...[...text.matchAll(new RegExp(`\\b(${monthNames.join('|')})\\s+((?:19|20|21)\\d{2})\\b`,'g'))].map(match=>`${match[2]}-${String(monthNames.indexOf(match[1])+1).padStart(2,'0')}`),
  ]);
  if(physicalOnly&&explicitMonths.length){
    const dataset=physicalSets.find(series=>series.frequency==='monthly'&&series.period===explicitMonths[0]);
    if(explicitMonths.length!==1||!dataset)fail('unsupported_transfer_period','The loaded monthly physical data cover '+physicalSets.filter(series=>series.frequency==='monthly').map(series=>series.period).join(', ')+'. Other months are not available in this snapshot.');
    transferSet=dataset.id;
  }else if(physicalOnly&&/\bmonthly\b/.test(text)){
    const dataset=physicalSets.find(series=>series.frequency==='monthly');
    if(!dataset||explicitYears.length)fail('unsupported_transfer_period','Choose the exact available monthly period'+(dataset?`, ${dataset.period}`:' for a commodity with monthly data')+'. Annual totals and monthly observations are separate.');
    transferSet=dataset.id;
  }
  if(explicitYears.length){
    const explicit=explicitYears[0];
    if(physicalOnly&&!transferSet){
      const dataset=physicalSets.find(series=>series.frequency==='annual'&&Number(series.period)===explicit);
      if(!dataset)fail('unsupported_transfer_period','The loaded physical data cover '+physicalSets.map(series=>series.period).join(' and ')+'. Choose one of those periods.');
      transferSet=dataset.id;
    }else if(!physicalOnly){
      if(!flows.trade.years.includes(explicit))fail('unsupported_trade_period','Published interprovincial trade estimates cover '+flows.trade.years.join(', ')+'. A forecast is not available.');
      year=explicit;
    }
  }
  const between=/\b(between|entre|from .+ to |de .+ a )\b/.test(text);
  const physicalBilateral=physical&&(between||/\b(throughput|pipeline|route|corridor|shipments?)\b/.test(text));
  const unsupportedGDP=impact&&clauses.some(clause=>/\b(gdp|pib|gross domestic product)\b/.test(clause)&&((priceWords.test(clause)&&changeWords.test(clause))||/\b(impact\w*|affect\w*|effect\w*|forecast\w*|predict\w*|chang\w*)\b/.test(clause)));
  const unsupportedOutcome=unsupportedGDP||/\b(jobs?|employment|emissions?|households?|bills?|incomes|(?:provincial|personal|disposable|family)\s+income|profits?|welfare|emplois|factures?)\b/.test(text);
  return {commodity,year,shockPct,linkScope:between?'between':proposed?.linkScope==='between'?'between':'touching',transferSet,
    includeFlows:flowsRequested||impact,includePhysical:flowsRequested,includeImpacts:impact,physicalOnly,physicalBilateral,unsupportedOutcome,
    defaultCommodity:named.length!==1,explicitYears};
}
