// The model selects findings; it cannot author economic claims or citations.
// Every eligible finding carries its own scope and limitations into the answer.
export function buildClaimCatalog({evidence,summary,state,regionName}) {
  const byLabel=new Map(evidence.numbers.map(item=>[item.label,item]));
  const byId=new Map([...evidence.numbers,...evidence.facts].map(item=>[item.id,item]));
  const claims=[];
  const number=label=>{
    const item=byLabel.get(label);
    if(!item)throw Error(`Missing claim evidence: ${label}`);
    return `[[${item.id}]]`;
  };
  const add=(id,text,extraIds=[])=>{
    const evidenceIds=[...new Set([...text.matchAll(/\[\[(n\d+)\]\]/g)].map(match=>match[1]).concat(extraIds))];
    const sourceIds=[...new Set(evidenceIds.flatMap(key=>{
      if(!byId.has(key))throw Error('Unknown claim evidence');
      return byId.get(key).sourceIds;
    }))];
    claims.push({id,text,evidenceIds,sourceIds});
  };
  const year=number('Observed GDP year');
  const code=state.region;
  add('observed-contribution',`In ${year}, ${regionName}'s energy sector generated ${number(`selected ${code} GDP energy`)} million current CAD in value added, or ${number(`selected ${code} GDP sharePct`)}% of its GDP at basic prices. This measures where production occurs, not where owners live or how the income is distributed.${code==='CA'?' The Canada figure is the sum of provincial and territorial accounts.':''}`);
  if(code!=='CA'){
    const row=summary.gdp.ranking.find(item=>item.code===code);
    add('national-contribution',`${regionName} accounted for ${number(`${row.name||row.code} observed GDP nationalEnergySharePct`)}% of Canada's energy-sector value added in ${year}. This is a share of the energy sector, not of Canada's total GDP or federal revenue.`);
  }
  for(const row of summary.gdp.ranking){
    if(row.code===code)continue;
    const name=row.name||row.code;
    add(`compare-${row.code}`,`In ${year}, ${name}'s energy sector generated ${number(`${name} observed GDP energy`)} million current CAD in value added, representing ${number(`${name} observed GDP sharePct`)}% of its GDP at basic prices. This observed contribution is not a forecast of the province's response to a price change.`);
  }
  if(state.oilShock!==0 && byLabel.has('Oil sensitivity baseline year')){
    const baseline=number('Oil sensitivity baseline year');
    const scope=`This is a national ${state.duration==='temporary'?'temporary':'persistent'} oil-price sensitivity on Finance Canada's ${baseline} baseline. ${state.oilShock===10?'It uses the published illustration.':'It uses a local linear approximation of the published illustration.'} It cannot be allocated to provinces or added to CER scenario results.`;
    add('oil-gdp',`For an oil-price change of ${number('Oil-price shock percent')}%, Canada's nominal GDP changes by ${number('National oil sensitivity nominalGdpPct, year after shock 1')}% in the first year after the shock and ${number('National oil sensitivity nominalGdpPct, year after shock 2')}% in the second. Real GDP changes by ${number('National oil sensitivity realGdpPct, year after shock 1')}% and ${number('National oil sensitivity realGdpPct, year after shock 2')}%, respectively. ${scope}`);
    add('oil-federal-revenue',`The national oil-price illustration gives a federal revenue change of ${number('National oil sensitivity federalRevenueBillionCad, year after shock 1')} billion CAD in the first year and ${number('National oil sensitivity federalRevenueBillionCad, year after shock 2')} billion CAD in the second. These are changes in federal revenue, not payments between provinces. ${scope}`);
  }
  for(const metric of summary.metrics){
    if(metric.status==='unavailable')continue;
    const label=field=>`${metric.id} ${metric.label} ${field}`;
    let unit=metric.unit;
    if(metric.kind==='benchmark')unit=unit.replace(/^\d{4}/,number(`${metric.id} price dollar year`));
    if(metric.kind==='priceIndex')unit=`with Current Measures in the same year equal to ${number(`${metric.id} index reference`)}`;
    const place=metric.kind==='benchmark'?'the benchmark':regionName;
    const period=metric.status==='observed'?'historical value':'projection';
    add(`scenario-${metric.id}`,`In the CER ${state.scenario} case, the ${period} for ${metric.label.toLowerCase()} for ${place} in ${number(label('year'))} is ${number(label('selected'))} ${unit}. The Current Measures value for the same year is ${number(label('baseline'))}. These scenarios change several assumptions together; their difference is not the causal effect of changing a single price.${metric.kind==='priceIndex'?' The index is not a household bill in dollars.':''}`);
  }
  for(const fact of evidence.facts){
    const text=fact.id==='f_oil-shock'
      ? 'Oil-price changes affect producer income and the energy costs paid by households and businesses. The Bank of Canada distinguishes supply disruptions from changes in global demand. The cause, persistence, ownership and exchange-rate response affect the net result.'
      : fact.id==='f_rights-positions'
      ? 'Haisla Nation described majority ownership and construction of Cedar LNG in its cited update. Coastal First Nations opposes northern oil tanker traffic. These are positions on different projects and places; they do not represent all Indigenous peoples. The dated update does not establish current operating status.'
      : fact.text;
    add(fact.id,text,[fact.id]);
  }
  const metric=summary.metrics.find(item=>item.status!=='unavailable');
  const basis=byLabel.get(`${metric.id} ${metric.label} selected`);
  const baseline=byLabel.get('Oil sensitivity baseline year');
  add('unsupported-price-response','These sources do not provide provincial GDP, jobs, royalty or household-bill responses to arbitrary commodity-price changes. The CER cases compare complete scenarios, and the oil-price sensitivity is national only.',[basis.id,baseline.id]);
  add('distribution-limits','Provincial GDP records where value is added; it does not identify everyone who receives the income. Household energy costs and the distribution of benefits within a province require separate measures.',[byLabel.get(`selected ${code} GDP energy`).id,'f_households']);
  add('outside-data','This question goes beyond the energy accounts and scenarios available here. The app can show observed energy-sector value added, published energy scenarios and national oil-price sensitivities.',[byLabel.get('Observed GDP year').id,basis.id,baseline.id]);
  return claims;
}

