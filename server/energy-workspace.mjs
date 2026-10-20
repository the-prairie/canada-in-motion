import {JEV_MODEL} from './jev-decisions.mjs';
import {selectInfrastructure} from '../infrastructure-model.mjs';
import {buildTradePanels} from '../trade-workspace-model.mjs';
import {inspectEnergyTradeQuestion,isEnergyTradeClause} from './energy-trade-request.mjs';
import {summarizeProvincialForecast} from '../provincial-forecast-model.mjs';
import {inspectProvincialForecastQuestion} from './provincial-forecast-request.mjs';

export const WORKSPACE_SCHEMA_VERSION=1;
const REGIONS=['CA','AB','BC','SK','MB','ON','QC','NB','NS','PE','NL','YT','NT','NU'];
export const WORKSPACE_METRICS=['wti','wcs','brent','cls','henry-hub','nit','oil-production','gas-production','electricity-generation','end-use-demand','electricity-price','gas-price'];
const TOPICS=['gdp','gdp-forecast','scenario','infrastructure','oil-sensitivity','energy-flows','provincial-impact','unavailable'];
const MEASURES=['available','measured-flow','provincial-price-impact','beneficiary-distribution','other-unavailable'];
const enumArray=(values,maximum)=>({type:'array',minItems:1,maxItems:maximum,items:{type:'string',enum:values}});
export const INVESTIGATION_SCHEMA={type:'object',properties:{regions:enumArray(REGIONS,14),topics:enumArray(TOPICS,3),metricIds:{...enumArray(WORKSPACE_METRICS,3),minItems:0},includeMap:{type:'boolean'},requestedMeasure:{type:'string',enum:MEASURES,description:'Use available for observed energy GDP, published CER generation or production comparisons, and infrastructure locations. Use measured-flow only when the user asks for quantities transported between places, not for quantities produced in each province.'}},required:['regions','topics','metricIds','includeMap','requestedMeasure'],additionalProperties:false};
INVESTIGATION_SCHEMA.properties.energyTrade={type:'object',properties:{commodity:{type:'string',enum:['oil','gas','electricity']},year:{type:['integer','null']},shockPct:{type:'number',minimum:-20,maximum:20},linkScope:{type:'string',enum:['between','touching']}},required:['commodity','year','shockPct','linkScope'],additionalProperties:false};
export const WORKSPACE_PLANNING_INSTRUCTIONS=' Also return investigation. Identify every requested province or territory, not only the state region. state.year applies only to published CER scenarios; observed GDP retains its own published period. Copy an explicitly requested supported scenario year exactly into state.year, independently of any GDP year in the question. Use CA for a national/all-provinces comparison, including when a province is emphasized. Respect exclusions by listing the remaining requested regions. Select up to three topics and up to three metricIds from the supplied capabilities. GDP contribution uses gdp and an empty metricIds array; published CER scenarios use scenario and only the requested metric IDs; pipeline/refinery/LNG locations use infrastructure; supported national oil-price changes use oil-sensitivity. Include a map when requested or geographic context helps. Set requestedMeasure to available for observed GDP contribution, production/generation within provinces, published CER scenarios, and infrastructure locations. Comparing electricity generation in Alberta and Quebec is available; it does not request electricity trade or measured-flow. Comparing energy GDP in Alberta, Ontario and Quebec is available; it does not request shipment volumes. Use measured-flow only for requested shipment, pipeline throughput or origin-destination quantities. Use provincial-price-impact for arbitrary provincial GDP/jobs/royalties/bill changes, beneficiary-distribution for who receives energy income, and other-unavailable for another unsupported measure. Compound questions retain any genuinely missing requested measure. Infrastructure geometry cannot answer measured-flow. Published CER scenario differences cannot answer isolated price impacts. Never invent a tool, metric, source, number, URL or view.';
export const TRADE_PLANNING_INSTRUCTIONS=' When energyTrade capabilities are supplied, use energy-flows for historical economic trade values or physical provincial totals, and provincial-impact for bounded price changes. Add energyTrade with commodity oil/gas/electricity, the requested historical trade year or null for latest, shockPct with the correct sign, and linkScope between for trade between named provinces or touching for all their partners. Trade years are independent of state.year (CER). Economic trade is a Statistics Canada supply/use estimate, not measured physical shipment routes. Physical datasets give only provincial totals/net balances; bilateral physical flow remains measured-flow. Fixed-quantity trade repricing and separately published provincial budget sensitivities are available, but no provincial GDP/jobs/profit/household bill forecast. For a request only about trade or these supported price channels, requestedMeasure is available; retain provincial-price-impact for unsupported GDP/jobs/bills. Do not add CER scenarios or national oil-sensitivity unless explicitly requested. A fiscal sensitivity has its own published baseline, not the selected historical trade year.';

