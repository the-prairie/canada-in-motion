/** Bounded question interpretation. Models select views; explicit scope wins. */
const distinct = values => [...new Set(values)];
const normalized = value => value.normalize('NFD').replace(/\p{M}/gu,'').toLowerCase().replace(/[’‘]/g,"'").replace(/m³/g,'m3').replace(/(?<=\d),(?=\d{1,2}\s*(?:%|pour cent))/g,'.');
const flowWords = /\b(trade|traded|trading|exports?|imports?|interprovincial\w*|interregional\w*|inter-regional|transfers?|flow(?:s|ed|ing)?|shipments?|throughput|receipts|deliveries|sends?|sent|received?|echanges?|commerce|exportations?|importations?|transferts?|flux|livraisons?)\b/;
const priceWords = /\b(prices?|prix|wti|wcs|brent|henry hub|aeco|benchmark)\b/;
const changeWords = /%|\b(percent|percentage|increase|decrease|rise|rises|rising|fall|falls|falling|drop|drops|change|changes|shock|shocks|impact|impacts|affect|effects?|up|down|double|halve|hauss\w*|baiss\w*|augment\w*|diminu\w*|effets?)\b/;
const physicalUnitWords = /\b(barrels?|bbl|tonnes?|m3|mwh|gwh|kwh|tj|gj|megawatt[ -]?hours?|gigawatt[ -]?hours?|kilowatt[ -]?hours?|terajoules?|gigajoules?|cubic metres?|cubic meters?|barils?|metres? cubes?)\b/;
const explicitPhysicalWords = /\b(physical(?:ly)?|physiqu\w*|volumes?|barrels?|barils?|bbl|tonnes?|m3|mwh|gwh|kwh|tj|gj|megawatt[ -]?hours?|gigawatt[ -]?hours?|kilowatt[ -]?hours?|terajoules?|gigajoules?|cubic metres?|cubic meters?|metres? cubes?|throughput|shipments?|quantit\w*)\b/;
const implicitPhysicalWords = /\b(measur(?:e|ed|ing|ements?)|mesur\w*|how (?:much|many) (?:(?:crude|natural) )?(?:energy|electricity|oil|gas|flows?|flowed|is flowing|is shipped)|combien d'(?:(?:energie|electricite|huile|petrole|gaz)))\b/;
const moneyWords = /\b(value|worth|sales|dollars|cad|monetary|revenues?|valeur|ventes|monetair\w*|revenus?)\b|\$/;
const unchangedPriceWords = /\b(?:prices?\s+(?:(?:remain|stay|are|be|kept|held)\s+)?(?:unchanged|constant|flat|fixed|the same)|(?:do not|don't|never)\s+change\s+(?:the\s+)?(?:(?:crude oil|oil|natural gas|gas|electricity)\s+)?prices?|(?:no|zero)\s+(?:(?:oil|gas|electricity)\s+)?price\s+change|prix\s+(?:(?:du|de)\s+(?:petrole|gaz)\s+)?(?:(?:restent|demeurent|sont)\s+)?(?:inchang\w*|constant\w*|stable\w*))\b/;
const monthNames=['january','february','march','april','may','june','july','august','september','october','november','december'];
const frenchMonths=['janvier','fevrier','mars','avril','mai','juin','juillet','aout','septembre','octobre','novembre','decembre'];
// Mask only explicit excluded nouns; a negated price change is handled separately.
// This is deliberately narrower than general natural-language negation.
function affirmativeScope(text) {
  const noun='(?:physical(?:\\s+(?:trade|energy|oil|gas|electricity))?\\s+(?:volumes?|flows?|quantities|transfers?)|volumes?\\s+physiques?|physical\\s+measurements?|natural gas|gaz naturel|electricity|electricite|oil|crude|petrole|gas|gaz|jobs?|employment|emissions?|household bills?|bills?|profits?|emplois|factures?)';
  const item=`(?:(?:the|les|le|la|des)\\s+)?${noun}`;
  return text.replace(new RegExp(`\\b(?:excluding|exclude|except|without|but not|not including|sauf|sans|hors|pas|not)\\s+${item}(?:\\s*(?:,|and|or|et|ni)\\s*${item})*(?=\\s*(?:[,.;!?]|$|between\\b|entre\\b|from\\b|in\\b|en\\b))`,'g'),' ');
}
function fail(code,message) { const error=new Error(message);error.code=code;throw error; }
function questionClauses(text) {
  return text.split(/\.(?!\d)|[;!?]|\bwhile\b|(?:,\s*(?:and\s+)?|\band\s+)(?=(?:(?:their|the|its|observed|published|historical)\s+)*(?:compare|show|tell|explain|calculate|estimate|how|what|energy gdp|gdp|electricity|oil|gas|natural gas|trade|flows|physical|imports|exports)\b)/);
}

export function isEnergyTradeClause(text) {
  const plain=normalized(text);
  return flowWords.test(plain)||(priceWords.test(plain)&&(changeWords.test(plain)||unchangedPriceWords.test(plain))&&!/\b(scenario|higher|lower|net.zero)\b/.test(plain));
}

export function inspectEnergyTradeQuestion(question, flows, proposed, topics=[], fiscal) {
  if(!flows)return null;
  const rawText=normalized(question);
  const text=affirmativeScope(rawText);
  const excludedPhysical=explicitPhysicalWords.test(rawText)&&!explicitPhysicalWords.test(text);
  const commodityNames=[['oil',/\b(oil|crude|bitumen|petrole|wti|wcs|brent)\b/],['gas',/\b(natural gas|gas|gaz|henry hub|aeco)\b/],['electricity',/\b(electricity|electric|electricite|power)\b/]];
  const named=commodityNames.filter(([,pattern])=>pattern.test(text)).map(([id])=>id);
  // Units can identify a fuel only when an explicit fuel is absent.
  if(!named.length&&/\b(mwh|gwh|kwh|(?:mega|giga|kilo)watt[ -]?hours?)\b/.test(text))named.push('electricity');
  if(!named.length&&/\b(barrels?|bbl|barils?)\b/.test(text))named.push('oil');
  const unchangedPrice=priceWords.test(text)&&unchangedPriceWords.test(text);
  const impact=topics.includes('provincial-impact')||(priceWords.test(text)&&(changeWords.test(text)||unchangedPrice)&&named.length>0&&!/\b(higher|lower|net.zero)\s+scenario\b/.test(text));
  const flowsRequested=topics.includes('energy-flows')||(flowWords.test(text)&&named.length>0)||(/\b(energy|energie)\b/.test(text)&&flowWords.test(text))||(named.length>0&&explicitPhysicalWords.test(text)&&!/\b(generation|production|demand|consumption)\b/.test(text))||(named.length>0&&implicitPhysicalWords.test(text)&&/\b(between|from|entre)\b/.test(text));
  if(!impact&&!flowsRequested)return null;
  if(impact&&named.length>1)fail('ambiguous_price_change','Choose one commodity price change per analysis: crude oil, natural gas or electricity. The comparison can include every province.');
  if(impact&&(/\d[\d.,]*,\d[\d.,]*\s*(?:%|(?:percent|per cent|pour cent)\b)/.test(text)||/\b(percentage points?|points? de pourcentage)\b/.test(text)))fail('unsupported_price_change','Use an unambiguous percentage price change from −20% to +20%, without thousands separators or percentage-point units.');
  // Consume complete decimal tokens. A trailing digit in 1e1%, 1/2% or a
  // malformed decimal must never become a smaller, apparently valid change.
  const percentMarkers=[...text.matchAll(/%|percent\b|per cent\b|pour cent\b/g)];
  const numeric=[...text.matchAll(/(?<![\p{L}\p{N}.,/⁄^*+−–-])([+−–-]?(?:\d+(?:\.\d+)?|\.\d+))\s*(?:%|percent\b|per cent\b|pour cent\b)/gu)];
  const compoundPercent=/\d+(?:\.\d+)?\s*(?:[eE]\s*[+−–-]?|[/⁄])\s*\d+(?:\.\d+)?\s*(?:%|percent\b|per cent\b|pour cent\b)/;
  if(impact&&(compoundPercent.test(text)||percentMarkers.length!==numeric.length))fail('unsupported_price_change','Write one ordinary decimal percentage from −20% to +20%, such as −0.5%. Scientific notation, fractions and malformed numbers are not supported.');
  if(impact&&numeric.length>1)fail('ambiguous_price_change','Use one percentage price change per analysis. You can adjust the result afterwards.');
  if(impact&&/\b(double\w*|halve\w*)\b/.test(text))fail('unsupported_price_change','The provincial calculation supports price changes from −20% to +20%.');
  if(impact&&(/\b(?:demand|demande|quantities|quantity|quantites|output|supply|offre|consumption|consommation|production)\s+(?:\w+\s+){0,2}(?:rise\w*|fall\w*|drop\w*|increas\w*|decreas\w*|declin\w*|grow\w*|shrink\w*|chang\w*|augment\w*|diminu\w*|baiss\w*|hauss\w*)\b/.test(text)||/\b(?:ris\w*|fall\w*|lower|higher|reduc\w*|increas\w*|hauss\w*|baiss\w*)\s+(?:(?:de la|de|la|l')\s*)?(?:demand|demande|quantities|quantites|output|supply|offre|consumption|consommation|production)\b/.test(text)))fail('unsupported_price_change','The price calculation holds quantities and product mix fixed. It cannot combine a price change with a change in demand, production or shipment quantities.');
  if(impact&&!numeric.length&&/\b(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|hundred)\s+(?:percent|per cent)\b/.test(text))fail('unsupported_price_change','Write the price change as a number from −20% to +20%, such as −10%.');
  let shockPct=unchangedPrice?0:Number.isFinite(proposed?.shockPct)&&Math.abs(proposed.shockPct)<=20?proposed.shockPct:10;
  if(impact&&numeric.length){
    const match=numeric[0];
    shockPct=Number(match[1].replace(/[−–]/g,'-'));
    if(unchangedPrice&&shockPct!==0)fail('ambiguous_price_change','Keeping prices unchanged means a 0% change. Remove the conflicting percentage or choose one price change.');
    const prefix=text.slice(Math.max(0,match.index-85),match.index).split(/[.;!?]|\b(?:while|but|then)\b/).at(-1);
    const suffix=text.slice(match.index+match[0].length,match.index+match[0].length+35);
    const directions=[...prefix.matchAll(/\b(fall\w*|drop\w*|decreas\w*|declin\w*|down|lower\w*|cut|reduc\w*|baiss\w*|diminu\w*|rise\w*|ris\w*|increas\w*|up|higher|rais\w*|hauss\w*|augment\w*)\b/g)];
    const nearest=directions.at(-1)?.[1];
    const after=suffix.match(/^\s*(?:(?:crude oil|natural gas|oil|gas|electricity)\s+)?(?:prices?\s+)?(fall\w*|drop\w*|decreas\w*|declin\w*|down|lower\w*|cut|reduc\w*|baiss\w*|diminu\w*|rise\w*|ris\w*|increas\w*|up|higher|rais\w*|hauss\w*|augment\w*)\b/)?.[1];
    const word=nearest||after;
    const direction=word&&/^(fall|drop|decreas|declin|down|lower|cut|reduc|baiss|diminu)/.test(word)?-1:1;
    if(/\b(?:not|never|no)\s+(?:\w+\s+){0,2}(?:rise\w*|ris\w*|fall\w*|increas\w*|decreas\w*|drop\w*|change\w*)\b/.test(prefix)||/\b(?:not|never|no)\s+(?:(?:a|an|the)\s+)?$/.test(prefix)||/\bne\s+(?:\w+\s+){0,3}pas\b/.test(prefix))fail('ambiguous_price_change','Specify the actual price change. Negating a percentage change does not identify a replacement scenario.');
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
  const physical=flowsRequested&&(explicitPhysicalWords.test(text)||(implicitPhysicalWords.test(text)&&!moneyWords.test(text))||(commodity==='electricity'&&/\b(monthly|mensuel\w*)\b/.test(text)&&!moneyWords.test(text)));
  const physicalOnly=physical&&!impact&&!moneyWords.test(text);
  const physicalSets=flows.physical.series.filter(series=>series.commodity===commodity);
  let transferSet=null;
  if(explicitYears.length>1)fail('unsupported_trade_period','Choose one published period per analysis. Trade comparisons cover '+flows.trade.years.join(', ')+'.');
  let year=!physicalOnly&&flows.trade.years.includes(proposed?.year)?proposed.year:flows.trade.latestYear;
  const explicitMonths=distinct([
    ...[...text.matchAll(/\b((?:19|20|21)\d{2})-(0[1-9]|1[0-2])\b/g)].map(match=>`${match[1]}-${match[2]}`),
    ...[...text.matchAll(new RegExp(`\\b(${monthNames.join('|')})\\s+((?:19|20|21)\\d{2})\\b`,'g'))].map(match=>`${match[2]}-${String(monthNames.indexOf(match[1])+1).padStart(2,'0')}`),
    ...[...text.matchAll(new RegExp(`\\b(${frenchMonths.join('|')})\\s+((?:19|20|21)\\d{2})\\b`,'g'))].map(match=>`${match[2]}-${String(frenchMonths.indexOf(match[1])+1).padStart(2,'0')}`),
  ]);
  if(physicalOnly&&/\b(quarterly|quarter|trimestr\w*)\b/.test(text))fail('unsupported_transfer_period','The physical snapshot contains separately dated annual and monthly observations, not quarterly balances.');
  if(!physicalOnly&&(explicitMonths.length||/\b(monthly|mensuel\w*|quarterly|quarter|trimestr\w*)\b/.test(text)))fail('unsupported_trade_period','Economic trade values are annual estimates. A monthly or quarterly trade value is not available in this snapshot.');
  if(physical&&physicalUnitWords.test(text)){
    const units=[...text.matchAll(new RegExp(physicalUnitWords.source,'g'))].map(match=>match[0]);
    const allowed=commodity==='electricity'?/^(mwh|megawatt[ -]?hours?)$/:/^(tj|terajoules?)$/;
    if(units.some(unit=>!allowed.test(unit)))fail('unsupported_transfer_unit',`The published physical ${commodity==='gas'?'natural gas':commodity==='oil'?'crude oil':'electricity'} balances use ${commodity==='electricity'?'MWh':'TJ'}. This view does not convert them to other units or estimate bilateral shipment volumes.`);
  }
  if(physicalOnly&&explicitMonths.length){
    const dataset=physicalSets.find(series=>series.frequency==='monthly'&&series.period===explicitMonths[0]);
    if(explicitMonths.length!==1||!dataset)fail('unsupported_transfer_period','The loaded monthly physical data cover '+physicalSets.filter(series=>series.frequency==='monthly').map(series=>series.period).join(', ')+'. Other months are not available in this snapshot.');
    transferSet=dataset.id;
  }else if(physicalOnly&&/\b(monthly|mensuel\w*)\b/.test(text)){
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
    includeFlows:flowsRequested||impact,includePhysical:flowsRequested&&!excludedPhysical,includeImpacts:impact,physicalOnly,physicalBilateral,unsupportedOutcome,
    defaultCommodity:named.length!==1,explicitYears};
}
