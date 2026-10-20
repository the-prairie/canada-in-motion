import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateProvincialForecast,validateProvincialOutlooks,summarizeProvincialForecast} from '../provincial-forecast-model.mjs';
import {normalizeEconomyState} from '../economy-model.mjs';
import {validateWorkspace,compileWorkspace,initialSelection,resolveWorkspace} from '../workspace-contract.mjs';
import {captureInvestigation,validateInvestigation} from '../investigation-model.mjs';
const read=file=>JSON.parse(readFileSync(new URL(`../data/${file}.json`,import.meta.url)));
const data=read('provincial-forecasts'),outlooks=read('provincial-outlook-benchmarks'),economy=read('economy');
const make=()=>({schemaVersion:1,dataVersion:economy.generatedAt,economySnapshot:economy,forecastSnapshot:data,sources:structuredClone(data.sources),plan:{regions:['AB','ON'],year:2030,scenario:'Current Measures',oilShock:10,duration:'persistent'},panels:[2026,2027].map(year=>({id:`gdp-forecast-${year}`,type:'gdp-forecast',title:'Provincial GDP outlook',role:'answer',sourceIds:data.sources.map(s=>s.id),unit:data.information.forecastUnit,period:String(year),year,regions:['AB','ON'],summary:summarizeProvincialForecast(data,{regions:['AB','ON'],year})}))});

test('source-backed forecasts retain both horizons and explicit territorial gaps',()=>{
  assert.equal(validateProvincialForecast(data),data);
  assert.equal(data.forecasts.length,20);
  const view=summarizeProvincialForecast(data);
  assert.equal(view.rows.length,13);
  assert.equal(view.rows.filter(r=>r.status==='available').length,10);
  assert.equal(view.rows.find(r=>r.region==='NU').predictionPct,null);
  const ab=summarizeProvincialForecast(data,{regions:['AB'],year:2027}).rows[0];
  assert.equal(ab.model,'historical-mean');
  assert.equal(ab.predictionPct,ab.benchmarkPct);
  assert.ok(ab.actuals.every(r=>r.year<=data.information.gdpYear));
  assert.throws(()=>summarizeProvincialForecast(data,{year:2040}));
  assert.throws(()=>summarizeProvincialForecast(data,{regions:['XX']}));
});
test('published backtest scores, period cutoffs and intervals are verified',()=>{
  for(const mutate of [
    d=>d.forecasts[0].validation.mae+=1,
    d=>d.forecasts[0].validation.heldout[0].selectionMaxTargetYear=2050,
    d=>d.forecasts[0].modelDetails.selectionMaxTargetYear=2050,
    d=>d.forecasts[0].modelDetails.calibrationMaxTargetYear=2050,
    d=>d.forecasts[0].modelDetails.candidates['historical-mean'].fit.trainingMaxTargetYear=2050,
    d=>d.sources[0].releaseTime='2050-01-01',
    d=>d.forecasts[0].validation.benchmarkMae+=1,
    d=>d.forecasts[0].validation.intervalCoverage=.123,
    d=>d.forecasts[0].validation.heldout[0].trainingMaxTargetYear=2050,
    d=>d.forecasts[0].validation.heldout[0].calibrationMaxTargetYear=2050,
    d=>d.forecasts[0].upperPct=d.forecasts[0].predictionPct-1,
    d=>d.information.gdpBasis='GDP at market prices',
    d=>d.history.gdp[0].value=Infinity,
  ]){
    const value=structuredClone(data);mutate(value);assert.throws(()=>validateProvincialForecast(value));
  }
});
test('official outlooks remain dated external forecasts on a separate basis',()=>{
  assert.equal(validateProvincialOutlooks(outlooks),outlooks);
  assert.equal(outlooks.rows.length,20);
  const broken=structuredClone(outlooks);broken.rows[0].publicationDate='2050-01-01';
  assert.throws(()=>validateProvincialOutlooks(broken));
});
test('outlook URL controls survive normalization without borrowing CER years',()=>{
  const state=normalizeEconomyState({section:'outlook',forecastYear:2027,forecastRegions:['AB','ON'],forecastFocus:'ON',year:2040});
  assert.deepEqual(normalizeEconomyState(JSON.parse(JSON.stringify(state))),state);
  assert.equal(state.forecastYear,2027);assert.equal(state.year,2040);
});
test('OpenUI forecast rows are checked against their pinned statistical snapshot',()=>{
  const workspace=make();assert.equal(validateWorkspace(workspace),workspace);
  assert.match(compileWorkspace(workspace),/ProvincialForecast/);
  for(const mutate of [
    w=>w.panels[0].summary.rows[0].predictionPct=99,
    w=>w.panels[0].year=2040,
    w=>delete w.forecastSnapshot,
    w=>w.panels[0].sourceIds=[],
    w=>w.sources[0].url='https://example.org/false-source'
  ]){
    const value=structuredClone(workspace);mutate(value);assert.throws(()=>validateWorkspace(value));
  }
});
test('linked forecast selections preserve separate years and saved data',()=>{
  const workspace=make(),selection={...initialSelection(workspace),regions:['QC','NU']};
  const result=resolveWorkspace(workspace,selection,economy);
  assert.deepEqual(result.panels.map(p=>p.year),[2026,2027]);
  assert.deepEqual(result.panels[0].summary.rows.map(r=>r.region),['QC','NU']);
  assert.equal(result.panels[0].summary.rows[1].predictionPct,null);
  const saved=captureInvestigation({workspace,selection,question:'Québec and Nunavut forecasts'});
  const restored=validateInvestigation(JSON.parse(JSON.stringify(saved)));
  assert.deepEqual(restored.selection,selection);
  const different=structuredClone(economy);different.generatedAt='2030-01-01';
  assert.deepEqual(resolveWorkspace(restored.workspace,selection,different).panels,result.panels);
  assert.throws(()=>resolveWorkspace(workspace,{...selection,forecastYearsByPanel:{'gdp-forecast-2026':2050,'gdp-forecast-2027':2027}},economy));
});
