import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT, readJSON, validateRelease } from './build-public.mjs';

export async function releaseGate(root = ROOT, { now = new Date() } = {}) {
  const errors = [];
  let release;
  try { release = await validateRelease(root); } catch(error) { return {passed:false,errors:[error.message]}; }
  const {config,catalog,registry} = release;
  const coverage = await readJSON(root,'data/national-coverage.json');
  if(config.publicLaunchEnabled !== true) errors.push('Public launch is disabled in publication configuration.');
  if(!['noncommercial','commercial'].includes(config.purpose)) errors.push('Unknown publication purpose.');
  const fresh = (date, label) => {
    const timestamp = Date.parse(date);
    const age = (now.getTime()-timestamp)/86400000;
    if(!Number.isFinite(timestamp) || age < -1/24 || age > config.staleAfterDays) errors.push(`${label}: retrieval/evidence is missing, future-dated or older than ${config.staleAfterDays} days.`);
  };
  if(!Number.isFinite(config.staleAfterDays) || config.staleAfterDays <= 0) errors.push('Invalid freshness threshold.');
  fresh(catalog.retrievedAt,'Catalog');
  fresh(release.context.retrievedAt,'Infrastructure and benchmark context');
  for(const source of catalog.sources) {
    fresh(source.retrievedAt,source.id);
    const definition = registry.find(item=>item.id===source.id);
    const evidence = definition.licenseUrl || definition.licenceUrl || definition.license?.url || definition.licence?.url;
    if(!evidence || !/^https:\/\//.test(evidence)) errors.push(`${source.id}: missing licence evidence URL.`);
  }
  if(config.requireNationalCompleteness) {
    const expected = ['AB','BC','SK','MB','ON','QC','NB','NS','PE','NL'];
    if(expected.some(code=>!config.requiredProvinces?.includes(code))) errors.push('National completeness configuration omits a province.');
    const topics = ['well-inventory','orphan-status','abandonment-status','infrastructure','carrier-rates','government-charges'];
    if(topics.some(topic=>!config.requiredTopics?.includes(topic))) errors.push('National completeness configuration omits a required topic.');
    for(const code of expected) {
      const matches = coverage.provinces?.filter(item=>item.code===code) || [];
      if(matches.length !== 1) { errors.push(`${code}: coverage record missing or duplicated.`); continue; }
      for(const topic of topics) {
        const item = matches[0].topics?.[topic];
        if(item?.status !== 'complete') { errors.push(`${code}/${topic}: ${item?.status || 'unassessed'}.`); continue; }
        if(!/^https:\/\//.test(item.evidenceUrl || '')) errors.push(`${code}/${topic}: missing authority evidence URL.`);
        fresh(item.retrievedAt,`${code}/${topic}`);
        if(!Array.isArray(item.sourceIds) || item.sourceIds.length === 0) errors.push(`${code}/${topic}: no source evidence.`);
        for(const sourceId of item.sourceIds || []) {
          const source = registry.find(source=>source.id===sourceId);
          if(!source || !['open','noncommercial'].includes(source.publication) || source.publication==='noncommercial' && config.purpose!=='noncommercial') errors.push(`${code}/${topic}: source ${sourceId} has unverified publication rights.`);
        }
      }
    }
    if(catalog.nationalComplete !== true) errors.push('Catalog explicitly declares nationalComplete=false.');
  }
  return {passed:errors.length===0,releaseId:catalog.releaseId,checkedAt:now.toISOString(),errors};
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  releaseGate(process.argv[2] ? path.resolve(process.argv[2]):ROOT).then(result=>{console.log(JSON.stringify(result,null,2));if(!result.passed)process.exitCode=1;}).catch(error=>{console.error(error.message);process.exitCode=1;});
}
