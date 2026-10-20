import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { createEnergyAnalyzer,createOpenAIProvider,buildEvidence,validateExplanation,validateAnalysisRequest,AnalysisError } from '../server/energy-analysis.mjs';
import { createAnalysisServer } from '../server/server.mjs';
const state={region:'AB',scenario:'Current Measures',year:2030,oilShock:10,duration:'persistent'};
const source={id:'gdp',title:'GDP',url:'https://example.org/gdp'};
const summary={state,gdp:{year:2022,unit:'CAD million',selected:{code:'AB',energy:100,total:500,sharePct:20},national:{code:'CA',energy:200,total:2000,sharePct:10},sourceId:'gdp'},metrics:[],publishedOilSensitivity:{available:false},sources:[source],limitations:['Observed GDP is not a shock forecast.']};
const explanation={headline:'Alberta has measured energy exposure',blocks:[{text:'Observed energy value added is [[n1]] CAD million.',sourceIds:['gdp'],evidenceIds:['n1']}]};
const data={regions:[{code:'AB',name:'Alberta'}]};
const analyzer=provider=>createEnergyAnalyzer({data,normalizeState:value=>({...state,...value}),summarize:()=>summary,provider,timeoutMs:100});
function queued(...answers){let i=0;return async()=>answers[i++];}
const request={question:'What happens in Alberta?',state};
test('two-pass analysis selects state, resolves exact numeric evidence and preserves limitations',async()=>{
  let calls=0;const run=analyzer(async input=>{calls++;assert.ok(input.signal);return calls===1?{state}:explanation;});
  const result=await run(request);assert.equal(calls,2);assert.equal(result.analysis.blocks[0].text,'Observed energy value added is 100 CAD million.');assert.equal(result.analysis.sources[0].id,'gdp');assert.ok(result.analysis.limitations.some(x=>/provincial GDP/i.test(x)));
});
test('bad input is rejected before the provider runs',async()=>{
  let calls=0;const run=analyzer(async()=>{calls++;});
  for(const input of [{...request,question:'x'},{...request,state:{...state,oilShock:99}},{...request,state:{...state,region:'XX'}},{...request,secret:'x'}])await assert.rejects(run(input),error=>error.code==='invalid_request');
  assert.equal(calls,0);assert.throws(()=>validateAnalysisRequest({...request,state:{year:NaN}}));
});
test('malformed plan, numeric inventions and mismatched citations fail closed',async()=>{
  await assert.rejects(analyzer(queued({state:{...state,year:2100}}))(request),error=>error.code==='invalid_analysis');
  const evidence=buildEvidence(summary);
  for(const block of [
    {...explanation.blocks[0],text:'GDP grows 15%.'},
    {...explanation.blocks[0],text:'GDP doubles.'},
    {...explanation.blocks[0],text:'GDP is [[n999]].'},
    {...explanation.blocks[0],sourceIds:['invented']},
    {...explanation.blocks[0],evidenceIds:[]},
    {...explanation.blocks[0],text:'<script>alert()</script>'}
  ])assert.throws(()=>validateExplanation({...explanation,blocks:[block]},evidence),error=>error.code==='invalid_analysis');
});
test('refusal and malformed provider output never return raw provider content',async()=>{
  const response=payload=>async()=>({ok:true,json:async()=>payload});
  const refused=createOpenAIProvider({apiKey:'test-private',fetchImpl:response({status:'completed',output:[{type:'message',content:[{type:'refusal',refusal:'private provider text'}]}]})});
  await assert.rejects(refused({}),error=>error.code==='analysis_refused'&&!error.message.includes('private'));
  const malformed=createOpenAIProvider({apiKey:'test-private',fetchImpl:response({status:'completed',output:[{type:'message',content:[{type:'output_text',text:'not JSON'}]}]})});
  await assert.rejects(malformed({}),error=>error.code==='invalid_analysis');
  const failed=createOpenAIProvider({apiKey:'test-private',fetchImpl:async()=>({ok:false,status:401})});
  await assert.rejects(failed({}),error=>error.code==='provider_unavailable');
});
test('Responses request uses strict output, no stored responses and bounded tokens',async()=>{
  let sent;
  const provider=createOpenAIProvider({apiKey:'test-private',fetchImpl:async(url,options)=>{sent={url,...options};return {ok:true,json:async()=>({status:'completed',output:[{type:'message',content:[{type:'output_text',text:'{"state":{}}'}]}]})};}});
  await provider({name:'check',schema:{type:'object'},instructions:'rules',input:{question:'q'}});
  const body=JSON.parse(sent.body);assert.equal(body.store,false);assert.equal(body.text.format.strict,true);assert.equal(body.max_output_tokens,2200);assert.equal(body.model,'gpt-6-luna');assert.equal(sent.url,'https://api.openai.com/v1/responses');
});
test('timeout aborts a stalled provider and makes no second call',async()=>{
  let calls=0,signal;
  const run=createEnergyAnalyzer({data,normalizeState:value=>value,summarize:()=>summary,provider:async input=>{calls++;signal=input.signal;return new Promise(()=>{});},timeoutMs:10});
  await assert.rejects(run(request),error=>error.code==='analysis_timeout');assert.equal(calls,1);assert.equal(signal.aborted,true);
});
async function serverFixture(t,options={}) {
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'energy-api-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));
  const bytes=Buffer.from('<html>App</html>');
  await fs.writeFile(path.join(directory,'index.html'),bytes);await fs.writeFile(path.join(directory,'.env.local'),'SECRET=private');
  await fs.writeFile(path.join(directory,'build-manifest.json'),JSON.stringify({schemaVersion:1,files:[{path:'index.html',size:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')}]}));
  const server=await createAnalysisServer({directory,analyze:analyzer(queued({state},explanation)),...options});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
  const origin=`http://127.0.0.1:${server.address().port}`;
  return {origin,post:(body=request,headers={})=>fetch(origin+'/api/analysis',{method:'POST',headers:{'Content-Type':'application/json',Origin:origin,...headers},body:JSON.stringify(body)})};
}
test('same-origin API serves checked analysis and denies private files and cross-origin requests',async t=>{
  const f=await serverFixture(t);
  assert.equal((await (await fetch(f.origin+'/api/analysis/status')).json()).available,true);
  assert.equal((await fetch(f.origin+'/.env.local')).status,404);assert.equal((await fetch(f.origin+'/server/energy-analysis.mjs')).status,404);
  assert.equal((await f.post(request,{Origin:'https://evil.example'})).status,403);
  assert.equal((await f.post(request,{'Content-Type':'text/plain'})).status,415);
  const response=await f.post();assert.equal(response.status,200);assert.equal((await response.json()).analysis.blocks[0].text,'Observed energy value added is 100 CAD million.');
});
test('daily quota, concurrency, body size, invalid JSON and missing origin are bounded',async t=>{
  const f=await serverFixture(t,{dailyLimit:1});assert.equal((await f.post()).status,200);assert.equal((await f.post()).status,429);
  assert.equal((await f.post({...request,question:'a'.repeat(9000)})).status,413);
  assert.equal((await fetch(f.origin+'/api/analysis',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(request)})).status,403);
  assert.equal((await fetch(f.origin+'/api/analysis',{method:'POST',headers:{'Content-Type':'application/json',Origin:f.origin},body:'{'})).status,400);
  let finish;const g=await serverFixture(t,{maxConcurrent:1,analyze:()=>new Promise(resolve=>{finish=resolve;})});
  const pending=g.post();await new Promise(resolve=>setTimeout(resolve,20));assert.equal((await g.post()).status,429);finish({done:true});assert.equal((await pending).status,200);
});
test('unconfigured server reports unavailable without provider calls or secret errors',async t=>{
  const f=await serverFixture(t,{analyze:undefined});assert.equal((await (await fetch(f.origin+'/api/analysis/status')).json()).available,false);assert.equal((await f.post()).status,503);
  const g=await serverFixture(t,{analyze:async()=>{throw new Error('secret provider detail');}});const result=await g.post();assert.equal(result.status,503);assert.ok(!(await result.text()).includes('secret'));
});

test('presentation defaults cannot reset the selected UI section after analysis', async () => {
  let inputState;
  const run = createEnergyAnalyzer({ data, normalizeState: value => ({ ...state, section: 'income', display: 'bars', metric: 'production', ...value }), summarize: () => summary, provider: async input => {
    if (input.name === 'energy_scenario') { inputState = input.input.state; return {state}; }
    return explanation;
  }});
  const result = await run(request);
  assert.deepEqual(inputState, state);
  assert.deepEqual(result.state, state);
});

test('the published Canada Net-zero scenario name is permitted without allowing invented numbers', () => {
  const evidence = buildEvidence(summary);
  const result = validateExplanation({...explanation, headline:'Canada Net-zero is a conditional scenario'}, evidence);
  assert.equal(result.headline, 'Canada Net-zero is a conditional scenario');
  assert.throws(() => validateExplanation({...explanation, headline:'Canada Net-zero doubles GDP'}, evidence), error => error.code === 'invalid_analysis');
});
