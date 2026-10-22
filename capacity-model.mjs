const finite = Number.isFinite;
const number = (value, fallback) => value !== null && value !== '' && finite(Number(value)) ? Number(value) : fallback;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const mean = values => values.reduce((sum, value) => sum + value, 0) / values.length;
const check = (condition, message) => { if (!condition) throw Error(`Capacity data: ${message}`); };

export function normalizeCapacitySelection(raw = {}) {
  raw = raw && typeof raw === 'object' ? raw : {};
  return {
    topic: ['workforce','construction','funding'].includes(raw.topic) ? raw.topic : 'workforce',
    extraEntrants: Math.round(clamp(number(raw.extraEntrants, 0), 0, 3000)),
    retentionPp: clamp(number(raw.retentionPp, 0), 0, 2),
    delayYears: Math.round(clamp(number(raw.delayYears, 1), 0, 3)),
    years: Math.round(clamp(number(raw.years, 5), 1, 10)),
    openingShiftMonths: Math.round(clamp(number(raw.openingShiftMonths, 0), -12, 24)),
    fundingYear: Math.round(clamp(number(raw.fundingYear, 2025), 2023, 2025)),
    projectionChangePct: clamp(number(raw.projectionChangePct, 0), -10, 10),
    fundingRule: ['previous','current','projection'].includes(raw.fundingRule) ? raw.fundingRule : 'current',
  };
}

export function forecastErrors(rows) {
  check(rows.length > 0 && rows.every(row => finite(row.actual) && finite(row.predicted)), 'forecast observations required');
  return {n: rows.length, mae: mean(rows.map(row => Math.abs(row.predicted-row.actual))), bias: mean(rows.map(row => row.predicted-row.actual)), rmse: Math.sqrt(mean(rows.map(row => (row.predicted-row.actual)**2)))};
}

export function workforceHistoricalCheck(history, originYear = 2020) {
  const origin = history.find(row => row.year === originYear);
  check(origin, 'missing workforce evaluation origin');
  const entryTraining = history.filter(row => row.year <= originYear);
  // Outflow[t] depends on registrations in t+1; never use outflow at the origin.
  const exitTraining = history.filter(row => row.year < originYear && finite(row.outflow));
  const entrants = mean(entryTraining.map(row => row.inflow));
  const exitRate = exitTraining.reduce((sum,row)=>sum+row.outflow,0)/exitTraining.reduce((sum,row)=>sum+row.supply,0);
  const annualDrift = (origin.supply-entryTraining[0].supply)/(originYear-entryTraining[0].year);
  let projected = origin.supply;
  const rows = history.filter(row=>row.year>originYear).map(row=>{
    projected=projected*(1-exitRate)+entrants;
    return {year:row.year,actual:row.supply,predicted:projected,persistence:origin.supply,drift:origin.supply+(row.year-originYear)*annualDrift};
  });
  const replay = history.slice(1).map((row,index)=>({year:row.year,actual:row.supply,predicted:history[index].supply-history[index].outflow+row.inflow}));
  return {originYear, entrants, exitRate, annualDrift, rows, model:forecastErrors(rows), persistence:forecastErrors(rows.map(row=>({...row,predicted:row.persistence}))), drift:forecastErrors(rows.map(row=>({...row,predicted:row.drift}))), replay:forecastErrors(replay)};
}

export function simulateWorkforce(history, raw) {
  const selection=normalizeCapacitySelection(raw), origin=history.at(-1);
  const entrants=mean(history.slice(-3).map(row=>row.inflow));
  const exitRows=history.filter(row=>finite(row.outflow)).slice(-3);
  const exitRate=exitRows.reduce((sum,row)=>sum+row.outflow,0)/exitRows.reduce((sum,row)=>sum+row.supply,0);
  const scenarioExitRate=Math.max(0,exitRate-selection.retentionPp/100);
  let baseline=origin.supply, scenario=origin.supply, recruitmentOnly=origin.supply;
  const rows=[{year:origin.year,baseline,scenario,extraEntries:0,avoidedExits:0}];
  for(let step=1;step<=selection.years;step++){
    // Delay is complete waiting years: delay=1 first adds entrants in the second interval.
    const extraEntries=step>selection.delayYears?selection.extraEntrants:0;
    const avoidedExits=scenario*(exitRate-scenarioExitRate);
    baseline=baseline*(1-exitRate)+entrants;
    scenario=scenario*(1-scenarioExitRate)+entrants+extraEntries;
    recruitmentOnly=recruitmentOnly*(1-exitRate)+entrants+extraEntries;
    rows.push({year:origin.year+step,baseline,scenario,extraEntries,avoidedExits});
  }
  return {selection,origin,entrants,exitRate,scenarioExitRate,rows,last:rows.at(-1),additional:scenario-baseline,recruitmentOnlyGain:recruitmentOnly-baseline,retentionAndInteractionGain:scenario-recruitmentOnly,validation:workforceHistoricalCheck(history)};
}

