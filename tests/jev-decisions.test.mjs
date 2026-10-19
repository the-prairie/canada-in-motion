import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createJevDecider,JEV_MODEL,JEV_ATTEMPT_RESERVE_USD} from '../server/jev-decisions.mjs';
const request={state:{request:'Compare energy GDP by province.'},questions:{view:{type:'choice',instructions:'Choose the supported view.',criteria:{bars:'Comparable provincial values',map:'Geographic locations'}}}};
const valid=()=>({model:JEV_MODEL,answers:{view:{type:'choice',choice:'bars',confidence:0.8,probabilities:{bars:0.9,map:0.1}}},usage:{input_tokens:100}});
test('Jev requires a budget reservation before sending and pins endpoint/model without redirects',async()=>{
  const events=[];
  const decide=createJevDecider({apiKey:'fake-key',reserveAttempt:async amount=>{assert.equal(amount,JEV_ATTEMPT_RESERVE_USD);events.push('reserved');},fetchImpl:async(url,options)=>{events.push('called');assert.equal(url,'https://api.typesafe.ai/v1/systemone');assert.equal(options.redirect,'error');assert.equal(JSON.parse(options.body).model,JEV_MODEL);return Response.json(valid());}});
  assert.equal((await decide(request)).answers.view.choice,'bars');assert.deepEqual(events,['reserved','called']);
});
test('Jev budget refusal prevents inference entirely',async()=>{
  let calls=0;
  const decide=createJevDecider({apiKey:'fake-key',reserveAttempt:async()=>{throw Error('Budget exhausted');},fetchImpl:async()=>{calls++;}});
  await assert.rejects(()=>decide(request));assert.equal(calls,0);
});
test('Jev rejects fabricated options, wrong model, inconsistent probabilities and impossible usage',async()=>{
  for(const mutate of [p=>p.answers.view.choice='invented',p=>p.model='other-model',p=>p.answers.view.probabilities.map=0.9,p=>p.answers.view.probabilities={bars:1},p=>p.usage.input_tokens=64001]){
    const payload=valid();mutate(payload);
    const decide=createJevDecider({apiKey:'fake-key',reserveAttempt:async()=>{},fetchImpl:async()=>Response.json(payload)});
    await assert.rejects(()=>decide(request),error=>['invalid_decision','invalid_usage'].includes(error.code));
  }
});
test('Jev strips unrelated upstream fields and sanitizes upstream failure bodies without retry',async()=>{
  const payload={...valid(),secret:'upstream-secret',prose:'unverified commentary'};
  payload.answers.view.extra='unverified';
  const success=createJevDecider({apiKey:'fake-key',reserveAttempt:async()=>{},fetchImpl:async()=>Response.json(payload)});
  const result=await success(request);
  assert.ok(!JSON.stringify(result).includes('upstream-secret'));assert.ok(!Object.hasOwn(result.answers.view,'extra'));
  let calls=0;
  const failed=createJevDecider({apiKey:'fake-key',reserveAttempt:async()=>{},fetchImpl:async()=>{calls++;return new Response('sensitive upstream details',{status:401});}});
  await assert.rejects(()=>failed(request),error=>error.code==='authentication_failed'&&!error.message.includes('sensitive'));
  assert.equal(calls,1);
});
test('oversized or malformed Jev requests cannot spend the budget',async()=>{
  let reservations=0;
  const decide=createJevDecider({apiKey:'fake-key',reserveAttempt:async()=>{reservations++;},fetchImpl:async()=>{throw Error('must not run');}});
  await assert.rejects(()=>decide({...request,state:'a'.repeat(24001)}),{code:'request_too_large'});
  await assert.rejects(()=>decide({...request,questions:{bad:{type:'text',instructions:'Generate HTML'}}}),{code:'invalid_questions'});
  assert.equal(reservations,0);
});
