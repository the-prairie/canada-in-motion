import {validateEnergyFlows} from './energy-flow-model.mjs';
import {validateProvincialImpacts,summarizeProvincialImpacts} from './provincial-impact-model.mjs';
import {validateProvincialPriceResponse,validateHouseholdEnergyCosts,summarizeProvincialPriceResponse,summarizeHouseholdEnergyCosts} from './price-response-model.mjs';

export const GUIDE_STEPS=['exchange','provinces','households'];
export const GUIDE_DEFAULTS={guideStep:null,guideHorizon:0,guideHouseholdBasis:'benchmark',guideRetailShock:0};
export function validateGuideSelection(selection) {
  if(selection.guideStep!=null&&!GUIDE_STEPS.includes(selection.guideStep))throw Error('Unknown scenario step');
  if(selection.guideHorizon!==undefined&&![0,1].includes(selection.guideHorizon))throw Error('Unknown GDP horizon');
  if(selection.guideHouseholdBasis!==undefined&&!['benchmark','retail'].includes(selection.guideHouseholdBasis))throw Error('Unknown household price basis');
  if(selection.guideRetailShock!==undefined&&(!Number.isFinite(selection.guideRetailShock)||Math.abs(selection.guideRetailShock)>20))throw Error('Retail price change must be within 20%');
}
export function validateGuidedSnapshot(snapshot) {
  validateProvincialImpacts(snapshot.fiscal);
  validateProvincialPriceResponse(snapshot.priceResponses);
  validateHouseholdEnergyCosts(snapshot.householdCosts);
  return snapshot;
}
export async function loadGuidedSnapshot(fiscal,fetchImpl=fetch,signal) {
  const read=async name=>{const response=await fetchImpl(`data/${name}.json`,{signal});if(!response.ok)throw Error('Scenario sources could not load.');return response.json();};
  const [priceResponses,householdCosts,fiscalData]=await Promise.all([read('provincial-price-response'),read('household-energy-costs'),fiscal||read('provincial-impacts')]);
  signal?.throwIfAborted();
  return validateGuidedSnapshot({priceResponses,householdCosts,fiscal:fiscalData});
}
export function summarizeGuidedConnection(flows,snapshot,input) {
  validateEnergyFlows(flows);validateGuideSelection(input);
  const selection={...GUIDE_DEFAULTS,...input};
  if(!Number.isFinite(selection.priceShock)||Math.abs(selection.priceShock)>20)throw Error('Price change must be within 20%');
  const link=flows.trade.observations.find(row=>`${row.origin}-${row.destination}`===selection.tradeConnection&&row.commodity===selection.tradeCommodity&&row.year===selection.tradeYear);
  if(!link||link.origin==='ROW'||link.destination==='ROW')throw Error('Select an interprovincial trade connection.');
  if(snapshot)validateGuidedSnapshot(snapshot);
  const regions=[link.origin,link.destination],available=link.status==='available'&&Number.isFinite(link.value);
  const change=available?link.value*selection.priceShock/100:null;
  const exchange={...link,available,sourceId:flows.trade.sourceId,unit:'million current CAD at basic prices',change,scenarioValue:available?link.value+change:null,sellerReceiptsChange:change,buyerCostsChange:change};
  const provincial=snapshot?summarizeProvincialImpacts(flows,snapshot.fiscal,{commodity:link.commodity,year:link.year,shockPct:selection.priceShock,regions}):null;
  const gdp=summarizeProvincialPriceResponse(snapshot?.priceResponses,{commodity:link.commodity,regions,shockPct:selection.priceShock,horizonYears:selection.guideHorizon});
  const households=summarizeHouseholdEnergyCosts(snapshot?.householdCosts,{commodity:link.commodity,regions,shockPct:selection.guideHouseholdBasis==='retail'?selection.guideRetailShock:selection.priceShock,basis:selection.guideHouseholdBasis});
  const suppressGDP=gdp.rows.map(row=>row.status==='supported'?row:{...row,estimatePct:null,lowerPct:null,upperPct:null});
  const sources=[...flows.sources,...(snapshot?Object.values(snapshot).flatMap(data=>data.sources):[])];
  const sourceKeys=new Set();
  return {schemaVersion:1,selection:{commodity:link.commodity,year:link.year,connection:selection.tradeConnection,priceShock:selection.priceShock,...Object.fromEntries(Object.keys(GUIDE_DEFAULTS).map(key=>[key,selection[key]]))},exchange,
    provinces:regions.map(region=>({region,name:flows.regions.find(row=>row.code===region)?.name||region,role:region===link.origin?'seller':'buyer',trade:provincial?.trade.rows.find(row=>row.region===region)||null,fiscal:provincial?.fiscal.rows.find(row=>row.region===region)||null,gdp:suppressGDP.find(row=>row.region===region),household:households.rows.find(row=>row.region===region)})),
    householdBasis:households.basis,benchmark:snapshot?.priceResponses.benchmarks?.[link.commodity]?.label||null,
    sources:sources.filter(row=>{const key=`${row.id}/${row.sha256}`;if(sourceKeys.has(key))return false;sourceKeys.add(key);return true;}),
    versions:{trade:flows.dataVersion,...Object.fromEntries(Object.entries(snapshot||{}).map(([key,data])=>[key,data.dataVersion]))},
    interpretation:'The connection selects the two regions. Provincial and household estimates apply separate province-wide price assumptions; they are not effects attributable to this single transaction. GDP, government revenue and household spending cannot be added together.'};
}
