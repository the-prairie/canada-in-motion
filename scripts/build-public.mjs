import {validateProvincialForecast, validateProvincialOutlooks} from '../provincial-forecast-model.mjs';
import {validateIncomePaths} from '../income-path-model.mjs';
import {validateDynamicPriceHistory} from '../dynamic-price-model.mjs';
import {validateAlbertaWellStatus} from '../alberta-status-model.mjs';
import {validateEnergyFlows} from '../energy-flow-model.mjs';
import {validateProvincialImpacts} from '../provincial-impact-model.mjs';
import { validateEconomy } from '../economy-model.mjs';
import { BC_FILES, validateBC } from './bc-validation.mjs';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
export const CONTEXT_FILES = ['historical-infrastructure.geojson','benchmark-tolls.json','pipeline-attributes.json'];

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
export function publicAIConfig(value) {
  assert(value && Object.keys(value).length===1 && Object.hasOwn(value,'apiOrigin'), 'Invalid public AI configuration');
  if(value.apiOrigin===null)return value;
  const url=new URL(value.apiOrigin);
  assert(url.protocol==='https:' && url.origin===value.apiOrigin && !url.username && !url.password, 'AI service must be an exact HTTPS origin');
  return {apiOrigin:url.origin};
}
export function cspForAI(config) {
  if(!config.apiOrigin)return CSP;
  return CSP.replace("script-src 'self'", "script-src 'self' https://challenges.cloudflare.com").replace("connect-src 'self'",`connect-src 'self' ${config.apiOrigin} https://challenges.cloudflare.com`)+"; frame-src https://challenges.cloudflare.com";
}
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export const PUBLIC_FILES = ['data/provincial-forecasts.json','data/provincial-outlook-benchmarks.json','provincial-forecast-model.mjs','data/income-paths.json','income-path-model.mjs','data/dynamic-price-history.json','dynamic-price-model.mjs','ai-client.mjs','energy-economy.js','energy-economy.css','energy-workspace.css','energy-story.css','vendor/energy-workspace.js','economy-model.mjs','data/economy.json','data/energy-debate.json','data/energy-flows.json','data/provincial-impacts.json','data/alberta-well-status.json','alberta-status-model.mjs','energy-flow-model.mjs','provincial-impact-model.mjs','trade-workspace-model.mjs','index.html','app.js','record-atlas.js','record-atlas.css','atlas-model.mjs','map.js','model.mjs','data-store.mjs','insights.mjs','style.css','design.css', 'vendor/leaflet.js','vendor/leaflet.css','vendor/supercluster.js', 'vendor/fonts/ibm-plex-sans-400.ttf','vendor/fonts/ibm-plex-sans-500.ttf','vendor/fonts/ibm-plex-sans-600.ttf','vendor/fonts/ibm-plex-mono-400.ttf','vendor/fonts/ibm-plex-mono-500.ttf', 'data/network.json','data/tariffs.json','data/tariff-sources.json','data/countries.geojson','data/provinces.geojson','data/national-coverage.json', 'data/context/manifest.json', ...CONTEXT_FILES.map(name => 'data/context/'+name)];
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
export async function validateReproductions(source, definition, readVerified, records) {
  const enabled = definition.faithfulReproduction || definition.preservePublisherResponses;
  const entries = source.reproductions || [];
  assert(Array.isArray(entries), `Invalid publisher reproductions: ${source.id}`);
  if (!enabled) { assert(entries.length === 0, `Unapproved publisher reproductions: ${source.id}`); return; }
  const payloads = new Map();
  for (const entry of entries) {
    const name = entry.file?.slice(source.id.length + 1);
    assert(/^publisher-(?:native|wgs84|layer|item|service|ids|count|final-ids|batch-\d{4})\.json$/.test(name) && !payloads.has(name), `Unexpected or duplicate publisher response: ${entry.file}`);
    assert(/^https:\/\//.test(entry.url || '') && Number.isSafeInteger(entry.bytes) && entry.bytes > 0, `Missing publisher response provenance: ${entry.file}`);
    payloads.set(name, await readVerified(entry.file, entry.sha256, entry.bytes));
  }
  const required = ['publisher-layer.json','publisher-ids.json','publisher-count.json','publisher-final-ids.json'];
  if (definition.faithfulReproduction) required.push('publisher-native.json','publisher-wgs84.json','publisher-item.json','publisher-service.json');
  assert(required.every(name => payloads.has(name)), `Missing original publisher responses: ${source.id}`);
  const ids = payloads.get('publisher-ids.json').objectIds;
  const finalIds = payloads.get('publisher-final-ids.json').objectIds;
  assert(Array.isArray(ids) && new Set(ids).size === source.count && ids.length === source.count && payloads.get('publisher-count.json').count === source.count && Array.isArray(finalIds) && isDeepStrictEqual([...ids].sort(), [...finalIds].sort()), `Publisher enumeration mismatch: ${source.id}`);
  let batches;
  if (definition.faithfulReproduction) {
    const item = payloads.get('publisher-item.json');
    assert(item.owner === definition.itemOwner && item.url === definition.serviceUrl && sha256(item.licenseInfo || '') === definition.itemLicenceSha256, `Publisher identity or terms changed: ${source.id}`);
    assert(payloads.get('publisher-service.json').serviceItemId === definition.itemId, `Publisher service identity mismatch: ${source.id}`);
    assert(/^\d{4}-\d{2}-\d{2}$/.test(source.sourceObservationDate || '') && Number.isFinite(Date.parse(source.sourceObservationDate)), `Publisher observation date missing: ${source.id}`);
    const native = payloads.get('publisher-native.json');
    const display = payloads.get('publisher-wgs84.json');
    assert(native.geometryType === 'esriGeometryPoint' && !native.exceededTransferLimit && native.features?.length === source.count, `Invalid native publisher response: ${source.id}`);
    const attributes = features => new Map(features.map(f => [f.attributes[definition.objectIdField], f.attributes]));
    assert(isDeepStrictEqual(attributes(native.features), attributes(display.features || [])), `Publisher projections disagree: ${source.id}`);
    batches = [display];
  } else {
    batches = [...payloads].filter(([name]) => name.startsWith('publisher-batch-')).map(([,value]) => value);
  }
  assert(batches.length > 0 && batches.every(p => p.geometryType === 'esriGeometryPoint' && p.spatialReference?.wkid === 4326 && !p.exceededTransferLimit && Array.isArray(p.features)), `Invalid publisher map geometry: ${source.id}`);
  const features = batches.flatMap(p => p.features);
  const sourceIDs = features.map(f => f.attributes?.[definition.objectIdField]);
  assert(features.length === source.count && isDeepStrictEqual([...sourceIDs].sort(), [...ids].sort()), `Publisher feature IDs mismatch: ${source.id}`);
  const raw = new Map(features.map(f => [String(f.attributes[definition.objectIdField]), f]));
  const stableIDs = features.map(f => f.attributes?.[definition.stableIdField]);
  assert(stableIDs.every(id => id !== null && id !== undefined && String(id).trim()) && new Set(stableIDs).size === source.count, `Publisher stable IDs invalid: ${source.id}`);
  for (const row of records) {
    const original = raw.get(row.sourceRecordId);
    assert(original && isDeepStrictEqual(original.attributes, row.raw), `Application attributes differ from publisher: ${source.id}`);
    assert(Math.abs(original.geometry.x - row.lon) <= 0.00000051 && Math.abs(original.geometry.y - row.lat) <= 0.00000051, `Application location differs from publisher: ${source.id}`);
    if (definition.attributeFilter) assert(definition.attributeFilter.values.includes(original.attributes[definition.attributeFilter.field]), `Publisher record outside declared filter: ${source.id}`);
  }
}
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
    const exclusions = source.excludedRecords || [];
    const rule = definition.reviewedExclusion;
    assert(Array.isArray(exclusions) && source.droppedRecords === exclusions.length, `Unaccounted exclusions: ${source.id}`);
    if (exclusions.length) {
      assert(rule && exclusions.length <= rule.maximumCount && new Set(exclusions.map(row => row.sourceRecordId)).size === exclusions.length && exclusions.every(row => rule.sourceRecordIds.includes(row.sourceRecordId) && row.reason === rule.reason), `Unreviewed exclusions: ${source.id}`);
    }
    assert(source.enumerationVerified === true && Number.isSafeInteger(source.count) && source.count > 0 && source.sourceCount === source.count + exclusions.length, `Incomplete source enumeration: ${source.id}`);
    assert(Number.isFinite(Date.parse(source.retrievedAt)), `Missing retrieval date: ${source.id}`);
    assert(Array.isArray(source.detailFiles) && source.detailFiles.length > 0, `Missing detail checksums: ${source.id}`);
    const readVerified = async (file, digest, expectedBytes) => {
      safeRelative(file);
      assert(file.startsWith(source.id + '/') && file.endsWith('.json'), `Source path mismatch: ${file}`);
      assert(/^[a-f0-9]{64}$/.test(digest), `Missing SHA256: ${file}`);
      const full = catalog.basePath + file;
      const bytes = await safeRead(root, full);
      assert(sha256(bytes) === digest, `Checksum mismatch: ${file}`);
      if (expectedBytes !== undefined) assert(bytes.length === expectedBytes, `Publisher byte count mismatch: ${file}`);
      files.add(full);
      return JSON.parse(bytes);
    };
    const index = await readVerified(source.indexFile, source.indexSha256);
    assert(Array.isArray(index.fields) && Array.isArray(index.rows) && index.rows.length === source.count, `Index count mismatch: ${source.id}`);
    const columns = Object.fromEntries(index.fields.map((name, position) => [name, position]));
    for (const field of ['id','sourceId','detailFile']) assert(Number.isInteger(columns[field]), `Missing index field: ${field}`);
    const details = new Map();
    const records = new Map();
    const recordValues = [];
    for (const shard of source.detailFiles) {
      assert(!details.has(shard.file), `Duplicate detail file: ${shard.file}`);
      const rows = await readVerified(shard.file, shard.sha256);
      assert(Array.isArray(rows) && rows.length === shard.count, `Detail count mismatch: ${shard.file}`);
      details.set(shard.file, rows.length);
      for (const row of rows) {
        assert(typeof row.id === 'string' && row.sourceId === source.id && !records.has(row.id), `Invalid or duplicate detail ID: ${shard.file}`);
        if (definition.coordinateBounds) {
          const [west,south,east,north] = definition.coordinateBounds;
          assert(Number.isFinite(row.lon) && Number.isFinite(row.lat) && row.lon >= west && row.lon <= east && row.lat >= south && row.lat <= north, `Detail coordinates outside declared source envelope: ${source.id}`);
        }
        records.set(row.id, shard.file);
        if (definition.faithfulReproduction || definition.preservePublisherResponses) recordValues.push(row);
      }
    }
    assert(records.size === source.count, `Detail total mismatch: ${source.id}`);
    await validateReproductions(source, definition, readVerified, recordValues);
    const rowIDs = new Set();
    for (const row of index.rows) {
      const id = row[columns.id], file = row[columns.detailFile];
      assert(Array.isArray(row) && row.length === index.fields.length && !rowIDs.has(id) && row[columns.sourceId] === source.id && details.has(file) && records.get(id) === file, `Broken index reference: ${source.id}`);
      rowIDs.add(id);
    }
    total += source.count;
  }
  assert(total === catalog.totalRecords, 'Catalog total mismatch');
  assert(registry.filter(source => source.enabled && ['open','noncommercial'].includes(source.publication)).every(source => ids.has(source.id)), 'Catalog omits an enabled permitted source');
  const context = await validateContext(root);
  const bc = config.bcInfrastructureEnabled ? await validateBC(root, {readJSON,safeRead,sha256}) : null;
  if (bc) for (const name of [...BC_FILES, "manifest.json"]) files.add("data/bc-infrastructure/"+name);
  return { config, catalog, registry, context, bc, files: [...files].sort() };
}
const licence = value => value?.name === 'Open Government Licence - Canada' && value.url === 'https://open.canada.ca/en/open-government-licence-canada' && value.attribution?.trim();
export async function validateContext(root) {
  const manifest = await readJSON(root,'data/context/manifest.json');
  assert(manifest.schemaVersion === 1 && Number.isFinite(Date.parse(manifest.retrievedAt)), 'Invalid context manifest');
  assert(manifest.files?.length === CONTEXT_FILES.length, 'Incomplete context file group');
  const payloads = {};
  for (const name of CONTEXT_FILES) {
    const entries = manifest.files.filter(entry => entry.file === name);
    assert(entries.length === 1, 'Missing or duplicated context file: '+name);
    const bytes = await safeRead(root,'data/context/'+name);
    assert(sha256(bytes) === entries[0].sha256, 'Context checksum mismatch: '+name);
    payloads[name] = JSON.parse(bytes);
  }
  const geometry = payloads['historical-infrastructure.geojson'];
  assert(geometry.type === 'FeatureCollection' && licence(geometry.metadata?.licence) && geometry.features.length > 0, 'Invalid historical geography or licence');
  const identities = new Set();
  for (const feature of geometry.features) {
    assert(feature.properties?.historical === true && !identities.has(feature.id), 'Invalid or duplicate historical feature');
    identities.add(feature.id);
    const kind = feature.properties.kind;
    assert(kind === 'pipeline' || kind === 'refinery', 'Unknown context feature kind');
    assert(feature.geometry.type === (kind === 'pipeline' ? 'MultiLineString' : 'Point'), 'Unexpected context geometry');
    const points = kind === 'pipeline' ? feature.geometry.coordinates.flat() : [feature.geometry.coordinates];
    assert(points.length > 0 && points.every(p => p.length === 2 && p.every(Number.isFinite) && Math.abs(p[0]) <= 180 && Math.abs(p[1]) <= 90), 'Invalid context coordinates');
  }
  for (const kind of ['pipeline','refinery']) assert(geometry.features.filter(f => f.properties.kind === kind).length === manifest.counts.geometry[kind] && manifest.counts.geometry[kind] === geometry.metadata.counts[kind], 'Context feature count mismatch');
  const tolls = payloads['benchmark-tolls.json'];
  assert(licence(tolls.licence) && tolls.currentValidity === 'not-verified' && tolls.eligibleForQuote === false, 'Benchmark quote boundary or licence missing');
  assert(/^\d{4}-\d{2}-\d{2}$/.test(tolls.snapshotAsOf) && Number.isFinite(Date.parse(tolls.snapshotAsOf)), 'Invalid benchmark observation cutoff');
  assert(!tolls.pendingSources?.length && tolls.systems?.length === tolls.systemCount && tolls.systemCount === manifest.counts.benchmarkSystems, 'Incomplete benchmark system count');
  let rows = 0;
  for (const system of tolls.systems) {
    assert(system.eligibleForQuote === false && system.currentValidity === 'not-verified' && system.rows.length === system.snapshotRowCount && system.rows.length > 0, 'Invalid benchmark system');
    assert(/^https:\/\//.test(system.source?.url || '') && /^[a-f0-9]{64}$/.test(system.source?.sha256 || '') && Number.isFinite(Date.parse(system.source.retrievedAt)), 'Missing benchmark provenance');
    assert(/^\d{4}-\d{2}-\d{2}$/.test(system.latestObservationDate) && system.latestObservationDate <= tolls.snapshotAsOf, 'Future or invalid benchmark observation');
    for (const row of system.rows) assert(row.Date === system.latestObservationDate && row.Unit?.trim() && row['Pipeline Name']?.trim() && row.Toll?.trim() && Number.isFinite(Number(row.Toll)), 'Malformed benchmark row');
    rows += system.rows.length;
  }
  assert(rows === tolls.rowCount && rows === manifest.counts.benchmarkRows, 'Benchmark row count mismatch');
  const attributes = payloads['pipeline-attributes.json'];
  assert(licence(attributes.licence) && attributes.rows?.length === attributes.rowCount && attributes.rowCount === manifest.counts.pipelineAttributes, 'Invalid pipeline attributes');
  const evidence = [geometry.metadata.source, geometry.metadata.catalogue, tolls.catalogue, attributes.source, attributes.catalogue, ...tolls.systems.map(system => system.source)];
  assert(evidence.every(item => /^https:\/\//.test(item?.url || '') && /^[a-f0-9]{64}$/.test(item?.sha256 || '') && Number.isFinite(Date.parse(item?.retrievedAt))), 'Missing context acquisition provenance');
  assert(Date.parse(manifest.retrievedAt) === Math.min(...evidence.map(item => Date.parse(item.retrievedAt))), 'Context freshness must preserve the oldest acquisition');
  return manifest;
}

// GitHub Pages caches subresources for ten minutes. Give every module in a
// release the same content-derived version so a new document cannot mix old
// imports with a new entry point. Data snapshots keep their existing URLs.
export function versionApplicationAssets(output) {
  const codeFiles = [...output.keys()].filter(file => /\.(?:m?js|css)$/.test(file)).sort();
  const version = sha256(codeFiles.map(file => `${file}:${sha256(output.get(file))}`).join('\n')).slice(0, 20);
  for (const file of codeFiles.filter(file => /\.m?js$/.test(file) && !file.startsWith('vendor/'))) {
    const source = output.get(file).toString().replace(/(['"`])((?:\.\.?\/)[A-Za-z0-9_./-]+\.m?js)\1/g, (match, quote, target) => {
      const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(file), target));
      return output.has(resolved) ? `${quote}${target}?v=${version}${quote}` : match;
    });
    output.set(file, Buffer.from(source));
  }
  const html = output.get('index.html').toString().replace(/((?:src|href)=)(['"])([^'"?#]+\.(?:m?js|css))\2/g, (match, attribute, quote, target) =>
    output.has(target.replace(/^\.\//, '')) ? `${attribute}${quote}${target}?v=${version}${quote}` : match);
  output.set('index.html', Buffer.from(html));
  return version;
}

export async function buildPublic(root = ROOT) {
  const { catalog, files, config } = await validateRelease(root);
  validateEconomy(await readJSON(root, 'data/economy.json'));
  validateIncomePaths(await readJSON(root,'data/income-paths.json'));
  validateDynamicPriceHistory(await readJSON(root,'data/dynamic-price-history.json'));
  validateProvincialForecast(await readJSON(root,'data/provincial-forecasts.json'));
  validateProvincialOutlooks(await readJSON(root,'data/provincial-outlook-benchmarks.json'));
  validateAlbertaWellStatus(await readJSON(root,'data/alberta-well-status.json'));
  validateEnergyFlows(await readJSON(root,'data/energy-flows.json'));
  validateProvincialImpacts(await readJSON(root,'data/provincial-impacts.json'));
  let aiConfig;
  try{aiConfig=publicAIConfig(await readJSON(root,'config/ai-public.json'));}catch(error){if(error.code!=='ENOENT')throw error;aiConfig={apiOrigin:null};}
  const contentSecurityPolicy=cspForAI(aiConfig);
  const stage = await fs.mkdtemp(path.join(root, '.public-build-'));
  try {
    const vendorExtras = [];
    for (const folder of ['vendor','vendor/fonts']) {
      for (const entry of await fs.readdir(path.join(root, folder))) if (/^(?:(?:[A-Za-z0-9_-]+-)?LICENSE(?:-[A-Za-z0-9_-]+)?|OFL|NOTICE)(?:\.(?:txt|md))?$/i.test(entry)) vendorExtras.push(`${folder}/${entry}`);
    }
    assert(vendorExtras.some(file => file.startsWith('vendor/fonts/')), 'Font licence notice missing');
    assert(vendorExtras.some(file => !file.startsWith('vendor/fonts/')), 'Vendor licence notices missing');
    const output = new Map([['ai-config.json',Buffer.from(JSON.stringify(aiConfig))]]);
    for (const file of [...new Set([...PUBLIC_FILES, ...vendorExtras, ...files])].sort()) {
      let bytes = await safeRead(root, file);
      if (file === 'index.html') {
        let html = bytes.toString();
        assert(!/http-equiv=["']Content-Security-Policy/i.test(html), 'Source HTML already has CSP; review before build');
        html = html.replace('<head>', `<head>\n    <meta http-equiv="Content-Security-Policy" content="${contentSecurityPolicy.replace("; frame-ancestors 'none'", '')}">\n    <meta name="referrer" content="no-referrer">`);
        bytes = Buffer.from(html);
      }
      output.set(file, bytes);
    }
    const codeVersion = versionApplicationAssets(output);
    output.set('health.json', Buffer.from(JSON.stringify({codeVersion,status:config.publicLaunchEnabled && config.releaseScope === 'public-beta' ? 'public-beta' : 'candidate',releaseId:catalog.releaseId,records:catalog.totalRecords,retrievedAt:catalog.retrievedAt,builtAt:new Date().toISOString(),nationalComplete:catalog.nationalComplete === true})));
    output.set('robots.txt', Buffer.from('User-agent: *\nAllow: /\n'));
    output.set('_headers', Buffer.from(`/*\n  Content-Security-Policy: ${contentSecurityPolicy}\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: no-referrer\n  X-Frame-Options: DENY\n  Permissions-Policy: camera=(), microphone=(), geolocation=()\n  Cache-Control: no-cache\n/data/releases/*\n  Cache-Control: public, max-age=31536000, immutable\n`));
    const manifest = {schemaVersion:1,releaseId:catalog.releaseId,codeVersion,contentSecurityPolicy,files:[]};
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
