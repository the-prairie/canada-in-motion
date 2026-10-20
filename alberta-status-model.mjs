export const ALBERTA_LIFECYCLE = [
  ['active','Active'],['marginal','Marginal'],['inactive','Inactive'],['new','New'],
  ['decommissioned','Decommissioned'],['reclamationCertified','Reclamation certified'],['reclamationExempt','Reclamation exempt'],
];

export function validateAlbertaWellStatus(data) {
  const fail=()=>{throw new Error('Alberta well-status data could not be verified.');};
  if(data?.schemaVersion!==1||data.region!=='AB'||data.unit!=='well licences'||data.measure!=='province-wide-lifecycle-counts'||!Number.isFinite(Date.parse(data.retrievedAt))||!Array.isArray(data.observations)||!data.observations.length||data.observations.length>30)fail();
  if(data.source?.id!=='aer-well-status'||data.source.url!=='https://www.aer.ca/data-and-performance-reports/information-hub/well-status'||!/^https:\/\/www2\.aer\.ca\//.test(data.source.downloadUrl)||!/^[a-f0-9]{64}$/.test(data.source.sha256||''))fail();
  const years=new Set();
  for(const row of data.observations){
    if(!Number.isInteger(row.year)||row.year<2000||row.year>Number(data.retrievedAt.slice(0,4))||years.has(row.year))fail();
    years.add(row.year);
    if(!row.counts||Object.keys(row.counts).length!==ALBERTA_LIFECYCLE.length||ALBERTA_LIFECYCLE.some(([key])=>!Number.isSafeInteger(row.counts[key])||row.counts[key]<0))fail();
    if(row.operating!==row.counts.active+row.counts.marginal||row.total!==Object.values(row.counts).reduce((a,b)=>a+b,0)||!row.total)fail();
    if(!['year','day'].includes(row.datePrecision)||(row.datePrecision==='year'&&row.snapshotDate!==null)||(row.datePrecision==='day'&&row.snapshotDate!==`${row.year}-12-31`))fail();
  }
  if(data.latestYear!==Math.max(...years)||JSON.stringify(data.latest)!==JSON.stringify(data.observations.find(row=>row.year===data.latestYear)))fail();
  if(!data.definitions?.marginal||!data.definitions?.operating||!Array.isArray(data.limitations)||!data.attribution)fail();
  return data;
}
