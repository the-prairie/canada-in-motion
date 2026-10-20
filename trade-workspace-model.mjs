import {validateEnergyFlows,summarizeEnergyFlows} from './energy-flow-model.mjs';
import {validateProvincialImpacts,summarizeProvincialImpacts} from './provincial-impact-model.mjs';

export const ENERGY_COMMODITIES={oil:'Crude oil',gas:'Natural gas',electricity:'Electricity'};
export function normalizeTradeSelection(flows,input={}) {
  const year=Number(input.tradeYear??input.year??flows.trade.latestYear);
  const shock=Number(input.priceShock??input.shockPct??10);
  if(!flows.trade.years.includes(year))throw new Error('The requested trade year is not published.');
  if(!Number.isFinite(shock)||Math.abs(shock)>20)throw new Error('Price changes must be between −20% and +20%.');
  const commodity=input.tradeCommodity??input.commodity??'oil';
  if(!Object.hasOwn(ENERGY_COMMODITIES,commodity))throw new Error('Unknown energy commodity.');
  return {tradeYear:year,tradeCommodity:commodity,priceShock:shock,linkScope:input.linkScope==='between'?'between':'touching',transferSet:input.transferSet||null};
}

export function buildTradePanels({flows,fiscal,selection={},regions=[],includeFlows=true,includeImpacts=true,includePhysical=true}) {
  validateEnergyFlows(flows);
  const state=normalizeTradeSelection(flows,selection);
  const summary=summarizeEnergyFlows(flows,{year:state.tradeYear,commodity:state.tradeCommodity,regions:regions.filter(r=>r!=='CA'),linkScope:state.linkScope});
  const panels=[];
  if(includeFlows)panels.push({id:'energy-trade',type:'energy-trade',title:`${ENERGY_COMMODITIES[state.tradeCommodity]} traded between provinces`,role:'answer',period:String(summary.year),unit:summary.unit,sourceIds:[summary.sourceId],summary,note:'Statistics Canada estimates transactions from the supplier to the final purchaser. Values are at basic prices, excluding taxes and transport margins. Connections do not trace physical shipments or identify who ultimately receives the income.'});
  if(includePhysical){
    const sets=summary.physical||[];
    const chosen=sets.find(s=>s.id===state.transferSet)||sets.find(s=>s.commodity===state.tradeCommodity&&s.frequency==='annual')||sets.find(s=>s.commodity===state.tradeCommodity)||sets[0];
    if(chosen)panels.push({id:'energy-transfers',type:'energy-transfers',title:chosen.commodity==='electricity'?'Electricity crossing provincial borders':`${ENERGY_COMMODITIES[chosen.commodity]} net regional transfers`,role:'answer',period:chosen.period,unit:chosen.unit,sourceIds:[chosen.sourceId],dataset:chosen,sets:sets.map(s=>({id:s.id,commodity:s.commodity,frequency:s.frequency,period:s.period,unit:s.unit})),note:(chosen.limitations||[]).join(' ')});
  }
  if(includeImpacts&&fiscal){
    validateProvincialImpacts(fiscal);
    const result=summarizeProvincialImpacts(flows,fiscal,{year:state.tradeYear,commodity:state.tradeCommodity,shockPct:state.priceShock,regions:regions.filter(r=>r!=='CA')});
    panels.push({id:'provincial-impact',type:'provincial-impact',title:'What the price change affects',role:'answer',period:String(state.tradeYear),unit:result.unit,sourceIds:[...new Set([summary.sourceId,...(result.sources||[]).map(s=>s.id)])],result,note:'A fixed-quantity calculation of interprovincial trade receipts and purchase costs. Published budget sensitivities use separate fiscal baselines. These results are not GDP, employment, profit or household-income forecasts, and the channels must not be added together.'});
  }
  return {panels,selection:state};
}

export function createTradeWorkspace({economy,flows,fiscal,selection={},regions=[]}) {
  const result=buildTradePanels({flows,fiscal,selection,regions});
  const registry=[...flows.sources,...(fiscal?.sources||[])];
  return {schemaVersion:1,dataVersion:economy.generatedAt,economySnapshot:economy,tradeSnapshot:flows,fiscalSnapshot:fiscal,
    plan:{regions:regions.length?regions:['CA'],year:2030,scenario:'Current Measures',oilShock:10,duration:'persistent',...result.selection},
    panels:result.panels,sources:[...new Map(registry.map(s=>[s.id,s])).values()],limitations:[],decision:{provider:'rules',status:'not-needed'},authored:true};
}
