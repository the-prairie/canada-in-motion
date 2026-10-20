/** Published-input provincial GDP forecasts. Price interventions are not inputs. */
export const FORECAST_REGIONS=['NL','PE','NS','NB','QC','ON','MB','SK','AB','BC','YT','NT','NU'];
const finite=value=>typeof value==='number'&&Number.isFinite(value);
const check=(condition,message)=>{if(!condition)throw Error(`Invalid provincial forecast: ${message}`);};
const mean=values=>values.reduce((a,b)=>a+b,0)/values.length;
const close=(a,b)=>finite(a)&&finite(b)&&Math.abs(a-b)<1e-7;

export function validateProvincialOutlooks(data){
  check(data?.schemaVersion===1&&/^[a-f0-9]{20}$/.test(data.dataVersion)&&Number.isFinite(Date.parse(data.reviewedDate)),'official outlook identity');
  check(Array.isArray(data.sources)&&data.sources.length===10&&Array.isArray(data.rows)&&data.rows.length===20,'official outlook coverage');
  const ids=new Set();
  for(const source of data.sources){
    check(typeof source.id==='string'&&!ids.has(source.id)&&typeof source.title==='string'&&/^https:\/\//.test(source.url)&&/^[a-f0-9]{64}$/.test(source.sha256)&&Number.isFinite(Date.parse(source.publicationDate)),'official outlook provenance');
    ids.add(source.id);
  }
  const keys=new Set();
  for(const row of data.rows){
    const key=`${row.region}/${row.year}`;
    check(FORECAST_REGIONS.slice(0,10).includes(row.region)&&Number.isInteger(row.year)&&!keys.has(key)&&finite(row.growthPct)&&row.growthPct>-100&&ids.has(row.sourceId)&&row.unit==='percent'&&typeof row.basis==='string','official outlook observation');
    check(row.publicationDate===data.sources.find(s=>s.id===row.sourceId).publicationDate,'official outlook publication date');
    keys.add(key);
  }
  check(FORECAST_REGIONS.slice(0,10).every(code=>data.rows.filter(r=>r.region===code).length===2),'official outlook jurisdictions');
  return data;
}

export function validateProvincialForecast(data){
  check(data?.schemaVersion===1&&data.method==='publication-lag-aware-provincial-gdp-forecast','schema');
  check(/^[a-f0-9]{20}$/.test(data.dataVersion)&&Number.isFinite(Date.parse(data.asOf)),'snapshot identity');
  check(Number.isInteger(data.forecastOriginYear)&&data.forecastOriginYear===data.information?.gdpYear+1,'forecast origin');
  check(data.information.gdpBasis==='GDP at basic prices'&&data.information.gdpUnit==='million chained 2017 CAD'&&data.information.forecastUnit==='annual real GDP growth (%)','GDP concept and units');
  check(/^\d{4}-\d{2}$/.test(data.information.employmentThrough)&&Number.isInteger(data.information.employmentCutoffMonth)&&data.information.employmentCutoffMonth>=1&&data.information.employmentCutoffMonth<=12,'indicator cutoff');
  check(Array.isArray(data.sources)&&data.sources.length>=2&&data.sources.length<20,'source registry');
  const ids=new Set();
  for(const source of data.sources){
    check(typeof source.id==='string'&&!ids.has(source.id)&&typeof source.title==='string'&&/^https:\/\//.test(source.url)&&/^[a-f0-9]{64}$/.test(source.sha256),'source identity');
    ids.add(source.id);
    check(Number.isFinite(Date.parse(source.releaseTime))&&source.releaseTime.slice(0,10)<=data.asOf.slice(0,10),'source released after forecast');
  }
  check(Array.isArray(data.regions)&&data.regions.length===13&&FORECAST_REGIONS.every(code=>data.regions.filter(r=>r.code===code).length===1),'jurisdictions');
  check(Array.isArray(data.history?.gdp)&&data.history.gdp.length>=300&&Array.isArray(data.history.employment),'history');
  const historyKeys=new Set();
  for(const row of data.history.gdp){
    const key=`${row.region}/${row.year}`;
    check(FORECAST_REGIONS.includes(row.region)&&Number.isInteger(row.year)&&!historyKeys.has(key),'GDP history identity');
    check(row.status==='available'?finite(row.value)&&row.value>0:row.value===null,'GDP history values');
    historyKeys.add(key);
  }
  check(data.methodology?.predictionRangeTarget===.8&&Array.isArray(data.methodology.limitations)&&data.methodology.limitations.length>=3,'forecast limitations');
  check(Array.isArray(data.forecasts)&&data.forecasts.length>=20&&data.forecasts.length<=26,'forecast coverage');
  const keys=new Set();
  for(const row of data.forecasts){
    const key=`${row.region}/${row.year}`;
    check(FORECAST_REGIONS.includes(row.region)&&[0,1].includes(row.horizon)&&row.year===data.forecastOriginYear+row.horizon&&!keys.has(key),'forecast identity');
    check(finite(row.predictionPct)&&row.predictionPct>-100&&finite(row.benchmarkPct)&&typeof row.model==='string','forecast value');
    check(row.lowerPct===null&&row.upperPct===null||finite(row.lowerPct)&&finite(row.upperPct)&&row.lowerPct<=row.predictionPct&&row.upperPct>=row.predictionPct,'forecast range');
    const v=row.validation;
    const details=row.modelDetails;
    check(details&&details.selectionMaxTargetYear<data.forecastOriginYear&&details.calibrationMaxTargetYear<data.forecastOriginYear,'future information in current model selection');
    check(Object.values(details.candidates||{}).length>0&&Object.values(details.candidates).every(candidate=>candidate.fit?.trainingMaxTargetYear<data.forecastOriginYear),'future information in current training');
    check(Array.isArray(v?.heldout)&&v.count===v.heldout.length&&v.count>=1,'validation sample');
    const heldoutKeys=new Set();
    for(const test of v.heldout){
      check(Number.isInteger(test.originYear)&&test.targetYear===test.originYear+row.horizon&&!heldoutKeys.has(test.originYear),'validation identity');
      check(test.trainingMaxTargetYear<test.originYear&&(test.calibrationMaxTargetYear===null||test.calibrationMaxTargetYear<test.originYear),'future information in training or calibration');
      check(test.selectionMaxTargetYear===null||test.selectionMaxTargetYear<test.originYear,'future information in historical model selection');
      check([test.actualPct,test.predictionPct,test.benchmarkPct].every(finite)&&test.trainingRows>0&&Number.isInteger(test.calibrationCount)&&test.calibrationCount>=0,'validation values');
      check(test.lowerPct===null&&test.upperPct===null||finite(test.lowerPct)&&finite(test.upperPct)&&test.lowerPct<=test.predictionPct&&test.upperPct>=test.predictionPct,'historical range');
      heldoutKeys.add(test.originYear);
    }
    check(close(v.mae,mean(v.heldout.map(r=>Math.abs(r.predictionPct-r.actualPct))))&&close(v.benchmarkMae,mean(v.heldout.map(r=>Math.abs(r.benchmarkPct-r.actualPct)))),'reported forecast error');
    check(close(v.rmse,Math.sqrt(mean(v.heldout.map(r=>(r.predictionPct-r.actualPct)**2)))),'reported squared error');
    const ranged=v.heldout.filter(r=>r.lowerPct!==null&&r.upperPct!==null);
    check(v.intervalCount===ranged.length&&(ranged.length?close(v.intervalCoverage,mean(ranged.map(r=>Number(r.actualPct>=r.lowerPct&&r.actualPct<=r.upperPct)))):v.intervalCoverage===null),'reported range coverage');
    keys.add(key);
  }
  for(const region of data.regions){
    const count=data.forecasts.filter(r=>r.region===region.code).length;
    check(count===2||count===0&&region.status==='insufficient-indicator-coverage','partial regional horizon');
  }
  return data;
}

export function summarizeProvincialForecast(data,{regions=[],year=data.forecastOriginYear}={}){
  validateProvincialForecast(data);
  check(Array.isArray(regions)&&regions.every(code=>code==='CA'||FORECAST_REGIONS.includes(code)),'selected regions');
  check([data.forecastOriginYear,data.forecastOriginYear+1].includes(year),'selected year');
  const selected=regions.length&&!regions.includes('CA')?[...new Set(regions)]:FORECAST_REGIONS;
  const rows=selected.map(code=>{
    const region=data.regions.find(r=>r.code===code),forecast=data.forecasts.find(r=>r.region===code&&r.year===year);
    const history=data.history.gdp.filter(r=>r.region===code&&r.status==='available').sort((a,b)=>a.year-b.year);
    const actuals=history.slice(-7).map(row=>{const previous=history.find(r=>r.year===row.year-1);return {...row,growthPct:previous?100*(row.value/previous.value-1):null};});
    return forecast?{...forecast,name:region.name,status:'available',actuals}:{region:code,name:region.name,year,status:region.status,predictionPct:null,lowerPct:null,upperPct:null,actuals};
  });
  return {year,years:[data.forecastOriginYear,data.forecastOriginYear+1],rows,information:data.information,asOf:data.asOf,dataVersion:data.dataVersion,methodology:data.methodology,sources:data.sources,
    interpretation:'Predictions of annual real GDP growth from observed economic indicators. These forecasts do not estimate the causal effect of changing energy prices.'};
}
