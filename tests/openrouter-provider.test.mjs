import test from 'node:test';
import assert from 'node:assert/strict';
import {createOpenRouterProvider,OPENROUTER_MODEL} from '../server/openrouter-provider.mjs';
const request={name:'test',schema:{type:'object'},input:{question:'Public test'},instructions:'Select evidence'};
const payload=value=>new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify(value)}}]}));
test('OpenRouter pins free models, zero prices and no fallback without exposing credentials',async()=>{
  let calls=0;
  const provider=createOpenRouterProvider({apiKey:'private-test',fetchImpl:async(url,options)=>{
    calls++;assert.equal(url,'https://openrouter.ai/api/v1/chat/completions');
    const body=JSON.parse(options.body);assert.equal(body.model,OPENROUTER_MODEL);
    assert.equal(body.provider.allow_fallbacks,false);assert.equal(body.provider.require_parameters,true);
    assert.deepEqual(body.provider.max_price,{prompt:0,completion:0,request:0,image:0});
    assert.equal(body.response_format.json_schema.strict,true);assert.deepEqual(body.response_format.json_schema.schema,request.schema);
    assert.ok(!options.body.includes('private-test'));assert.ok(!Object.hasOwn(body,'models'));assert.ok(!Object.hasOwn(body,'plugins'));
    return payload({answerability:'unsupported',claimIds:['outside-data']});
  }});
  assert.equal((await provider(request)).answerability,'unsupported');assert.equal(calls,1);
  for(const model of ['openrouter/free','openai/gpt-6','nvidia/nemotron-3.5-super-vl','unknown:free','constructor','__proto__'])assert.throws(()=>createOpenRouterProvider({apiKey:'private-test',model}),e=>e.code==='provider_unavailable');
});
test('OpenRouter rejects malformed, truncated and refused output and does not retry provider errors',async()=>{
  for(const value of [null,[],3])await assert.rejects(createOpenRouterProvider({apiKey:'test',fetchImpl:async()=>payload(value)})(request),e=>e.code==='invalid_analysis');
  for(const body of [{choices:[{finish_reason:'length',message:{content:'{}'}}]},{choices:[{finish_reason:'stop',message:{content:'```json\n{}\n```'}}]},{choices:[{finish_reason:'stop',message:{content:'{}',refusal:'no'}}]}])await assert.rejects(createOpenRouterProvider({apiKey:'test',fetchImpl:async()=>new Response(JSON.stringify(body))})(request),e=>e.code==='invalid_analysis');
  let calls=0;
  await assert.rejects(createOpenRouterProvider({apiKey:'test',fetchImpl:async()=>{calls++;return new Response('private-upstream-error',{status:429});}})(request),e=>e.code==='provider_unavailable'&&!e.message.includes('private'));
  assert.equal(calls,1);
});
test('OpenRouter rejects oversize evidence and propagates cancellation before requesting',async()=>{
  let calls=0;const provider=createOpenRouterProvider({apiKey:'test',fetchImpl:async()=>{calls++;return payload({});}});
  await assert.rejects(provider({...request,input:{text:'a'.repeat(51000)}}),e=>e.code==='evidence_too_large');
  await assert.rejects(provider({...request,signal:AbortSignal.abort()}));assert.equal(calls,0);
});
