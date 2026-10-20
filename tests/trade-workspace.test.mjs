import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createTradeWorkspace,normalizeTradeSelection} from '../trade-workspace-model.mjs';
import {validateWorkspace,compileWorkspace,initialSelection,resolveWorkspace} from '../workspace-contract.mjs';
import {normalizeEconomyState} from '../economy-model.mjs';
const read=name=>JSON.parse(readFileSync(new URL(`../data/${name}.json`,import.meta.url)));
const economy=read('economy'),flows=read('energy-flows'),fiscal=read('provincial-impacts');

test('the direct explorer pins its data and uses registered OpenUI components',()=>{
  const w=createTradeWorkspace({economy,flows,fiscal});
  assert.equal(validateWorkspace(w),w);
  assert.match(compileWorkspace(w),/EnergyTrade\("energy-trade"\)/);
  assert.match(compileWorkspace(w),/ProvincialImpact\("provincial-impact"\)/);
  assert.equal(w.tradeSnapshot,flows);assert.equal(w.fiscalSnapshot,fiscal);
  assert.equal(w.decision.status,'not-needed');
});

test('changing commodity, pair and price resolves all panels and exports from the same pinned data',()=>{
  const w=createTradeWorkspace({economy,flows,fiscal});
  const result=resolveWorkspace(w,{...initialSelection(w),regions:['AB','BC'],tradeCommodity:'electricity',linkScope:'between',priceShock:-10},economy);
  validateWorkspace(result);
  const trade=result.panels.find(p=>p.type==='energy-trade');
  assert.equal(trade.summary.links.length,2);
  assert.deepEqual(trade.summary.links.map(r=>[r.origin,r.destination,r.value]).sort(),[['AB','BC',60.209],['BC','AB',420.803]]);
  assert.equal(trade.summary.totals.value,481.012);
  const physical=result.panels.find(p=>p.type==='energy-transfers');
  assert.equal(physical.period,'2025');assert.equal(physical.dataset.publicationStatus,'preliminary');
  assert.deepEqual(physical.dataset.observations.map(r=>r.region),['AB','BC']);
  const impact=result.panels.find(p=>p.type==='provincial-impact').result;
  assert.equal(impact.shockPct,-10);assert.equal(impact.trade.rows.length,2);
  // Price exposure retains trade with ALL partners, rather than the pair on the map.
  assert.notEqual(impact.trade.rows.find(r=>r.region==='AB').exports,60.2);
  assert.equal(impact.trade.national.netChange,0);
  assert.ok(impact.fiscal.rows.every(r=>!r.available&&r.revenueChangeLow===null));
  assert.equal(JSON.parse(JSON.stringify(result)).tradeSnapshot.dataVersion,flows.dataVersion);
});

test('local commodity changes retain the complete citation registry and all calibrated fiscal ranges',()=>{
  const w=createTradeWorkspace({economy,flows,fiscal,regions:['AB']});
  const result=resolveWorkspace(w,{...initialSelection(w),regions:['BC'],tradeCommodity:'gas',priceShock:-10},economy);
  validateWorkspace(result);
  const row=result.panels.find(p=>p.type==='provincial-impact').result.fiscal.rows[0];
  assert.equal(row.region,'BC');assert.ok(row.available);
  assert.ok(Math.abs(row.revenueChangeLow+218)<1e-9);
  assert.ok(Math.abs(row.revenueChangeHigh+130.8)<1e-9);
  assert.ok(result.sources.some(s=>s.id===row.sourceId));
});

test('unsupported prices, periods and altered snapshots cannot create a view',()=>{
  assert.throws(()=>normalizeTradeSelection(flows,{priceShock:21}));
  assert.throws(()=>normalizeTradeSelection(flows,{tradeYear:2050}));
  const w=createTradeWorkspace({economy,flows,fiscal});
  const bad=structuredClone(w);bad.tradeSnapshot.trade.observations[0].value=-1;
  assert.throws(()=>validateWorkspace(bad));
});

test('the direct explorer state survives URL serialization independently of CER dates',()=>{
  const state=normalizeEconomyState({section:'trade',year:2040,tradeYear:2023,tradeCommodity:'gas',priceShock:-15,tradeRegions:['AB','BC'],linkScope:'between',transferSet:'gas-net-annual'});
  const restored=normalizeEconomyState(JSON.parse(JSON.stringify(state)));
  assert.deepEqual(restored,state);assert.equal(restored.year,2040);assert.equal(restored.tradeYear,2023);
});

// An unsupported physical-flow answer must stay context after changing controls.
test('recalculation preserves panel identity and context role',()=>{
  const w=createTradeWorkspace({economy,flows,fiscal});
  const physical=w.panels.find(p=>p.type==='energy-transfers');
  physical.id='context-transfers';physical.role='context';
  const result=resolveWorkspace(w,{...initialSelection(w),tradeCommodity:'gas'},economy);
  const revised=result.panels.find(p=>p.type==='energy-transfers');
  assert.equal(revised.id,'context-transfers');assert.equal(revised.role,'context');
});
