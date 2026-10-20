import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createEnergyAnalyzer} from '../server/energy-analysis.mjs';
import {inspectProvincialForecastQuestion} from '../server/provincial-forecast-request.mjs';
import {loadPublishedForecast} from '../server/cloudflare-worker.mjs';
import {normalizeEconomyState,summarizeEconomy} from '../economy-model.mjs';
import {summarizeProvincialForecast} from '../provincial-forecast-model.mjs';
import {validateWorkspace,initialSelection,resolveWorkspace} from '../workspace-contract.mjs';

const read=name=>JSON.parse(readFileSync(new URL(`../data/${name}.json`,import.meta.url)));
const data=read('economy'),forecast=read('provincial-forecasts'),debate=read('energy-debate'),flows=read('energy-flows'),fiscal=read('provincial-impacts');
const origin=forecast.forecastOriginYear;
const state={region:'AB',scenario:'Current Measures',year:2030,oilShock:10,duration:'persistent'};
function fixture(settings={}) {
  let calls=0;
  const analyze=createEnergyAnalyzer({data,forecast,debate,flows,fiscal,normalizeState:normalizeEconomyState,summarize:summarizeEconomy,workspaceEnabled:true,
    provider:async input=>{
      calls++;assert.equal(input.name,'energy_scenario');
      return {state:{...state,year:origin+1},investigation:{regions:['AB'],topics:['gdp'],metricIds:[],includeMap:false,requestedMeasure:'other-unavailable',...settings.plan}};
    },...settings});
  return {analyze,get calls(){return calls;}};
}

test('question-selected provincial outlook uses exact source predictions despite wrong planner topic and year',async()=>{
  const f=fixture();
  const result=await f.analyze({question:`Forecast real GDP growth for Alberta and Ontario in ${origin}.`,state});
  assert.equal(f.calls,1);
  assert.equal(result.state.year,state.year);
  const panel=result.workspace.panels.find(p=>p.type==='gdp-forecast');
  assert.equal(panel.year,origin);assert.deepEqual(panel.regions,['AB','ON']);
  assert.deepEqual(panel.summary,summarizeProvincialForecast(forecast,{year:origin,regions:['AB','ON']}));
  assert.deepEqual(result.workspace.forecastSnapshot,forecast);
  assert.equal(result.workspace.plan.requestedMeasure,'available');
  assert.doesNotThrow(()=>validateWorkspace(result.workspace));
  assert.match(result.analysis.blocks[0].text,/historical-error range/);
  assert.match(result.analysis.blocks[0].text,/not measured outcomes or effects of changing energy prices/);
});

test('two forecast horizons retain independently selected years after changing a panel',async()=>{
  const result=await fixture().analyze({question:`Compare Alberta GDP forecasts for ${origin} and ${origin+1}.`,state});
  const panels=result.workspace.panels.filter(p=>p.type==='gdp-forecast');
  assert.deepEqual(panels.map(p=>p.year),[origin,origin+1]);
  const selection=initialSelection(result.workspace);
  const resolved=resolveWorkspace(result.workspace,{...selection,regions:['ON'],forecastYearsByPanel:{...selection.forecastYearsByPanel,[panels[0].id]:origin+1}},data);
  assert.deepEqual(resolved.panels.filter(p=>p.type==='gdp-forecast').map(p=>p.year),[origin+1,origin+1]);
  assert.ok(resolved.panels.filter(p=>p.type==='gdp-forecast').every(p=>p.summary.rows[0].region==='ON'));
  assert.doesNotThrow(()=>validateWorkspace(resolved));
});

