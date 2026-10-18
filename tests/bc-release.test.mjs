import test from 'node:test';
import assert from 'node:assert/strict';
import {validateBC, BC_LICENCE} from '../scripts/bc-validation.mjs';
import {sha256} from '../scripts/build-public.mjs';
function fixture() {
 const date='2026-10-18T00:00:00Z';
 const feature=(id,kind)=>({id,properties:{kind,operatingStatus:null},geometry:kind==='pipeline-permit'?{type:'MultiLineString',coordinates:[[[-120,55],[-121,56]]]}:{type:'Point',coordinates:[-120,55]}});
 const full={type:'FeatureCollection',features:[feature('p','pipeline-permit'),feature('f','facility-permit')]};
 const payload={'full.geojson':full,'map.geojson':structuredClone(full),'orphan-pipelines.json':{rows:[{id:1}]}};
 const paths={pipelines:'PASR/PASR_PL_SEGMENT_LN/MapServer/0',facilities:'PASR/PASR_FACILITY_PT/MapServer/0','orphan-pipelines':'OPERATIONAL/ORPHAN_SITE_PT/MapServer/1'};
 const manifest={schemaVersion:1,scope:'Not a complete operating inventory',retrievedAt:date,counts:{'pipeline-permit':1,'facility-permit':1,'orphan-pipeline-row':1},sources:Object.fromEntries(Object.entries(paths).map(([name,p])=>[name,{sourceUrl:'https://geoweb-ags.bc-er.ca/arcgis/rest/services/'+p,license:BC_LICENCE,recordCount:1,sha256:'a'.repeat(64),retrievedAt:date}]))};
 const raw={};
 const seal=()=>{manifest.files={};for(const [name,value] of Object.entries(payload)){raw[name]=Buffer.from(JSON.stringify(value));manifest.files[name]={bytes:raw[name].length,sha256:sha256(raw[name])};}};
 seal();
 const deps={readJSON:async()=>manifest,safeRead:async(root,file)=>raw[file.split('/').pop()],sha256};
 return {manifest,payload,raw,seal,run:()=>validateBC('.',deps)};
}
test('BC publication preserves exact identities, rights, integrity and unknown operations',async()=>{
 const f=fixture(); await f.run();
 f.payload['map.geojson'].features[0].id='wrong';f.seal();await assert.rejects(f.run(),/identities/);
 f.payload['map.geojson'].features[0].id='p';f.payload['full.geojson'].features[0].properties.operatingStatus='active';f.seal();await assert.rejects(f.run(),/operating status/);
 f.payload['full.geojson'].features[0].properties.operatingStatus=null;f.seal();f.manifest.sources.facilities.license='https://example.org';await assert.rejects(f.run(),/licence/);
 f.manifest.sources.facilities.license=BC_LICENCE;f.raw['full.geojson']=Buffer.from('{}');await assert.rejects(f.run(),/checksum/);
});
test('BC acquisition timestamp cannot silently advance while reusing older sources',async()=>{
 const f=fixture();f.manifest.retrievedAt='2026-10-19T00:00:00Z';await assert.rejects(f.run(),/oldest acquisition/);
});