const exactKeys=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
const unique=values=>[...new Set(values)];
const listOf=(value,choices,min,max)=>Array.isArray(value)&&value.length>=min&&value.length<=max&&value.every(item=>choices.includes(item))&&new Set(value).size===value.length;
export function validateInvestigation(value) {
  const keys=Object.hasOwn(value||{},'energyTrade')?[...INVESTIGATION_SCHEMA.required,'energyTrade']:INVESTIGATION_SCHEMA.required;
  if(!exactKeys(value,keys)||!listOf(value.regions,REGIONS,1,14)||!listOf(value.topics,TOPICS,1,3)||!listOf(value.metricIds,WORKSPACE_METRICS,0,3)||typeof value.includeMap!=='boolean'||!MEASURES.includes(value.requestedMeasure))throw new Error('Invalid investigation');
  if(Object.hasOwn(value,'energyTrade')&&(!exactKeys(value.energyTrade,['commodity','year','shockPct','linkScope'])||!['oil','gas','electricity'].includes(value.energyTrade.commodity)||(value.energyTrade.year!==null&&!Number.isInteger(value.energyTrade.year))||!Number.isFinite(value.energyTrade.shockPct)||Math.abs(value.energyTrade.shockPct)>20||!['between','touching'].includes(value.energyTrade.linkScope)))throw new Error('Invalid trade investigation');
  return {...value,regions:[...value.regions],topics:[...value.topics],metricIds:[...value.metricIds]};
}

