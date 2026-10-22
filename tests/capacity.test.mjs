import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeEconomyState} from '../economy-model.mjs';
import {normalizeCapacitySelection} from '../capacity-model.mjs';

test('independently transcribed capacity observations, holdouts and scenario invariants',async()=>{
 await import('./capacity-independent.mjs');
});
test('capacity route survives serialization and constrains untrusted URL state',()=>{
 const raw={section:'services',albertaMode:'capacity',albertaStage:'health',capacity:{topic:'funding',extraEntrants:900,retentionPp:1.2,delayYears:2,years:7,openingShiftMonths:-6,fundingYear:2024,projectionChangePct:2.5,fundingRule:'previous'}};
 const first=normalizeEconomyState(raw);
 assert.deepEqual(normalizeEconomyState(JSON.parse(JSON.stringify(first))),first);
 assert.deepEqual(first.capacity,raw.capacity);
 const invalid=normalizeEconomyState({albertaMode:'bogus',capacity:{topic:'bogus',extraEntrants:99999,years:-5,retentionPp:Infinity,fundingRule:'javascript:bad'}});
 assert.equal(invalid.albertaMode,'observed');
 assert.equal(invalid.capacity.extraEntrants,3000);
 assert.equal(invalid.capacity.years,1);
 assert.equal(invalid.capacity.retentionPp,0);
 assert.deepEqual(normalizeCapacitySelection(null),normalizeCapacitySelection());
});
