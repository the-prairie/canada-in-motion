const RAD = Math.PI / 180;
const N = (Math.sin(50 * RAD) + Math.sin(70 * RAD)) / 2;
const C = Math.cos(50 * RAD) ** 2 + 2 * N * Math.sin(50 * RAD);
const RHO0 = Math.sqrt(C - 2 * N * Math.sin(58 * RAD)) / N;

export const JURISDICTIONS = [
  ['BC', 'British Columbia'], ['AB', 'Alberta'], ['SK', 'Saskatchewan'],
  ['MB', 'Manitoba'], ['ON', 'Ontario'], ['QC', 'Québec'],
  ['NB', 'New Brunswick'], ['NS', 'Nova Scotia'], ['PE', 'Prince Edward Island'],
  ['NL', 'Newfoundland and Labrador'], ['YT', 'Yukon'],
  ['NT', 'Northwest Territories'], ['NU', 'Nunavut'],
];
export const STATUSES = [
  {id:'abandoned', label:'Abandoned', colour:'#a34c32', rgb:[.639,.298,.196]},
  {id:'suspended', label:'Suspended', colour:'#a18436', rgb:[.631,.518,.212]},
  {id:'active', label:'Active', colour:'#27766e', rgb:[.153,.463,.431]},
  {id:'unknown', label:'Unknown', colour:'#818783', rgb:[.506,.529,.514]},
];

// Spherical Canada Albers. Coordinates use a radius of 1,000, not ground kilometres.
export function project(lon, lat) {
  const rho = Math.sqrt(C - 2 * N * Math.sin(lat * RAD)) / N;
  const theta = N * (lon + 96) * RAD;
  return [1000 * rho * Math.sin(theta), 1000 * (RHO0 - rho * Math.cos(theta))];
}
export function unproject(x, y) {
  const px = x / 1000, py = RHO0 - y / 1000;
  const rho = Math.hypot(px, py);
  return [Math.atan2(px, py) / N / RAD - 96, Math.asin(Math.max(-1, Math.min(1, (C - (rho * N) ** 2) / (2 * N)))) / RAD];
}
export function normalizeArea(raw) {
  if (!Array.isArray(raw) || raw.length !== 4 || raw.some(v => typeof v !== 'number' || !Number.isFinite(v) || Math.abs(v) > 4000)) return null;
  const [x1,y1,x2,y2] = raw;
  if (x1 === x2 || y1 === y2) return null;
  return [Math.min(x1,x2),Math.min(y1,y2),Math.max(x1,x2),Math.max(y1,y2)];
}
export function inArea(well, area) {
  if (!area) return true;
  if (!Number.isFinite(well.lon) || !Number.isFinite(well.lat)) return false;
  const [x,y] = project(well.lon, well.lat);
  return x >= area[0] && x <= area[2] && y >= area[1] && y <= area[3];
}
export function statusIndex(well) {
  const index = STATUSES.findIndex(status => status.id === well.closureStatus);
  return index < 0 ? 3 : index;
}
export function summarize(wells) {
  const rows = JURISDICTIONS.map(([code,name]) => ({code,name,total:0,counts:[0,0,0,0],sources:new Set()}));
  const lookup = new Map(rows.map(row => [row.code,row]));
  const counts = [0,0,0,0];
  for (const well of wells) {
    const status = statusIndex(well);
    counts[status]++;
    const row = lookup.get(well.province);
    if (row) { row.total++; row.counts[status]++; row.sources.add(well.sourceId); }
  }
  return {total:wells.length,counts,rows};
}
