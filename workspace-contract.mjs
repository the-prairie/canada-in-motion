import {summarizeEconomy} from './economy-model.mjs';
import {selectInfrastructure} from './infrastructure-model.mjs';

export const PANEL_COMPONENTS = Object.freeze({
  'province-map':'ProvinceMap', 'province-comparison':'ProvinceComparison',
  'scenario-comparison':'ScenarioComparison', 'infrastructure-map':'InfrastructureMap',
  'oil-sensitivity':'OilSensitivity', 'coverage-note':'CoverageNote',
});
export const REGION_CODES = ['CA','NL','PE','NS','NB','QC','ON','MB','SK','AB','BC','YT','NT','NU'];
const finiteOrNull = value => value === null || Number.isFinite(value);
const fail = () => {throw new Error('This workspace could not be verified. The written findings are still available.');};

export function validateWorkspace(value) {
  if(!value || value.schemaVersion!==1 || !Array.isArray(value.panels) || !value.panels.length || value.panels.length>6 || !Array.isArray(value.sources) || value.sources.length>30 || !Array.isArray(value.plan?.regions) || !value.plan.regions.length || value.plan.regions.some(code=>!REGION_CODES.includes(code)))fail();
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

export function initialSelection(workspace) {
  return {regions:workspace.plan.regions.includes('CA')?[]:[...workspace.plan.regions],year:workspace.plan.year,scenario:workspace.plan.scenario,oilShock:workspace.plan.oilShock,duration:workspace.plan.duration};
}

export function resolveWorkspace(workspace,selection,economy) {
  validateWorkspace(workspace);
  if(workspace.dataVersion!==economy.generatedAt)return workspace;
  if(!Array.isArray(selection.regions)||selection.regions.some(code=>!REGION_CODES.includes(code)||code==='CA')||!economy.years.includes(selection.year)||!economy.scenarios.includes(selection.scenario))fail();
  const regionCodes=selection.regions.length?selection.regions:economy.regions.filter(row=>row.code!=='CA').map(row=>row.code);
  const total=economy.gdp.regions.reduce((sum,row)=>sum+row.energy,0);
  const gdpRows=economy.gdp.regions.map(row=>({...row,value:row.energy,nationalSharePct:row.energy/total*100}));
  const panels=workspace.panels.map(panel=>{
    if(panel.type==='infrastructure-map'&&workspace.networkSnapshot)return {...panel,...selectInfrastructure(workspace.networkSnapshot,selection.regions),regions:selection.regions.length?selection.regions:['CA']};
    if(panel.type==='province-map')return {...panel,rows:gdpRows};
    if(panel.type==='province-comparison')return {...panel,rows:gdpRows.filter(row=>regionCodes.includes(row.code))};
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
