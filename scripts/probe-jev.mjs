import {readFile,writeFile,mkdir,rename,rmdir} from 'node:fs/promises';
import {createJevDecider,JEV_MODEL,JEV_ATTEMPT_RESERVE_USD} from '../server/jev-decisions.mjs';
import {JEV_BENCHMARK_CASES} from './jev-benchmark-cases.mjs';
const root=new URL('../',import.meta.url);
const trials=JEV_BENCHMARK_CASES.flatMap(item=>[0,1,2].map(repeat=>({...item,repeat})));
const ceiling=trials.length*JEV_ATTEMPT_RESERVE_USD;
if(!process.argv.includes('--run')){
  console.log(JSON.stringify({mode:'dry-run',model:JEV_MODEL,cases:JEV_BENCHMARK_CASES.length,attempts:trials.length,maximumReservedUsd:ceiling,authorizedLifetimeBudgetUsd:1,scope:'Development decision tests only; not end-to-end or held-out; no API calls'}));
}else{
  let locked=false;
  const cache=new URL('.data-cache/',root),lock=new URL('jev-benchmark.lock/',cache),ledgerFile=new URL('jev-benchmark-budget.json',cache);
  try{
    await mkdir(cache,{recursive:true});await mkdir(lock);locked=true;
    let ledger;
    try{ledger=JSON.parse(await readFile(ledgerFile,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;ledger={version:1,limitUsd:1,reservedUsd:0,attempts:0};}
    if(ledger.version!==1||ledger.limitUsd!==1||!Number.isFinite(ledger.reservedUsd)||ledger.reservedUsd<0||!Number.isSafeInteger(ledger.attempts)||ledger.attempts<0)throw Error('ledger');
    const apiKey=(await readFile(new URL('.env.jev.local',root),'utf8')).match(/^TYPESAFE_API_KEY=(\S+)$/m)?.[1];
    if(!apiKey)throw Error('missing key');
    const reserveAttempt=async usd=>{
      if(ledger.reservedUsd+usd>0.9)throw Error('budget');
      ledger={...ledger,reservedUsd:ledger.reservedUsd+usd,attempts:ledger.attempts+1};
      const staging=new URL('jev-benchmark-budget.tmp',cache);
      await writeFile(staging,JSON.stringify(ledger)+'\n',{mode:0o600});await rename(staging,ledgerFile);
    };
    const decide=createJevDecider({apiKey,reserveAttempt});
    const results=[];
    for(const trial of trials){
      const entries=Object.entries(trial.question.criteria);
      const ordered=trial.repeat===1?[...entries].reverse():trial.repeat===2?[...entries.slice(1),entries[0]]:entries;
      const question={...trial.question,criteria:Object.fromEntries(ordered)};
      const started=Date.now();
      try{
        const result=await decide({state:trial.state,questions:{decision:question}});
        const answer=result.answers.decision;
        results.push({id:trial.id,group:trial.group,repeat:trial.repeat,expected:trial.expected,selected:answer.choice,correct:answer.choice===trial.expected,confidence:answer.confidence,probabilities:answer.probabilities,inputTokens:result.inputTokens,estimatedUsd:result.estimatedUsd,milliseconds:Date.now()-started});
      }catch(error){results.push({id:trial.id,group:trial.group,repeat:trial.repeat,correct:false,error:['authentication_failed','rate_limited','provider_unavailable','invalid_decision','invalid_usage'].includes(error.code)?error.code:'benchmark_stopped',milliseconds:Date.now()-started});if(error.code!=='invalid_decision')break;}
      console.log(JSON.stringify(Object.fromEntries(Object.entries(results.at(-1)).filter(([key])=>!['probabilities'].includes(key)))));
    }
    const correct=results.filter(x=>x.correct).length;
    const ordered=results.map(x=>x.milliseconds).sort((a,b)=>a-b);
    const medianMilliseconds=ordered.length?(ordered[Math.floor((ordered.length-1)/2)]+ordered[Math.floor(ordered.length/2)])/2:null;
    const report={createdAt:new Date().toISOString(),model:JEV_MODEL,scope:'Authored development fixtures with supplied test contexts. Not held-out, not an LLM comparison, not end-to-end evidence of app quality.',priceBasis:{inputUsdPerMillion:0.042,source:'https://docs.typesafe.ai/models',checkedAt:'2026-10-19'},plannedAttempts:trials.length,completedAttempts:results.length,correct,estimatedUsd:results.reduce((sum,x)=>sum+(x.estimatedUsd||0),0),reservedUsd:ledger.reservedUsd,medianMilliseconds,results};
    await writeFile(new URL('JEV-DEVELOPMENT-EVALUATION.json',cache),JSON.stringify(report,null,2)+'\n',{mode:0o600});
    console.log(JSON.stringify({correct,attempts:results.length,estimatedUsd:report.estimatedUsd,lifetimeReservedUsd:ledger.reservedUsd,report:'.data-cache/JEV-DEVELOPMENT-EVALUATION.json'}));
    if(results.length!==trials.length||correct!==results.length)process.exitCode=1;
  }catch{console.error('Jev benchmark could not start or continue. Check local setup and the reserved budget. No credential or upstream error details were logged.');process.exitCode=1;}
  finally{if(locked)await rmdir(lock);}
}