export function weightedEnrolment(previous, current, projection, rule) {
  check([previous,current,projection].every(value=>finite(value)&&value>=0),'invalid funding input');
  if(rule==='projection') return projection;
  if(rule==='current') return .3*current+.7*projection;
  if(rule==='previous') return .2*previous+.3*current+.5*projection;
  throw Error('Capacity data: unknown funding rule');
}

export function monthIndex(date) {
  check(/^\d{4}-\d{2}(?:-\d{2})?$/.test(date),'invalid month');
  const [year,month]=date.split('-').map(Number);check(month>=1&&month<=12,'invalid month');return year*12+month-1;
}
export function monthLabel(index) { return `${Math.floor(index/12)}-${String(index%12+1).padStart(2,'0')}`; }

export function constructionTimeline(projects, shiftMonths=0) {
  check(projects.length>0,'projects required');
  check(finite(shiftMonths)&&Number.isInteger(shiftMonths)&&shiftMonths>=-12&&shiftMonths<=24,'invalid opening shift');
  const shifted=projects.map(project=>{
    const actual=monthIndex(project.actualOpening),planned=monthIndex(project.plannedOpening),approval=monthIndex(project.approved);
    const scenario=Math.max(approval+1,actual+shiftMonths);
    return {...project,actualMonth:actual,plannedMonth:planned,scenarioMonth:scenario,scenarioOpening:monthLabel(scenario),scheduleErrorMonths:actual-planned};
  });
  const start=Math.min(...shifted.map(p=>Math.min(p.actualMonth,p.plannedMonth,p.scenarioMonth)))-1;
  const end=Math.max(...shifted.map(p=>Math.max(p.actualMonth,p.plannedMonth,p.scenarioMonth)))+1;
  const rows=[];
  for(let month=start;month<=end;month++) rows.push({month,label:monthLabel(month),actual:shifted.filter(p=>p.actualMonth<=month).reduce((n,p)=>n+p.places,0),planned:shifted.filter(p=>p.plannedMonth<=month).reduce((n,p)=>n+p.places,0),scenario:shifted.filter(p=>p.scenarioMonth<=month).reduce((n,p)=>n+p.places,0)});
  return {projects:shifted,rows,totalPlaces:shifted.reduce((n,p)=>n+p.places,0),placeMonthsDifference:rows.reduce((n,row)=>n+row.scenario-row.actual,0),scheduleMaeMonths:mean(shifted.map(p=>Math.abs(p.scheduleErrorMonths)))};
}

