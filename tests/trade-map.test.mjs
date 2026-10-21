import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {project} from '../atlas-model.mjs';
import {TRADE_ANCHORS,tradeMapGeometry,guidedMapScene} from '../trade-map-model.mjs';
import {GUIDE_DEFAULTS,summarizeGuidedConnection} from '../guided-scenario-model.mjs';

const read=file=>JSON.parse(readFileSync(new URL(`../data/${file}`,import.meta.url)));
const flows=read('energy-flows.json');
const snapshots={fiscal:read('provincial-impacts.json'),priceResponses:read('provincial-price-response.json'),householdCosts:read('household-energy-costs.json')};
const run=patch=>summarizeGuidedConnection(flows,snapshots,{...GUIDE_DEFAULTS,tradeConnection:'AB-BC',tradeCommodity:'oil',tradeYear:2024,priceShock:10,guideStep:'exchange',...patch});
const shapes=read('provinces.geojson').features.filter(f=>f.properties.admin==='Canada').map(f=>({code:f.properties.postal,rings:(f.geometry.type==='Polygon'?[f.geometry.coordinates]:f.geometry.coordinates).flat().map(ring=>ring.map(point=>project(...point)))}));

test('every provincial pair fits desktop and compact map bounds with finite geometry',()=>{
  for(const [width,height,padding] of [[620,360,32],[354,124,24],[284,124,24]]){
    for(const a of Object.keys(TRADE_ANCHORS))for(const b of Object.keys(TRADE_ANCHORS)){
      if(a===b)continue;
      const g=tradeMapGeometry(shapes,{regions:[a,b],width,height,padding});
      for(const code of [a,b]){
        const [x,y]=g.anchors[code];
        assert.ok(x>=10&&x<=width-10&&y>=20&&y<=height-8,`${a}-${b} ${code} ${width}×${height}: ${x},${y}`);
      }
      assert.doesNotMatch(g.path(a,b),/NaN|Infinity/);
      assert.equal(g.paths.length,13);
      const [ax,ay]=g.labels[a],[bx,by]=g.labels[b];
      assert.ok(Math.abs(ax-bx)>=24||Math.abs(ay-by)>=18,`Labels overlap for ${a}-${b}`);
    }
  }
  assert.equal(tradeMapGeometry([]),null);
});

test('the map reports receipt and cost changes equally without inventing flow speed or volume',()=>{
  const geometry=tradeMapGeometry(shapes,{regions:['AB','BC']}),path=geometry.path('AB','BC');
  for(const priceShock of [-20,0,20]){
    const result=run({priceShock}),scene=guidedMapScene(result);
    assert.equal(scene.hasFlow,true);
    assert.deepEqual(scene.rows.map(r=>r.value),[result.exchange.change,result.exchange.change]);
    assert.deepEqual(scene.rows.map(r=>r.unit),['million-cad','million-cad']);
    assert.deepEqual(scene.rows.map(r=>r.label),['Receipts change','Costs change']);
    assert.match(scene.motionMeaning,/not shipment routes or speed/);
    assert.equal(tradeMapGeometry(shapes,{regions:scene.rows.map(r=>r.region)}).path('AB','BC'),path);
  }
});

test('each stage maps exact supported results with its own unit and never reveals failed estimates',()=>{
  for(const tradeCommodity of ['oil','gas','electricity'])for(const guideStep of ['provinces','households'])for(const guideHouseholdBasis of ['benchmark','retail']){
    const result=run({tradeCommodity,guideStep,guideHouseholdBasis,guideRetailShock:-10});
    const scene=guidedMapScene(result);
    for(const [i,row] of scene.rows.entries()){
      const model=guideStep==='provinces'?result.provinces[i].gdp:result.provinces[i].household;
      const supported=guideStep==='provinces'?model.status==='supported':['supported','retail-scenario'].includes(model.status);
      assert.equal(row.value,supported?(guideStep==='provinces'?model.estimatePct:model.annualChangeCad):null);
      assert.equal(row.unit,guideStep==='provinces'?'percent':'cad-year');
    }
  }
  assert.equal(guidedMapScene(run({guideStep:'provinces'})).rows[0].value,null);
});

test('published zeros and suppressed connections have no animated flow',()=>{
  for(const value of [0,null]){
    const result=run({});result.exchange.value=value;result.exchange.available=value!==null;result.exchange.change=value;
    const scene=guidedMapScene(result);
    assert.equal(scene.hasFlow,false);
    assert.equal(scene.rows[0].value,value);
  }
});
