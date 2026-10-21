import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {PUBLIC_FILES,safeRead} from './build-public.mjs';

const assert=(condition,message)=>{if(!condition)throw Error(message);};
const safePath=value=>typeof value==='string'&&/^[A-Za-z0-9_./-]+$/.test(value)&&!value.startsWith('/')&&value.split('/').every(part=>part&&part!=='.'&&part!=='..');
export async function restorePublicData(artifact,root,{requiredData=PUBLIC_FILES.filter(file=>file.startsWith('data/'))}={}) {
  const manifest=JSON.parse(await safeRead(artifact,'build-manifest.json'));
  assert(manifest.schemaVersion===1&&/^[a-f0-9]{20,64}$/.test(manifest.releaseId)&&Array.isArray(manifest.files),'Invalid public artifact manifest');
  const verified=new Map();
  for(const entry of manifest.files){
    assert(safePath(entry.path)&&!verified.has(entry.path),'Unsafe or duplicate artifact path');
    assert(/^[a-f0-9]{64}$/.test(entry.sha256)&&Number.isSafeInteger(entry.size)&&entry.size>=0,'Invalid artifact checksum or size');
    const bytes=await safeRead(artifact,entry.path);
    assert(bytes.length===entry.size&&createHash('sha256').update(bytes).digest('hex')===entry.sha256,`Artifact integrity failed: ${entry.path}`);
    verified.set(entry.path,bytes);
  }
  async function checkDataTree(relative) {
    for(const entry of await fs.readdir(path.join(artifact,relative),{withFileTypes:true})){
      const file=`${relative}/${entry.name}`;
      assert(safePath(file)&&!entry.isSymbolicLink(),'Unsafe artifact data tree');
      if(entry.isDirectory())await checkDataTree(file);
      else assert(entry.isFile()&&verified.has(file),`Unlisted artifact data: ${file}`);
    }
  }
  await checkDataTree('data');
  assert(requiredData.every(file=>verified.has(file)),'Artifact lacks a required public data file');
  const catalog=JSON.parse(verified.get('data/catalog.json')||'null');
  const health=JSON.parse(verified.get('health.json')||'null');
  assert(catalog?.releaseId===manifest.releaseId&&health?.releaseId===manifest.releaseId&&health.status==='public-beta','Artifact is not a matching public beta release');
  const data=[...verified].filter(([file])=>file.startsWith('data/'));
  const base=await fs.realpath(root);
  const destination=path.join(base,'data');
  let exists=false;
  try{const info=await fs.lstat(destination);assert(info.isDirectory()&&!info.isSymbolicLink(),'Destination data must be a real directory');exists=true;}catch(error){if(error.code!=='ENOENT')throw error;}
  const stage=await fs.mkdtemp(path.join(base,'.public-data-'));
  let moved=false,installed=false;
  try {
    for(const [file,bytes] of data){const target=path.join(stage,file);await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,bytes);}
    if(exists){await fs.rename(destination,path.join(stage,'previous'));moved=true;}
    await fs.rename(path.join(stage,'data'),destination);installed=true;
  } catch(error) {
    if(moved&&!installed){await fs.rename(path.join(stage,'previous'),destination);moved=false;}
    throw error;
  } finally {
    if(!moved||installed)await fs.rm(stage,{recursive:true,force:true});
  }
  return {releaseId:manifest.releaseId,files:data.length,retrievedAt:catalog.retrievedAt};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const [artifact,root]=process.argv.slice(2);
  if(!artifact||!root)throw Error('Usage: restore-public-data.mjs ARTIFACT_DIRECTORY CHECKOUT');
  console.log(JSON.stringify(await restorePublicData(artifact,root)));
}
