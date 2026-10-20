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
  validateEnergyForecastEvaluation(data);
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

/** Experimental indicators are evidence, never an implicit replacement forecast. */
export function validateEnergyForecastEvaluation(data){
  const e=data.energyEvaluation;
  if(e===undefined)return; // Saved workspaces from before the experiment remain readable.
  const p=e?.protocol, provinces=FORECAST_REGIONS.slice(0,10), metrics=['oil','gas','electricity'];
  const candidates=[...metrics.map(m=>`${m}-residual`),'equal-energy-residual'];
  check(e.schemaVersion===1&&['evaluated','outside-tested-cutoff'].includes(e.status),'energy evaluation schema');
  const fixed={id:'monthly-energy-residual-v1',energyCutoffMonth:7,energyPublicationLagMonths:3,employmentCutoffMonth:9,minimumTrainingYears:5,minimumOwnTrainingYears:5,minimumTrainingProvinces:4,minimumSelectionYears:3,ridgeRatio:1,maximumRawCorrectionPp:1,correctionWeight:.5,minimumMaeGainPct:5,maximumProvinceMaeLossPp:.25,minimumNonWorseYears:2,productionPolicy:'retain-incumbent-until-independent-admission'};
  check(p&&Object.entries(fixed).every(([k,v])=>p[k]===v)&&JSON.stringify(p.holdoutTargetYears)==='[2023,2024,2025]'&&JSON.stringify(p.electricityBreakYears)==='[2016]','energy frozen protocol');
  check(Array.isArray(e.sources)&&e.sources.length===3,'energy sources');
  const sourceIds=['statcan-25100063','statcan-25100086','statcan-25100015'];
  check(new Set(e.sources.map(s=>s.id)).size===3&&e.sources.every(s=>sourceIds.includes(s.id)&&/^[a-f0-9]{64}$/.test(s.sha256)&&/^[a-f0-9]{64}$/.test(s.metadataSha256)&&/^https:\/\//.test(s.url)&&Number.isFinite(Date.parse(s.releaseTime))&&s.releaseTime.slice(0,10)<=data.asOf.slice(0,10)&&Number.isFinite(Date.parse(s.retrievedAt))&&s.retrievedAt.slice(0,10)<=data.asOf.slice(0,10)),'energy source provenance');
  if(e.status==='outside-tested-cutoff'){
    check(data.information.employmentCutoffMonth!==9||data.asOf.slice(0,10)<`${data.forecastOriginYear}-10-01`,'energy experiment incorrectly skipped');
    check(typeof e.reason==='string'&&!e.horizons&&!e.records,'energy unavailable explanation');return;
  }
  check(data.information.employmentCutoffMonth===9&&data.asOf.slice(0,10)>=`${data.forecastOriginYear}-10-01`&&e.energyThrough===`${data.forecastOriginYear}-07`,'energy information cutoff');
  check(e.adopted===false&&typeof e.decision==='string','experimental model must not replace forecasts');
  check(Array.isArray(e.features)&&e.features.length>0&&Array.isArray(e.records)&&e.records.length>0,'energy evidence');
  const featureIndex=new Map();
  for(const f of e.features){
    const key=`${f.metric}/${f.region}/${f.originYear}`;
    check(metrics.includes(f.metric)&&provinces.includes(f.region)&&Number.isInteger(f.originYear)&&f.originYear<=data.forecastOriginYear&&!featureIndex.has(key)&&f.through===`${f.originYear}-07`&&f.sourceId===sourceIds[metrics.indexOf(f.metric)],'energy feature identity');
    check([f.currentTotal,f.previousTotal].every(v=>v===null||finite(v)&&v>=0),'energy feature totals');
    check(['available','incomplete-source-months','source-coverage-break','zero-prior-total'].includes(f.status),'energy feature missingness');
    check(f.status==='available'?finite(f.currentTotal)&&f.previousTotal>0&&close(f.growthPct,100*(f.currentTotal/f.previousTotal-1)):f.growthPct===null,'energy growth calculation');
    check(!(f.metric==='electricity'&&f.originYear===2016)||f.status!=='available','electricity series break');
    featureIndex.set(key,f);
  }
  const recordIndex=new Map();
  for(const r of e.records){
    const key=`${r.region}/${r.horizon}/${r.originYear}`;
    check(provinces.includes(r.region)&&[0,1].includes(r.horizon)&&Number.isInteger(r.originYear)&&r.originYear<=data.forecastOriginYear&&r.targetYear===r.originYear+r.horizon&&!recordIndex.has(key),'energy replay identity');
    check([r.baselinePct,r.experimentalPct,r.benchmarkPct].every(finite)&&(r.actualPct===undefined||finite(r.actualPct)),'energy replay values');
    const predictionKeys=Object.keys(r.candidatePredictions||{});
    check(predictionKeys.every(c=>candidates.includes(c))&&r.corrections&&metrics.every(m=>Object.hasOwn(r.corrections,m)),'energy candidates');
    for(const metric of metrics){
      const c=r.corrections[metric], name=`${metric}-residual`, f=featureIndex.get(`${metric}/${r.region}/${r.originYear}`);
      if(c===null){check(!Object.hasOwn(r.candidatePredictions,name),'unavailable energy candidate');continue;}
      check(c&&finite(c.deltaPp)&&Math.abs(c.deltaPp)<=.5&&finite(c.coefficient)&&f?.status==='available'&&close(c.inputGrowthPct,f.growthPct),'energy correction');
      check(Number.isInteger(c.trainingMaxTargetYear)&&c.trainingMaxTargetYear<r.originYear&&c.trainingYears>=5&&c.ownRows>=5&&c.trainingProvinces>=4&&c.trainingRows>=c.ownRows&&c.trainingRows>=c.trainingYears,'future information in energy training');
      check(close(r.candidatePredictions[name],r.baselinePct+c.deltaPp),'energy candidate prediction');
    }
    const single=metrics.map(m=>r.candidatePredictions[`${m}-residual`]).filter(finite);
    check(single.length?close(r.candidatePredictions['equal-energy-residual'],mean(single)):predictionKeys.length===0,'energy ensemble');
    recordIndex.set(key,r);
  }
  const stats=(rows,field)=>rows.length?{count:rows.length,mae:mean(rows.map(r=>Math.abs(r[field]-r.actualPct))),rmse:Math.sqrt(mean(rows.map(r=>(r[field]-r.actualPct)**2))),bias:mean(rows.map(r=>r[field]-r.actualPct))}:null;
  const verifyPair=(reported,rows)=>{
    check(reported&&reported.changedCount===rows.filter(r=>Math.abs(r.baselinePct-r.experimentalPct)>1e-10).length,'energy changed count');
    for(const [name,field] of [['baseline','baselinePct'],['experiment','experimentalPct']]){
      const expected=stats(rows,field),actual=reported[name];
      check(expected?actual?.count===expected.count&&['mae','rmse','bias'].every(k=>close(actual[k],expected[k])):actual===null,'energy reported errors');
    }
    const gain=reported.baseline?.mae?100*(1-reported.experiment.mae/reported.baseline.mae):null;
    check(gain===null?reported.maeGainPct===null:close(reported.maeGainPct,gain),'energy reported gain');
  };
  for(const r of e.records){
    const expected={};
    for(const candidate of candidates){
      if(!Object.hasOwn(r.candidatePredictions,candidate))continue;
      const prior=e.records.filter(x=>x.region===r.region&&x.horizon===r.horizon&&x.targetYear<r.originYear&&finite(x.actualPct)&&Object.hasOwn(x.candidatePredictions,candidate));
      if(prior.length<3)continue;
      const errors=prior.map(x=>x.candidatePredictions[candidate]-x.actualPct),baseline=prior.map(x=>x.baselinePct-x.actualPct),mae=mean(errors.map(Math.abs));
      if(mae<=.95*mean(baseline.map(Math.abs))&&mean(errors.map(v=>v*v))<=mean(baseline.map(v=>v*v)))expected[candidate]={mae,count:prior.length,maxTargetYear:Math.max(...prior.map(x=>x.targetYear))};
    }
    check(r.selectionScores&&Object.keys(expected).length===Object.keys(r.selectionScores).length&&Object.entries(expected).every(([k,v])=>close(r.selectionScores[k]?.mae,v.mae)&&r.selectionScores[k]?.count===v.count&&r.selectionScores[k]?.maxTargetYear===v.maxTargetYear),'energy earlier-only selection');
    const selected=Object.keys(expected).sort((a,b)=>expected[a].mae-expected[b].mae)[0]||'incumbent';
    check(r.selected===selected&&close(r.experimentalPct,selected==='incumbent'?r.baselinePct:r.candidatePredictions[selected]),'energy selected forecast');
    if(r.originYear===data.forecastOriginYear){
      const live=data.forecasts.find(f=>f.region===r.region&&f.horizon===r.horizon);
      check(live&&close(live.predictionPct,r.baselinePct),'experimental forecast promoted without admission');
    }
    const heldout=data.forecasts.find(f=>f.region===r.region&&f.horizon===r.horizon)?.validation.heldout.find(f=>f.originYear===r.originYear);
    if(heldout)check(close(heldout.predictionPct,r.baselinePct)&&close(heldout.actualPct,r.actualPct),'energy replay differs from incumbent');
  }
  check(e.records.filter(r=>r.originYear===data.forecastOriginYear).length===20,'energy current replay coverage');
  check(Array.isArray(e.horizons)&&e.horizons.length===2&&e.horizons[0].horizon===0&&e.horizons[1].horizon===1,'energy horizon coverage');
  for(const h of e.horizons){
    const heldout=e.records.filter(r=>r.horizon===h.horizon&&p.holdoutTargetYears.includes(r.targetYear)&&finite(r.actualPct));
    verifyPair(h,heldout);
    check(h.byYear?.length===3&&h.byProvince?.length===10&&p.holdoutTargetYears.every(y=>h.byYear.filter(r=>r.year===y).length===1)&&provinces.every(c=>h.byProvince.filter(r=>r.region===c).length===1),'energy score coverage');
    for(const y of h.byYear)verifyPair(y,heldout.filter(r=>r.targetYear===y.year));
    for(const province of h.byProvince)verifyPair(province,heldout.filter(r=>r.region===province.region));
    verifyPair(h.eligibleOnly,heldout.filter(r=>Object.keys(r.candidatePredictions).length));
    check(h.periods?.length===3&&['development','pandemic','without-pandemic'].every(label=>h.periods.filter(r=>r.label===label).length===1),'energy period coverage');
    for(const period of h.periods)verifyPair(period,e.records.filter(r=>r.horizon===h.horizon&&finite(r.actualPct)&&(period.label==='development'?r.targetYear>=2015&&r.targetYear<=2022:period.label==='pandemic'?r.targetYear===2020:r.targetYear>=2015&&r.targetYear<=2025&&![2020,2021].includes(r.targetYear))));
    const complete=heldout.length===30&&h.byProvince.every(r=>r.baseline?.count===3);
    const gates={complete,mae:complete&&h.maeGainPct>=5,rmse:complete&&h.experiment.rmse<=h.baseline.rmse,years:complete&&h.byYear.filter(y=>y.experiment.mae<=y.baseline.mae).length>=2,provinces:complete&&h.byProvince.every(r=>r.experiment.mae<=r.baseline.mae+.25)};
    check(Object.keys(h.gates||{}).length===5&&Object.entries(gates).every(([k,v])=>h.gates[k]===v)&&h.passed===Object.values(gates).every(Boolean),'energy admission gates');
  }
  return e;
}
