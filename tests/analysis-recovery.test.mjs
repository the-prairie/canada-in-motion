import test from 'node:test';
import assert from 'node:assert/strict';
import {analysisFailure,readAnalysisCooldown,saveAnalysisCooldown,analysisLimitMessage} from '../ai-client.mjs';
const now=Date.parse('2026-10-20T20:00:00Z');
const storage=()=>{const entries=new Map();return {getItem:k=>entries.get(k),setItem:(k,v)=>entries.set(k,v),removeItem:k=>entries.delete(k)};};
test('daily limit retains a local reset time across reloads and expires without retrying',()=>{
  const response=new Response(null,{status:429,headers:{'Retry-After':'14400'}});
  const error=analysisFailure(response,{error:{code:'visitor_limit',message:'Limit reached.'}},now);
  assert.equal(error.resetAt,Date.parse('2026-10-21T00:00:00Z'));
  const cache=storage();saveAnalysisCooldown(error,cache);
  const limit=readAnalysisCooldown(cache,now);
  assert.equal(limit.code,'visitor_limit');
  assert.match(analysisLimitMessage(limit),/network.*Available again.*comparisons above/);
  assert.equal(readAnalysisCooldown(cache,error.resetAt),null);
});
test('body retry delay works when a cross-origin header is unavailable',()=>{
  const error=analysisFailure(new Response(null,{status:429}),{error:{code:'busy',retryAfter:60}},now);
  assert.equal(error.resetAt,now+60000);
});
test('provider errors and malformed cooldowns cannot disable future questions',()=>{
  for(const code of ['provider_unavailable','unknown','visitor_limit']){
    const error=analysisFailure(new Response(null,{status:503}),{error:{code,retryAfter:999}},now);
    assert.equal(error.resetAt,undefined);
  }
  const cache=storage();saveAnalysisCooldown({code:'visitor_limit',resetAt:now+90*86400000},cache);
  assert.equal(readAnalysisCooldown(cache,now),null);
});
