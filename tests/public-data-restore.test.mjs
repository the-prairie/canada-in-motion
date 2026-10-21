import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {restorePublicData} from '../scripts/restore-public-data.mjs';

const releaseId='0123456789abcdef0123';
const retrievedAt='2026-10-20T12:34:56Z';
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
async function fixture(t){
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'public-data-restore-'));
  t.after(()=>fs.rm(directory,{recursive:true,force:true}));
  const artifact=path.join(directory,'artifact'),root=path.join(directory,'checkout');
  await fs.mkdir(path.join(root,'data'),{recursive:true});
  await fs.writeFile(path.join(root,'data/previous.json'),'previous snapshot');
  await fs.writeFile(path.join(root,'index.html'),'new application');
  const files={'data/catalog.json':JSON.stringify({releaseId,retrievedAt}),'data/value.json':JSON.stringify({retrievedAt,value:42}),'health.json':JSON.stringify({releaseId,status:'public-beta'}),'index.html':'previous application'};
  const manifest={schemaVersion:1,releaseId,files:[]};
  for(const [file,content] of Object.entries(files)){
    await fs.mkdir(path.dirname(path.join(artifact,file)),{recursive:true});
    await fs.writeFile(path.join(artifact,file),content);
    manifest.files.push({path:file,sha256:sha256(content),size:Buffer.byteLength(content)});
  }
  const save=()=>fs.writeFile(path.join(artifact,'build-manifest.json'),JSON.stringify(manifest));
  await save();return {directory,artifact,root,files,manifest,save};
}
const restore=f=>restorePublicData(f.artifact,f.root,{requiredData:['data/value.json']});
async function unchanged(f){
  assert.equal(await fs.readFile(path.join(f.root,'data/previous.json'),'utf8'),'previous snapshot');
  assert.equal(await fs.readFile(path.join(f.root,'index.html'),'utf8'),'new application');
  assert.deepEqual(await fs.readdir(path.join(f.root,'data')),['previous.json']);
}
test('restore replaces data atomically with exact bytes and original retrieval date, preserving current application',async t=>{
  const f=await fixture(t);const result=await restore(f);
  assert.deepEqual(result,{releaseId,files:2,retrievedAt});
  for(const name of ['data/catalog.json','data/value.json'])assert.equal(await fs.readFile(path.join(f.root,name),'utf8'),f.files[name]);
  assert.deepEqual((await fs.readdir(path.join(f.root,'data'))).sort(),['catalog.json','value.json']);
  assert.equal(await fs.readFile(path.join(f.root,'index.html'),'utf8'),'new application');
});
test('restore rejects unsafe paths and duplicate entries without changing checkout',async t=>{
  for(const bad of ['../escape.json','/absolute.json','data/../escape.json','data//value.json','data/./value.json','data\\escape.json','data/%2e%2e/escape.json','data/.hidden.json','data/catalog.json']){
    await t.test(bad,async t=>{const f=await fixture(t);f.manifest.files[1].path=bad;await f.save();await assert.rejects(restore(f));await unchanged(f);});
  }
});
test('restore rejects bad hashes, byte counts and missing files before modifying checkout',async t=>{
  for(const kind of ['hash','size','missing','missing-required'])await t.test(kind,async t=>{
    const f=await fixture(t);
    if(kind==='hash')f.manifest.files[1].sha256='0'.repeat(64);
    if(kind==='size')f.manifest.files[1].size++;
    if(kind.startsWith('missing'))await fs.unlink(path.join(f.artifact,'data/value.json'));
    if(kind==='missing-required')f.manifest.files.splice(1,1);
    await f.save();await assert.rejects(restore(f));await unchanged(f);
  });
});
test('restore rejects unlisted artifact data and source symlinks',async t=>{
  for(const kind of ['unlisted','symlink'])await t.test(kind,async t=>{
    const f=await fixture(t);
    if(kind==='unlisted')await fs.writeFile(path.join(f.artifact,'data/unlisted.json'),'{}');
    else {await fs.rename(path.join(f.artifact,'data/value.json'),path.join(f.directory,'outside.json'));await fs.symlink(path.join(f.directory,'outside.json'),path.join(f.artifact,'data/value.json'));}
    await assert.rejects(restore(f));await unchanged(f);
  });
});
test('restore rejects a symbolic-link destination without modifying its target',async t=>{
  const f=await fixture(t);const outside=path.join(f.directory,'outside');
  await fs.rename(path.join(f.root,'data'),outside);await fs.symlink(outside,path.join(f.root,'data'));
  await assert.rejects(restore(f),/Destination data/);await unchanged(f);
});
test('restore requires consistent public beta release identity',async t=>{
  for(const kind of ['identity','candidate'])await t.test(kind,async t=>{
    const f=await fixture(t);
    if(kind==='identity')f.manifest.releaseId='f'.repeat(20);
    else {const entry=f.manifest.files.find(file=>file.path==='health.json');const value=JSON.stringify({releaseId,status:'candidate'});await fs.writeFile(path.join(f.artifact,entry.path),value);entry.sha256=sha256(value);entry.size=Buffer.byteLength(value);}
    await f.save();await assert.rejects(restore(f),/matching public beta release/);await unchanged(f);
  });
});
test('restore rolls back the prior data if installing the staged directory fails',async t=>{
  const f=await fixture(t),rename=fs.rename;let failInstall=true;
  fs.rename=async(source,destination)=>{
    if(failInstall&&source.includes('.public-data-')&&source.endsWith('/data')){failInstall=false;throw new Error('Injected installation failure');}
    return rename(source,destination);
  };
  try{await assert.rejects(restore(f),/Injected installation failure/);await unchanged(f);}
  finally{fs.rename=rename;}
});
