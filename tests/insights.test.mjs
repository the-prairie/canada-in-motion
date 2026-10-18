import test from 'node:test';
import assert from 'node:assert/strict';
import {wellStatusSummary, comparisonWidths} from '../insights.mjs';
test('orphan designation and abandonment count separately and overlap explicitly', () => {
  assert.deepEqual(wellStatusSummary([
    {closureStatus:'abandoned',orphanStatus:'designated'},
    {closureStatus:'abandoned',orphanStatus:'unknown'},
    {closureStatus:'suspended',orphanStatus:'designated'},
    {closureStatus:'unknown',orphanStatus:'unknown'},
  ]), {total:4,abandoned:2,designated:2,both:1,closureUnknown:1});
});
test('comparison uses a shared zero baseline and handles zero without invented bars', () => {
  assert.deepEqual(comparisonWidths([20,40,0]), [50,100,0]);
  assert.deepEqual(comparisonWidths([0,0]), [0,0]);
  assert.throws(()=>comparisonWidths([NaN,1]));
  assert.throws(()=>comparisonWidths([-1,2]));
});
