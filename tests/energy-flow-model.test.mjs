import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateEnergyFlows, summarizeEnergyFlows } from '../energy-flow-model.mjs';

const data = JSON.parse(await readFile(new URL('../data/energy-flows.json',import.meta.url),'utf8'));

test('official snapshot retains all jurisdictions, three commodity matrices and independent physical periods', () => {
  assert.equal(validateEnergyFlows(data),data);
  assert.equal(data.trade.observations.length,data.trade.years.length*14*13*3);
  assert.equal(data.physical.series.length,4);
  const annual = data.physical.series.find(series => series.id==='electricity-annual');
  assert.equal(annual.measure,'receipts-deliveries');
  assert.equal(annual.unit,'MWh');
});

test('domestic internal trade totals balance once, with international sales excluded', () => {
  for (const commodity of ['oil','gas','electricity']) {
    const result = summarizeEnergyFlows(data,{commodity});
    assert.equal(result.links.length,13*12);
    assert.equal(result.totals.missingRecords,0);
    assert.ok(Math.abs(result.balances.reduce((sum,row) => sum+row.netExports,0))<1e-6);
    assert.ok(Math.abs(result.balances.reduce((sum,row) => sum+row.exports,0)-result.totals.value)<1e-6);
    assert.equal(result.links.some(row => row.origin==='ROW'||row.destination==='ROW'),false);
  }
});

test('between selection limits links while provincial balances retain all counterparties', () => {
  const result = summarizeEnergyFlows(data,{regions:['AB','BC'],commodity:'oil',linkScope:'between'});
  assert.equal(result.links.length,2);
  assert.ok(result.links.every(row => ['AB','BC'].includes(row.origin)&&['AB','BC'].includes(row.destination)));
  const all = summarizeEnergyFlows(data,{commodity:'oil'});
  assert.deepEqual(result.balances.find(row=>row.region==='AB'),all.balances.find(row=>row.region==='AB'));
  assert.equal(summarizeEnergyFlows(data,{regions:['AB'],linkScope:'between'}).links.length,24);
});

test('missing trade cannot be converted to zero or partial complete totals', () => {
  const edited = structuredClone(data);
  const row = edited.trade.observations.find(row => row.year===edited.trade.latestYear && row.origin==='AB'&&row.destination==='BC'&&row.commodity==='gas');
  row.value=null; row.status='suppressed'; row.components[0].value=null; row.components[0].status='suppressed'; row.components[0].sourceStatus='x';
  const result = summarizeEnergyFlows(edited,{regions:['AB'],commodity:'gas'});
  assert.equal(result.totals.value,null);
  assert.equal(result.totals.missingRecords,1);
  assert.equal(result.balances[0].exports,null);
  assert.equal(result.balances[0].netExports,null);
  assert.equal(typeof result.totals.availableValue,'number');
});

test('duplicate, invented unit, missing pair and inconsistent aggregate are rejected', () => {
  for (const mutate of [
    copy=>copy.trade.observations.push(copy.trade.observations[0]),
    copy=>copy.trade.unit='barrels',
    copy=>copy.trade.observations.pop(),
    copy=>copy.trade.observations[0].value=999999,
  ]) {
    const copy=structuredClone(data);mutate(copy);
    assert.throws(()=>validateEnergyFlows(copy));
  }
});

test('suppressed physical balances and absent territories remain null', () => {
  const result=summarizeEnergyFlows(data,{commodity:'oil',regions:['NS','NT']});
  assert.ok(result.physical[0].observations.every(row=>row.netReceipts===null));
  assert.ok(result.physical[0].observations.every(row=>row.receipts===null&&row.deliveries===null));
  const electricity=summarizeEnergyFlows(data,{commodity:'electricity',regions:['NU']});
  assert.ok(electricity.physical.every(series=>series.observations[0].netReceipts===null));
});

test('unpublished periods, unknown fuels and regions are never silently substituted', () => {
  for (const options of [{year:2060},{commodity:'all-energy'},{regions:['XX']},{linkScope:'physical-routes'}]) {
    assert.throws(()=>summarizeEnergyFlows(data,options));
  }
});

test('international comparison declares different valuation bases and partitions totals',()=>{
  const result=summarizeEnergyFlows(data,{regions:['AB'],commodity:'oil',includeInternational:true});
  assert.equal(result.valuation.basis,'mixed');assert.match(result.valuation.international,/FOB/);
  assert.ok(result.totalsByScope.international.value>0);
  assert.ok(Math.abs(result.totals.value-result.totalsByScope.interprovincial.value-result.totalsByScope.international.value)<1e-6);
});

test('physical source identity cannot drift into a different commodity or measure',()=>{
  for(const patch of [{id:'invented'},{commodity:'oil'},{measure:'net-receipts'},{sourceId:'statcan-36100709'}]){
    const copy=structuredClone(data);Object.assign(copy.physical.series[0],patch);
    assert.throws(()=>validateEnergyFlows(copy),/physical source contract/);
  }
});
