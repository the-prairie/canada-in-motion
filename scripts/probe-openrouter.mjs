import {BENCHMARK_CASES} from './ai-benchmark-cases.mjs';
// Fixed public questions only. Credentials, reasoning and upstream error bodies
// are never printed or written to the evaluation report.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createOpenRouterProvider,OPENROUTER_MODEL,OPENROUTER_FREE_MODELS} from '../server/openrouter-provider.mjs';
import {createEnergyAnalyzer} from '../server/energy-analysis.mjs';
import {normalizeEconomyState,summarizeEconomy,validateEconomy} from '../economy-model.mjs';
const root=new URL('../',import.meta.url);
const option=name=>process.argv.find(x=>x.startsWith(`--${name}=`))?.slice(name.length+3);
const model=option('model')||OPENROUTER_MODEL;
const reasoningEnabled=!process.argv.includes('--no-reasoning');
const cases=BENCHMARK_CASES;
try{
  if(!Object.hasOwn(OPENROUTER_FREE_MODELS,model))throw Error('model');
  const raw=await readFile(new URL('.env.openrouter.local',root),'utf8');
  const apiKey=raw.match(/^OPENROUTER_API_KEY=(\S+)$/m)?.[1];if(!apiKey)throw Error('key');
  const data=JSON.parse(await readFile(new URL('data/economy.json',root),'utf8'));validateEconomy(data);
  const debate=JSON.parse(await readFile(new URL('data/energy-debate.json',root),'utf8'));
  const calls=[];let authFailed=false;
  const fetchImpl=async(url,options)=>{
    const start=Date.now();const response=await fetch(url,options);
    if([401,403].includes(response.status))authFailed=true;
    const payload=await response.clone().json().catch(()=>({}));
    calls.push({status:response.status,milliseconds:Date.now()-start,provider:payload.provider,model:payload.model,cost:payload.usage?.cost,promptTokens:payload.usage?.prompt_tokens,completionTokens:payload.usage?.completion_tokens,finishReason:payload.choices?.[0]?.finish_reason,output:payload.choices?.[0]?.message?.content,errorCode:payload.error?.code});
    return response;
  };
  const analyze=createEnergyAnalyzer({data,debate,provider:createOpenRouterProvider({apiKey,model,fetchImpl,reasoningEnabled}),model,normalizeState:normalizeEconomyState,summarize:summarizeEconomy,answerMode:'claims'});
  const results=[];
  const selected=cases.filter(x=>option('case')?x.id===option('case'):process.argv.includes('--extended')||cases.indexOf(x)<4);
  if(!selected.length)throw Error('case');
  for(const item of selected){
    const start=Date.now();
    try{
      const result=await analyze({question:item.question,state:item.state});
      results.push({id:item.id,question:item.question,validated:true,stateMatched:Object.entries(item.expected).every(([key,value])=>result.state[key]===value),milliseconds:Date.now()-start,state:result.state,analysis:result.analysis});
    }catch(error){results.push({id:item.id,question:item.question,validated:error.code===item.expectedError,stateMatched:error.code===item.expectedError,requestRejected:error.code===item.expectedError,errorCode:error.code||'failed',milliseconds:Date.now()-start});}
    console.log(JSON.stringify({model,...Object.fromEntries(Object.entries(results.at(-1)).filter(([key])=>!['state','analysis','question'].includes(key)))}));
    if(authFailed)break;
  }
  const report={verifiedAt:new Date().toISOString(),model,reasoningEnabled,answerMode:'source-backed-findings',calls,results,humanContentReviewRequired:true};
  await mkdir(new URL('.data-cache/',root),{recursive:true});
  const filename=`.data-cache/openrouter-${model.split('/')[1].replace(':','-')}${reasoningEnabled?'':'-no-reasoning'}${option('case')?'-'+option('case'):''}.json`;
  await writeFile(new URL(filename,root),JSON.stringify(report,null,2)+'\n',{mode:0o600});
  console.log(JSON.stringify({report:filename,totalCost:calls.reduce((s,x)=>s+(x.cost||0),0)}));
  if(results.length!==selected.length||results.some(x=>!x.validated||!x.stateMatched))process.exitCode=1;
}catch{console.error('OpenRouter evaluation could not start. Check the secure connection and local data. No credential details were printed.');process.exitCode=1;}