const REGION_NAMES={AB:['alberta'],BC:['british columbia','colombie britannique'],SK:['saskatchewan'],MB:['manitoba'],ON:['ontario'],QC:['quebec'],NB:['new brunswick','nouveau brunswick'],NS:['nova scotia','nouvelle ecosse'],PE:['prince edward island','ile du prince edouard'],NL:['newfoundland and labrador','newfoundland','terre neuve et labrador'],YT:['yukon'],NT:['northwest territories','territoires du nord ouest'],NU:['nunavut']};
function explicitRegions(question) {
  const plain=question.normalize('NFD').replace(/\p{M}/gu,'').toLowerCase().replace(/[-–]/g,' ');
  return Object.entries(REGION_NAMES).filter(([code,names])=>new RegExp(`\\b${code}\\b`).test(question)||names.some(name=>new RegExp(`\\b${name}\\b`).test(plain))).map(([code])=>code);
}
function requestedRegions(question,proposed) {
  const text=question.normalize('NFD').replace(/\p{M}/gu,'').toLowerCase();
  // An exclusion is a list of regions immediately after the operator. Looking
  // anywhere in the remaining sentence turns “not jobs in Alberta” into an
  // exclusion of Alberta, or consumes a later comparison after a comma.
  const excludedRegionList=value=>{
    let remaining=value.normalize('NFD').replace(/\p{M}/gu,'').toLowerCase().replace(/[-–]/g,' ').trim();
    const codes=[];
    while(remaining){
      remaining=remaining.replace(/^(?:(?:the|le|la|les|province of|province de)\s+|l['’])/,'');
      const match=Object.entries(REGION_NAMES).flatMap(([code,names])=>[code.toLowerCase(),...names].map(name=>({code,name})))
        .sort((a,b)=>b.name.length-a.name.length).find(({name})=>remaining.startsWith(name)&&!/[a-z]/.test(remaining[name.length]||''));
      if(!match)break;
      codes.push(match.code);remaining=remaining.slice(match.name.length);
      const separator=remaining.match(/^\s*(?:,\s*(?:(?:and|or|et|ou)\s+)?|(?:and|or|et|ou)\s+)/);
      if(!separator)break;
      remaining=remaining.slice(separator[0].length);
    }
    return codes;
  };
  const exclusions=[...question.matchAll(/\b(?:except|excluding|exclude|without|but not|not including|other than|sauf|hors|sans)\s+([^.;!?]+)/gi)].flatMap(match=>excludedRegionList(match[1]));
  const bareNot=question.match(/\bnot\s+([^.;!?]+)/i);
  if(bareNot&&!/^just\b/i.test(bareNot[1]))exclusions.push(...excludedRegionList(bareNot[1]));
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
function topicClauses(text) {
  return text.split(/[.;!?]|(?:,\s*(?:and\s+)?|\b(?:and|with)\s+)(?=(?:(?:their|its|the|observed|projected|forecast|forecasted|future|published|historical|energy)\s+)*(?:electricity|oil|gas|natural gas|generation|production|gdp|pib)\b)/);
}
function missingGDPClausePeriod(text,gdpYear) {
  return topicClauses(text).some(clause=>/\b(gdp|pib|gross domestic product|value added)\b/.test(clause)&&(/\b(future|forecast\w*|projected|projection\w*)\b/.test(clause)||[...clause.matchAll(/\b((?:19|20|21)\d{2})\b/g)].some(match=>Number(match[1])!==gdpYear)));
}
export function requestedScenarioYears(question) {
  const clauses=topicClauses(question.toLowerCase()).filter(clause=>!/\b(gdp|pib|gross domestic product|value added)\b/.test(clause)&&(!isEnergyTradeClause(clause)||/\b(generation|production|scenario)\b/.test(clause))&&/\b(electricity|oil|gas|generation|production|demand|consumption|scenario|benchmark|wti|wcs|brent)\b/.test(clause));
  return unique(clauses.flatMap(clause=>[...clause.matchAll(/\b((?:19|20|21)\d{2})\b/g)].map(match=>Number(match[1]))));
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
export function buildWorkspacePanels({data,network,flows,fiscal,forecast,summary,summarize,state,investigation,question}) {
  const plan=validateInvestigation(investigation);
  plan.regions=requestedRegions(question,plan.regions);
  if(!plan.regions.length){plan.regions=['CA'];plan.topics=['unavailable'];plan.requestedMeasure='other-unavailable';}
  if(/\b(map|mapped|mapping|carte|cartograph\w*)\b/i.test(question))plan.includeMap=true;
  const forecastRequest=inspectProvincialForecastQuestion(question,forecast);
  const gdpPeriodGap=!forecastRequest&&unsupportedGDPPeriod(question,plan,data.gdp.year);
  plan.requestedMeasure=gdpPeriodGap?'other-unavailable':missingMeasure(question)||repairFlowClassification(question,plan,data.gdp.year);
  const tradeRequest=inspectEnergyTradeQuestion(question,flows,plan.energyTrade,plan.topics,fiscal);
  if(tradeRequest){
    if(tradeRequest.physicalBilateral)plan.requestedMeasure='measured-flow';
    else if(tradeRequest.unsupportedOutcome)plan.requestedMeasure=tradeRequest.includeImpacts?'provincial-price-impact':'other-unavailable';
    else if(!gdpPeriodGap&&!['beneficiary-distribution','other-unavailable'].includes(plan.requestedMeasure))plan.requestedMeasure='available';
    const requestedTopics=[...(tradeRequest.includeFlows?['energy-flows']:[]),...(tradeRequest.includeImpacts?['provincial-impact']:[])];
    plan.topics=unique([...requestedTopics,...plan.topics.filter(topic=>topic!=='unavailable'&&!(tradeRequest.includeImpacts&&topic==='oil-sensitivity'&&!/\b(national|canada|federal)\b/i.test(question)))]).slice(0,3);
  }
  if(forecastRequest){
    if(!explicitRegions(question).length&&/\b(canada|canadian|national)\b/i.test(question))plan.regions=['CA'];
    // Forecast recognition is server-owned. A planner cannot relabel observed
    // energy-sector GDP or a CER production path as a whole-economy forecast.
    const observedRequested=/\b(observed|historical|past|current contribution)\b/i.test(question);
    const scenarioRequested=/\b(production|generation|cer|energy futures)\b/i.test(question);
    plan.topics=unique([...(forecastRequest.supported?['gdp-forecast']:[]),...plan.topics.filter(topic=>
      topic!=='gdp-forecast'&&topic!=='unavailable'&&(topic!=='gdp'||observedRequested)&&(topic!=='scenario'||scenarioRequested))]).slice(0,3);
    if(!plan.topics.length)plan.topics=['unavailable'];
    plan.requestedMeasure=forecastRequest.supported&&!tradeRequest?.unsupportedOutcome&&!tradeRequest?.physicalBilateral?'available':'other-unavailable';
    if(forecastRequest.nationalAggregateRequested)plan.requestedMeasure='other-unavailable';
  }else{
    plan.topics=plan.topics.filter(topic=>topic!=='gdp-forecast');
    if(!plan.topics.length)plan.topics=['gdp'];
  }
  if(plan.regions.length>1)plan.regions=plan.regions.filter(code=>code!=='CA');
  const regions=plan.regions.includes('CA')?data.gdp.regions.map(row=>row.code):plan.regions;
  const allGDP=summary.gdp.ranking.map(row=>({code:row.code,name:row.name,value:row.energy,sharePct:row.sharePct,nationalSharePct:row.nationalEnergySharePct,energyVector:row.energyVector,totalVector:row.totalVector}));
  const contextual=plan.requestedMeasure!=='available';
  const role=contextual?'context':'answer';
  const panels=[];
  const limitations=[];
  const registry=new Map([...data.sources,...(network?.sources||[]),...(flows?.sources||[]),...(fiscal?.sources||[]),...(forecast?.sources||[])].map(source=>[source.id,source]));
  let coverage=gdpPeriodGap?{title:'GDP is unavailable for the requested period',message:`This app's GDP data cover ${data.gdp.year}. They do not provide GDP for other years or future forecasts. The dated GDP comparison provides context.`,sourceKind:'gdp'}:COVERAGE[plan.requestedMeasure];
  if(tradeRequest?.physicalBilateral)coverage={title:'Bilateral physical volumes are not published here',message:'The physical sources give provincial totals or net regional transfers, without identifying the partner province. The trade map shows modelled supplier-to-purchaser dollar values. It cannot establish a physical route or bilateral shipment volume.',sourceKind:'trade'};
  else if(tradeRequest?.unsupportedOutcome)coverage={title:'The requested economic or emissions effect is not modelled',message:'Published trade values and physical balances are available. The price tool calculates fixed-quantity trade receipts and purchase costs, plus selected published provincial budget sensitivities. These separate channels do not predict provincial GDP, jobs, emissions, profit or household income and must not be added together.',sourceKind:'trade'};
  if(forecastRequest&&!forecastRequest.supported)coverage={title:'This GDP forecast is not available',message:forecastRequest.reason,sourceKind:'forecast'};
  else if(forecastRequest?.nationalAggregateRequested)coverage={title:'A national GDP forecast is not supplied',message:'The available outlook predicts growth separately for each province. It does not supply a forecast for Canada as a whole. The provincial outlooks provide context; their growth rates cannot be added, and chained-dollar provincial GDP levels must not be summed to create a national forecast.',sourceKind:'forecast'};
  if(coverage){
    const sourceIds=coverage.sourceKind==='forecast'?(forecast?.sources||[]).map(source=>source.id):coverage.sourceKind==='trade'?(flows?.sources||[]).map(source=>source.id):coverage.sourceKind==='network'?(network?.sources||[]).filter(source=>source.id!=='natural-earth').map(source=>source.id):coverage.sourceKind==='gdp'?[data.gdp.sourceId]:unique([data.gdp.sourceId,data.oilSensitivity.sourceId]);
    panels.push({id:'coverage',type:'coverage-note',title:coverage.title,role:'answer',sourceIds,message:coverage.message});
    limitations.push(coverage.message);
  }
  let tradeSelection;
  if(tradeRequest){
    const built=buildTradePanels({flows,fiscal,regions:plan.regions,selection:tradeRequest,includeFlows:tradeRequest.includeFlows,includePhysical:tradeRequest.includePhysical,includeImpacts:tradeRequest.includeImpacts});
    tradeSelection=built.selection;
    for(const panel of built.panels){
      if(tradeRequest.physicalBilateral&&panel.type!=='provincial-impact')panel.role='context';
      panels.push(panel);
    }
    if(tradeRequest.defaultCommodity)limitations.push('The initial view shows '+(tradeRequest.commodity==='gas'?'natural gas':tradeRequest.commodity==='electricity'?'electricity':'crude oil')+'. Use the commodity selector to inspect the other published energy products.');
    if(tradeRequest.includeImpacts&&!fiscal){
      panels.push({id:'price-data-unavailable',type:'coverage-note',title:'The price-impact data could not be loaded',role:'answer',sourceIds:[flows.trade.sourceId],message:'Published trade values remain available. The price calculation needs a successful source-data refresh before it can run.'});
    }
  }
  const addGDP=()=>{
    if(panels.some(panel=>panel.type==='province-comparison'))return;
    const common={role,sourceIds:[data.gdp.sourceId],period:String(data.gdp.year),year:data.gdp.year,unit:data.gdp.unit,metricId:'energy-gdp',note:'Observed energy-sector value added at basic prices. This measures contribution, not a price response or the distribution of income.'};
    panels.push({id:'gdp-comparison',type:'province-comparison',title:'Energy contribution by province',...common,rows:allGDP.filter(row=>regions.includes(row.code))});
    if(plan.includeMap)panels.push({id:'gdp-map',type:'province-map',title:'Where energy value is added',...common,regions:plan.regions,rows:allGDP});
  };
  for(const topic of plan.topics){
    if(topic==='gdp')addGDP();
    if(topic==='gdp-forecast'&&forecastRequest?.supported){
      for(const year of forecastRequest.years){
        const result=summarizeProvincialForecast(forecast,{regions:plan.regions,year});
        const missing=result.rows.filter(row=>row.status!=='available');
        panels.push({id:`gdp-forecast-${year}`,type:'gdp-forecast',title:'Provincial GDP outlook',role,
          sourceIds:result.sources.map(source=>source.id),period:String(year),unit:'annual real GDP growth (%)',
          year,regions:[...plan.regions],summary:result,
          note:'Predictive whole-economy GDP growth from observed indicators. Historical validation uses revised data with publication lags; it does not estimate causal energy-price effects.'});
        if(missing.length)limitations.push(`No GDP forecast is available for ${missing.map(row=>row.name).join(', ')} because comparable monthly labour indicators are missing.`);
      }
    }
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
  const sourceIds=new Set([...selected.flatMap(panel=>panel.sourceIds),...(tradeSelection?[...(flows?.sources||[]),...(fiscal?.sources||[])].map(source=>source.id):[])]);
  const sources=[...registry.values()].filter(source=>sourceIds.has(source.id));
  return {schemaVersion:WORKSPACE_SCHEMA_VERSION,dataVersion:data.generatedAt,economySnapshot:structuredClone(data),sourceHashes:Object.fromEntries(sources.filter(source=>source.sha256).map(source=>[source.id,source.sha256])),plan:{...plan,year:state.year,scenario:state.scenario,oilShock:state.oilShock,duration:state.duration,...tradeSelection},panels:selected,sources,limitations:unique(limitations),...(selected.some(panel=>panel.type==='gdp-forecast')?{forecastSnapshot:structuredClone(forecast)}:{}),...(tradeSelection?{tradeSnapshot:structuredClone(flows),...(fiscal?{fiscalSnapshot:structuredClone(fiscal)}:{})}:{}),...(network&&selected.some(panel=>panel.type==='infrastructure-map')?{networkSnapshot:{routes:network.routes,facilities:network.facilities,sources:network.sources}}:{})};
}

export async function createEnergyWorkspace({data,network,flows,fiscal,forecast,summary,summarize,state,investigation,question,decider,signal}) {
  let selected,planStatus='valid';
  try{selected=validateInvestigation(investigation);}catch{selected=fallbackInvestigation(question,state);planStatus='rules-fallback';}
  const workspace=buildWorkspacePanels({data,network,flows,fiscal,forecast,summary,summarize,state,investigation:selected,question});
  workspace.decision={provider:'rules',model:null,status:decider?'unavailable':'disabled',planStatus};
  if(!decider)return workspace;
  const questions={
    presentation:{type:'choice',instructions:'Choose the most useful first view for this question, using only supplied panels. Choose geographic for location questions, comparison for magnitude comparisons, scenario for GDP outlooks or published future paths, and evidence when a requested measure is missing. Maps with no volumes cannot answer measured-flow questions.',criteria:{geographic:'A supplied geographic map is the most relevant first view.',comparison:'A supplied provincial GDP comparison or outlook is the most relevant first view.',scenario:'A supplied GDP outlook, scenario comparison or national oil sensitivity is the most relevant first view.',evidence:'The coverage note must lead because the requested result is not established.'}},
    coverage:{type:'choice',instructions:'Judge whether the supplied panel data answer the requested measure. Geometry is not measured flow. GDP contribution does not identify recipients. National oil sensitivity cannot be allocated to provinces. CER scenario comparisons are not isolated price effects. A GDP outlook predicts whole-economy growth from observed indicators; it is neither an observation nor an energy-price intervention. Missing territory forecasts cannot count as available.',criteria:{supported:'The supplied data answer the requested measure and scope.',partial:'The supplied data provide context or part of the answer, with missing requested evidence.',unsupported:'None of the supplied data establish the requested result.'}},
  };
  try{
    const decisionSignal=signal?AbortSignal.any([signal,AbortSignal.timeout(3000)]):AbortSignal.timeout(3000);
    const compactPanels=workspace.panels.map(panel=>({id:panel.id,type:panel.type,title:panel.title,role:panel.role,period:panel.period,unit:panel.unit,sourceIds:panel.sourceIds,...(panel.message?{message:panel.message}:{}),...(panel.note?{note:panel.note}:{}),...(panel.type==='gdp-forecast'?{unavailableRegions:panel.summary.rows.filter(row=>row.status!=='available').map(row=>row.region)}:{})}));
    const result=await decider({state:{question,plan:workspace.plan,panels:compactPanels},questions,signal:decisionSignal});
    const presentation=result.answers.presentation.choice;
    const coverage=result.answers.coverage.choice;
    const order={geographic:['province-map','infrastructure-map','energy-trade'],comparison:['province-comparison','gdp-forecast','energy-trade','energy-transfers'],scenario:['gdp-forecast','scenario-comparison','oil-sensitivity','provincial-impact'],evidence:['coverage-note']}[presentation];
    workspace.panels=workspace.panels.map((panel,index)=>({panel,index})).sort((a,b)=>{
      const rank=item=>item.panel.type==='coverage-note'?0:order.includes(item.panel.type)?1:2;
      return rank(a)-rank(b)||a.index-b.index;
    }).map(item=>item.panel);
    const missingForecast=workspace.panels.some(panel=>panel.type==='gdp-forecast'&&panel.summary.rows.some(row=>row.status!=='available'));
    workspace.decision={provider:'jev',model:JEV_MODEL,status:'accepted',planStatus,presentation,coverage:workspace.plan.requestedMeasure==='available'&&!missingForecast?coverage:'partial'};
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
    if(panel.type==='gdp-forecast'){
      const available=panel.summary.rows.filter(row=>row.status==='available');
      const selected=available.slice(0,4);
      const missing=panel.summary.rows.filter(row=>row.status!=='available');
      text=`The ${panel.year} outlook predicts annual real GDP growth at basic prices: ${selected.length?selected.map(row=>`${row.name} ${formatValue(row.predictionPct)}%${row.lowerPct===null?'':` (historical-error range ${formatValue(row.lowerPct)}% to ${formatValue(row.upperPct)}%)`}`).join('; '):'no supported forecast for the selected jurisdictions'}. ${available.length>4?'The table includes all selected provinces. ':''}${missing.length?`Comparable monthly indicators are unavailable for ${missing.map(row=>row.name).join(', ')}. `:''}These are predictions from observed indicators, not measured outcomes or effects of changing energy prices. Historical errors and range coverage are shown for each province; revised source data prevent a fully real-time validation.`;
    }
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
    if(panel.type==='energy-trade'){
      const result=panel.summary;
      const names=new Map((workspace.tradeSnapshot?.regions||[]).map(row=>[row.code,row.name]));
      const largest=result.links.filter(row=>row.value!==null&&row.value>0).sort((a,b)=>b.value-a.value).slice(0,3);
      const total=result.totals.value===null?`${formatValue(result.totals.availableValue)} is published, with ${result.totals.missingRecords} unavailable records`:`${formatValue(result.totals.value)}`;
      text=`In ${panel.period}, the selected ${result.commodity==='oil'?'crude oil':result.commodity==='gas'?'natural gas':'electricity'} trade connections total ${total} ${panel.unit} at basic prices. ${largest.length?`Largest published connections: ${largest.map(row=>`${names.get(row.origin)||row.origin} to ${names.get(row.destination)||row.destination}, ${formatValue(row.value)}`).join('; ')}. `:''}These are modelled supplier-to-purchaser transactions, not physical shipment routes, GDP or profit.`;
    }
    if(panel.type==='energy-transfers'){
      const names=new Map((workspace.tradeSnapshot?.regions||[]).map(row=>[row.code,row.name]));
      const result=panel.dataset;
      const selection=result.observations.slice(0,4);
      text=`The ${result.period} physical ${result.commodity==='gas'?'natural gas':result.commodity==='oil'?'crude oil':'electricity'} data use ${result.unit}${result.publicationStatus==='preliminary'?' and are preliminary':''}. ${selection.map(row=>row.netReceipts===null?`${names.get(row.region)} has no published net balance`:`${names.get(row.region)}: ${formatValue(Math.abs(row.netReceipts))} net ${row.netReceipts>=0?'received':'delivered'}`).join('; ')}. ${result.observations.length>4?'The table contains all selected jurisdictions. ':''}The source does not identify the partner province. ${result.commodity==='oil'?'This physical crude-oil category includes condensate and pentanes plus, unlike the narrower economic trade basket.':''}`;
    }
    if(panel.type==='provincial-impact'){
      const result=panel.result;
      const names=new Map((workspace.tradeSnapshot?.regions||[]).map(row=>[row.code,row.name]));
      const selected=result.trade.rows.slice(0,4);
      const fiscalRows=result.fiscal.rows.filter(row=>row.available).slice(0,3);
      text=`Holding ${result.year} quantities and product mix fixed, a ${result.shockPct}% price change gives these interprovincial trade-balance revaluations in ${result.unit}: ${selected.map(row=>`${names.get(row.region)} ${row.netChange===null?'unavailable':formatValue(row.netChange)}`).join('; ')}. ${result.trade.rows.length>4?'All selected jurisdictions appear in the table. ':''}Seller receipts and buyer costs offset across Canada; this is not a GDP or welfare forecast. ${fiscalRows.length?`Separately, published fiscal sensitivities imply ${fiscalRows.map(row=>`${names.get(row.region)} ${formatValue(row.revenueChangeLow)}${row.revenueChangeHigh!==row.revenueChangeLow?` to ${formatValue(row.revenueChangeHigh)}`:''} million CAD in ${row.fiscalYear}`).join('; ')} on their own benchmark assumptions. Do not add those fiscal results to trade repricing.`:'No calibrated fiscal result is available for this selection.'}`;
    }
    return {text,sourceIds:[...panel.sourceIds]};
  });
  const used=new Set(blocks.flatMap(block=>block.sourceIds));
  return {headline:panels[0].title,blocks,sources:workspace.sources.filter(source=>used.has(source.id)),limitations:[...workspace.limitations]};
}
