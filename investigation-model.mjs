import {validateWorkspace,initialSelection,resolveWorkspace} from './workspace-contract.mjs';
import {summarizeEnergyFlows,FLOW_REGIONS} from './energy-flow-model.mjs';

export function tradeMatrix(summary) {
  const indexed=new Map(summary.links.map(row=>[`${row.origin}/${row.destination}`,row]));
  return FLOW_REGIONS.map(origin=>({origin,cells:FLOW_REGIONS.map(destination=>{
    const row=indexed.get(`${origin}/${destination}`);
    return {origin,destination,value:row?.value??null,status:origin===destination?'same-region':row?row.status:'outside-selection'};
  })}));
}

// This is a reference-year sensitivity check, not a probability distribution.
export function tradeRobustness(flows,{tradeCommodity='oil',regions=[],priceShock=10}={}) {
  if(!Number.isFinite(priceShock)||Math.abs(priceShock)>20)throw Error('Unsupported price change');
  const summaries=flows.trade.years.map(year=>summarizeEnergyFlows(flows,{year,commodity:tradeCommodity,regions}));
  const rows=summaries[0].regions.map(region=>{
    const years=summaries.map(summary=>{
      const r=summary.balances.find(row=>row.region===region);
      return {year:summary.year,exports:r.exports,imports:r.imports,netExports:r.netExports,
        netChange:r.netExports===null?null:r.netExports*priceShock/100};
    });
    const complete=years.every(row=>row.netExports!==null);
    const signs=new Set(years.filter(row=>row.netExports!==null).map(row=>Math.sign(row.netExports)));
    return {region,years,complete,stable:complete&&signs.size===1,direction:complete&&signs.size===1?[...signs][0]:null};
  });
  return {years:flows.trade.years,rows,commodity:tradeCommodity,shockPct:priceShock,
    scope:'Each province’s trade with every other province and territory',unit:flows.trade.unit,sourceId:flows.trade.sourceId};
}

export function captureInvestigation({workspace,selection,question,baseline=null},now=new Date()) {
  validateWorkspace(workspace);
  const canonical=normalizeInvestigationSelection(workspace,selection);
  resolveWorkspace(workspace,canonical,workspace.economySnapshot);
  return {schemaVersion:1,kind:'canada-in-motion-investigation',id:globalThis.crypto.randomUUID(),savedAt:now.toISOString(),
    title:String(question||'Energy investigation').slice(0,200),workspace:structuredClone(workspace),selection:canonical,baseline:baseline?normalizeInvestigationSelection(workspace,baseline):null};
}
export function normalizeInvestigationSelection(workspace,value={}) {
  const base=initialSelection(workspace),result={...base};
  for(const key of Object.keys(base))if(Object.hasOwn(value,key))result[key]=structuredClone(value[key]);
  resolveWorkspace(workspace,result,workspace.economySnapshot);
  return result;
}
export function validateInvestigation(value) {
  if(value?.kind!=='canada-in-motion-investigation'||value.schemaVersion!==1||typeof value.id!=='string'||value.id.length>100||typeof value.title!=='string'||value.title.length>200||!Number.isFinite(Date.parse(value.savedAt)))throw Error('Invalid saved investigation');
  validateWorkspace(value.workspace);
  if(!value.workspace.economySnapshot)throw Error('The saved investigation has no source snapshot');
  return {...value,selection:normalizeInvestigationSelection(value.workspace,value.selection),baseline:value.baseline?normalizeInvestigationSelection(value.workspace,value.baseline):null};
}
export function compareTradeSelections(workspace,left,right) {
  const a=resolveWorkspace(workspace,left,workspace.economySnapshot),b=resolveWorkspace(workspace,right,workspace.economySnapshot);
  const impact=a.panels.some(p=>p.type==='provincial-impact');
  const extract=w=>{if(impact){const r=w.panels.find(p=>p.type==='provincial-impact')?.result;return r?{year:r.year,commodity:r.commodity,shockPct:r.shockPct,rows:r.trade.rows.map(x=>({region:x.region,value:x.netChange}))}:null;}
    const r=w.panels.find(p=>p.type==='energy-trade')?.summary;return r?{year:r.year,commodity:r.commodity,rows:r.balances.map(x=>({region:x.region,value:x.netExports}))}:null;};
  const av=extract(a),bv=extract(b);if(!av||!bv)return null;
  const codes=[...new Set([...av.rows,...bv.rows].map(r=>r.region))];
  return {measure:impact?'Net trade-value change':'Net trade value',left:av,right:bv,rows:codes.map(region=>{
    const l=av.rows.find(r=>r.region===region)?.value??null,r=bv.rows.find(r=>r.region===region)?.value??null;
    return {region,left:l,right:r,difference:l!==null&&r!==null?r-l:null};})};
}
