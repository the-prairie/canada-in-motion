import test from 'node:test';
import assert from 'node:assert/strict';
import {DESTINATIONS, currentDestination, destinationState} from '../navigation-model.mjs';

test('every destination resolves without losing filters or scenario inputs', () => {
  const original={view:'economy',economy:{section:'income',region:'BC',demandMillion:50},province:'AB',closure:'abandoned',labTab:'cleanup',well:'selected',scenario:{budget:10000000}};
  for(const item of DESTINATIONS){
    const next=destinationState(original,item.id);
    assert.equal(currentDestination(next).id,item.id);
    assert.equal(next.economy.region,'BC');
    assert.equal(next.economy.demandMillion,50);
    assert.equal(next.province,'AB');
    assert.equal(next.closure,'abandoned');
    assert.deepEqual(next.scenario,original.scenario);
    assert.equal(next.well,null);
  }
  assert.equal(original.well,'selected');
});
test('unknown destinations leave state alone and old links resolve', () => {
  const state={view:'lab',labTab:'cleanup'};
  assert.equal(destinationState(state,'invalid'),state);
  assert.equal(currentDestination(state).id,'cleanup');
  assert.equal(currentDestination({view:'economy',economy:{section:'oil'}}).id,'oil');
  assert.equal(currentDestination({view:'economy'}).id,'explore');
  assert.equal(new Set(DESTINATIONS.map(d=>d.id)).size,12);
});

test('first Explore visit inherits the selected province, saved questions retain their focus', () => {
  const state={view:'economy',economy:{section:'income',region:'BC',story:{}}};
  assert.equal(destinationState(state,'explore').economy.story.focus,'BC');
  state.economy.story={focus:'AB',shockPct:-10};
  assert.deepEqual(destinationState(state,'explore').economy.story,state.economy.story);
});