export function validateCapacityData(data) {
  check(data?.schemaVersion===1&&/^\d{4}-\d{2}-\d{2}$/.test(data.reviewedAt??''),'snapshot metadata required');
  const ids=new Set();
  check(Array.isArray(data.sources)&&data.sources.length>0,'sources required');
  for(const source of data.sources){check(typeof source.id==='string'&&!ids.has(source.id)&&typeof source.title==='string'&&/^https:\/\//.test(source.url??''),'invalid or duplicate source');ids.add(source.id);}
  const history=data.workforce?.history;
  check(Array.isArray(history)&&history.length>=10&&history[0].year===2016&&history.at(-1).year===2025,'workforce history scope');
  for(const [index,row] of history.entries()){
    check(Number.isInteger(row.year)&&row.year===2016+index,'workforce years must be contiguous');
    check([row.supply,row.inflow,row.renewal].every(value=>finite(value)&&value>=0)&&row.supply>0,'invalid workforce stock or flows');
    check(row.supply===row.inflow+row.renewal&&ids.has(row.sourceId),'invalid registration identity or source');
    check(index===history.length-1?row.outflow===null:finite(row.outflow)&&row.outflow>=0&&row.outflow<=row.supply,'invalid outflow timing or amount');
    if(index)check(row.supply===history[index-1].supply-history[index-1].outflow+row.inflow,'registration stock does not reconcile');
  }
  const funding=data.schools?.funding;
  check(Array.isArray(funding?.vintages)&&funding.vintages.length===3&&Array.isArray(funding.actuals),'funding observations required');
  for(const [index,row] of funding.vintages.entries()){
    check(row.targetYear===2023+index&&ids.has(row.sourceId),'funding vintage scope or source');
    check([row.previousActual,row.currentActualAtBudget,row.forecast,row.realized].every(value=>finite(value)&&value>=0),'invalid eligible FTE');
    check(typeof row.vintageDate==='string'&&row.vintageDate<`${row.targetYear}-09`,'forecast must predate September observation');
    for(const [year,key] of [[row.targetYear-2,'previousActual'],[row.targetYear-1,'currentActualAtBudget'],[row.targetYear,'realized']])check(funding.actuals.find(actual=>actual.year===year)?.eligibleGrade1to12Fte===row[key],'funding scope or actual mismatch');
  }
  const projects=data.schools?.construction?.projects;
  check(Array.isArray(projects)&&projects.length>0,'construction cohort required');
  const projectIds=new Set();
  for(const project of projects){
    check(project.id&&!projectIds.has(project.id)&&project.name,'invalid project identity');projectIds.add(project.id);
    check(finite(project.approvedCapacity)&&project.approvedCapacity>0,'invalid design places');
    check(monthIndex(project.constructionApprovalDate)<monthIndex(project.actualOpening),'opening precedes approval');
    check(monthIndex(project.planVintageDate)<monthIndex(project.actualOpening)&&monthIndex(project.planVintageDate)<monthIndex(project.plannedOpening),'plan is not pre-outcome');
    check(['actualSourceId','approvalSourceId','plannedSourceId','capacitySourceId'].every(key=>ids.has(project[key])),'unattributed project');
  }
  check(typeof data.workforce.definitions?.outflow==='string'&&data.workforce.limitations.length&&funding.limitations.length&&data.schools.construction.limitations.length,'definitions and limitations required');
  return data;
}

export function simulateCapacity(data, raw={}) {
  validateCapacityData(data);
  const selection=normalizeCapacitySelection(raw);
  const vintage=data.schools.funding.vintages.find(row=>row.targetYear===selection.fundingYear);
  const projection=vintage.forecast*(1+selection.projectionChangePct/100);
  const labels={previous:'Previous rule · 20 / 30 / 50',current:'Current rule · 30 / 70',projection:'Full projection · comparison only'};
  const values=Object.entries(labels).map(([id,label])=>({id,label,value:weightedEnrolment(vintage.previousActual,vintage.currentActualAtBudget,projection,id)}));
  const currentRuleId=vintage.actualRule==='30/70'?'current':'previous';
  const baseline=weightedEnrolment(vintage.previousActual,vintage.currentActualAtBudget,vintage.forecast,currentRuleId);
  const selected=values.find(row=>row.id===selection.fundingRule).value;
  const rows=data.schools.funding.vintages.map(row=>({year:row.targetYear,actual:row.realized,predicted:row.forecast,persistence:row.currentActualAtBudget}));
  return {
    selection,
    workforce:simulateWorkforce(data.workforce.history,selection),
    construction:constructionTimeline(data.schools.construction.projects.map(project=>({...project,places:project.approvedCapacity,approved:project.constructionApprovalDate})),selection.openingShiftMonths),
    funding:{vintage,projection,values,selected,actual:vintage.realized,baseline,currentRuleId,differenceFromHistoricalRule:selected-baseline,gapToObserved:selected-vintage.realized,validation:{rows,forecast:forecastErrors(rows),persistence:forecastErrors(rows.map(row=>({...row,predicted:row.persistence})))}}
  };
}
