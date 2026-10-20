import React,{useState,useId} from 'react';
import {createRoot} from 'react-dom/client';
import {summarizeProvincialForecast,validateProvincialForecast} from '../provincial-forecast-model.mjs';

const n=(value,d=1)=>Number.isFinite(value)?new Intl.NumberFormat('en-CA',{maximumFractionDigits:d}).format(value):'—';
const pct=value=>Number.isFinite(value)?`${value>0?'+':''}${n(value)}%`:'Not available';
const range=row=>Number.isFinite(row.lowerPct)?`${pct(row.lowerPct)} to ${pct(row.upperPct)}`:row.status&&row.status!=='available'?'Not available':'Too little history';
const modelName=id=>({'mean':'Historical mean','mean-growth':'Historical mean','historical-mean':'Historical mean','pooled':'Pooled employment model','pooled-ridge':'Pooled employment model','pooled-employment-bridge':'Pooled employment model','employment-bridge':'Provincial employment model','shrunk-autoregression':'Shrunk autoregression','own':'Provincial employment model','own-employment':'Provincial employment model','ar1':'Autoregression','ensemble':'Forecast combination'}[id]||id?.replaceAll('-',' '));
const download=(data,selection)=>{const url=URL.createObjectURL(new Blob([JSON.stringify({selection,result:summarizeProvincialForecast(data,selection),sourceSnapshot:data},null,2)],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download='provincial-gdp-forecast.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};

function ForecastRanges({rows,focus,onFocus,year}){
  const available=rows.filter(r=>r.status==='available');
  const low=Math.floor(Math.min(-1,...available.map(r=>r.lowerPct??r.predictionPct)));
  const high=Math.ceil(Math.max(1,...available.map(r=>r.upperPct??r.predictionPct)));
  const position=value=>(value-low)/(high-low)*100;
  return <div className="pf-range-chart" role="group" aria-label={`Provincial real GDP growth forecasts for ${year}`}>
    <div className="pf-range-axis"><span>Province / territory</span><div><span>{pct(low)}</span><span>Annual growth</span><span>{pct(high)}</span></div><span>Estimate</span></div>
    <ol>{rows.map(row=><li key={row.region}><button onClick={()=>onFocus(row.region)} aria-pressed={focus===row.region} aria-label={`${row.name}: ${pct(row.predictionPct)}; historical error range ${range(row)}. Inspect forecast.`}>
      <span className="pf-region">{row.name}</span>
      <span className="pf-track" aria-hidden="true"><i className="pf-zero" style={{left:`${position(0)}%`}}/>{row.status==='available'?<>{Number.isFinite(row.lowerPct)&&<i className="pf-range" style={{left:`${position(row.lowerPct)}%`,width:`${position(row.upperPct)-position(row.lowerPct)}%`}}/>}<i className="pf-point" style={{left:`${position(row.predictionPct)}%`}}/></>:<span className="pf-unavailable">Indicator coverage unavailable</span>}</span>
      <strong>{Number.isFinite(row.predictionPct)?pct(row.predictionPct):'—'}</strong>
    </button></li>)}</ol>
    <p className="hw-caption">● Model estimate <span className="pf-key-range"/> Historical error range</p>
  </div>;
}

function ForecastAudit({row}){
  const v=row.validation;
  return <details className="hw-method-inline pf-audit"><summary>How this forecast performed in past years</summary>
    <div className="pf-scorecard">
      <div><span>Average prediction error</span><strong>{n(v.mae,2)} <small>percentage points</small></strong></div>
      <div><span>Historical-mean benchmark</span><strong>{n(v.benchmarkMae,2)} <small>percentage points</small></strong></div>
      <div><span>Outcomes inside the range</span><strong>{Number.isFinite(v.intervalCoverage)?`${n(v.intervalCoverage*100,0)}%`:'—'} <small>of {v.intervalCount} evaluated years</small></strong></div>
    </div>
    <p>{v.mae<v.benchmarkMae?'The forecasting procedure had a lower average error than the historical-mean benchmark.':'The historical-mean benchmark had an equal or lower average error than the forecasting procedure.'} Models were chosen using earlier outcomes only. The selected model can change between forecast dates.</p>
    <div className="hw-table-wrap" role="region" aria-label={`${row.name} forecast backtest`} tabIndex={0}><table><caption>Predictions made without the target year’s GDP · annual real GDP growth</caption><thead><tr><th scope="col">Forecast origin</th><th scope="col">Target year</th><th scope="col">Prediction</th><th scope="col">Actual</th><th scope="col">Error range</th><th scope="col">Covered</th></tr></thead><tbody>{v.heldout.slice().reverse().map(test=><tr key={test.originYear}><th scope="row">{test.originYear}</th><td>{test.targetYear}</td><td>{pct(test.predictionPct)}</td><td>{pct(test.actualPct)}</td><td>{range(test)}</td><td>{test.lowerPct===null?'Not calibrated':test.actualPct>=test.lowerPct&&test.actualPct<=test.upperPct?'Yes':'No'}</td></tr>)}</tbody></table></div>
    <p className="hw-caption">Historical tests use today’s revised data with period cutoffs. They do not recreate the exact data releases a forecaster saw at the time. Short, dependent annual samples do not establish guaranteed coverage.</p>
  </details>;
}

function ForecastDetail({data,row,benchmarks}){
  const titleId=useId();
  if(row.status!=='available')return <section className="pf-detail" aria-live="polite"><h3>{row.name}</h3><p>The forecasting model needs a comparable monthly employment series. This source does not cover this jurisdiction; its GDP observations remain available.</p></section>;
  const future=data.forecasts.filter(r=>r.region===row.region).sort((a,b)=>a.year-b.year);
  const official=benchmarks?.rows?.filter(r=>r.region===row.region).map(r=>({...r,source:benchmarks.sources.find(s=>s.id===r.sourceId)}))||[];
  return <section className="pf-detail" aria-labelledby={titleId}>
    <div className="pf-detail-heading"><div><p className="hw-eyebrow">{row.year} · {row.horizon===0?'Estimate':'Forecast'}</p><h3 id={titleId}>{row.name}</h3></div><div><strong>{pct(row.predictionPct)}</strong><span>{range(row)}</span></div></div>
    <p className="hw-caption">{modelName(row.model)} · historical average error {n(row.validation.mae,2)} percentage points.</p>
    <div className="hw-table-wrap" tabIndex={0} role="region" aria-label={`${row.name} GDP history and outlook`}><table><caption>Recent outcomes and the two-year outlook · annual real GDP growth</caption><thead><tr><th scope="col">Year</th><th scope="col">Status</th><th scope="col">Growth</th><th scope="col">Historical error range</th></tr></thead><tbody>
      {row.actuals.slice(-4).map(r=><tr key={r.year}><th scope="row">{r.year}</th><td>Observed</td><td>{pct(r.growthPct)}</td><td>—</td></tr>)}
      {future.map(r=><tr className="pf-projection-row" key={r.year}><th scope="row">{r.year}</th><td>{r.horizon===0?'Estimate':'Forecast'}</td><td>{pct(r.predictionPct)}</td><td>{range(r)}</td></tr>)}
    </tbody></table></div>
    <ForecastAudit row={row}/>
    {official.length>0&&<details className="hw-method-inline"><summary>Published provincial outlooks</summary><p>These are separate forecasts with their own dates and assumptions. Provincial budgets generally use expenditure-based GDP at market prices; this model uses industry GDP at basic prices.</p>{official.map(r=><p key={`${r.region}-${r.year}`}><strong>{r.year}: {pct(r.growthPct)}</strong> · {r.publicationDate} · <a href={r.source.url} target="_blank" rel="noopener noreferrer">{r.source.title}</a></p>)}</details>}
  </section>;
}

export function ForecastExplorer({data,initial={},onChange,benchmarks=null,embedded=false,selection,update}){
  const [local,setLocal]=useState(()=>({regions:initial.forecastRegions?.length?initial.forecastRegions:initial.region&&initial.region!=='CA'?[initial.region]:[],year:[data.forecastOriginYear,data.forecastOriginYear+1].includes(initial.forecastYear)?initial.forecastYear:data.forecastOriginYear}));
  const state=selection||local;
  const result=summarizeProvincialForecast(data,state);
  const [focus,setFocus]=useState(initial.forecastFocus||state.regions[0]||'AB'),[table,setTable]=useState(false);
  const row=result.rows.find(r=>r.region===focus)||result.rows[0];
  const change=patch=>{const next={...state,...patch};if(update)update(next);else{setLocal(next);onChange?.({...next,focus});}};
  const inspect=code=>{setFocus(code);if(!embedded)onChange?.({...state,focus:code});};
  const through=result.information.employmentThrough;
  return <section className={`hw-shell pf-shell ${embedded?'pf-embedded':''}`} aria-label="Provincial GDP outlook">
    {!embedded&&<header className="hw-heading"><div><p className="hw-eyebrow">Provincial outlook · employment through {through}</p><h2>Provincial GDP outlook</h2><p className="hw-caption">Annual real GDP growth, estimated from published economic indicators.</p></div><button data-research-export onClick={()=>download(data,state)}>Export forecast & evidence</button></header>}
    <div className="pf-toolbar"><div className="hw-switch" aria-label="Forecast year">{result.years.map(year=><button key={year} aria-pressed={state.year===year} onClick={()=>change({year})}>{year}</button>)}</div><div className="hw-switch" aria-label="Forecast display"><button aria-pressed={!table} onClick={()=>setTable(false)}>Ranges</button><button aria-pressed={table} onClick={()=>setTable(true)}>Table</button></div></div>
    {!embedded&&<details className="hw-selection"><summary>Compare {state.regions.length?state.regions.map(code=>data.regions.find(r=>r.code===code)?.name).join(', '):'all provinces and territories'}</summary><div className="hw-regions"><button aria-pressed={!state.regions.length} onClick={()=>change({regions:[]})}>All</button>{data.regions.map(r=><button key={r.code} aria-label={r.name} aria-pressed={state.regions.includes(r.code)} onClick={()=>change({regions:state.regions.includes(r.code)?state.regions.filter(c=>c!==r.code):[...state.regions,r.code]})}>{r.code}</button>)}</div></details>}
    {table?<div className="hw-table-wrap" tabIndex={0} role="region" aria-label="Provincial GDP forecast table"><table><caption>{result.year} · annual real GDP growth at basic prices</caption><thead><tr><th scope="col">Province / territory</th><th scope="col">Forecast</th><th scope="col">Historical error range</th><th scope="col">Mean historical error</th></tr></thead><tbody>{result.rows.map(r=><tr key={r.region}><th scope="row"><button onClick={()=>inspect(r.region)}>{r.name}</button></th><td>{pct(r.predictionPct)}</td><td>{range(r)}</td><td>{r.validation?`${n(r.validation.mae,2)} pp`:'Not available'}</td></tr>)}</tbody></table></div>:<ForecastRanges rows={result.rows} focus={row.region} onFocus={inspect} year={result.year}/>}
    <details className="pf-scope"><summary>What this estimates</summary><p>Real GDP growth across all industries, at basic prices. These forecasts do not isolate the effect of oil, gas or electricity prices. Ranges use past prediction errors, with an 80% calibration target. The observed coverage is shown for each province.</p></details>
    <label className="hw-measure pf-inspect">Inspect a province<select aria-label="Inspect provincial forecast" value={row.region} onChange={e=>inspect(e.target.value)}>{result.rows.map(r=><option value={r.region} key={r.region}>{r.name}</option>)}</select></label>
    <ForecastDetail data={data} row={row} benchmarks={benchmarks}/>
    <details className="hw-sources"><summary>Inputs, model selection & limitations</summary><p>GDP observations through {result.information.gdpYear}; employment through {through}. Forecast snapshot: {result.asOf.slice(0,10)}. Models are fitted separately for the current and following year.</p><p>{typeof result.methodology.selection==='string'?result.methodology.selection:''}</p>{result.methodology.limitations.map((text,i)=><p key={i}>{text}</p>)}{result.sources.map(source=><p key={source.id}><a href={source.url} target="_blank" rel="noopener noreferrer">{source.title}</a></p>)}{result.methodology.literature?.map((paper,i)=><p key={i}><a href={paper.url} target="_blank" rel="noopener noreferrer">{paper.title}</a></p>)}</details>
  </section>;
}
export function mountProvincialForecast(element,options){validateProvincialForecast(options.data);const root=createRoot(element);root.render(<ForecastExplorer {...options}/>);return {unmount:()=>root.unmount()};}
