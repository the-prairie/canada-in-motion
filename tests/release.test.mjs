import { betaReleaseGate } from '../scripts/beta-release-gate.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { gunzipSync } from 'node:zlib';
import { buildPublic, validateRelease, PUBLIC_FILES, sha256 } from '../scripts/build-public.mjs';
import { createPublicServer } from '../scripts/serve-public.mjs';
import { releaseGate } from '../scripts/release-gate.mjs';
import { betaReadiness } from '../scripts/launch-readiness.mjs';
const DATE='2026-10-17T12:00:00Z';
async function fixture(t) {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'atlas-release-'));
  t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const write=async(file,value)=>{await fs.mkdir(path.dirname(path.join(root,file)),{recursive:true});await fs.writeFile(path.join(root,file),typeof value==='string'?value:JSON.stringify(value));};
  const config={purpose:'noncommercial',publicLaunchEnabled:false,requireNationalCompleteness:true,staleAfterDays:8,requiredProvinces:['AB','BC','SK','MB','ON','QC','NB','NS','PE','NL'],requiredTopics:['well-inventory','orphan-status','abandonment-status','infrastructure','carrier-rates','government-charges']};
  const definition={id:'example',enabled:true,publication:'open',licenseUrl:'https://example.org/license'};
  const details=[{id:'example-1',sourceId:'example',province:'AB'}];
  const index={fields:['id','sourceId','detailFile'],rows:[['example-1','example','example/details-0000.json']]};
  const source={...definition,sourceCount:1,count:1,enumerationVerified:true,droppedRecords:0,retrievedAt:DATE,indexFile:'example/index.json',indexSha256:sha256(JSON.stringify(index)),detailFiles:[{file:'example/details-0000.json',sha256:sha256(JSON.stringify(details)),count:1}]};
  const catalog={schemaVersion:2,releaseId:'a'.repeat(20),basePath:`data/releases/${'a'.repeat(20)}/`,purpose:'noncommercial',retrievedAt:DATE,nationalComplete:false,totalRecords:1,sources:[source]};
  const coverage={provinces:config.requiredProvinces.map(code=>({code,topics:Object.fromEntries(config.requiredTopics.map(topic=>[topic,{status:'partial',sourceIds:['example'],evidenceUrl:'https://example.org/evidence',retrievedAt:DATE}]))}))};
  for(const file of PUBLIC_FILES) await write(file,file==='index.html'?'<html><head></head><body>Atlas</body></html>':file.endsWith('.json')?{}:'/* fixture */');
  await write('vendor/LICENSE.txt','Third party notice');await write('vendor/fonts/OFL.txt','Font notice');
  await write('config/publication.json',config);await write('config/sources.json',[definition]);await write('data/catalog.json',catalog);await write('data/national-coverage.json',coverage);
  await write(catalog.basePath+source.indexFile,index);await write(catalog.basePath+source.detailFiles[0].file,details);
  const openLicence={name:'Open Government Licence - Canada',url:'https://open.canada.ca/en/open-government-licence-canada',attribution:'Contains information licensed under the Open Government Licence - Canada.'};
  const contextEvidence={url:'https://example.org/open-data',sha256:'a'.repeat(64),retrievedAt:DATE};
  const contextFiles={
    'historical-infrastructure.geojson':{type:'FeatureCollection',metadata:{licence:openLicence,source:contextEvidence,catalogue:contextEvidence,counts:{pipeline:1,refinery:0}},features:[{id:'line1',type:'Feature',properties:{kind:'pipeline',historical:true},geometry:{type:'MultiLineString',coordinates:[[[-100,50],[-101,51]]]}}]},
    'benchmark-tolls.json':{licence:openLicence,catalogue:contextEvidence,snapshotAsOf:'2026-10-17',currentValidity:'not-verified',eligibleForQuote:false,systemCount:1,rowCount:1,systems:[{name:'Example',eligibleForQuote:false,currentValidity:'not-verified',latestObservationDate:'2026-05-01',snapshotRowCount:1,source:{url:'https://example.org/tolls',sha256:'a'.repeat(64),retrievedAt:DATE},rows:[{Date:'2026-05-01',Unit:'CAD/m3',Toll:'2.5','Pipeline Name':'Example'}]}]},
    'pipeline-attributes.json':{licence:openLicence,source:contextEvidence,catalogue:contextEvidence,rowCount:1,rows:[{'Pipeline name':'Example'}]}
  };
  for(const [name,value] of Object.entries(contextFiles)) await write('data/context/'+name,value);
  await write('data/context/manifest.json',{schemaVersion:1,retrievedAt:DATE,counts:{geometry:{pipeline:1,refinery:0},benchmarkSystems:1,benchmarkRows:1,pipelineAttributes:1},files:Object.entries(contextFiles).map(([file,value])=>({file,sha256:sha256(JSON.stringify(value))}))});
  return {root,write,config,catalog,coverage,source};
}
test('public package is an allowlist; source-only and extra release files cannot leak',async t=>{
  const f=await fixture(t);await f.write('secret.txt','sensitive');await f.write('data/wells.json','old restricted data');await f.write(f.catalog.basePath+'example/raw.json','raw private metadata');
  const result=await buildPublic(f.root);assert.equal(result.records,1);
  for(const file of ['secret.txt','data/wells.json','config/publication.json','data/refresh-report.json',f.catalog.basePath+'example/raw.json']) await assert.rejects(fs.stat(path.join(f.root,'dist',file)),{code:'ENOENT'});
  assert.match(await fs.readFile(path.join(f.root,'dist/index.html'),'utf8'),/Content-Security-Policy/);
});
test('release rejects restricted sources, commercial misuse, altered data and traversal',async t=>{
  const f=await fixture(t);
  await f.write('config/sources.json',[{id:'example',enabled:true,publication:'permission-required'}]);await assert.rejects(validateRelease(f.root),/rights/);
  await f.write('config/sources.json',[{id:'example',enabled:true,publication:'noncommercial'}]);f.source.publication='noncommercial';f.config.purpose='commercial';f.catalog.purpose='commercial';await f.write('config/publication.json',f.config);await f.write('data/catalog.json',f.catalog);await assert.rejects(validateRelease(f.root),/Noncommercial/);
  f.config.purpose='noncommercial';f.catalog.purpose='noncommercial';await f.write('config/publication.json',f.config);await f.write('data/catalog.json',f.catalog);
  await f.write(f.catalog.basePath+f.source.detailFiles[0].file,'[]');await assert.rejects(validateRelease(f.root),/Checksum/);
  f.source.indexFile='../private.json';await f.write('data/catalog.json',f.catalog);await assert.rejects(validateRelease(f.root),/Unsafe/);
});
test('release rejects symlink files even when pointed inside the root',async t=>{
  const f=await fixture(t);const file=path.join(f.root,f.catalog.basePath+f.source.indexFile);await fs.rename(file,file+'.real');await fs.symlink(file+'.real',file);await assert.rejects(validateRelease(f.root),/Symbolic links/);
});
test('public gate refuses incomplete, disabled, stale and unsupported licence releases',async t=>{
  const f=await fixture(t);let report=await releaseGate(f.root,{now:new Date(DATE)});assert.equal(report.passed,false);assert.ok(report.errors.some(x=>x.includes('disabled')));assert.ok(report.errors.some(x=>x.includes('AB/well-inventory')));
  f.config.publicLaunchEnabled=true;f.catalog.nationalComplete=true;for(const p of f.coverage.provinces)for(const item of Object.values(p.topics))item.status='complete';
  await f.write('config/publication.json',f.config);await f.write('data/catalog.json',f.catalog);await f.write('data/national-coverage.json',f.coverage);
  assert.equal((await releaseGate(f.root,{now:new Date(DATE)})).passed,true);
  report=await releaseGate(f.root,{now:new Date('2026-11-01T12:00:00Z')});assert.equal(report.passed,false);assert.ok(report.errors.some(x=>x.includes('older')));
  await f.write('config/sources.json',[{id:'example',enabled:true,publication:'open'}]);report=await releaseGate(f.root,{now:new Date(DATE)});assert.ok(report.errors.some(x=>x.includes('licence evidence')));
});
function request(port,url,options={}) {return new Promise((resolve,reject)=>{const req=http.request({host:'127.0.0.1',port,path:url,...options},response=>{const chunks=[];response.on('data',x=>chunks.push(x));response.on('end',()=>resolve({status:response.statusCode,headers:response.headers,body:Buffer.concat(chunks)}));});req.on('error',reject);req.end();});}
test('server isolates public files, blocks traversal/methods/symlinks, supports HEAD and caching',async t=>{
  const f=await fixture(t);await f.write('app.js','/* '+ 'a'.repeat(2000)+' */');await buildPublic(f.root);
  const server=await createPublicServer(path.join(f.root,'dist'));await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));const port=server.address().port;
  for(const url of ['/config/publication.json','/build-manifest.json','/_headers','/../config/publication.json','/%2e%2e/config/publication.json','/%252e%252e/config/publication.json','/data%5c..%5csecret.txt','/%00']) {const r=await request(port,url);assert.ok([400,404].includes(r.status),`${url}: ${r.status}`);}
  assert.equal((await request(port,'/',{method:'POST'})).status,405);
  const home=await request(port,'/');assert.equal(home.status,200);assert.match(home.headers['content-security-policy'],/frame-ancestors 'none'/);assert.equal(home.headers['cache-control'],'no-cache');
  const head=await request(port,'/',{method:'HEAD'});assert.equal(head.status,200);assert.equal(head.body.length,0);
  assert.equal((await request(port,'/',{headers:{'If-None-Match':home.headers.etag}})).status,304);
  const gzip=await request(port,'/app.js',{headers:{'Accept-Encoding':'gzip'}});assert.equal(gzip.headers['content-encoding'],'gzip');assert.match(gunzipSync(gzip.body).toString(),/aaa/);
  assert.equal((await request(port,'/app.js',{headers:{'Accept-Encoding':'gzip;q=0'}})).headers['content-encoding'],undefined);
  const index=await request(port,'/'+f.catalog.basePath+f.source.indexFile);assert.match(index.headers['cache-control'],/immutable/);
  await fs.rm(path.join(f.root,'dist/app.js'));await fs.symlink(path.join(f.root,'app.js'),path.join(f.root,'dist/app.js'));assert.equal((await request(port,'/app.js')).status,500);
});

