export const BC_FILES = ['map.geojson','full.geojson','orphan-pipelines.json'];
export const BC_LICENCE = 'https://www.bc-er.ca/files/gis/BCER-Open-Data-Licence.pdf';
const sourcePaths = {pipelines:'PASR/PASR_PL_SEGMENT_LN/MapServer/0',facilities:'PASR/PASR_FACILITY_PT/MapServer/0','orphan-pipelines':'OPERATIONAL/ORPHAN_SITE_PT/MapServer/1'};
export async function validateBC(root, {readJSON, safeRead, sha256}) {
  const check=(v,m)=>{if(!v)throw new Error('BC permit inventory: '+m);};
  const base='data/bc-infrastructure/';
  const manifest=await readJSON(root,base+'manifest.json');
  check(manifest.schemaVersion===1 && Object.keys(manifest.files||{}).sort().join()===BC_FILES.slice().sort().join(), 'invalid file group');
  const payload={};
  for(const name of BC_FILES) {
    const raw=await safeRead(root,base+name), proof=manifest.files[name];
    check(sha256(raw)===proof.sha256 && raw.length===proof.bytes,'checksum mismatch: '+name);
    payload[name]=JSON.parse(raw);
  }
  check(Object.keys(manifest.sources||{}).sort().join()===Object.keys(sourcePaths).sort().join(),'missing sources');
  const dates=[];
  for(const [name,part] of Object.entries(sourcePaths)) {
    const s=manifest.sources[name];
    check(s.license===BC_LICENCE && s.sourceUrl==='https://geoweb-ags.bc-er.ca/arcgis/rest/services/'+part,'source or licence mismatch');
    check(Number.isSafeInteger(s.recordCount)&&s.recordCount>0 && /^[a-f0-9]{64}$/.test(s.sha256),'invalid source count or provenance');
    dates.push(Date.parse(s.retrievedAt));
  }
  check(dates.every(Number.isFinite) && Date.parse(manifest.retrievedAt)===Math.min(...dates),'oldest acquisition date must be retained');
  const full=payload['full.geojson'], map=payload['map.geojson'];
  const ids=[];
  for(const layer of [full,map]) {
    check(layer.type==='FeatureCollection' && Array.isArray(layer.features),'invalid feature collection');
    const seen=new Set();
    for(const f of layer.features) {
      const p=f.properties, g=f.geometry;
      check(typeof f.id==='string'&&!seen.has(f.id)&&p?.operatingStatus===null,'duplicate ID or unsupported operating status');seen.add(f.id);
      check(['pipeline-permit','facility-permit'].includes(p.kind),'invalid permit kind');
      check(g?.type===(p.kind==='pipeline-permit'?'MultiLineString':'Point'),'unexpected geometry');
      const points=g.type==='Point'?[g.coordinates]:g.coordinates.flat();
      check(points.length>0&&points.every(x=>x.length===2&&x.every(Number.isFinite)&&Math.abs(x[0])<=180&&Math.abs(x[1])<=90),'invalid coordinates');
    }
    ids.push([...seen].sort().join('\n'));
  }
  check(ids[0]===ids[1],'map/full identities differ');
  for(const [kind,name] of [['pipeline-permit','pipelines'],['facility-permit','facilities']]) check(full.features.filter(f=>f.properties.kind===kind).length===manifest.counts[kind]&&manifest.counts[kind]===manifest.sources[name].recordCount,'feature counts disagree');
  check(payload['orphan-pipelines.json'].rows?.length===manifest.counts['orphan-pipeline-row']&&manifest.counts['orphan-pipeline-row']===manifest.sources['orphan-pipelines'].recordCount,'orphan table count mismatch');
  check(manifest.scope?.includes('Not a complete operating inventory'),'scope disclosure missing');
  return manifest;
}
