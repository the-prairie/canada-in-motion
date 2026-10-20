const REGIONS=['NL','PE','NS','NB','QC','ON','MB','SK','AB','BC','YT','NT','NU'];
const finite=Number.isFinite;
const require=(test,message)=>{if(!test)throw Error(`Invalid price response: ${message}`);};
const percent=(elasticity,shock)=>shock===0?0:100*Math.expm1(elasticity*Math.log1p(shock/100));
const mean=values=>values.reduce((sum,value)=>sum+value,0)/values.length;
const quantile=(values,p)=>{
  const sorted=[...values].sort((a,b)=>a-b),index=(sorted.length-1)*p,low=Math.floor(index);
  return sorted[low]+(sorted[Math.ceil(index)]-sorted[low])*(index-low);
};
function sources(data) {
  require(data?.schemaVersion===1&&typeof data.dataVersion==='string','schema and version');
  require(Array.isArray(data.sources)&&data.sources.length>0,'source registry');
  const ids=new Set();
  for(const source of data.sources){
    require(typeof source.id==='string'&&!ids.has(source.id)&&/^https:\/\//.test(source.url)&&/^[a-f0-9]{64}$/.test(source.sha256),'source identity');
    ids.add(source.id);
  }
  return ids;
}
function selection(input) {
  const result={commodity:input.commodity??'oil',regions:input.regions??['AB'],shockPct:input.shockPct??-10,horizonYears:input.horizonYears??0,basis:input.basis??'benchmark'};
  require(['oil','gas','electricity'].includes(result.commodity),'commodity');
  require(Array.isArray(result.regions)&&result.regions.length>0&&result.regions.length<=13&&result.regions.every(r=>REGIONS.includes(r))&&new Set(result.regions).size===result.regions.length,'regions');
  require(finite(result.shockPct)&&Math.abs(result.shockPct)<=20,'bounded price change');
  require([0,1].includes(result.horizonYears),'response period');
  require(['benchmark','retail'].includes(result.basis),'household price basis');
  return result;
}
export function validateProvincialPriceResponse(data) {
  const ids=sources(data),keys=new Set();
  require(data.method==='conditional-historical-energy-price-response'&&Array.isArray(data.models)&&data.models.length>0,'GDP model method');
  for(const model of data.models){
    const key=`${model.region}/${model.commodity}/${model.horizonYears}`;
    require(REGIONS.includes(model.region)&&['oil','gas'].includes(model.commodity)&&[0,1].includes(model.horizonYears)&&!keys.has(key),'GDP model identity');keys.add(key);
    require(finite(model.coefficient)&&finite(model.parameterRange?.low)&&finite(model.parameterRange?.high)&&model.parameterRange.low<=model.parameterRange.high,'GDP coefficient range');
    const v=model.validation;
    require(v&&typeof v.passesScreen==='boolean'&&finite(v.maePctPoints)&&v.maePctPoints>=0&&finite(v.baselineMeanMaePctPoints)&&finite(v.baselineArMaePctPoints),'GDP validation');
    require(Array.isArray(model.heldout)&&model.heldout.length===model.heldoutCount&&model.heldoutCount>=1,'GDP held-out records');
    const criteria={heldoutMinimum:model.heldoutCount>=12,maeImprovement:v.improvementPct>=5,rmseNoWorse:v.rmsePctPoints<=v.baselineRmsePctPoints,nonPandemicGain:v.eras?.excludePandemic?.improvementPct>0,recentGain:v.eras?.from2015?.improvementPct>=0,stableSign:v.coefficientSignShare>=.8};
    require(Object.entries(criteria).every(([key,pass])=>v.criteria?.[key]===pass)&&v.passesScreen===Object.values(criteria).every(Boolean),'GDP acceptance screen');
    const periods=new Set();
    for(const record of model.heldout){
      require(Number.isInteger(record.year)&&record.outcomeYear===record.year+model.horizonYears&&record.trainingEnd<record.year&&(record.latestSelectionOutcomeYear===null||record.latestSelectionOutcomeYear<record.year)&&!periods.has(record.year),'GDP historical boundary');
      require([record.actualPct,record.modelPct,record.baselineMeanPct,record.baselineArPct].every(finite),'GDP historical values');periods.add(record.year);
    }
    const mae=mean(model.heldout.map(r=>Math.abs(r.modelPct-r.actualPct)));
    require(Math.abs(mae-v.maePctPoints)<1e-7,'GDP historical score');
    require(data.benchmarks?.[model.commodity]?.label,'GDP benchmark');
    require(!model.sourceIds||model.sourceIds.every(id=>ids.has(id)),'GDP source references');
  }
  return data;
}
export function validateHouseholdEnergyCosts(data) {
  const ids=sources(data),keys=new Set();
  require(Array.isArray(data.spendingBaselines)&&Array.isArray(data.calibrations),'household records');
  for(const row of data.spendingBaselines){
    const key=`${row.region}/${row.commodity}`;
    require(REGIONS.includes(row.region)&&['oil','gas','electricity'].includes(row.commodity)&&!keys.has(key),'spending identity');keys.add(key);
    require(row.currentAnnualCad===null||finite(row.currentAnnualCad)&&row.currentAnnualCad>=0,'household spending');
    require(Number.isInteger(row.spendingYear)&&typeof row.spendingCategory==='string','spending definition');
  }
  keys.clear();
  for(const row of data.calibrations){
    const key=`${row.region}/${row.commodity}`;
    require(REGIONS.includes(row.region)&&['oil','gas'].includes(row.commodity)&&!keys.has(key),'household model identity');keys.add(key);
    require(['supported','exploratory','unavailable'].includes(row.status),'household model status');
    require(row.status==='unavailable'||Array.isArray(row.sourceIds)&&row.sourceIds.every(id=>ids.has(id)),'household source references');
    if(row.status!=='unavailable'){
      require(row.responseElasticities?.persistent?.length>=12&&row.responseElasticities.persistent.every(finite),'household response path');
      if(row.status==='supported')require(Array.isArray(row.responseDraws?.persistent)&&row.responseDraws.persistent.length>=100&&row.responseDraws.persistent.every(draw=>Array.isArray(draw)&&draw.length>=12&&draw.every(finite)),'household parameter draws');
      require(row.validation?.monthly?.development&&row.validation?.monthly?.audit,'household validation periods');
      if(row.status==='supported')require(['development','audit'].every(period=>row.validation.monthly[period].n>=60&&row.validation.monthly[period].improvementPct>=10)&&Math.abs(row.coefficients.autoregressive)<.98&&mean(row.responseElasticities.persistent.slice(0,12))>0,'household acceptance screen');
      for(const prediction of row.validation.monthlyPredictions||[])require(prediction.trainingEnd<prediction.month&&[prediction.actual,prediction.model,prediction.baseline].every(finite),'household historical boundary');
    }
  }
  return data;
}
export function summarizeProvincialPriceResponse(data,input={}) {
  const s=selection(input);
  if(data)validateProvincialPriceResponse(data);
  const rows=s.regions.map(region=>{
    const model=data?.models.find(row=>row.region===region&&row.commodity===s.commodity&&row.horizonYears===s.horizonYears);
    const benchmark=data?.benchmarks?.[s.commodity]?.label??null;
    if(!model)return {region,status:'unavailable',benchmark,estimatePct:null,lowerPct:null,upperPct:null,validation:null,reasons:[s.commodity==='electricity'?'There is no common wholesale electricity benchmark with a validated provincial GDP response.':data?'The available history does not support this regional model.':'The GDP price-response snapshot is unavailable.']};
    const v=model.validation,bounds=[percent(model.parameterRange.low,s.shockPct),percent(model.parameterRange.high,s.shockPct)].sort((a,b)=>a-b);
    return {region,status:v.passesScreen?'supported':'exploratory',benchmark,estimatePct:percent(model.coefficient,s.shockPct),lowerPct:bounds[0],upperPct:bounds[1],
      rangeLabel:`${Math.round(model.parameterRange.level*100)}% parameter range; not a forecast-error range`,
      reasons:Object.entries(v.criteria).filter(([,pass])=>!pass).map(([key])=>({heldoutMinimum:'Too few held-out years are available.',maeImprovement:'The model did not reduce average error enough against both simpler baselines.',rmseNoWorse:'Large errors were worse than a simpler baseline.',nonPandemicGain:'The improvement did not hold outside the pandemic years.',recentGain:'The improvement did not hold from 2015 onward.',stableSign:'The fitted price relationship changed sign too often across historical tests.'})[key]),
      validation:{n:model.heldoutCount,mae:v.maePctPoints,baselineMae:Math.min(v.baselineMeanMaePctPoints,v.baselineArMaePctPoints),description:'Each historical test fits only earlier GDP outcomes. It conditions on the realized annual commodity price. Revised data are used; this is not a real-time forecasting test. The comparator shown is the stronger of the mean and autoregressive baselines across the evaluated period.',outcomeLabel:'cumulative real GDP change, percent',auditNote:`A successful historical screen does not identify a causal price shock or guarantee a future outcome. The separate 80% target outcome-error band covered ${Math.round(v.outcomeRange.heldoutCoverage*100)}% of ${v.outcomeRange.calibratedCount} evaluated outcomes. The parameter range above is not that outcome band.`,origins:model.heldout.map(r=>({period:r.year,actual:r.actualPct,prediction:r.modelPct,baseline:v.baselineMeanMaePctPoints<=v.baselineArMaePctPoints?r.baselineMeanPct:r.baselineArPct}))}};
  });
  return {...s,available:!!data,rows,sourceIds:data?.sources.map(row=>row.id)||[]};
}
export function summarizeHouseholdEnergyCosts(data,input={}) {
  const s=selection(input);
  if(data)validateHouseholdEnergyCosts(data);
  const categoryLabel={oil:'Motor fuel spending',gas:'Natural gas at home',electricity:'Electricity at home'};
  const rows=s.regions.map(region=>{
    const base=data?.spendingBaselines.find(row=>row.region===region&&row.commodity===s.commodity),model=data?.calibrations.find(row=>row.region===region&&row.commodity===s.commodity);
    const baselineAnnualCad=base?.status==='available'?base.currentAnnualCad:null;
    const row={region,categoryLabel:categoryLabel[s.commodity],status:'unavailable',baselineAnnualCad,spendingYear:base?.spendingYear??null,spendingCategory:base?.spendingCategory??null,retailChangePct:null,annualChangeCad:null,monthlyEquivalentCad:null,lowerAnnualCad:null,upperAnnualCad:null,validation:null,reasons:[]};
    row.baselineLabel=base?`${base.spendingYear} average spending, repriced using the provincial ${base.cpiPeriodStart} to ${base.cpiPeriodEnd} retail-price index. This is a price-adjusted spending reference, not newly observed expenditure.`:'';
    row.interpretation=s.commodity==='oil'?'Gasoline CPI is a proxy for the survey’s broader motor-fuel category. Consumption, taxes, contracts and household composition can change the result.':'The calculation holds consumption and household composition fixed. Individual tariffs, taxes and usage can differ.';
    if(!data){row.reasons=['Household energy data could not be loaded. Retry the published sources.'];return row;}
    if(!finite(baselineAnnualCad)){row.reasons=[finite(base?.annualCad)?`The ${base.spendingYear} spending survey reports $${base.annualCad} per household, but a provincial retail-price index is unavailable for repricing it.`:'A usable provincial spending reference is not published for this category.'];return row;}
    if(s.basis==='retail'){
      row.status='retail-scenario';row.retailChangePct=s.shockPct;
    }else if(model?.status==='supported'){
      row.status='supported';row.retailChangePct=mean(model.responseElasticities.persistent.slice(0,12).map(e=>percent(e,s.shockPct)));
      const draws=model.responseDraws.persistent.map(draw=>baselineAnnualCad*mean(draw.slice(0,12).map(e=>percent(e,s.shockPct)))/100);
      row.lowerAnnualCad=quantile(draws,.05);row.upperAnnualCad=quantile(draws,.95);
      row.rangeLabel='90% model-parameter range; excludes individual bill and spending-survey uncertainty';
    }else{
      row.status=model?'exploratory':'unavailable';row.reasons=model?.reasons||['No validated wholesale-to-retail response is available. A separate retail-price scenario can use the observed spending reference.'];
    }
    if(finite(row.retailChangePct)){row.annualChangeCad=baselineAnnualCad*row.retailChangePct/100;row.monthlyEquivalentCad=row.annualChangeCad/12;}
    row.benchmark=model?.benchmark??null;
    row.priceBasis=model?.priceBasis??null;
    if(model?.validation&&s.basis==='benchmark'){
      const audit=model.validation.monthly.audit,annual=model.validation.annual;
      row.validation={n:audit.n,mae:audit.mae,baselineMae:audit.baselineMae,
        description:`Monthly retail-price checks from 2020–2025, using only earlier CPI outcomes and the realized commodity price. Benchmark prices are converted to CAD; the scenario holds the exchange rate fixed. Earlier 2015–2019 tests improved monthly error by ${model.validation.monthly.development.improvementPct.toFixed(1)}%.`,
        outcomeLabel:'monthly retail CPI log change, percentage points',
        auditNote:`Annual-average CPI checks are separate. Error was ${annual.audit.mae.toFixed(2)}% versus ${annual.audit.baselineMae.toFixed(2)}% for the simpler model in 2020–2025, and ${annual.development.mae.toFixed(2)}% versus ${annual.development.baselineMae.toFixed(2)}% in 2015–2019. These checks do not validate future dollar bills.`,
        origins:model.validation.monthlyPredictions.filter(r=>r.month>='2020-01'&&r.month<='2025-12').map(r=>({period:r.month,actual:r.actual,prediction:r.model,baseline:r.baseline}))};
    }
    if(model?.validation&&s.basis==='benchmark')row.annualCheck={mae:model.validation.annual.audit.mae,baselineMae:model.validation.annual.audit.baselineMae};
    return row;
  });
  return {...s,available:!!data,horizonMonths:12,rows,sourceIds:data?.sources.map(row=>row.id)||[]};
}