test('beta readiness requires honest coverage and never authorizes deployment', async t => {
  const f = await fixture(t);
  f.source.province = 'AB'; f.source.publisher = 'Example regulator'; f.source.license = 'Open licence'; f.source.limitations = 'Partial inventory.';
  f.coverage.nationalComplete = false;
  for (const code of ['YT','NT','NU']) f.coverage.provinces.push({code, topics: structuredClone(f.coverage.provinces[0].topics)});
  for (const row of f.coverage.provinces) for (const item of Object.values(row.topics)) item.note = 'Partial or missing source coverage.';
  await f.write('data/catalog.json', f.catalog); await f.write('data/national-coverage.json', f.coverage);
  let report = await betaReadiness(f.root, {now:new Date(DATE)});
  assert.equal(report.technicalReady, true); assert.equal(report.launchAuthorized, false);
  assert.equal((await releaseGate(f.root, {now:new Date(DATE)})).passed, false);
  f.coverage.provinces.find(row => row.code === 'AB').topics['well-inventory'].sourceIds = [];
  await f.write('data/national-coverage.json', f.coverage);
  report = await betaReadiness(f.root, {now:new Date(DATE)}); assert.equal(report.technicalReady, false); assert.ok(report.errors.some(x=>x.includes('absent')));
});

