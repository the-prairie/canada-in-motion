import test from 'node:test';
import assert from 'node:assert/strict';
import {project,unproject,normalizeArea,inArea,summarize,statusAvailability,inventoryScope,matchingJurisdictions} from '../atlas-model.mjs';
import {filterWells,normalizeState} from '../model.mjs';

test('Canada Albers roundtrips western, Arctic and offshore source coordinates', () => {
  for (const coordinate of [[-123.1,49.2],[-96,58],[-45.26,47.1],[-84,82],[-141,60],[-60,44]]) {
    const actual = unproject(...project(...coordinate));
    actual.forEach((value,index) => assert.ok(Math.abs(value-coordinate[index]) < 1e-9));
  }
  assert.deepEqual(project(-96,58),[0,0]);
});
test('shared areas accept reversed corners but reject malformed and degenerate bounds', () => {
  assert.deepEqual(normalizeArea([3,4,-1,-2]),[-1,-2,3,4]);
  for (const invalid of [null,[],[0,0,0,1],[0,0,1,0],[0,0,Infinity,1],['0',0,1,1],[0,0,5000,1]]) assert.equal(normalizeArea(invalid),null);
});
test('geographic selection includes boundary records and excludes invalid coordinates', () => {
  const well = {lon:-113.6,lat:53.3};
  const [x,y] = project(well.lon,well.lat);
  assert.equal(inArea(well,[x,y,x+1,y+1]),true);
  assert.equal(inArea(well,[x+1,y,x+2,y+1]),false);
  assert.equal(inArea({lon:null,lat:53},[x,y,x+1,y+1]),false);
  assert.equal(inArea(well,null),true);
});
test('comparison denominators and unknown counts use the supplied matching inventory only', () => {
  const result = summarize([
    {province:'AB',closureStatus:'abandoned',sourceId:'a'},
    {province:'AB',closureStatus:'unmapped publisher value',sourceId:'a'},
    {province:'QC',closureStatus:'active',sourceId:'q'},
  ]);
  assert.equal(result.total,3);
  assert.deepEqual(result.counts,[1,0,1,1]);
  assert.equal(result.rows.find(row=>row.code==='AB').total,2);
  assert.deepEqual(result.rows.find(row=>row.code==='AB').counts,[1,0,0,1]);
  assert.equal(result.rows.find(row=>row.code==='QC').total,1);
  assert.equal(result.rows.find(row=>row.code==='PE').total,0);
});

test('active Alberta and Saskatchewan are outside source scope rather than measured zero', () => {
  const catalog={sources:[{id:'aer-abandoned-wells',province:'AB',closureMapping:{Abandoned:'abandoned',Suspension:'suspended'}},{id:'sk-orphan-wells',province:'SK'}]};
  const inventory=summarize([{province:'AB',closureStatus:'abandoned',sourceId:'aer-abandoned-wells'},{province:'SK',closureStatus:'unknown',sourceId:'sk-orphan-wells'}]);
  assert.deepEqual(statusAvailability(catalog,'AB',inventory),[true,true,false,true]);
  assert.deepEqual(statusAvailability(catalog,'SK',inventory),[true,false,false,true]);
  assert.match(inventoryScope(catalog,'AB').detail,/province-wide active and marginal totals are shown separately/);
  assert.match(inventoryScope(catalog,'SK').label,/Orphan/);
  assert.deepEqual(statusAvailability(catalog,'PE',inventory),[false,false,false,false]);
});

test('status facets retain other statuses while preserving province and text filters', () => {
  const wells=[{id:'one',name:'Match',province:'BC',closureStatus:'abandoned'},{id:'two',name:'Match',province:'BC',closureStatus:'active'},{id:'three',name:'Other',province:'BC',closureStatus:'active'},{id:'four',name:'Match',province:'AB',closureStatus:'active'}];
  const state=normalizeState({province:'BC',closure:'abandoned',query:'Match'});
  assert.deepEqual(summarize(filterWells(wells,state)).counts,[1,0,0,0]);
  assert.deepEqual(summarize(filterWells(wells,{...state,closure:'all'})).counts,[1,0,1,0]);
  const catalog={sources:[{province:'BC',closureMapping:{ACT:'active',ABAN:'abandoned'}}]};
  assert.equal(statusAvailability(catalog,'BC',summarize([]))[2],true);
});

test('province picker search handles accents and codes without changing jurisdiction identities', () => {
  assert.deepEqual(matchingJurisdictions('quebec'),[['QC','Québec']]);
  assert.deepEqual(matchingJurisdictions('AB'),[['AB','Alberta']]);
  assert.equal(matchingJurisdictions('').length,14);
  assert.deepEqual(matchingJurisdictions('unlisted'),[]);
});
