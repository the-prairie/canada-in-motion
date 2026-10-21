import {normalizeNetworkSelection} from './trade-network-model.mjs';
import {summarizeEconomy,validateEconomy} from './economy-model.mjs';
import {selectInfrastructure} from './infrastructure-model.mjs';
import {buildTradePanels,normalizeTradeSelection,ENERGY_COMMODITIES} from './trade-workspace-model.mjs';
import {validateEnergyFlows} from './energy-flow-model.mjs';
import {validateProvincialImpacts} from './provincial-impact-model.mjs';
import {validateProvincialForecast,summarizeProvincialForecast} from './provincial-forecast-model.mjs';

export const PANEL_COMPONENTS = Object.freeze({
  'province-map':'ProvinceMap', 'province-comparison':'ProvinceComparison',
  'scenario-comparison':'ScenarioComparison', 'infrastructure-map':'InfrastructureMap',
  'oil-sensitivity':'OilSensitivity', 'coverage-note':'CoverageNote',
  'energy-trade':'EnergyTrade','energy-transfers':'EnergyTransfers','provincial-impact':'ProvincialImpact',
  'gdp-forecast':'ProvincialForecast',
});
export const REGION_CODES = ['CA','NL','PE','NS','NB','QC','ON','MB','SK','AB','BC','YT','NT','NU'];
const finiteOrNull = value => value === null || Number.isFinite(value);
const fail = () => {throw new Error('This workspace could not be verified. The written findings are still available.');};

export function validateWorkspace(value) {
  if(!value || value.schemaVersion!==1 || !Array.isArray(value.panels) || !value.panels.length || value.panels.length>6 || !Array.isArray(value.sources) || value.sources.length>30 || !Array.isArray(value.plan?.regions) || !value.plan.regions.length || value.plan.regions.some(code=>!REGION_CODES.includes(code)))fail();
  if(value.economySnapshot){try{validateEconomy(value.economySnapshot);if(value.economySnapshot.generatedAt!==value.dataVersion)fail();}catch{fail();}}
  if(value.tradeSnapshot){try{validateEnergyFlows(value.tradeSnapshot);}catch{fail();}}
  if(value.fiscalSnapshot){try{validateProvincialImpacts(value.fiscalSnapshot);}catch{fail();}}
  if(value.forecastSnapshot){try{validateProvincialForecast(value.forecastSnapshot);}catch{fail();}}
  const sources=new Set();
  for(const source of value.sources){
    if(typeof source.id!=='string'||typeof source.title!=='string'||source.title.length>500||typeof source.url!=='string')fail();
    let url;try{url=new URL(source.url);}catch{fail();}
    if(url.protocol!=='https:'||url.username||url.password||sources.has(source.id))fail();
    sources.add(source.id);
  }
  const ids=new Set();
  for(const panel of value.panels){
    if(!Object.hasOwn(PANEL_COMPONENTS,panel.type)||typeof panel.id!=='string'||!/^[a-zA-Z0-9_-]{1,80}$/.test(panel.id)||ids.has(panel.id)||typeof panel.title!=='string'||panel.title.length>250||!['answer','context'].includes(panel.role)||!Array.isArray(panel.sourceIds)||panel.sourceIds.some(id=>!sources.has(id)))fail();
    ids.add(panel.id);
    if(panel.type==='gdp-forecast'){
      try{
        if(!value.forecastSnapshot||!Array.isArray(panel.regions)||!panel.regions.length||panel.unit!==value.forecastSnapshot.information.forecastUnit||panel.period!==String(panel.year))fail();
        const expected=summarizeProvincialForecast(value.forecastSnapshot,{regions:panel.regions,year:panel.year});
        if(JSON.stringify(panel.summary)!==JSON.stringify(expected)||value.forecastSnapshot.sources.some(source=>!panel.sourceIds.includes(source.id)||!value.sources.some(s=>s.id===source.id&&s.url===source.url)))fail();
      }catch{fail();}
    }
    if(['energy-trade','energy-transfers','provincial-impact'].includes(panel.type)){
      if(!value.tradeSnapshot||!panel.sourceIds.length)fail();
      if(panel.type==='energy-trade'&&(!Array.isArray(panel.summary?.links)||panel.summary.links.length>300))fail();
      if(panel.type==='energy-transfers'&&(!Array.isArray(panel.dataset?.observations)||panel.dataset.observations.length>13))fail();
      if(panel.type==='provincial-impact'&&(!value.fiscalSnapshot||!Array.isArray(panel.result?.trade?.rows)||panel.result.trade.rows.length>13))fail();
      const finiteTree=(v)=>{if(typeof v==='number'&&!Number.isFinite(v))fail();if(v&&typeof v==='object')Object.values(v).forEach(finiteTree);};finiteTree(panel);
    }
    if(panel.type==='coverage-note'){if(typeof panel.message!=='string'||panel.message.length>2500)fail();continue;}
    if(!['infrastructure-map','oil-sensitivity'].includes(panel.type)&&(!panel.sourceIds.length||typeof panel.unit!=='string'))fail();
    if(['province-map','province-comparison','scenario-comparison','oil-sensitivity'].includes(panel.type)){
      if(!Array.isArray(panel.rows)||panel.rows.length>40)fail();
      for(const row of panel.rows){
        if(panel.type.startsWith('province-')&&(!REGION_CODES.includes(row.code)||!finiteOrNull(row.value)||!finiteOrNull(row.sharePct)))fail();
        if(panel.type==='scenario-comparison'&&(!REGION_CODES.includes(row.code)||!finiteOrNull(row.baseline)||!finiteOrNull(row.selected)))fail();
        if(panel.type==='oil-sensitivity'&&(!finiteOrNull(row.value)||typeof row.label!=='string'||typeof row.unit!=='string'||typeof row.period!=='string'))fail();
      }
    }
    if(panel.type==='infrastructure-map'&&(!Array.isArray(panel.routeIds)||!Array.isArray(panel.facilityIds)||panel.geometryStatus!=='indicative'||[...panel.routeIds,...panel.facilityIds].some(id=>typeof id!=='string'||!/^[a-z0-9-]{1,80}$/.test(id))))fail();
  }
  return value;
}