test('only bounded reviewed source exclusions may reconcile a larger raw source count', async t => {
  const f = await fixture(t);
  f.source.sourceCount = 2; f.source.droppedRecords = 1;
  f.source.excludedRecords = [{sourceRecordId:'126',reason:'Empty placeholder'}];
  await f.write('data/catalog.json', f.catalog);
  await assert.rejects(validateRelease(f.root), /Unreviewed exclusions/);
  await f.write('config/sources.json',[{id:'example',enabled:true,publication:'open',reviewedExclusion:{maximumCount:1,sourceRecordIds:['126'],reason:'Empty placeholder'}}]);
  await validateRelease(f.root);
  f.source.excludedRecords[0].sourceRecordId = '127'; await f.write('data/catalog.json', f.catalog);
  await assert.rejects(validateRelease(f.root), /Unreviewed exclusions/);
});

test('approved beta gate retains honest scope, freshness and the national gate',async t=>{
  const f=await fixture(t);
  f.config.owner='the-prairie';f.config.requireNationalCompleteness=true;
  f.coverage.nationalComplete=false;
  f.catalog.nationalComplete=false;
  f.coverage.provinces=['AB','BC','SK','MB','ON','QC','NB','NS','PE','NL','YT','NT','NU'].map(code=>({code,topics:Object.fromEntries(['well-inventory','orphan-status','abandonment-status','infrastructure','carrier-rates','government-charges'].map(topic=>[topic,{status:code==='AB'?'partial':'unavailable',note:'Coverage is incomplete',sourceIds:code==='AB'?['example']:[]}]))}));
  f.source.province='AB';f.source.publisher='Authority';f.source.license='Open licence';f.source.limitations='Partial inventory';
  await f.write('data/catalog.json',f.catalog);await f.write('data/national-coverage.json',f.coverage);
  await f.write('config/sources.json',[{id:'example',enabled:true,publication:'open',licenseUrl:'https://example.org/licence'}]);
  await f.write('config/publication.json',f.config);
  assert.equal((await betaReleaseGate(f.root,{now:new Date(DATE)})).passed,false);
  f.config.publicLaunchEnabled=true;f.config.releaseScope='public-beta';f.config.betaApproval={owner:'the-prairie',approvedAt:DATE,scope:'incomplete-national-coverage',repositoryVisibility:'public'};
  await f.write('config/publication.json',f.config);
  assert.equal((await betaReleaseGate(f.root,{now:new Date(DATE)})).passed,true);
  assert.equal((await releaseGate(f.root,{now:new Date(DATE)})).passed,false);
  assert.equal((await betaReleaseGate(f.root,{now:new Date('2027-01-01')})).passed,false);
  f.coverage.nationalComplete=true;await f.write('data/national-coverage.json',f.coverage);
  assert.equal((await betaReleaseGate(f.root,{now:new Date(DATE)})).passed,false);
});

