import {JEV_MODEL} from './jev-decisions.mjs';
import {selectInfrastructure} from '../infrastructure-model.mjs';

export const WORKSPACE_SCHEMA_VERSION=1;
const REGIONS=['CA','AB','BC','SK','MB','ON','QC','NB','NS','PE','NL','YT','NT','NU'];
export const WORKSPACE_METRICS=['wti','wcs','brent','cls','henry-hub','nit','oil-production','gas-production','electricity-generation','end-use-demand','electricity-price','gas-price'];
const TOPICS=['gdp','scenario','infrastructure','oil-sensitivity','unavailable'];
const MEASURES=['available','measured-flow','provincial-price-impact','beneficiary-distribution','other-unavailable'];
const enumArray=(values,maximum)=>({type:'array',minItems:1,maxItems:maximum,items:{type:'string',enum:values}});
export const INVESTIGATION_SCHEMA={type:'object',properties:{regions:enumArray(REGIONS,14),topics:enumArray(TOPICS,3),metricIds:{...enumArray(WORKSPACE_METRICS,3),minItems:0},includeMap:{type:'boolean'},requestedMeasure:{type:'string',enum:MEASURES,description:'Use available for observed energy GDP, published CER generation or production comparisons, and infrastructure locations. Use measured-flow only when the user asks for quantities transported between places, not for quantities produced in each province.'}},required:['regions','topics','metricIds','includeMap','requestedMeasure'],additionalProperties:false};
export const WORKSPACE_PLANNING_INSTRUCTIONS=' Also return investigation. Identify every requested province or territory, not only the state region. Use CA for a national/all-provinces comparison, including when a province is emphasized. Respect exclusions by listing the remaining requested regions. Select up to three topics and up to three metricIds from the supplied capabilities. GDP contribution uses gdp and an empty metricIds array; published CER scenarios use scenario and only the requested metric IDs; pipeline/refinery/LNG locations use infrastructure; supported national oil-price changes use oil-sensitivity. Include a map when requested or geographic context helps. Set requestedMeasure to available for observed GDP contribution, production/generation within provinces, published CER scenarios, and infrastructure locations. Comparing electricity generation in Alberta and Quebec is available; it does not request electricity trade or measured-flow. Comparing energy GDP in Alberta, Ontario and Quebec is available; it does not request shipment volumes. Use measured-flow only for requested shipment, pipeline throughput or origin-destination quantities. Use provincial-price-impact for arbitrary provincial GDP/jobs/royalties/bill changes, beneficiary-distribution for who receives energy income, and other-unavailable for another unsupported measure. Compound questions retain any genuinely missing requested measure. Infrastructure geometry cannot answer measured-flow. Published CER scenario differences cannot answer isolated price impacts. Never invent a tool, metric, source, number, URL or view.';

const exactKeys=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
const unique=values=>[...new Set(values)];
const listOf=(value,choices,min,max)=>Array.isArray(value)&&value.length>=min&&value.length<=max&&value.every(item=>choices.includes(item))&&new Set(value).size===value.length;
export function validateInvestigation(value) {
  if(!exactKeys(value,INVESTIGATION_SCHEMA.required)||!listOf(value.regions,REGIONS,1,14)||!listOf(value.topics,TOPICS,1,3)||!listOf(value.metricIds,WORKSPACE_METRICS,0,3)||typeof value.includeMap!=='boolean'||!MEASURES.includes(value.requestedMeasure))throw new Error('Invalid investigation');
  return {...value,regions:[...value.regions],topics:[...value.topics],metricIds:[...value.metricIds]};
}