export function compileWorkspace(value) {
  validateWorkspace(value);
  return `root = EnergyWorkspace([${value.panels.map(panel=>`${PANEL_COMPONENTS[panel.type]}(${JSON.stringify(panel.id)})`).join(', ')}])`;
}

export function normalizeWorkspaceTradeSelection(workspace,selection) {
  if(!workspace.tradeSnapshot)return selection;
  const regions=selection.regions.filter(code=>code!=='CA');
  const links=workspace.tradeSnapshot.trade.observations.filter(row=>row.year===selection.tradeYear&&row.commodity===selection.tradeCommodity&&row.origin!==row.destination&&(!regions.length||(selection.linkScope==='between'?regions.includes(row.origin)&&regions.includes(row.destination):regions.includes(row.origin)||regions.includes(row.destination))));
  return normalizeNetworkSelection(links,selection);
}

export function initialSelection(workspace) {
  return {regions:workspace.plan.regions.includes('CA')?[]:[...workspace.plan.regions],year:workspace.plan.year,scenario:workspace.plan.scenario,oilShock:workspace.plan.oilShock,duration:workspace.plan.duration,panelId:(workspace.panels.find(p=>p.type!=='coverage-note'&&p.role==='answer')||workspace.panels.find(p=>p.type!=='coverage-note')||workspace.panels[0]).id,viewMode:'focus',...(workspace.tradeSnapshot?{...normalizeTradeSelection(workspace.tradeSnapshot,workspace.plan),tradeDisplay:workspace.plan.tradeDisplay==='map'?'map':'matrix',tradeConnection:null,tradeFocus:null}:{}),...(workspace.forecastSnapshot?{forecastYearsByPanel:Object.fromEntries(workspace.panels.filter(p=>p.type==='gdp-forecast').map(p=>[p.id,p.year]))}:{})};
}