test('unsupported horizons, sector GDP, nominal levels and causal price effects never receive predictive panels',async()=>{
  for(const question of [
    `Forecast Alberta GDP in ${origin+5}.`,
    `Forecast Alberta energy-sector GDP in ${origin}.`,
    `Forecast nominal GDP for Alberta in ${origin}.`,
    `Forecast nominal provincial economic growth next year.`,
    `Forecast Alberta GDP next year if oil prices rise 10%.`,
    `Predict how a 10% natural gas price increase will affect Alberta GDP next year.`,
  ]){
    const request=inspectProvincialForecastQuestion(question,forecast);
    assert.equal(request?.supported,false,question);
    const result=await fixture().analyze({question,state});
    assert.ok(!result.workspace.panels.some(p=>p.type==='gdp-forecast'),question);
    assert.ok(result.workspace.panels.some(p=>p.type==='coverage-note'),question);
    assert.ok(!result.workspace.forecastSnapshot);
  }
});

test('ordinary economic outlook wording and current-year requests select the forecast without a numeric model response',async()=>{
  for(const question of ['What is the economic outlook for Alberta next year?','What is Alberta GDP growth in the current year?']){
    const result=await fixture().analyze({question,state});
    const panel=result.workspace.panels.find(p=>p.type==='gdp-forecast');
    assert.equal(panel.year,question.includes('next year')?origin+1:origin);
    assert.equal(panel.summary.rows[0].region,'AB');
  }
});

test('forecast horizons and a separate electricity scenario retain their own dates',async()=>{
  const result=await fixture({plan:{topics:['gdp','scenario'],metricIds:['electricity-generation']}}).analyze({
    question:`Compare Alberta and Quebec GDP forecasts in ${origin} and ${origin+1}, and electricity generation in 2040.`,state});
  assert.deepEqual(result.workspace.panels.filter(p=>p.type==='gdp-forecast').map(p=>p.year),[origin,origin+1]);
  assert.equal(result.workspace.panels.find(p=>p.type==='scenario-comparison').year,2040);
  assert.equal(result.state.year,2040);
});

test('territory gaps and missing forecast snapshot remain explicit rather than zero',async()=>{
  const territory=await fixture().analyze({question:`Forecast Yukon GDP growth next year.`,state});
  const panel=territory.workspace.panels.find(p=>p.type==='gdp-forecast');
  assert.deepEqual(panel.regions,['YT']);
  assert.equal(panel.summary.rows[0].status,'insufficient-indicator-coverage');
  assert.equal(panel.summary.rows[0].predictionPct,null);
  assert.match(territory.analysis.blocks[0].text,/no supported forecast/);
  const missing=await fixture({forecast:undefined}).analyze({question:'Forecast Alberta GDP growth next year.',state});
  assert.ok(!missing.workspace.panels.some(p=>p.type==='gdp-forecast'));
  assert.match(missing.workspace.panels[0].message,/could not be loaded/);
});

test('a request for Canada GDP receives an explicit national gap and provincial context, never a sum',async()=>{
  const result=await fixture().analyze({question:`Forecast Canada's GDP growth in ${origin}.`,state});
  assert.equal(result.workspace.plan.requestedMeasure,'other-unavailable');
  assert.deepEqual(result.workspace.plan.regions,['CA']);
  assert.equal(result.workspace.panels[0].type,'coverage-note');
  assert.match(result.workspace.panels[0].message,/does not supply a forecast for Canada as a whole/);
  assert.match(result.workspace.panels[0].message,/chained-dollar provincial GDP levels must not be summed/);
  const panel=result.workspace.panels.find(p=>p.type==='gdp-forecast');
  assert.equal(panel.role,'context');assert.equal(panel.summary.rows.length,13);
  assert.ok(panel.summary.rows.every(row=>row.region!=='CA'));
  assert.doesNotThrow(()=>validateWorkspace(result.workspace));
  const provincial=await fixture().analyze({question:`Compare provincial GDP growth forecasts across Canada in ${origin}.`,state});
  assert.equal(provincial.workspace.plan.requestedMeasure,'available');
  assert.ok(!provincial.workspace.panels.some(p=>p.type==='coverage-note'));
  assert.equal(provincial.workspace.panels[0].summary.rows.length,13);
});

