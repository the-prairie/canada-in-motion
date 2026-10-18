import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export const PUBLIC_FILES = ['index.html','app.js','map.js','model.mjs','data-store.mjs','style.css', 'vendor/leaflet.js','vendor/leaflet.css','vendor/supercluster.js', 'vendor/fonts/ibm-plex-sans-400.ttf','vendor/fonts/ibm-plex-sans-500.ttf','vendor/fonts/ibm-plex-sans-600.ttf','vendor/fonts/ibm-plex-mono-400.ttf','vendor/fonts/ibm-plex-mono-500.ttf', 'data/network.json','data/tariffs.json','data/tariff-sources.json','data/countries.geojson','data/provinces.geojson','data/national-coverage.json'];
export function safeRelative(value) {
  if (typeof value !== 'string' || !value || value.includes('\\') || value.includes('%') || value.includes('\0') || path.posix.isAbsolute(value) || value.split('/').some(x => !x || x === '.' || x === '..' || x.startsWith('.')) || !/^[A-Za-z0-9_./-]+$/.test(value)) throw new Error(`Unsafe release path: ${value}`);
  return value;
}
export async function safeRead(root, relative) {
  safeRelative(relative);
  const base = await fs.realpath(root);
  let current = base;
  for (const part of relative.split('/')) {
    current = path.join(current, part);
    if ((await fs.lstat(current)).isSymbolicLink()) throw new Error(`Symbolic links forbidden: ${relative}`);
  }
  const resolved = await fs.realpath(current);
  if (!resolved.startsWith(base + path.sep) || !(await fs.stat(resolved)).isFile()) throw new Error(`Not an allowed file: ${relative}`);
  return fs.readFile(resolved);
}
export async function readJSON(root, file) { return JSON.parse(await safeRead(root, file)); }
const assert = (condition, message) => { if (!condition) throw new Error(message); };
export async function validateRelease(root = ROOT) {
  const config = await readJSON(root, 'config/publication.json');
  const registry = await readJSON(root, 'config/sources.json');
  const catalog = await readJSON(root, 'data/catalog.json');
  assert(catalog.schemaVersion === 2 && /^[a-f0-9]{20,64}$/.test(catalog.releaseId), 'Invalid catalog version or release ID');
  assert(catalog.basePath === `data/releases/${catalog.releaseId}/`, 'Catalog release directory mismatch');
  assert(catalog.purpose === config.purpose, 'Publication purpose mismatch');
  assert(Array.isArray(catalog.sources) && catalog.sources.length > 0, 'Catalog has no sources');
  const files = new Set(['data/catalog.json']);
  const ids = new Set();
  let total = 0;
  for (const source of catalog.sources) {
    assert(!ids.has(source.id), 'Duplicate source'); ids.add(source.id);
    const definition = registry.find(item => item.id === source.id);
    assert(definition?.enabled && ['open','noncommercial'].includes(definition.publication) && source.publication === definition.publication, `Unapproved publication rights: ${source.id}`);
    assert(source.publication !== 'noncommercial' || config.purpose === 'noncommercial', `Noncommercial source in commercial build: ${source.id}`);
    assert(source.enumerationVerified === true && source.droppedRecords === 0 && Number.isSafeInteger(source.count) && source.count > 0 && source.sourceCount === source.count, `Incomplete source enumeration: ${source.id}`);
    assert(Number.isFinite(Date.parse(source.retrievedAt)), `Missing retrieval date: ${source.id}`);
    assert(Array.isArray(source.detailFiles) && source.detailFiles.length > 0, `Missing detail checksums: ${source.id}`);
    const readVerified = async (file, digest) => {
      safeRelative(file);
      assert(file.startsWith(source.id + '/') && file.endsWith('.json'), `Source path mismatch: ${file}`);
      assert(/^[a-f0-9]{64}$/.test(digest), `Missing SHA256: ${file}`);
      const full = catalog.basePath + file;
      const bytes = await safeRead(root, full);
      assert(sha256(bytes) === digest, `Checksum mismatch: ${file}`);
      files.add(full);
      return JSON.parse(bytes);
    };
    const index = await readVerified(source.indexFile, source.indexSha256);
    assert(Array.isArray(index.fields) && Array.isArray(index.rows) && index.rows.length === source.count, `Index count mismatch: ${source.id}`);
    const columns = Object.fromEntries(index.fields.map((name, position) => [name, position]));
    for (const field of ['id','sourceId','detailFile']) assert(Number.isInteger(columns[field]), `Missing index field: ${field}`);
    const details = new Map();
    const records = new Map();
    for (const shard of source.detailFiles) {
      assert(!details.has(shard.file), `Duplicate detail file: ${shard.file}`);
      const rows = await readVerified(shard.file, shard.sha256);
      assert(Array.isArray(rows) && rows.length === shard.count, `Detail count mismatch: ${shard.file}`);
      details.set(shard.file, rows.length);
      for (const row of rows) {
        assert(typeof row.id === 'string' && row.sourceId === source.id && !records.has(row.id), `Invalid or duplicate detail ID: ${shard.file}`);
        records.set(row.id, shard.file);
      }
    }
    assert(records.size === source.count, `Detail total mismatch: ${source.id}`);
    const rowIDs = new Set();
    for (const row of index.rows) {
      const id = row[columns.id], file = row[columns.detailFile];
      assert(Array.isArray(row) && row.length === index.fields.length && !rowIDs.has(id) && row[columns.sourceId] === source.id && details.has(file) && records.get(id) === file, `Broken index reference: ${source.id}`);
      rowIDs.add(id);
    }
    total += source.count;
  }
  assert(total === catalog.totalRecords, 'Catalog total mismatch');
  return { config, catalog, registry, files: [...files].sort() };
}
export async function buildPublic(root = ROOT) {
  const { catalog, files } = await validateRelease(root);
  const stage = await fs.mkdtemp(path.join(root, '.public-build-'));
  try {
    const vendorExtras = [];
    for (const folder of ['vendor','vendor/fonts']) {
      for (const entry of await fs.readdir(path.join(root, folder))) if (/^(?:(?:[A-Za-z0-9_-]+-)?LICENSE(?:-[A-Za-z0-9_-]+)?|OFL|NOTICE)(?:\.(?:txt|md))?$/i.test(entry)) vendorExtras.push(`${folder}/${entry}`);
    }
    assert(vendorExtras.some(file => file.startsWith('vendor/fonts/')), 'Font licence notice missing');
    assert(vendorExtras.some(file => !file.startsWith('vendor/fonts/')), 'Vendor licence notices missing');
    const output = new Map();
    for (const file of [...new Set([...PUBLIC_FILES, ...vendorExtras, ...files])].sort()) {
      let bytes = await safeRead(root, file);
      if (file === 'index.html') {
        let html = bytes.toString();
        assert(!/http-equiv=["']Content-Security-Policy/i.test(html), 'Source HTML already has CSP; review before build');
        html = html.replace('<head>', `<head>\n    <meta http-equiv="Content-Security-Policy" content="${CSP.replace("; frame-ancestors 'none'", '')}">\n    <meta name="referrer" content="no-referrer">`);
        bytes = Buffer.from(html);
      }
      output.set(file, bytes);
    }
    output.set('health.json', Buffer.from(JSON.stringify({status:'candidate',releaseId:catalog.releaseId,records:catalog.totalRecords,retrievedAt:catalog.retrievedAt,builtAt:new Date().toISOString(),nationalComplete:catalog.nationalComplete === true})));
    output.set('robots.txt', Buffer.from('User-agent: *\nAllow: /\n'));
    output.set('_headers', Buffer.from(`/*\n  Content-Security-Policy: ${CSP}\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: no-referrer\n  X-Frame-Options: DENY\n  Permissions-Policy: camera=(), microphone=(), geolocation=()\n  Cache-Control: no-cache\n/data/releases/*\n  Cache-Control: public, max-age=31536000, immutable\n`));
    const manifest = {schemaVersion:1,releaseId:catalog.releaseId,files:[]};
    for (const [file, bytes] of output) {
      await fs.mkdir(path.dirname(path.join(stage,file)),{recursive:true});
      await fs.writeFile(path.join(stage,file),bytes);
      manifest.files.push({path:file,sha256:sha256(bytes),size:bytes.length});
    }
    await fs.writeFile(path.join(stage,'build-manifest.json'), JSON.stringify(manifest));
    const dist = path.join(root,'dist');
    const backup = path.join(root,'.dist-previous');
    await fs.rm(backup,{recursive:true,force:true});
    try { await fs.rename(dist,backup); } catch (error) { if(error.code !== 'ENOENT') throw error; }
    try { await fs.rename(stage,dist); } catch(error) { await fs.rename(backup,dist).catch(()=>{}); throw error; }
    await fs.rm(backup,{recursive:true,force:true});
    return {files:manifest.files.length,records:catalog.totalRecords,releaseId:catalog.releaseId,directory:dist};
  } finally { await fs.rm(stage,{recursive:true,force:true}); }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  buildPublic(process.argv[2] ? path.resolve(process.argv[2]) : ROOT).then(result=>console.log(JSON.stringify(result,null,2))).catch(error=>{console.error(error.message);process.exitCode=1;});
}