export function resolveWorkspace(workspace,selection,economy) {
  validateWorkspace(workspace);
  economy=workspace.economySnapshot||economy;
  if(workspace.dataVersion!==economy.generatedAt)return workspace;
  if(!Array.isArray(selection.regions)||selection.regions.some(code=>!REGION_CODES.includes(code)||code==='CA')||!economy.years.includes(selection.year)||!economy.scenarios.includes(selection.scenario))fail();
  if(selection.panelId!==undefined&&!workspace.panels.some(p=>p.id===selection.panelId))fail();
  if(selection.viewMode!==undefined&&!['focus','all'].includes(selection.viewMode))fail();
  if(workspace.forecastSnapshot){
    const years=selection.forecastYearsByPanel;
    const panels=workspace.panels.filter(p=>p.type==='gdp-forecast');
    if(!years||typeof years!=='object'||Array.isArray(years)||Object.keys(years).length!==panels.length||panels.some(p=>![workspace.forecastSnapshot.forecastOriginYear,workspace.forecastSnapshot.forecastOriginYear+1].includes(years[p.id])))fail();
  }
  const regionCodes=selection.regions.length?selection.regions:economy.regions.filter(row=>row.code!=='CA').map(row=>row.code);
  const total=economy.gdp.regions.reduce((sum,row)=>sum+row.energy,0);
  const gdpRows=economy.gdp.regions.map(row=>({...row,value:row.energy,nationalSharePct:row.energy/total*100,activity:economy.gdpActivity?.regions.find(activity=>activity.code===row.code)||null}));
  const tradeTypes=['energy-trade','energy-transfers','provincial-impact'];
  if(selection.tradeDisplay!==undefined&&!['matrix','map','table'].includes(selection.tradeDisplay))fail();
  if(selection.tradeFocus!=null&&(!REGION_CODES.includes(selection.tradeFocus)||selection.tradeFocus==='CA'))fail();
  if(selection.tradeConnection!=null&&(typeof selection.tradeConnection!=='string'||!/^([A-Z]{2})-([A-Z]{2})$/.test(selection.tradeConnection)||selection.tradeConnection.split('-').some(code=>!REGION_CODES.includes(code)||code==='CA')))fail();
  const tradePanels=workspace.tradeSnapshot?buildTradePanels({flows:workspace.tradeSnapshot,fiscal:workspace.fiscalSnapshot,selection,regions:selection.regions,includeFlows:workspace.panels.some(p=>p.type==='energy-trade'),includePhysical:workspace.panels.some(p=>p.type==='energy-transfers'),includeImpacts:workspace.panels.some(p=>p.type==='provincial-impact')}).panels:[];
  const panels=workspace.panels.map(panel=>{
    if(panel.type==='gdp-forecast'){
      const year=selection.forecastYearsByPanel[panel.id],regions=selection.regions.length?selection.regions:['CA'];
      return {...panel,year,period:String(year),regions,summary:summarizeProvincialForecast(workspace.forecastSnapshot,{regions,year})};
    }
    if(tradeTypes.includes(panel.type)){const rebuilt=tradePanels.find(p=>p.type===panel.type);return rebuilt?{...rebuilt,id:panel.id,role:panel.role}:panel;}
    if(panel.type==='infrastructure-map'&&workspace.networkSnapshot)return {...panel,...selectInfrastructure(workspace.networkSnapshot,selection.regions),regions:selection.regions.length?selection.regions:['CA']};
    if(panel.type==='oil-sensitivity'){
      const oilShock=selection.oilShock===undefined?panel.shockPct:selection.oilShock;
      const duration=selection.duration===undefined?panel.duration:selection.duration;
      if(!Number.isFinite(oilShock)||Math.abs(oilShock)>20||!['persistent','temporary'].includes(duration))fail();
      if(oilShock===panel.shockPct&&duration===panel.duration)return panel;
      const sensitivity=summarizeEconomy(economy,{...selection,oilShock,duration,region:'CA'}).publishedOilSensitivity;
      const rows=panel.rows.map(row=>{
        const match=/^oil-(nominalGdpPct|realGdpPct|nominalGdpBillionCad|federalRevenueBillionCad|federalBalanceBillionCad)-([12])$/.exec(row.id);
        if(!match)fail();
        return {...row,value:sensitivity.years[Number(match[2])-1][match[1]]};
      });
      return {...panel,scope:'CA',shockPct:oilShock,duration,method:sensitivity.method,baseline:sensitivity.baseline,period:sensitivity.baseline,sourceIds:sensitivity.sourceIds,rows};
    }
    if(panel.type==='province-map')return {...panel,rows:gdpRows};
    if(panel.type==='province-comparison')return {...panel,activityYear:economy.gdpActivity?.year??null,previousActivityYear:economy.gdpActivity?.previousYear??null,rows:gdpRows.filter(row=>regionCodes.includes(row.code))};
    if(panel.type==='scenario-comparison'){
      const metric=economy.metrics.find(row=>row.id===panel.metricId);if(!metric)fail();
      const codes=metric.kind==='benchmark'?['CA']:regionCodes;
      return {...panel,year:selection.year,period:String(selection.year),scenario:selection.scenario,rows:codes.map(code=>{
        const summary=summarizeEconomy(economy,{...selection,region:code});
        const row=summary.metrics.find(item=>item.id===panel.metricId);
        return {...row,code,name:code==='CA'?(metric.kind==='benchmark'?'Benchmark · shared across provinces':'Canada'):economy.regions.find(r=>r.code===code).name};
      })};
    }
    return panel;
  });
  return {...workspace,panels};
}