const REGION_NAMES={AB:['alberta'],BC:['british columbia','colombie britannique'],SK:['saskatchewan'],MB:['manitoba'],ON:['ontario'],QC:['quebec'],NB:['new brunswick','nouveau brunswick'],NS:['nova scotia','nouvelle ecosse'],PE:['prince edward island','ile du prince edouard'],NL:['newfoundland and labrador','newfoundland','terre neuve et labrador'],YT:['yukon'],NT:['northwest territories','territoires du nord ouest'],NU:['nunavut']};
function explicitRegions(question) {
  const plain=question.normalize('NFD').replace(/\p{M}/gu,'').toLowerCase().replace(/[-–]/g,' ');
  return Object.entries(REGION_NAMES).filter(([code,names])=>new RegExp(`\\b${code}\\b`).test(question)||names.some(name=>new RegExp(`\\b${name}\\b`).test(plain))).map(([code])=>code);
}
function requestedRegions(question,proposed) {
  const text=question.normalize('NFD').replace(/\p{M}/gu,'').toLowerCase();
  const exclusionClause=value=>value.split(/\b(?:especially|focusing|but include|and include|versus|compared to|to|show|compare|focus)\b/i)[0];
  const exclusions=[...question.matchAll(/\b(?:except|excluding|exclude|without|but not|not including|other than|sauf|hors|sans)\s+([^.;!?]+)/gi)].flatMap(match=>explicitRegions(exclusionClause(match[1])));
  const bareNot=question.match(/\bnot\s+([^.;!?]+)/i);
  if(bareNot&&!/^just\b/i.test(bareNot[1]))exclusions.push(...explicitRegions(exclusionClause(bareNot[1])));
  const excluded=new Set(exclusions);
  const all=/\b(all|every|each)\s+(?:(?:other|the|canadian)\s+)?(?:provinces?|territories|regions?)\b|\b(across canada|nationwide|nationally|national comparison|canada wide)\b|\b(toutes? les provinces|chaque province|partout au canada)\b/.test(text)||(proposed.includes('CA')&&/\b(especially|particularly|in particular|notably|attention to|focus on|surtout|notamment)\b/.test(text));
  if(all&&!excluded.size)return ['CA'];
  if(all||(proposed.includes('CA')&&excluded.size))return REGIONS.filter(code=>code!=='CA'&&!excluded.has(code));
  const named=explicitRegions(question).filter(code=>!excluded.has(code));
  return (named.length?named:proposed).filter(code=>!excluded.has(code));
}
function missingMeasure(question) {
  const text=question.normalize('NFD').replace(/\p{M}/gu,'').toLowerCase();
  const transport=/\b(pipelines?|routes?|corridors?|interprovincial|province to province|between provinces|oleoducs?|gazoducs?|echanges?|transport|ship|send|sends|sent|envoie)\b/.test(text)||(explicitRegions(question).length>1&&/\b(flow|flows|flowing|transfer|transferred|export|import|circul\w*)\b/.test(text));
  if(transport&&/\b(flow|flows|flowing|throughput|shipments?|volumes?|barrels|tonnes|m3|debit|achemin|transported|how much energy|combien d.energie)\b/.test(text))return 'measured-flow';
  if(/\b(gdp|jobs|royalties|bills?|pib|emplois|factures?)\b/.test(text)&&/\b(provinces?|provincial|alberta|quebec|ontario|british columbia|saskatchewan|manitoba)\b/.test(text)&&/\b(price|prices|prix)\b/.test(text)&&/\b(increase|decrease|rise|fall|double|halve|change|shock|impact|effect|affect|up|down|hausse|baisse)\b/.test(text))return 'provincial-price-impact';
  return null;
}
function missingGDPClausePeriod(text,gdpYear) {
  const clauses=text.split(/[.;!?]|\b(?:and|with)\b(?=\s+(?:(?:observed|projected|forecast|forecasted|future|published|historical)\s+)*(?:electricity|oil|gas|natural gas|generation|production|gdp|pib)\b)/);
  return clauses.some(clause=>/\b(gdp|pib|gross domestic product|value added)\b/.test(clause)&&(/\b(future|forecast\w*|projected|projection\w*)\b/.test(clause)||[...clause.matchAll(/\b((?:19|20|21)\d{2})\b/g)].some(match=>Number(match[1])!==gdpYear)));
}
function repairFlowClassification(question,plan,gdpYear) {
  if(plan.requestedMeasure!=='measured-flow'||plan.topics.some(topic=>!['gdp','scenario'].includes(topic)))return plan.requestedMeasure;
  const text=question.normalize('NFD').replace(/\p{M}/gu,'').toLowerCase();
  if(/\b(flow\w*|throughput|ship\w*|pipeline\w*|routes?|corridors?|trade|transfer\w*|transport\w*|export\w*|import\w*|interties?|transmission|send\w*|sent|receive\w*|benefit\w*|recipient\w*|jobs?|royalties|bills?|revenue|profits?|pension\w*|emissions?|tolls?|tax\w*|debit|echange\w*|achemin\w*|emplois|factures|beneficiaires)\b/.test(text))return plan.requestedMeasure;
  const gdp=/\b(gdp|pib|value added)\b/.test(text);
  const quantity=/\b(generation|production|demand|consumption)\b/.test(text);
  if(!gdp&&!quantity)return plan.requestedMeasure;
  if(/\b(price|prices|prix|shock|effect|impact|affect|double|halve)\b/.test(text))return plan.requestedMeasure;
  if(gdp&&missingGDPClausePeriod(text,gdpYear))return plan.requestedMeasure;
  return 'available';
}
function unsupportedGDPPeriod(question,plan,gdpYear) {
  const text=question.normalize('NFD').replace(/\p{M}/gu,'').toLowerCase();
  const nationalOil=plan.topics.includes('oil-sensitivity')&&plan.regions.includes('CA')&&/\boil\b/.test(text)&&/\bprice\b/.test(text)&&/\b(change|fall|rise|drop|increase|decrease|shock)\b/.test(text)&&!/\b(absolute|level|forecast|forecasted)\b/.test(text);
  if(nationalOil)return false;
  return missingGDPClausePeriod(text,gdpYear);
}
export function fallbackInvestigation(question,state) {
  const text=question.toLowerCase();
  const regions=explicitRegions(question);
  const topics=[];
  const metricIds=[];
  if(/gdp|contribut|value added|econom|pib|benefit/i.test(text))topics.push('gdp');
  if(/pipeline|refiner|\blng\b|infrastructure|oleoduc|gazoduc/i.test(text))topics.push('infrastructure');
  if(/oil.*price|price.*oil|petrole.*prix|prix.*petrole/i.test(text)&&/change|shock|rise|fall|increase|decrease|up|down|%/i.test(text))topics.push('oil-sensitivity');
  if(/scenario|forecast|project|generation|production|2050|2040|2030/i.test(text)){
    topics.push('scenario');
    if(/electric|hydro/i.test(text))metricIds.push('electricity-generation');
    if(/\bgas\b|\bgaz\b/i.test(text))metricIds.push('gas-production');
    if(/oil|petrole/i.test(text))metricIds.push('oil-production');
  }
  return {regions:regions.length?regions:[state.region],topics:topics.length?unique(topics).slice(0,3):['unavailable'],metricIds:metricIds.slice(0,3),includeMap:true,requestedMeasure:missingMeasure(question)||(topics.length?'available':'other-unavailable')};
}

