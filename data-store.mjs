const eventKinds = {
  orphanDesignated: ['orphan-designated', 'Orphan designation recorded'],
  abandoned: ['abandoned', 'Abandonment recorded'],
  reclaimed: ['reclaimed', 'Reclamation recorded'],
  transferred: ['transferred', 'Transfer recorded'],
};
const chunks = new Map();
export async function fetchJSON(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Data request failed (${response.status}). Please retry.`);
  return response.json();
}
export function snapshotFreshness(retrievedAt, now = Date.now(), maxDays = 8) {
  const age = (now - Date.parse(retrievedAt)) / 86400000;
  return !Number.isFinite(age) || age < -1 || age > maxDays ? 'stale' : 'recent';
}
export async function loadWells(catalog) {
  const lists = await Promise.all(catalog.sources.map(async source => {
    const index = await fetchJSON(catalog.basePath + source.indexFile);
    if (!Array.isArray(index.fields) || !Array.isArray(index.rows) || index.rows.length !== source.count) throw new Error('Inventory count does not match the release manifest.');
    return index.rows.map(row => {
      const well = Object.fromEntries(index.fields.map((field,i) => [field,row[i]]));
      well.observationsThrough = source.observationsThrough || '';
      well.sourceRetrievedAt = source.retrievedAt;
      well.sourceDateDetail = source.sourceDateDetail || source.sourceDateText || (typeof source.upstreamModifiedAt === 'number' ? new Date(source.upstreamModifiedAt).toISOString() : source.upstreamModifiedAt) || 'Not supplied';
      well.sourceLimitations = source.limitations;
      well.sourceUrl = source.format === 'arcgis' ? source.url + '/query?' + new URLSearchParams({where: source.objectIdField+'='+well.sourceRecordId,outFields:'*',returnGeometry:'false',f:'pjson'}) : source.url;
      well.events = Object.entries(well.dates || {}).filter(([key]) => eventKinds[key]).map(([key,date]) => ({type:eventKinds[key][0],label:eventKinds[key][1],date,sourceId:source.id}));
      return well;
    });
  }));
  return lists.flat();
}
export async function loadDetail(catalog, well) {
  const path = catalog.basePath + well.detailFile;
  if (!chunks.has(path)) chunks.set(path, fetchJSON(path).catch(error => { chunks.delete(path); throw error; }));
  const record = (await chunks.get(path)).find(record => record.id === well.id);
  if (!record) throw new Error('This record is missing from its release.');
  return record;
}