const formatFinding=value=>new Intl.NumberFormat('en-CA',{maximumFractionDigits:Math.abs(value)>0&&Math.abs(value)<.01?4:2}).format(Object.is(value,-0)?0:value);
const moneyFinding=value=>Number.isFinite(value)?`CA$${formatFinding(Math.abs(value)>=1000?value/1000:value)} ${Math.abs(value)>=1000?'billion':'million'}`:'unavailable';
const signedFinding=value=>`${value>0?'+':''}${formatFinding(value)}`;
const leadingRows=(rows,key)=>[...rows].sort((a,b)=>(Number.isFinite(b[key])?b[key]:-Infinity)-(Number.isFinite(a[key])?a[key]:-Infinity)).slice(0,3);
const regionName=(workspace,code)=>workspace.tradeSnapshot?.regions.find(row=>row.code===code)?.name||workspace.economySnapshot?.regions.find(row=>row.code===code)?.name||code;

function panelFinding(panel,workspace,selection) {
  if(panel.type==='coverage-note')return panel.message;
  if(panel.type==='province-comparison'||panel.type==='province-map'){
    const rows=panel.type==='province-map'&&selection.regions?.length?panel.rows.filter(row=>selection.regions.includes(row.code)):panel.rows;
    const leaders=leadingRows(rows,'value');
    return `${leaders.map(row=>`${row.name} generated ${moneyFinding(row.value)} in energy-sector GDP${Number.isFinite(row.sharePct)?`, ${formatFinding(row.sharePct)}% of its economy`:''}`).join('; ')} in ${panel.period}.${rows.length>3?' These are the three largest values in this selection.':''} GDP records value added where production occurs; it does not identify who receives the income.${panel.activityYear&&panel.type==='province-comparison'?` Real energy-sector growth from ${panel.previousActivityYear} to ${panel.activityYear}: ${leaders.map(row=>`${row.name} ${Number.isFinite(row.activity?.energyGrowthPct)?signedFinding(row.activity.energyGrowthPct)+'%':'unavailable'}`).join('; ')}.`:''}`;
  }
  if(panel.type==='scenario-comparison'){
    const rows=leadingRows(panel.rows,'selected');
    const entries=rows.map(row=>row.selected===null?`${row.name} has no published value`:`${row.name} ${formatFinding(row.selected)}${panel.scenario!==panel.baselineScenario&&Number.isFinite(row.baseline)?` versus ${formatFinding(row.baseline)} under ${panel.baselineScenario}`:''}`);
    return `${panel.title} in ${panel.period} under ${panel.scenario}, in ${panel.unit}. ${entries.join('; ')}.${panel.rows.length>3?' These are the three largest selected values.':''} CER changes several assumptions together. This comparison does not isolate a price effect.`;
  }
  if(panel.type==='oil-sensitivity'){
    const outcomes=[1,2].map(year=>{
      const gdp=panel.rows.find(row=>row.id===`oil-nominalGdpPct-${year}`);
      const revenue=panel.rows.find(row=>row.id===`oil-federalRevenueBillionCad-${year}`);
      if(!gdp||!revenue)return null;
      return `year ${year} nominal GDP ${Number.isFinite(gdp.value)?`${signedFinding(gdp.value)}%`:'unavailable'} and federal revenue ${Number.isFinite(revenue.value)?`${signedFinding(revenue.value)} billion CAD`:'unavailable'}`;
    }).filter(Boolean);
    return `Canada-wide effects of a ${signedFinding(panel.shockPct)}% WTI change${panel.duration==='temporary'?', lasting two quarters':', sustained'} on the ${panel.baseline}. ${outcomes.join('; ')}. ${panel.method}. This model does not estimate effects for individual provinces.`;
  }
  if(panel.type==='energy-trade'){
    const result=panel.summary,total=result.totals;
    const largest=leadingRows(result.links.filter(row=>Number.isFinite(row.value)&&row.value>0),'value')[0];
    const amount=total.value===null?`${moneyFinding(total.availableValue)} in published transactions, with ${total.missingRecords} unavailable ${total.missingRecords===1?'record':'records'}`:`${moneyFinding(total.value)} in transactions`;
    const scope=result.linkScope==='between'?'between the selected provinces':'touching the selected provinces';
    return `${ENERGY_COMMODITIES[result.commodity]} trade ${scope} totalled ${amount} in ${panel.period}.${largest?` The largest connection is ${regionName(workspace,largest.origin)} to ${regionName(workspace,largest.destination)}, ${moneyFinding(largest.value)}.`:''} These supplier-to-purchaser estimates use basic prices. They measure transactions, not GDP or physical routes.`;
  }
  if(panel.type==='energy-transfers'){
    const result=panel.dataset;
    const rows=result.observations.slice(0,3).map(row=>`${regionName(workspace,row.region)} ${row.netReceipts===null?'has no published net balance':row.netReceipts===0?'has balanced net transfers':`${formatFinding(Math.abs(row.netReceipts))} net ${row.netReceipts>0?'received':'delivered'}`}`);
    return `${ENERGY_COMMODITIES[result.commodity]} transfers in ${result.period}, in ${result.unit}${result.publicationStatus==='preliminary'?', preliminary':''}. ${rows.join('; ')}.${result.observations.length>3?' The table includes the other selected jurisdictions.':''} The source does not identify the partner province.`;
  }
  if(panel.type==='provincial-impact'){
    const result=panel.result;
    const trade=result.trade.rows.slice(0,3).map(row=>`${regionName(workspace,row.region)} ${moneyFinding(row.netChange)}`);
    const fiscal=result.fiscal.rows.filter(row=>row.available).slice(0,2).map(row=>`${regionName(workspace,row.region)} ${moneyFinding(row.revenueChangeLow)}${row.revenueChangeHigh!==row.revenueChangeLow?` to ${moneyFinding(row.revenueChangeHigh)}`:''} in ${row.fiscalYear}`);
    return `A ${signedFinding(result.shockPct)}% ${ENERGY_COMMODITIES[result.commodity].toLowerCase()} price change, with ${result.year} quantities held fixed, changes interprovincial trade balances by ${trade.join('; ')}. This is trade repricing, not a GDP forecast.${fiscal.length?` Separate budget sensitivities give ${fiscal.join('; ')} on their own benchmark assumptions. Those amounts cannot be added to trade repricing.`:' No fiscal sensitivity is calibrated for this selection.'}`;
  }
  if(panel.type==='gdp-forecast'){
    const available=panel.summary.rows.filter(row=>row.status==='available');
    const missing=panel.summary.rows.filter(row=>row.status!=='available');
    const entries=available.slice(0,3).map(row=>`${row.name} ${formatFinding(row.predictionPct)}%${row.lowerPct!==null?`, with a historical-error range of ${formatFinding(row.lowerPct)}% to ${formatFinding(row.upperPct)}%`:''}`);
    return `${panel.year} real GDP growth outlook at basic prices. ${entries.length?entries.join('; '):'No forecast is available for this selection'}.${available.length>3?' The table contains the other selected provinces.':''}${missing.length?` No comparable forecast is available for ${missing.map(row=>row.name).join(', ')}.`:''} These predictions use observed indicators. Changing energy-price assumptions does not change this forecast.`;
  }
  if(panel.type==='infrastructure-map')return `${panel.routeIds.length} selected routes and ${panel.facilityIds.length} facility records match these provinces. Locations are approximate and source dates vary. These records do not measure shipments or establish current operating status.`;
  return null;
}

export function summarizeWorkspaceFindings(workspace,selection={}) {
  const focus=workspace.panels.find(panel=>panel.id===selection.panelId)||workspace.panels.find(panel=>panel.role==='answer'&&panel.type!=='coverage-note')||workspace.panels[0];
  const visible=selection.viewMode==='all'?workspace.panels.filter(panel=>panel.type!=='province-map'||!workspace.panels.some(p=>p.type==='province-comparison')):[focus];
  const coverage=workspace.panels.filter(panel=>panel.type==='coverage-note'&&!visible.includes(panel));
  const panels=[...visible,...coverage];
  const sources=new Set(workspace.sources.map(source=>source.id));
  return panels.map(panel=>({panelId:panel.id,title:panel.title,text:panelFinding(panel,workspace,selection),sourceIds:panel.sourceIds.filter(id=>sources.has(id))})).filter(block=>block.text);
}
