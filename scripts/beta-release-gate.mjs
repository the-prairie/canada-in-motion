import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT, readJSON } from './build-public.mjs';
import { betaReadiness } from './launch-readiness.mjs';

export async function betaReleaseGate(root = ROOT, options = {}) {
  const ready = await betaReadiness(root, options);
  const config = await readJSON(root, 'config/publication.json');
  const errors = [...ready.errors];
  if (config.publicLaunchEnabled !== true) errors.push('Public launch is disabled.');
  if (config.releaseScope !== 'public-beta') errors.push('Explicit public-beta scope is required.');
  if (config.betaApproval?.owner !== config.owner || config.betaApproval?.scope !== 'incomplete-national-coverage' || !Number.isFinite(Date.parse(config.betaApproval?.approvedAt)) || config.betaApproval?.repositoryVisibility !== 'public') errors.push('The approved beta scope and repository visibility must be recorded.');
  if (config.requireNationalCompleteness !== true) errors.push('Keep the separate national completeness requirement intact.');
  return {passed:ready.technicalReady && errors.length === 0, scope:'public-beta', nationalComplete:false, releaseId:ready.releaseId, checkedAt:ready.checkedAt, errors};
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  betaReleaseGate().then(result=>{console.log(JSON.stringify(result,null,2));if(!result.passed)process.exitCode=1;}).catch(error=>{console.error(error.message);process.exitCode=1;});
}
