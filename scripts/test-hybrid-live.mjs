import {readFile,writeFile,mkdir,rename,rmdir} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createCloudflareProvider,createEnergyAnalyzer,FREE_MODEL} from '../server/energy-analysis.mjs';
import {createJevDecider,JEV_ATTEMPT_RESERVE_USD} from '../server/jev-decisions.mjs';
import {normalizeEconomyState,summarizeEconomy,validateEconomy} from '../economy-model.mjs';
import {validateWorkspace} from '../workspace-contract.mjs';

const root=new URL('../',import.meta.url);
export const HYBRID_LIVE_CASES=[
  {id:'provincial-forecast',question:'Compare the GDP forecasts for Alberta, Ontario and Québec in 2026 and 2027.',types:['gdp-forecast']},
  {id:'gdp',question:'Compare energy GDP in Alberta, Ontario and Québec. Include a map.',types:['province-map','province-comparison']},
  {id:'electricity',question:'Compare electricity generation in Alberta, Ontario and Québec in the Higher scenario in 2040.',types:['scenario-comparison'],year:2040,scenario:'Higher'},
  {id:'compound',question:'Compare 2022 energy GDP in Alberta and Québec, their electricity generation in the Higher scenario in 2040, and map their pipeline routes and facilities.',types:['province-map','province-comparison','scenario-comparison','infrastructure-map'],year:2040,scenario:'Higher'},
  {id:'trade',question:'Show the value of oil traded between Alberta and British Columbia in 2024.',types:['energy-trade']},
  {id:'provincial-price',question:'If natural gas prices fall 10%, compare interprovincial trade exposure and published budget sensitivities in Alberta and British Columbia.',types:['provincial-impact']},
  {id:'missing-flow',question:'Map the energy routes between Alberta and British Columbia. Can we measure how much flows between them?',types:['infrastructure-map','coverage-note']},
];
const selectedCases=process.argv.find(arg=>arg.startsWith('--cases='))?.slice(8).split(',');
const cases=selectedCases?HYBRID_LIVE_CASES.filter(row=>selectedCases.includes(row.id)):HYBRID_LIVE_CASES;
if(selectedCases&&(!cases.length||cases.length!==selectedCases.length))throw new Error('Unknown hybrid test case');
if(!process.argv.includes('--run')&&!process.argv.includes('--serve')){
  console.log(JSON.stringify({mode:'dry-run',cases:HYBRID_LIVE_CASES.length,maximumJevReserveUsd:HYBRID_LIVE_CASES.length*JEV_ATTEMPT_RESERVE_USD,authorization:'Shares the existing lifetime US$1 Jev testing budget. No live calls without --run.'}));
}else{
  const cache=new URL('.data-cache/',root),lock=new URL('jev-benchmark.lock/',cache),ledgerFile=new URL('jev-benchmark-budget.json',cache);
  let locked=false;
  try{
    await mkdir(cache,{recursive:true});await mkdir(lock);locked=true;
    let ledger=JSON.parse(await readFile(ledgerFile,'utf8'));
    if(ledger.version!==1||ledger.limitUsd!==1||!Number.isFinite(ledger.reservedUsd)||ledger.reservedUsd<0||!Number.isSafeInteger(ledger.attempts))throw Error('ledger');
    const apiKey=(await readFile(new URL('.env.jev.local',root),'utf8')).match(/^TYPESAFE_API_KEY=(\S+)$/m)?.[1];
    const wrangler=await readFile(process.env.WRANGLER_AUTH_FILE||path.join(os.homedir(),'Library/Preferences/.wrangler/config/default.toml'),'utf8');
    const token=wrangler.match(/^oauth_token\s*=\s*"([^"]+)"/m)?.[1];
    const account=JSON.parse(await readFile(new URL('wrangler.jsonc',root),'utf8')).account_id;
    if(!apiKey||!token||!/^[a-f0-9]{32}$/.test(account))throw Error('setup');
    const data=JSON.parse(await readFile(new URL('data/economy.json',root)));validateEconomy(data);
    const debate=JSON.parse(await readFile(new URL('data/energy-debate.json',root)));
    const network=JSON.parse(await readFile(new URL('data/network.json',root)));
    const flows=JSON.parse(await readFile(new URL('data/energy-flows.json',root)));
    const fiscal=JSON.parse(await readFile(new URL('data/provincial-impacts.json',root)));
    const forecast=JSON.parse(await readFile(new URL('data/provincial-forecasts.json',root)));
    const reserveAttempt=async usd=>{
      if(ledger.reservedUsd+usd>0.9)throw Error('budget');
      ledger={...ledger,reservedUsd:ledger.reservedUsd+usd,attempts:ledger.attempts+1};
      const temporary=new URL('jev-benchmark-budget.tmp',cache);await writeFile(temporary,JSON.stringify(ledger)+'\n',{mode:0o600});await rename(temporary,ledgerFile);
    };
    let llmCalls=0;
    const provider=createCloudflareProvider({ai:{run:async(model,body)=>{
      llmCalls++;
      const response=await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/ai/run/${model}`,{method:'POST',redirect:'error',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(55000)});
      if(!response.ok)throw Error('provider');const payload=await response.json();if(!payload.success)throw Error('provider');return payload.result;
    }}});
    const usage=[];
    const liveDecider=createJevDecider({apiKey,reserveAttempt});
    const analyze=createEnergyAnalyzer({data,debate,network,flows,fiscal,forecast,workspaceEnabled:true,normalizeState:normalizeEconomyState,summarize:summarizeEconomy,provider,decider:async input=>{const result=await liveDecider(input);usage.push({inputTokens:result.inputTokens,estimatedUsd:result.estimatedUsd});return result;},answerMode:'claims',model:FREE_MODEL});
    if(process.argv.includes('--serve')){
      const {createAnalysisServer}=await import('../server/server.mjs');
      const server=await createAnalysisServer({analyze,provider:'cloudflare',model:FREE_MODEL,workspaceEnabled:true,jevEnabled:true,perMinute:10,dailyLimit:12});
      const listener=server.listeners('request')[0];server.removeAllListeners('request');
      server.on('request',(request,response)=>{if(request.url==='/ai-config.json'){response.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});response.end(JSON.stringify({apiOrigin:null}));}else listener(request,response);});
      await new Promise(resolve=>{server.listen(4182,'127.0.0.1',()=>console.log('Live hybrid browser test: http://127.0.0.1:4182/'));process.once('SIGINT',()=>server.close(resolve));process.once('SIGTERM',()=>server.close(resolve));});
      console.log(JSON.stringify({liveBrowserJevCalls:usage.length,estimatedJevUsd:usage.reduce((sum,row)=>sum+row.estimatedUsd,0),lifetimeJevReservedUsd:ledger.reservedUsd}));
    }else{
    const results=[];
    for(const item of cases){
      const start=Date.now();const callsBefore=llmCalls;
      try{
        const state={region:'CA',year:2030,scenario:'Current Measures',oilShock:10,duration:'persistent'};
        const answer=await analyze({question:item.question,state});validateWorkspace(answer.workspace);
        const types=answer.workspace.panels.map(p=>p.type);
        const passed=answer.answerMode==='source-backed-workspace'&&llmCalls-callsBefore===1&&item.types.every(type=>types.includes(type))&&(item.id==='missing-flow'?answer.workspace.plan.requestedMeasure==='measured-flow':answer.workspace.plan.requestedMeasure==='available')&&answer.workspace.decision.provider==='jev'&&(!item.year||(answer.workspace.plan.year===item.year&&answer.workspace.plan.scenario===item.scenario))&&JSON.stringify(answer.workspace.economySnapshot)===JSON.stringify(data)&&(item.id!=='provincial-forecast'||answer.workspace.decision.coverage==='supported'&&JSON.stringify(answer.workspace.forecastSnapshot)===JSON.stringify(forecast)&&answer.workspace.panels.filter(panel=>panel.type==='gdp-forecast').length===2);
        results.push({id:item.id,passed,milliseconds:Date.now()-start,llmCalls:llmCalls-callsBefore,types,decision:answer.workspace.decision,plan:answer.workspace.plan});
        await writeFile(new URL(`hybrid-live-${item.id}.json`,cache),JSON.stringify({...answer,question:item.question},null,2)+'\n',{mode:0o600});
      }catch(error){results.push({id:item.id,passed:false,error:['unsupported_scenario','provider_unavailable','analysis_unavailable','invalid_model_output'].includes(error.code)?error.code:'test_failed',milliseconds:Date.now()-start});}
      console.log(JSON.stringify(results.at(-1)));
    }
    const report={createdAt:new Date().toISOString(),model:FREE_MODEL,scope:'Live Cloudflare planning, live Jev decision, deterministic source-backed findings and client contract validation. Browser interaction and deployed Turnstile checks are separate.',results,usage,lifetimeJevReservedUsd:ledger.reservedUsd};
    await writeFile(new URL('HYBRID-LIVE-EVALUATION.json',cache),JSON.stringify(report,null,2)+'\n',{mode:0o600});
    console.log(JSON.stringify({passed:results.filter(r=>r.passed).length,total:results.length,estimatedJevUsd:usage.reduce((sum,row)=>sum+row.estimatedUsd,0),lifetimeJevReservedUsd:ledger.reservedUsd}));
    if(results.some(r=>!r.passed))process.exitCode=1;
    }
  }catch{console.error('Live hybrid test could not start or finish. Check secure local setup and the remaining testing budget. Credential and upstream response details were suppressed.');process.exitCode=1;}
  finally{if(locked)await rmdir(lock);}
}