const COVERAGE={
  'measured-flow':{title:'Shipment volumes are not available',message:'The available infrastructure records show routes and locations. They do not establish shipment volumes or energy transferred between provinces. The map is geographic context.',sourceKind:'network'},
  'provincial-price-impact':{title:'Provincial price effects are not estimated',message:'No calibrated model in this app translates a commodity price change into provincial GDP, jobs, royalties or household bills. Observed GDP shows exposure. Published CER scenarios change several assumptions together.',sourceKind:'economy'},
  'beneficiary-distribution':{title:'Contribution does not identify recipients',message:'Energy-sector GDP measures value added where production occurs. These data do not allocate the income to households, governments, investors or other provinces.',sourceKind:'gdp'},
  'other-unavailable':{title:'The requested measure is not available',message:'The available datasets do not establish this requested result. Any accompanying view provides context only.',sourceKind:'economy'},
};
const oilFields={nominalGdpPct:['Nominal GDP','% change'],realGdpPct:['Real GDP','% change'],nominalGdpBillionCad:['Nominal GDP','billion CAD'],federalRevenueBillionCad:['Federal revenue','billion CAD'],federalBalanceBillionCad:['Federal budget balance','billion CAD']};
export function buildWorkspacePanels({data,network,summary,summarize,state,investigation,question}) {
  const plan=validateInvestigation(investigation);
  plan.regions=requestedRegions(question,plan.regions);
  if(!plan.regions.length){plan.regions=['CA'];plan.topics=['unavailable'];plan.requestedMeasure='other-unavailable';}
  if(/\b(map|mapped|mapping|carte|cartograph\w*)\b/i.test(question))plan.includeMap=true;
  const gdpPeriodGap=unsupportedGDPPeriod(question,plan,data.gdp.year);
  plan.requestedMeasure=gdpPeriodGap?'other-unavailable':missingMeasure(question)||repairFlowClassification(question,plan,data.gdp.year);
  if(plan.regions.length>1)plan.regions=plan.regions.filter(code=>code!=='CA');
  const regions=plan.regions.includes('CA')?data.gdp.regions.map(row=>row.code):plan.regions;
  const allGDP=summary.gdp.ranking.map(row=>({code:row.code,name:row.name,value:row.energy,sharePct:row.sharePct,nationalSharePct:row.nationalEnergySharePct,energyVector:row.energyVector,totalVector:row.totalVector}));
  const contextual=plan.requestedMeasure!=='available';
  const role=contextual?'context':'answer';
  const panels=[];
  const limitations=[];
  const registry=new Map([...data.sources,...(network?.sources||[])].map(source=>[source.id,source]));
  const coverage=gdpPeriodGap?{title:'GDP is unavailable for the requested period',message:`This app's GDP data cover ${data.gdp.year}. They do not provide GDP for other years or future forecasts. The dated GDP comparison provides context.`,sourceKind:'gdp'}:COVERAGE[plan.requestedMeasure];
  if(coverage){
    const sourceIds=coverage.sourceKind==='network'?(network?.sources||[]).filter(source=>source.id!=='natural-earth').map(source=>source.id):coverage.sourceKind==='gdp'?[data.gdp.sourceId]:unique([data.gdp.sourceId,data.oilSensitivity.sourceId]);
    panels.push({id:'coverage',type:'coverage-note',title:coverage.title,role:'answer',sourceIds,message:coverage.message});
    limitations.push(coverage.message);
  }
  const addGDP=()=>{
    if(panels.some(panel=>panel.type==='province-comparison'))return;
    const common={role,sourceIds:[data.gdp.sourceId],period:String(data.gdp.year),year:data.gdp.year,unit:data.gdp.unit,metricId:'energy-gdp',note:'Observed energy-sector value added at basic prices. This measures contribution, not a price response or the distribution of income.'};
    panels.push({id:'gdp-comparison',type:'province-comparison',title:'Energy contribution by province',...common,rows:allGDP.filter(row=>regions.includes(row.code))});
    if(plan.includeMap)panels.push({id:'gdp-map',type:'province-map',title:'Where energy value is added',...common,regions:plan.regions,rows:allGDP});
  };
  for(const topic of plan.topics){
    if(topic==='gdp')addGDP();
    if(topic==='scenario'){
      const metrics=plan.metricIds.length?plan.metricIds:['electricity-generation'];
      for(const metricId of metrics){
        const metric=data.metrics.find(item=>item.id===metricId);
        const sourceIds=[metric.sourceId,...(metric.basisSourceId?[metric.basisSourceId]:[])];
        const codes=metric.kind==='benchmark'?['CA']:regions;
        const rows=codes.map(code=>{
          const result=summarize(data,{...state,region:code}).metrics.find(item=>item.id===metricId);
          return {code,name:data.regions.find(item=>item.code===code).name,baseline:result.baseline,selected:result.selected,delta:result.delta,deltaPct:result.deltaPct,status:result.status,reason:result.unavailableReason||null};
        });
        panels.push({id:`scenario-${metricId}`,type:'scenario-comparison',title:metric.label,role,sourceIds,metricId,period:String(state.year),year:state.year,unit:metric.unit,scenario:state.scenario,baselineScenario:'Current Measures',rows,note:'Published CER scenarios change several assumptions together. Their difference is not the isolated effect of a commodity price change.'});
      }
    }
    if(topic==='infrastructure'){
      if(network){
        const selected=selectInfrastructure(network,plan.regions);
        panels.push({id:'infrastructure',type:'infrastructure-map',title:'Selected routes and facilities',role:plan.requestedMeasure==='available'?'answer':'context',sourceIds:network.sources.map(source=>source.id),period:'Source dates vary',unit:null,regions:plan.regions,...selected,geometryStatus:'indicative',note:'Lines connect named places along selected corridors. Facility markers are approximate. This map does not show measured flow, shipment volumes or current operating status.'});
      }else{
        panels.push({id:'infrastructure-unavailable',type:'coverage-note',title:'Infrastructure records could not be loaded',role:'answer',sourceIds:[],message:'The economic comparisons are still available. Infrastructure locations need a successful data refresh before this view can be shown.'});
      }
    }
    if(topic==='oil-sensitivity'){
      const sensitivity=summarize(data,{...state,region:'CA'}).publishedOilSensitivity;
      const rows=sensitivity.years.flatMap(row=>Object.entries(oilFields).map(([field,[label,unit]])=>({id:`oil-${field}-${row.yearAfterShock}`,label,value:row[field],unit,period:`Year ${row.yearAfterShock} after the shock`,yearAfterShock:row.yearAfterShock})));
      panels.push({id:'national-oil-sensitivity',type:'oil-sensitivity',title:'National oil-price sensitivity',role:plan.regions.length===1&&plan.regions[0]==='CA'?'answer':'context',sourceIds:sensitivity.sourceIds,scope:'CA',baseline:sensitivity.baseline,period:sensitivity.baseline,unit:null,shockPct:state.oilShock,duration:state.duration,method:sensitivity.method,rows,note:'This Finance Canada illustration is national. It does not estimate provincial effects and does not change the CER scenarios.'});
      limitations.push(...sensitivity.limitations);
      if(!panels.some(panel=>panel.type==='province-comparison'))addGDP();
    }
  }
  if(!panels.length)panels.push({id:'no-supported-view',type:'coverage-note',title:'No supported comparison was selected',role:'answer',sourceIds:[],message:'Ask about observed provincial GDP, a published CER scenario, national oil-price sensitivity, or infrastructure locations.'});
  const optional=panel=>panel.type==='province-map'||(panel.type==='province-comparison'&&!plan.topics.includes('gdp'));
  const required=panels.filter(panel=>!optional(panel));
  const included=new Set([...required,...panels.filter(optional).slice(0,Math.max(0,6-required.length))]);
  const selected=panels.filter(panel=>included.has(panel)).slice(0,6);
  for(const panel of panels.filter(panel=>!selected.includes(panel)))limitations.push(`${panel.title} is omitted from this result to keep the requested comparisons together. Its source data remain available.`);
  const sourceIds=new Set(selected.flatMap(panel=>panel.sourceIds));
  const sources=[...registry.values()].filter(source=>sourceIds.has(source.id));
  return {schemaVersion:WORKSPACE_SCHEMA_VERSION,dataVersion:data.generatedAt,economySnapshot:structuredClone(data),sourceHashes:Object.fromEntries(sources.filter(source=>source.sha256).map(source=>[source.id,source.sha256])),plan:{...plan,year:state.year,scenario:state.scenario,oilShock:state.oilShock,duration:state.duration},panels:selected,sources,limitations:unique(limitations),...(network&&selected.some(panel=>panel.type==='infrastructure-map')?{networkSnapshot:{routes:network.routes,facilities:network.facilities,sources:network.sources}}:{})};
}

