import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateAlbertaWellStatus} from '../alberta-status-model.mjs';
const data=JSON.parse(readFileSync(new URL('../data/alberta-well-status.json',import.meta.url)));

test('AER operating licence totals include marginal wells without inventing a snapshot month',()=>{
  validateAlbertaWellStatus(data);
  assert.equal(data.latest.operating,data.latest.counts.active+data.latest.counts.marginal);
  assert.equal(data.latest.snapshotDate,null);
  assert.equal(data.latest.datePrecision,'year');
  assert.equal(data.measure,'province-wide-lifecycle-counts');
});

test('inconsistent counts, duplicate years and invented observation dates are rejected',()=>{
  for(const mutate of [
    d=>{d.latest.operating++;},
    d=>{d.observations[0].counts.active=-1;},
    d=>{d.observations.push(d.observations[0]);},
    d=>{d.observations.at(-1).snapshotDate=d.retrievedAt.slice(0,10);},
  ]){const changed=structuredClone(data);mutate(changed);assert.throws(()=>validateAlbertaWellStatus(changed));}
});
