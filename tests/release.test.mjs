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