export async function createEnergyWorkspace({data,network,summary,summarize,state,investigation,question,decider,signal}) {
  let selected,planStatus='valid';
  try{selected=validateInvestigation(investigation);}catch{selected=fallbackInvestigation(question,state);planStatus='rules-fallback';}
  const workspace=buildWorkspacePanels({data,network,summary,summarize,state,investigation:selected,question});
  workspace.decision={provider:'rules',model:null,status:decider?'unavailable':'disabled',planStatus};
  if(!decider)return workspace;
  const questions={
    presentation:{type:'choice',instructions:'Choose the most useful first view for this question, using only supplied panels. Choose geographic for location questions, comparison for magnitude comparisons, scenario for published future paths, and evidence when a requested measure is missing. Maps with no volumes cannot answer measured-flow questions.',criteria:{geographic:'A supplied geographic map is the most relevant first view.',comparison:'A supplied provincial GDP comparison is the most relevant first view.',scenario:'A supplied scenario comparison or national oil sensitivity is the most relevant first view.',evidence:'The coverage note must lead because the requested result is not established.'}},
    coverage:{type:'choice',instructions:'Judge whether the supplied panel data answer the requested measure. Geometry is not measured flow. GDP contribution does not identify recipients. National oil sensitivity cannot be allocated to provinces. CER scenario comparisons are not isolated price effects.',criteria:{supported:'The supplied data answer the requested measure and scope.',partial:'The supplied data provide context or part of the answer, with missing requested evidence.',unsupported:'None of the supplied data establish the requested result.'}},
  };
  try{
    const decisionSignal=signal?AbortSignal.any([signal,AbortSignal.timeout(3000)]):AbortSignal.timeout(3000);
    const result=await decider({state:{question,plan:workspace.plan,panels:workspace.panels},questions,signal:decisionSignal});
    const presentation=result.answers.presentation.choice;
    const coverage=result.answers.coverage.choice;
    const order={geographic:['province-map','infrastructure-map'],comparison:['province-comparison'],scenario:['scenario-comparison','oil-sensitivity'],evidence:['coverage-note']}[presentation];
    workspace.panels=workspace.panels.map((panel,index)=>({panel,index})).sort((a,b)=>{
      const rank=item=>item.panel.type==='coverage-note'?0:order.includes(item.panel.type)?1:2;
      return rank(a)-rank(b)||a.index-b.index;
    }).map(item=>item.panel);
    workspace.decision={provider:'jev',model:JEV_MODEL,status:'accepted',planStatus,presentation,coverage:workspace.plan.requestedMeasure==='available'?coverage:'partial'};
  }catch(error){
    if(signal?.aborted)throw error;
    workspace.decision.status=error?.code==='budget_exhausted'?'budget-exhausted':'unavailable';
  }
  return workspace;
}