test('faithful source downloads preserve publisher bytes and reject altered application copies', async t => {
  const f = await fixture(t);
  const definition = {id:'example',enabled:true,publication:'noncommercial',faithfulReproduction:true,objectIdField:'OBJECTID',stableIdField:'Well_ID',itemOwner:'publisher',serviceUrl:'https://example.org/FeatureServer',itemId:'item',itemLicenceSha256:sha256('As-is public data'),coordinateBounds:[-67,43,-59,48]};
  Object.assign(f.source, definition, {sourceObservationDate:'2026-10-13'});
  const attributes = {OBJECTID:1,Well_ID:'A1',Spud_Month:'Febuary',Status:'Plugged and Abandoned'};
  const native = {geometryType:'esriGeometryPoint',spatialReference:{wkid:26920},features:[{attributes,geometry:{x:400000,y:5000000}}]};
  const display = {...native,spatialReference:{wkid:4326},features:[{attributes,geometry:{x:-63.123456789,y:45.3456789}}]};
  const payloads = {'publisher-native.json':native,'publisher-wgs84.json':display,'publisher-layer.json':{},'publisher-item.json':{owner:'publisher',url:definition.serviceUrl,licenseInfo:'As-is public data'},'publisher-service.json':{serviceItemId:'item'},'publisher-ids.json':{objectIds:[1]},'publisher-count.json':{count:1},'publisher-final-ids.json':{objectIds:[1]}};
  const bytes = new Map();
  f.source.reproductions=[];
  for(const [name,value] of Object.entries(payloads)) {
    const raw=JSON.stringify(value,null,3)+'\n';bytes.set(name,raw);
    const file='example/'+name;
    f.source.reproductions.push({file,url:'https://example.org/'+name,sha256:sha256(raw),bytes:Buffer.byteLength(raw)});
    await f.write(f.catalog.basePath+file,raw);
  }
  const details=[{id:'example-1',sourceId:'example',sourceRecordId:'1',province:'NS',lon:-63.123457,lat:45.345679,raw:attributes}];
  f.source.detailFiles[0].sha256=sha256(JSON.stringify(details));
  await f.write(f.catalog.basePath+f.source.detailFiles[0].file,details);
  await f.write('config/sources.json',[definition]);await f.write('data/catalog.json',f.catalog);
  await buildPublic(f.root);
  for(const [name,raw] of bytes) assert.equal(await fs.readFile(path.join(f.root,'dist',f.catalog.basePath,'example',name),'utf8'),raw);
  details[0].raw={...attributes,Spud_Month:'February'};
  f.source.detailFiles[0].sha256=sha256(JSON.stringify(details));
  await f.write(f.catalog.basePath+f.source.detailFiles[0].file,details);await f.write('data/catalog.json',f.catalog);
  await assert.rejects(validateRelease(f.root),/Application attributes differ/);
  details[0].raw=attributes;details[0].lon=0;f.source.detailFiles[0].sha256=sha256(JSON.stringify(details));
  await f.write(f.catalog.basePath+f.source.detailFiles[0].file,details);await f.write('data/catalog.json',f.catalog);
  await assert.rejects(validateRelease(f.root),/source envelope/);
  details[0].lon=-63.123457;f.source.detailFiles[0].sha256=sha256(JSON.stringify(details));
  await f.write(f.catalog.basePath+f.source.detailFiles[0].file,details);
  f.source.reproductions=f.source.reproductions.filter(entry=>!entry.file.endsWith('publisher-native.json'));await f.write('data/catalog.json',f.catalog);
  await assert.rejects(validateRelease(f.root),/Missing original publisher/);
});
