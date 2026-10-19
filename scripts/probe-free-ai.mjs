import {gradeTrial} from './ai-trial-grading.mjs';
import {BENCHMARK_CASES} from './ai-benchmark-cases.mjs';
// Uses only fixed public questions/data. Wrangler supplies credentials in memory;
// neither tokens nor upstream errors are printed or saved. No paid fallback.
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {createCloudflareProvider,createEnergyAnalyzer,FREE_MODEL} from '../server/energy-analysis.mjs';
import {normalizeEconomyState,summarizeEconomy,validateEconomy} from '../economy-model.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const run=promisify(execFile);
const selectedCase=process.argv.find(value=>value.startsWith('--case='))?.slice(7);
const trialModel=process.argv.includes('--gpt-oss')?'@cf/openai/gpt-oss-120b':FREE_MODEL;
const cases=BENCHMARK_CASES;
try{
  const {stdout}=await run('npx',['wrangler','auth','token','--json'],{cwd:root,maxBuffer:100000});
  const {token}=JSON.parse(stdout);if(typeof token!=='string'||!token)throw Error('auth');
  const config=JSON.parse(await readFile(path.join(root,'wrangler.jsonc'),'utf8'));
  const data=JSON.parse(await readFile(path.join(root,'data/economy.json'),'utf8'));validateEconomy(data);
  const debate=JSON.parse(await readFile(path.join(root,'data/energy-debate.json'),'utf8'));
  let authorizationFailure=false;const calls=[];
  const ai={run:async(model,body)=>{
    if(trialModel.includes('gpt-oss')){
      const schema=body.response_format.json_schema;
      body={...body,max_tokens:2048,reasoning_effort:'low',messages:[{...body.messages[0],content:body.messages[0].content+' Return only the JSON object described by this schema: '+JSON.stringify(schema)},body.messages[1]],response_format:{type:'json_schema',json_schema:{name:'energy_response',strict:true,schema}}};
    }
    const start=Date.now();
    const response=await fetch(`https://api.cloudflare.com/client/v4/accounts/${config.account_id}/ai/run/${trialModel}`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(60000)});
    if(response.status===401||response.status===403)authorizationFailure=true;
    const payload=await response.json();
    const usage=payload.result?.usage;
    const content=payload.result?.choices?.[0]?.message?.content;
    calls.push({status:response.status,milliseconds:Date.now()-start,promptTokens:usage?.prompt_tokens??null,completionTokens:usage?.completion_tokens??null,neurons:usage?.neurons??null,output:payload.result?.response??content,finishReason:payload.result?.choices?.[0]?.finish_reason,...(!response.ok?{errors:payload.errors}: {})});
    if(!response.ok||payload.success===false)throw Error('provider');
    return trialModel.includes('gpt-oss')?{response:content}:payload.result;
  }};
  const analyze=createEnergyAnalyzer({data,debate,provider:createCloudflareProvider({ai}),model:trialModel,normalizeState:normalizeEconomyState,summarize:summarizeEconomy,answerMode:'claims'});
  const results=[];
  const selected=cases.filter((item,index)=>selectedCase?item.id===selectedCase:process.argv.includes('--extended')||index<4);
  if(!selected.length)throw Error('Unknown case');
  for(const item of selected){
    const start=Date.now();
    try{
      const result=await analyze({question:item.question,state:item.state});
      results.push({id:item.id,...gradeTrial(item,{result}),milliseconds:Date.now()-start,state:result.state,analysis:result.analysis});
    }catch(error){results.push({id:item.id,...gradeTrial(item,{error}),milliseconds:Date.now()-start});}
    if(authorizationFailure)break;
  }
  const report={verifiedAt:new Date().toISOString(),model:trialModel,calls,results,humanContentReviewRequired:true};
  const directory=path.join(root,'.data-cache');await mkdir(directory,{recursive:true});
  await writeFile(path.join(directory,process.argv.includes('--extended')?'free-ai-evaluation-extended.json':'free-ai-evaluation.json'),JSON.stringify(report,null,2)+'\n',{mode:0o600});
  console.log(JSON.stringify({model:trialModel,results:results.map(({id,passed,outcome,validated,stateMatched,errorCode,milliseconds})=>({id,passed,outcome,validated,stateMatched,errorCode,milliseconds})),report:process.argv.includes('--extended')?'.data-cache/free-ai-evaluation-extended.json':'.data-cache/free-ai-evaluation.json'}));
  if(authorizationFailure)console.log('Cloudflare authorization needs Workers AI access. No further model calls were attempted.');
  if(results.length!==selected.length||results.some(r=>!r.passed))process.exitCode=1;
}catch{console.error('The free-model evaluation could not start. Check Wrangler authorization and local public data. No credentials were printed.');process.exitCode=1;}