const formatValue=value=>new Intl.NumberFormat('en-CA',{maximumFractionDigits:Math.abs(value)>0&&Math.abs(value)<0.01?4:2}).format(value);
function selectedRows(rows,valueKey) {
  if(rows.length<=4)return {rows,tail:''};
  const ordered=rows.filter(row=>Number.isFinite(row[valueKey])).sort((a,b)=>b[valueKey]-a[valueKey]);
  return {rows:ordered.length?ordered.slice(0,3):rows.slice(0,3),tail:` ${ordered.length?'These are the largest published values.':'The selected scenario has no published values for these regions.'} The table includes all ${rows.length} selected provinces and territories.`};
}
export function buildWorkspaceAnalysis(workspace) {
  const hasGDPComparison=workspace.panels.some(panel=>panel.type==='province-comparison');
  const panels=workspace.panels.filter(panel=>panel.type!=='province-map'||!hasGDPComparison);
  panels.sort((a,b)=>Number(b.type==='coverage-note')-Number(a.type==='coverage-note'));
  const blocks=panels.map(panel=>{
    let text;
    if(panel.type==='coverage-note')text=panel.message;
    if(panel.type==='province-comparison'||panel.type==='province-map'){
      const selection=selectedRows(panel.rows,'value');
      text=`Observed energy-sector GDP in ${panel.period} was ${selection.rows.map(row=>`${formatValue(row.value)} for ${row.name}`).join('; ')}. Values are in ${panel.unit}.${selection.tail} GDP measures value added where production occurs, not who receives the income.`;
    }
    if(panel.type==='scenario-comparison'){
      const selection=selectedRows(panel.rows,'selected');
      const entries=selection.rows.map(row=>{
        if(row.selected===null&&row.baseline===null)return `${row.name} has no published value for this selection`;
        const selected=row.selected===null?'not published':formatValue(row.selected);
        const baseline=row.baseline===null?'not published':formatValue(row.baseline);
        return panel.scenario===panel.baselineScenario?`${row.name} ${selected} in ${panel.scenario}`:`${row.name} ${baseline} in ${panel.baselineScenario} and ${selected} in ${panel.scenario}`;
      });
      text=`The ${panel.period} ${panel.title.toLowerCase()} comparison uses ${panel.unit}. ${entries.join('; ')}.${selection.tail} These are complete CER scenarios, not isolated price effects.`;
    }
    if(panel.type==='infrastructure-map'){
      text=panel.routeIds.length||panel.facilityIds.length?`The overview map contains ${panel.routeIds.length} selected route records and ${panel.facilityIds.length} facility records. Source dates vary. ${panel.note}`:'No featured routes or facilities match the selected regions in this overview. That does not establish that those regions have no energy infrastructure.';
    }
    if(panel.type==='oil-sensitivity'){
      const outcomes=[1,2].map(year=>{
        const gdp=panel.rows.find(row=>row.id===`oil-nominalGdpPct-${year}`);
        const revenue=panel.rows.find(row=>row.id===`oil-federalRevenueBillionCad-${year}`);
        return `year ${year} nominal GDP ${formatValue(gdp.value)}% and federal revenue ${formatValue(revenue.value)} billion CAD`;
      });
      text=`On the ${panel.baseline}, the ${panel.shockPct}% ${panel.duration} oil-price change gives national changes of ${outcomes.join('; ')}. ${panel.method}. The illustration does not estimate provincial effects or change the CER scenarios.`;
    }
    return {text,sourceIds:[...panel.sourceIds]};
  });
  const used=new Set(blocks.flatMap(block=>block.sourceIds));
  return {headline:panels[0].title,blocks,sources:workspace.sources.filter(source=>used.has(source.id)),limitations:[...workspace.limitations]};
}
