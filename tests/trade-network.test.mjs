import test from 'node:test';
import assert from 'node:assert/strict';
import {networkConnections} from '../trade-network-model.mjs';
const links=[{origin:'AB',destination:'BC',value:100},{origin:'BC',destination:'AB',value:20},{origin:'QC',destination:'ON',value:50},{origin:'AB',destination:'ON',value:0},{origin:'PE',destination:'NB',value:null}];
test('network scope accounts for hidden positive values, zeros and missingness separately',()=>{
  const result=networkConnections(links,{maximum:2});
  assert.equal(result.total,170);assert.equal(result.visible,150);assert.equal(result.omitted,1);
  assert.equal(result.zeros,1);assert.equal(result.unpublished,1);
  assert.equal(result.share,150/170*100);
});
test('a pinned smaller connection stays visible and reciprocal trades remain distinct',()=>{
  const result=networkConnections(links,{maximum:1,active:'BC-AB',focus:'AB'});
  assert.deepEqual(result.shown.map(r=>[r.origin,r.destination]),[['AB','BC'],['BC','AB']]);
  assert.equal(result.share,100);assert.equal(result.total,120);
});
test('zero-only and unpublished scopes never become positive flows',()=>{
  const result=networkConnections(links,{focus:'PE'});
  assert.equal(result.shown.length,0);assert.equal(result.share,null);assert.equal(result.unpublished,1);
});

test('a province focus outside a new comparison is cleared with its connection',async()=>{
  const {normalizeNetworkSelection}=await import('../trade-network-model.mjs');
  const next=normalizeNetworkSelection([{origin:'SK',destination:'ON',value:1800}],{tradeFocus:'AB',tradeConnection:'AB-BC',tradeDisplay:'map'});
  assert.deepEqual(next,{tradeFocus:null,tradeConnection:null,tradeDisplay:'map'});
});