export function claimSelectionSchema(claims) {
  return {type:'object',properties:{answerability:{type:'string',enum:['supported','partial','unsupported']},claimIds:{type:'array',minItems:1,maxItems:4,items:{type:'string',enum:claims.map(item=>item.id)}}},required:['answerability','claimIds'],additionalProperties:false};
}

export function renderClaimSelection(selection,claims,regionName) {
  if(!selection||Object.keys(selection).sort().join(',')!=='answerability,claimIds'||!['supported','partial','unsupported'].includes(selection.answerability)||!Array.isArray(selection.claimIds)||selection.claimIds.length>4||new Set(selection.claimIds).size!==selection.claimIds.length)throw Error('Invalid claim selection');
  const catalog=new Map(claims.map(claim=>[claim.id,claim]));
  if(selection.claimIds.some(id=>!catalog.has(id)))throw Error('Unknown or inapplicable claim');
  const limitations=['unsupported-price-response','distribution-limits','outside-data'];
  let ids=[...selection.claimIds];
  if(selection.answerability!=='supported'&&!ids.some(id=>limitations.includes(id)))throw Error('A partial or unsupported answer needs its relevant limitation');
  // An unanswerable request needs a direct limitation, not unrelated figures.
  if(selection.answerability==='unsupported')ids=[ids.find(id=>limitations.includes(id))];
  if(!ids.length)throw Error('Empty answer');
  const headline=selection.answerability==='unsupported'?'What the published data can answer':ids.some(id=>id.startsWith('oil-'))?`${regionName} and the oil price change`:`${regionName}'s energy economy`;
  return {headline,blocks:ids.map(id=>{
    const {text,sourceIds,evidenceIds}=catalog.get(id);
    return {text,sourceIds,evidenceIds};
  })};
}
