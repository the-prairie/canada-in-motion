import {normalizeEconomyState,summarizeEconomy} from './economy-model.mjs';
import {buildWorkspacePanels,buildWorkspaceAnalysis} from './server/energy-workspace.mjs';
import {validateWorkspace} from './workspace-contract.mjs';
import {validateEnergyFlows} from './energy-flow-model.mjs';
import {validateProvincialImpacts} from './provincial-impact-model.mjs';
import {validateProvincialForecast} from './provincial-forecast-model.mjs';

export const LOCAL_INVESTIGATIONS=[
  {id:'outlook',label:'Provincial GDP outlook'},
  {id:'contributions',label:'Provincial contributions'},
  {id:'electricity',label:'Electricity in 2040'},
  {id:'trade',label:'Energy trade'},
  {id:'prices',label:'Provincial price effects'},
];

export function buildLocalInvestigation(id,{data,forecast,flows,fiscal,state:current}) {
  if(!LOCAL_INVESTIGATIONS.some(item=>item.id===id))throw new Error('This comparison is not available.');
  let state=normalizeEconomyState(current,data);
  let question,investigation={regions:['AB','ON','QC'],topics:['gdp'],metricIds:[],includeMap:false,requestedMeasure:'available'};
  if(id==='outlook'){
    validateProvincialForecast(forecast);
    question=`Compare the GDP forecasts for Alberta, Ontario and Québec in ${forecast.forecastOriginYear} and ${forecast.forecastOriginYear+1}.`;
    investigation.topics=['gdp-forecast'];
  }else if(id==='contributions'){
    question='Compare energy GDP in Alberta, Ontario and Québec. Include a map.';
    investigation.includeMap=true;
  }else if(id==='electricity'){
    question='Compare electricity generation in Alberta, Ontario and Québec in the Higher scenario in 2040.';
    state=normalizeEconomyState({...state,scenario:'Higher',year:2040},data);
    investigation.topics=['scenario'];investigation.metricIds=['electricity-generation'];
  }else{
    validateEnergyFlows(flows);
    if(id==='prices')validateProvincialImpacts(fiscal);
    question=id==='trade'?'Show the value of oil traded between Alberta and British Columbia.':'If oil prices rise 10%, compare trade exposure and published budget sensitivities in Alberta and Saskatchewan.';
    investigation={...investigation,regions:id==='trade'?['AB','BC']:['AB','SK'],topics:[id==='trade'?'energy-flows':'provincial-impact'],energyTrade:{commodity:'oil',year:null,shockPct:id==='trade'?0:10,linkScope:id==='trade'?'between':'touching'}};
  }
  const summary=summarizeEconomy(data,state);
  const workspace=buildWorkspacePanels({data,forecast,flows,fiscal,summary,summarize:summarizeEconomy,state,investigation,question});
  workspace.localComparison=true;
  if(id==='trade')workspace.plan.tradeDisplay='map';
  workspace.decision={provider:'rules',model:null,status:'disabled',planStatus:'valid'};
  validateWorkspace(workspace);
  return {state,summary,workspace,question,analysis:buildWorkspaceAnalysis(workspace),model:null,answerMode:'local-data-workspace'};
}

export async function loadLocalInvestigation(id,options,fetchImpl=fetch,signal) {
  const read=async file=>{
    const response=await fetchImpl(`data/${file}.json`,{signal});
    if(!response.ok)throw new Error('The comparison data could not load. Check your connection and try again.');
    return response.json();
  };
  const [forecast,flows,fiscal]=await Promise.all([
    id==='outlook'?read('provincial-forecasts'):null,
    ['trade','prices'].includes(id)?read('energy-flows'):null,
    id==='prices'?read('provincial-impacts'):null,
  ]);
  signal?.throwIfAborted();
  return buildLocalInvestigation(id,{...options,forecast,flows,fiscal});
}