test('a supportive layout model cannot erase missing territory coverage',async()=>{
  const result=await fixture({decider:async()=>({answers:{presentation:{choice:'comparison'},coverage:{choice:'supported'}}})}).analyze({question:'Forecast Yukon GDP growth next year.',state});
  assert.equal(result.workspace.decision.coverage,'partial');
  assert.equal(result.workspace.panels[0].summary.rows[0].predictionPct,null);
});

test('a planner cannot add future forecasts to a historical GDP question',async()=>{
  const result=await fixture({plan:{topics:['gdp-forecast'],requestedMeasure:'available'}}).analyze({question:'Compare observed energy GDP for Alberta and Ontario.',state});
  assert.ok(result.workspace.panels.some(p=>p.type==='province-comparison'));
  assert.ok(!result.workspace.panels.some(p=>p.type==='gdp-forecast'));
  assert.equal(result.workspace.forecastSnapshot,undefined);
});

test('published snapshot loader bounds size, validates identity, checks freshness and caches valid sources',async()=>{
  const now=Date.parse(forecast.asOf)+3600000;
  const respond=value=>async()=>new Response(JSON.stringify(value),{headers:{'Content-Type':'application/json'}});
  assert.equal(await loadPublishedForecast(respond({...forecast,schemaVersion:99}),now),null);
  assert.equal(await loadPublishedForecast(respond({...forecast,dataVersion:'forged'}),now),null);
  assert.equal(await loadPublishedForecast(respond({...forecast,asOf:'2000-01-01'}),now),null);
  assert.equal(await loadPublishedForecast(respond({...forecast,asOf:'2099-01-01'}),now),null);
  assert.equal(await loadPublishedForecast(async()=>new Response('x',{headers:{'Content-Length':String(5*1048576)}}),now),null);
  assert.equal(await loadPublishedForecast(async()=>new Response(null,{status:302,headers:{Location:'https://other.example/data'}}),now),null);
  let calls=0;
  const loaded=await loadPublishedForecast(async url=>{calls++;assert.equal(url,'https://the-prairie.github.io/canada-in-motion/data/provincial-forecasts.json');return new Response(JSON.stringify(forecast));},now);
  assert.deepEqual(loaded,forecast);
  assert.equal(await loadPublishedForecast(async()=>{calls++;throw Error('cached');},now+1),loaded);
  assert.equal(calls,1);
});


test('verified forecast coverage survives an incorrect advisory model label without losing its audit trail',async()=>{
  let decisionInput;
  const result=await fixture({decider:async input=>{decisionInput=input;return {answers:{presentation:{choice:'comparison'},coverage:{choice:'unsupported'}}};}}).analyze({question:`Compare Alberta and Ontario GDP forecasts in ${origin} and ${origin+1}.`,state});
  assert.equal(result.workspace.decision.coverage,'supported');
  assert.equal(result.workspace.decision.modelCoverage,'unsupported');
  assert.equal(result.workspace.decision.coverageBasis,'verified-forecast-rows');
  assert.deepEqual(decisionInput.state.panels.map(p=>p.forecastYear),[origin,origin+1]);
  assert.ok(decisionInput.state.panels.every(p=>JSON.stringify(p.availableRegions)===JSON.stringify(['AB','ON'])&&!p.unavailableRegions.length));
  assert.match(decisionInput.questions.coverage.instructions,/plan.year.*other tools/);
  assert.doesNotThrow(()=>validateWorkspace(result.workspace));
});


test('forecast-only panels do not erase an advisory gap for a companion outcome',async()=>{
  const f=fixture({decider:async()=>({answers:{presentation:{choice:'comparison'},coverage:{choice:'partial'}}})});
  for(const question of [`Forecast Alberta GDP and jobs in ${origin}.`,`Compare Alberta GDP forecasts and unemployment forecasts for ${origin} and ${origin+1}.`]){
    const result=await f.analyze({question,state});
    assert.equal(result.workspace.decision.coverage,'partial');
    assert.equal(result.workspace.decision.coverageBasis,undefined);
  }
});
