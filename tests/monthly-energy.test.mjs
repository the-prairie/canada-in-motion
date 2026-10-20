import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateMonthlyEnergy,summarizeMonthlyEnergy,monthlyObservation,monthBefore} from '../monthly-energy-model.mjs';
const snapshot=JSON.parse(readFileSync(new URL('../data/monthly-energy.json',import.meta.url)));
const clone=()=>structuredClone(snapshot);
test('official monthly snapshot has 1512 unique jurisdiction-month observations',()=>{
 validateMonthlyEnergy(snapshot);assert.equal(snapshot.metrics.reduce((n,m)=>n+m.observations.length,0),1512);
 for(const region of snapshot.regions){const s=summarizeMonthlyEnergy(snapshot,{region:region.code});assert.equal(s.metrics.length,3);assert.equal(s.metrics[0].history.length,24);}
});
test('year-over-year compares matching calendar months, not adjacent months or annual GDP',()=>{
 const d=clone(),m=d.metrics[0],row=m.observations.find(r=>r.region==='AB'&&r.month===m.latestMonth);
 row.value=120;row.status='available';row.sourceStatus='';row.sourceSymbol='';
 Object.assign(m.observations.find(r=>r.region==='AB'&&r.month===monthBefore(m.latestMonth)),{value:100,status:'available',sourceStatus:'',sourceSymbol:''});
 Object.assign(m.observations.find(r=>r.region==='AB'&&r.month===monthBefore(m.latestMonth,1)),{value:1000,status:'available',sourceStatus:'',sourceSymbol:''});
 assert.ok(Math.abs(monthlyObservation(m,'AB').yoyPct-20)<1e-10);
 assert.equal(monthBefore('2026-01',1),'2025-12');assert.equal(monthBefore('2024-02'),'2023-02');
});
test('gas source scaling is explicit and cannot silently switch to volume',()=>{
 const d=clone(),gas=d.metrics.find(m=>m.id==='gas');assert.equal(gas.unit,'GJ');assert.equal(gas.sourceScale,'thousands');
 gas.unit='m³';assert.throws(()=>validateMonthlyEnergy(d),/unit/);
 gas.unit='GJ';gas.sourceScale='units';assert.throws(()=>validateMonthlyEnergy(d),/unit/);
});
test('zero production is valid but zero baseline has no percentage change',()=>{
 const gas=snapshot.metrics.find(m=>m.id==='gas');for(const region of ['NS','NB']){const row=monthlyObservation(gas,region);assert.equal(row.value,0);assert.equal(row.status,'available');assert.equal(row.yoyPct,null);}
});
test('confidential, absent and missing geography stay distinct',()=>{
 const s=summarizeMonthlyEnergy(snapshot,{region:'ON'});assert.equal(s.metrics.find(m=>m.id==='oil').latest.status,'suppressed');
 assert.equal(summarizeMonthlyEnergy(snapshot,{region:'PE'}).metrics.find(m=>m.id==='oil').latest.status,'not-reported');
 assert.equal(summarizeMonthlyEnergy(snapshot,{region:'PE'}).metrics.find(m=>m.id==='gas').latest.status,'missing');
});
test('commodity dates can advance independently',()=>{
 const d=clone(),gas=d.metrics.find(m=>m.id==='gas');gas.latestMonth=monthBefore(gas.latestMonth,-1);gas.months=gas.months.map(m=>monthBefore(m,-1));gas.observations.forEach(r=>r.month=monthBefore(r.month,-1));
 const s=summarizeMonthlyEnergy(d);assert.notEqual(s.metrics[0].latestMonth,s.metrics[1].latestMonth);
});
test('source flags cannot be laundered into available numbers',()=>{
 for(const flag of ['x','..','...','F','z']){const d=clone();d.metrics[0].observations.find(r=>r.status==='available').sourceStatus=flag;assert.throws(()=>validateMonthlyEnergy(d),/flag/);}
 const d=clone();d.metrics[0].observations.find(r=>r.status==='available').value=Infinity;assert.throws(()=>validateMonthlyEnergy(d),/value/);
});
test('missing, duplicated and nonconsecutive observations fail release validation',()=>{
 let d=clone();d.metrics[0].observations[0]={...d.metrics[0].observations[1]};assert.throws(()=>validateMonthlyEnergy(d),/duplicate/);
 d=clone();d.metrics[0].months[0]='2000-01';assert.throws(()=>validateMonthlyEnergy(d),/nonconsecutive/);
 d=clone();d.metrics[0].observations.pop();assert.throws(()=>validateMonthlyEnergy(d),/grid/);
});
test('published national value is retained rather than summing provinces',()=>{
 const d=clone(),m=d.metrics[0];m.observations.find(r=>r.region==='CA'&&r.month===m.latestMonth).value=42;
 assert.equal(summarizeMonthlyEnergy(d).metrics[0].latest.value,42);
});
test('comparison follows the selected metric and region; unknown selections reject',()=>{
 const s=summarizeMonthlyEnergy(snapshot,{region:'AB',compare:'BC',commodity:'gas'});assert.equal(s.metrics.length,1);assert.equal(s.metrics[0].comparison.region,'BC');
 assert.equal(summarizeMonthlyEnergy(snapshot,{region:'AB',compare:'AB'}).metrics[0].comparison,null);
 assert.throws(()=>summarizeMonthlyEnergy(snapshot,{region:'ZZ'}));assert.throws(()=>summarizeMonthlyEnergy(snapshot,{commodity:'coal'}));
});
