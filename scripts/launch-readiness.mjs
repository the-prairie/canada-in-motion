import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT, readJSON, validateRelease } from './build-public.mjs';

export async function betaReadiness(root = ROOT, { now = new Date() } = {}) {
  const errors = [];
  let release;
  try { release = await validateRelease(root); }
  catch (error) { return { technicalReady: false, launchAuthorized: false, errors: [error.message] }; }
  const { catalog, registry, config, context } = release;
  const coverage = await readJSON(root, 'data/national-coverage.json');
  const jurisdictions = ['AB', 'BC', 'SK', 'MB', 'ON', 'QC', 'NB', 'NS', 'PE', 'NL', 'YT', 'NT', 'NU'];
  const topics = ['well-inventory', 'orphan-status', 'abandonment-status', 'infrastructure', 'carrier-rates', 'government-charges'];
  const maxAge = config.staleAfterDays;
  if (!Number.isFinite(maxAge) || maxAge <= 0) errors.push('Invalid freshness threshold.');
  const contextAge = (now.getTime() - Date.parse(context.retrievedAt)) / 86400000;
  if (!Number.isFinite(contextAge) || contextAge < -1/24 || contextAge > maxAge) errors.push('Context acquisition is stale or invalid.');
  if (catalog.nationalComplete !== false || coverage.nationalComplete !== false) errors.push('The beta must disclose incomplete national coverage.');
  for (const code of jurisdictions) {
    const rows = coverage.provinces?.filter(row => row.code === code) || [];
    if (rows.length !== 1) { errors.push(`${code}: missing or duplicate coverage disclosure.`); continue; }
    for (const topic of topics) {
      const item = rows[0].topics?.[topic];
      if (!['partial', 'unavailable', 'permission-required', 'complete'].includes(item?.status) || !item.note?.trim()) errors.push(`${code}/${topic}: coverage and limitation must be explicit.`);
    }
  }
  for (const source of catalog.sources) {
    const definition = registry.find(row => row.id === source.id);
    const licence = definition?.licenseUrl || definition?.licenceUrl;
    if (!/^https:\/\//.test(licence || '')) errors.push(`${source.id}: missing licence URL.`);
    if (!source.publisher?.trim() || !source.license?.trim() || !source.limitations?.trim()) errors.push(`${source.id}: missing attribution or limitations.`);
    const age = (now.getTime() - Date.parse(source.retrievedAt)) / 86400000;
    if (!Number.isFinite(age) || age < -1/24 || age > maxAge) errors.push(`${source.id}: retrieval is stale or invalid.`);
    const item = coverage.provinces?.find(row => row.code === source.province)?.topics?.['well-inventory'];
    if (!item?.sourceIds?.includes(source.id) || !['partial', 'complete'].includes(item.status)) errors.push(`${source.id}: loaded inventory is absent from coverage disclosure.`);
  }
  return { technicalReady: errors.length === 0, launchAuthorized: false, releaseId: catalog.releaseId, records: catalog.totalRecords, checkedAt: now.toISOString(), scope: 'Public beta with explicit national coverage gaps', requiredDecisions: ['Approve a public beta with disclosed incomplete coverage.', 'Approve making the source repository public for the free GitHub Pages hosting path, or choose an eligible private-repository host.'], errors };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  betaReadiness().then(result => { console.log(JSON.stringify(result, null, 2)); if (!result.technicalReady) process.exitCode = 1; }).catch(error => { console.error(error.message); process.exitCode = 1; });
}
