import {readFile,writeFile,rename} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {DEFAULT_MODEL,FREE_MODEL} from '../server/energy-analysis.mjs';
import {publicAIConfig} from './build-public.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const origin=process.argv[2];
try {
  const config=publicAIConfig({apiOrigin:origin});
  const worker=JSON.parse(await readFile(path.join(root,'wrangler.jsonc'),'utf8'));
  const response=await fetch(origin+'/api/analysis/status',{headers:{Origin:'https://the-prairie.github.io'},signal:AbortSignal.timeout(10000)});
  const status=await response.json();
  if(!response.ok||response.headers.get('Access-Control-Allow-Origin')!=='https://the-prairie.github.io'||status.available!==true||status.provider!==worker.vars.AI_PROVIDER||status.model!==(worker.vars.AI_PROVIDER==='cloudflare'?FREE_MODEL:DEFAULT_MODEL)||!status.turnstileSiteKey||status.turnstileSiteKey!==worker.vars.TURNSTILE_SITE_KEY)throw Error('The deployed service is not configured for this public app.');
  const destination=path.join(root,'config/ai-public.json');
  await writeFile(destination+'.tmp',JSON.stringify(config,null,2)+'\n');await rename(destination+'.tmp',destination);
  console.log('Public AI endpoint saved. Run the public build and publish workflow to connect visitors. This status check does not verify model access or a completed answer.');
} catch(error) {console.error(error.message);process.exitCode=1;}
