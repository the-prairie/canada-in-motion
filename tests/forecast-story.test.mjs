import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {forecastStory} from '../forecast-story-model.mjs';
import {summarizeProvincialForecast} from '../provincial-forecast-model.mjs';
const data=JSON.parse(readFileSync(new URL('../data/provincial-forecasts.json',import.meta.url)));

test('outlook chart preserves all source forecast values and error ranges',()=>{
  const {rows}=summarizeProvincialForecast(data);
  for(const row of rows){
    const scene=forecastStory(data,row);
    assert.deepEqual(scene.outlook.map(p=>[p.year,p.value,p.lower,p.upper]),data.forecasts.filter(p=>p.region===row.region).sort((a,b)=>a.year-b.year).map(p=>[p.year,p.predictionPct,p.lowerPct,p.upperPct]));
    for(const point of scene.points)for(const value of [point.value,point.lower,point.upper].filter(Number.isFinite))assert.ok(value>=scene.domain[0]&&value<=scene.domain[1]);
    assert.ok(scene.domain[0]<0&&scene.domain[1]>0);
  }
});

test('territories retain observed GDP without fabricated forecasts',()=>{
  const {rows}=summarizeProvincialForecast(data,{regions:['YT','NT','NU']});
  for(const row of rows){
    const scene=forecastStory(data,row);
    assert.equal(scene.outlook.length,0);
    assert.ok(scene.observed.length>0);
    assert.equal(scene.latest.year,data.information.gdpYear);
    assert.ok(scene.points.every(p=>p.kind==='observed'));
  }
});

test('selected year does not reshape the history or uncertainty scale',()=>{
  for(const region of data.regions){
    const a=summarizeProvincialForecast(data,{regions:[region.code],year:data.forecastOriginYear}).rows[0];
    const b=summarizeProvincialForecast(data,{regions:[region.code],year:data.forecastOriginYear+1}).rows[0];
    assert.deepEqual(forecastStory(data,a),forecastStory(data,b));
  }
});
