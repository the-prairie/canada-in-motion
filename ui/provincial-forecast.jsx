import {MonthlyEnergy} from './monthly-energy.jsx';
import React,{useState,useId,useEffect,useMemo,useRef} from 'react';
import {tradeMapGeometry} from '../trade-map-model.mjs';
import {forecastStory} from '../forecast-story-model.mjs';
import './provincial-forecast.css';
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
  return <section className="pf-audit"><h4>Historical checks</h4>
    <div className="pf-scorecard">
      <div><span>Average prediction error</span><strong>{n(v.mae,2)} <small>percentage points</small></strong></div>
      <div><span>Historical-mean benchmark</span><strong>{n(v.benchmarkMae,2)} <small>percentage points</small></strong></div>
      <div><span>Outcomes inside the range</span><strong>{Number.isFinite(v.intervalCoverage)?`${n(v.intervalCoverage*100,0)}%`:'—'} <small>of {v.intervalCount} evaluated years</small></strong></div>
    </div>
    <p>{v.mae<v.benchmarkMae?'The forecasting procedure had a lower average error than the historical-mean benchmark.':'The historical-mean benchmark had an equal or lower average error than the forecasting procedure.'} Models were chosen using earlier outcomes only. The selected model can change between forecast dates.</p>
    <div className="hw-table-wrap" role="region" aria-label={`${row.name} forecast backtest`} tabIndex={0}><table><caption>Predictions made without the target year’s GDP · annual real GDP growth</caption><thead><tr><th scope="col">Forecast origin</th><th scope="col">Target year</th><th scope="col">Prediction</th><th scope="col">Actual</th><th scope="col">Error range</th><th scope="col">Covered</th></tr></thead><tbody>{v.heldout.slice().reverse().map(test=><tr key={test.originYear}><th scope="row">{test.originYear}</th><td>{test.targetYear}</td><td>{pct(test.predictionPct)}</td><td>{pct(test.actualPct)}</td><td>{range(test)}</td><td>{test.lowerPct===null?'Not calibrated':test.actualPct>=test.lowerPct&&test.actualPct<=test.upperPct?'Yes':'No'}</td></tr>)}</tbody></table></div>
    <p className="hw-caption">Historical tests use today’s revised data with period cutoffs. They do not recreate the exact data releases a forecaster saw at the time. Short, dependent annual samples do not establish guaranteed coverage.</p>
  </section>;
}


function EnergyForecastAudit({data,row}){
  const evaluation=data.energyEvaluation;
  if(!evaluation)return null;
  if(evaluation.status!=='evaluated')return <section className="pf-energy-audit"><h4>Monthly energy test</h4><p>{evaluation.reason}</p></section>;
  const test=evaluation.horizons.find(h=>h.horizon===row.horizon);
  const province=test.byProvince.find(p=>p.region===row.region);
  const records=evaluation.records.filter(r=>r.region===row.region&&r.horizon===row.horizon&&evaluation.protocol.holdoutTargetYears.includes(r.targetYear));
  const current=evaluation.records.find(r=>r.region===row.region&&r.horizon===row.horizon&&r.originYear===data.forecastOriginYear);
  const inputs=evaluation.features.filter(f=>f.region===row.region&&f.originYear===data.forecastOriginYear);
  const changed=Math.abs(current.experimentalPct-current.baselinePct)>1e-10;
  return <section className="pf-energy-audit"><h4>Monthly energy test · existing forecast retained</h4>
    <p>{test.passed?'The monthly energy model passed the numerical checks, but requires a separate review before it can change the forecast.':test.changedCount===0?'Monthly oil, gas and electricity readings did not change any forecasts in the final test.':'Monthly oil, gas and electricity readings did not improve accuracy enough to change the forecast.'}</p>
    <div className="hw-table-wrap" role="region" tabIndex={0} aria-label="Monthly energy forecast accuracy"><table><caption>Average absolute error · {evaluation.protocol.holdoutTargetYears[0]}–{evaluation.protocol.holdoutTargetYears.at(-1)} outcomes · percentage points</caption><thead><tr><th scope="col">Test</th><th scope="col">Existing model</th><th scope="col">With energy inputs</th></tr></thead><tbody>
      <tr><th scope="row">All 10 provinces</th><td>{n(test.baseline.mae,3)}</td><td>{n(test.experiment.mae,3)}</td></tr>
      <tr><th scope="row">{row.name}</th><td>{n(province.baseline.mae,3)}</td><td>{n(province.experiment.mae,3)}</td></tr>
    </tbody></table></div>
    <p>{n(Math.abs(test.maeGainPct),1)}% {test.maeGainPct>=0?'lower':'higher'} average error; the rule requires at least 5%, plus checks on large errors and performance across years and provinces. {test.changedCount} of {test.baseline.count} predictions changed. These span only three shared economic years.</p>
    <h4>{row.name}’s results and inputs</h4>
      <div className="hw-table-wrap" role="region" tabIndex={0} aria-label={`${row.name} energy model test years`}><table><caption>Annual real GDP growth · forecasts made {row.horizon===0?'during':'the year before'} the target year</caption><thead><tr><th scope="col">Year</th><th scope="col">Existing</th><th scope="col">With energy</th><th scope="col">Actual</th></tr></thead><tbody>{records.map(r=><tr key={r.targetYear}><th scope="row">{r.targetYear}</th><td>{pct(r.baselinePct)}</td><td>{pct(r.experimentalPct)}</td><td>{pct(r.actualPct)}</td></tr>)}</tbody></table></div>
      <p>{row.year}: {changed?`the unadopted energy model would give ${pct(current.experimentalPct)}. The published estimate remains ${pct(current.baselinePct)}.`:'the energy model proposes no change.'}</p>
      <div className="hw-table-wrap" role="region" tabIndex={0} aria-label={`${row.name} energy model inputs`}><table><caption>January–July {data.forecastOriginYear} production · change from the same months a year earlier</caption><thead><tr><th scope="col">Input</th><th scope="col">Change</th></tr></thead><tbody>{inputs.map(f=><tr key={f.metric}><th scope="row">{{oil:'Crude oil',gas:'Marketable natural gas',electricity:'Electricity generation'}[f.metric]}</th><td>{f.status==='available'?pct(f.growthPct):'Insufficient comparable data'}</td></tr>)}</tbody></table></div>
      <p>Each historical forecast uses earlier GDP outcomes to fit and select its model. Energy inputs stop in July; employment stops in September. Missing energy readings are never treated as zero.</p>
      <p>These tests use revised historical data and simulated release delays. They do not recreate the data available at the time, establish a causal price effect, or guarantee future accuracy. The 2016 electricity coverage break is excluded.</p>
      {evaluation.sources.map(s=><p key={s.id}><a href={s.url} target="_blank" rel="noopener noreferrer">{s.title}</a> · released {s.releaseTime.slice(0,10)}</p>)}
  </section>;
}

function HistoryChart({data,row,year,onYear}){
  const scene=forecastStory(data,row),titleId=useId(),svg=useRef(null),[width,setWidth]=useState(680);
  useEffect(()=>{const observer=new ResizeObserver(entries=>{const next=Math.round(entries[0].contentRect.width);if(next>0)setWidth(next);});observer.observe(svg.current);return()=>observer.disconnect();},[]);
  const height=width<440?250:310,left=width<440?36:46,right=width<440?18:28,top=26,bottom=42;
  const first=scene.points[0]?.year??data.information.gdpYear,last=data.forecastOriginYear+1;
  const x=value=>left+(value-first)/(last-first)*(width-left-right);
  const y=value=>height-bottom-(value-scene.domain[0])/(scene.domain[1]-scene.domain[0])*(height-top-bottom);
  const path=points=>points.map((point,i)=>`${i?'L':'M'}${x(point.year)},${y(point.value)}`).join(' ');
  const projected=scene.latest?[scene.latest,...scene.outlook]:scene.outlook;
  const boundary=x(data.information.gdpYear+.5);
  return <figure className="pf-history-chart">
    <svg ref={svg} viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby={titleId}>
      <title id={titleId}>{row.name}, annual real GDP growth. Solid points are observed; hollow points and whiskers are estimates and historical error ranges.</title>
      <rect x={boundary} y={top-12} width={width-right-boundary} height={height-top-bottom+24} className="pf-future-area"/>
      {[scene.domain[0],0,scene.domain[1]].map(value=><g key={value}><line x1={left} x2={width-right} y1={y(value)} y2={y(value)} className={value===0?'pf-history-zero':'pf-history-grid'}/><text x={left-9} y={y(value)+4} textAnchor="end">{pct(value)}</text></g>)}
      <path d={path(scene.observed)} className="pf-history-line"/>
      {scene.outlook.length>0&&<path d={path(projected)} className="pf-history-line pf-history-projected"/>}
      {scene.points.map(point=><g key={point.year} className={point.kind==='observed'?'pf-history-actual':`pf-history-future ${point.year===year?'is-selected':''}`}>
        {Number.isFinite(point.lower)&&<g className="pf-history-whisker"><line x1={x(point.year)} x2={x(point.year)} y1={y(point.lower)} y2={y(point.upper)}/><line x1={x(point.year)-7} x2={x(point.year)+7} y1={y(point.lower)} y2={y(point.lower)}/><line x1={x(point.year)-7} x2={x(point.year)+7} y1={y(point.upper)} y2={y(point.upper)}/></g>}
        <circle cx={x(point.year)} cy={y(point.value)} r={point.kind==='observed'?4:6}><title>{point.year}: {pct(point.value)}{Number.isFinite(point.lower)?`, historical error range ${pct(point.lower)} to ${pct(point.upper)}`:''}</title></circle>
        {width>=440||point.kind!=='observed'||point.year%2===first%2?<text x={x(point.year)} y={height-15} textAnchor="middle">{point.year}</text>:null}
      </g>)}
    </svg>
    <figcaption><span><i className="pf-legend-observed"/>Observed</span><span><i className="pf-legend-forecast"/>Estimate</span><span><i className="pf-legend-range"/>Historical error range</span></figcaption>
    <div className="pf-year-readings" role="group" aria-label="Forecast year">{scene.outlook.map(point=><button key={point.year} aria-label={String(point.year)} aria-describedby={`${titleId}-${point.year}-value ${titleId}-${point.year}-range`} aria-pressed={year===point.year} onClick={()=>onYear(point.year)}><span>{point.year}</span><strong id={`${titleId}-${point.year}-value`}>{pct(point.value)}</strong><small id={`${titleId}-${point.year}-range`}>{Number.isFinite(point.lower)?`${pct(point.lower)} to ${pct(point.upper)}`:'Range unavailable'}</small></button>)}</div>
  </figure>;
}

function ProvinceSelector({shapes,regions,focus,onFocus}){
  const geometry=useMemo(()=>tradeMapGeometry(shapes||[],{width:440,height:310,padding:16}),[shapes]);
  return <aside className="pf-place" aria-label="Choose a province or territory">
    {geometry&&<svg className="pf-place-map" viewBox="0 0 440 310" role="group" aria-label="Select a province on the map">{geometry.paths.map(shape=>{const region=regions.find(region=>region.code===shape.code);return region&&<path key={shape.code} d={shape.d} role="button" tabIndex={0} aria-label={`Inspect ${region.name} forecast`} aria-pressed={focus===shape.code} className={focus===shape.code?'is-selected':''} onClick={()=>onFocus(shape.code)} onKeyDown={event=>{if(['Enter',' '].includes(event.key)){event.preventDefault();onFocus(shape.code);}}}><title>{region.name}</title></path>;})}</svg>}
    <div className="pf-place-buttons">{regions.map(region=><button key={region.code} aria-label={region.name} aria-pressed={focus===region.code} onClick={()=>onFocus(region.code)}>{region.code}</button>)}</div>
  </aside>;
}

function ForecastDetail({data,row,year,onYear}){
  const titleId=useId(),scene=forecastStory(data,row),available=row.status==='available';
  return <section className="pf-detail" aria-labelledby={titleId}>
    <div className="pf-detail-heading" aria-live="polite"><div><h3 id={titleId} tabIndex={-1}>{row.name}</h3><p>Annual real GDP growth</p></div><div><strong>{available?pct(row.predictionPct):'No forecast'}</strong><span>{available?`${row.year} ${row.horizon===0?'estimate':'forecast'}`:`Observed through ${data.information.gdpYear}`}</span></div></div>
    <HistoryChart data={data} row={row} year={year} onYear={onYear}/>
    {available?<p className="pf-uncertainty">{Number.isFinite(row.lowerPct)?<>Historical error range <strong>{range(row)}</strong>. {n(row.validation.intervalCoverage*100,0)}% of {row.validation.intervalCount} tested years fell inside their ranges, using revised historical data.</>:'There is too little history to calibrate an error range.'}</p>:<p className="pf-uncertainty">This source does not cover comparable monthly employment here. GDP observations through {scene.latest?.year??data.information.gdpYear} remain available.</p>}
  </section>;
}

function Evidence({data,row,result,benchmarks,selection,onClose}){
  const dialog=useRef(null),previousFocus=useRef(document.activeElement),[tab,setTab]=useState('performance'),heading=useId();
  useEffect(()=>{const node=dialog.current;node.showModal();return()=>{node.close();if(previousFocus.current?.isConnected)previousFocus.current.focus({preventScroll:true});};},[]);
  const official=benchmarks?.rows?.filter(r=>r.region===row.region).map(r=>({...r,source:benchmarks.sources.find(s=>s.id===r.sourceId)}))||[];
  const tabs=[['performance','Historical checks'],['inputs','Inputs & sources'],['published','Published outlooks'],['activity','Monthly activity']];
  return <dialog ref={dialog} className="pf-evidence" aria-labelledby={heading} onCancel={onClose} onClick={event=>{if(event.target===event.currentTarget)onClose();}}>
    <header><h3 id={heading}>{row.name} · {row.year}</h3><button onClick={onClose} autoFocus aria-label="Close forecast evidence">Close</button></header>
    <nav aria-label="Forecast evidence">{tabs.map(([id,label])=><button key={id} aria-pressed={tab===id} onClick={()=>setTab(id)}>{label}</button>)}</nav>
    <div className="pf-evidence-content">
      {tab==='performance'&&<>{row.validation?<><ForecastAudit row={row}/><EnergyForecastAudit data={data} row={row}/></>:<p>No model has been fitted for this territory.</p>}</>}
      {tab==='inputs'&&<><h4>Forecast inputs</h4><p>GDP through {result.information.gdpYear}; employment through {result.information.employmentThrough}. Snapshot {result.asOf.slice(0,10)}.</p><div className="hw-table-wrap" tabIndex={0} role="region" aria-label={`${row.name} GDP history and outlook`}><table><caption>Annual real GDP growth · percent</caption><thead><tr><th scope="col">Year</th><th scope="col">Status</th><th scope="col">Growth</th><th scope="col">Historical error range</th></tr></thead><tbody>{forecastStory(data,row).points.map(point=><tr key={point.year}><th scope="row">{point.year}</th><td>{point.kind}</td><td>{pct(point.value)}</td><td>{Number.isFinite(point.lower)?`${pct(point.lower)} to ${pct(point.upper)}`:'—'}</td></tr>)}</tbody></table></div><p>{row.model?`${modelName(row.model)}. `:''}Whole-economy GDP at basic prices. This model does not isolate energy-price effects.</p><p>Ranges use past prediction errors with an 80% calibration target. Actual coverage varies by province.</p><p>{typeof result.methodology.selection==='string'?result.methodology.selection:''}</p><ul>{result.methodology.limitations.map((text,i)=><li key={i}>{text}</li>)}</ul><h4>Sources</h4>{result.sources.map(source=><p key={source.id}><a href={source.url} target="_blank" rel="noopener noreferrer">{source.title}</a></p>)}{result.methodology.literature?.map((paper,i)=><p key={i}><a href={paper.url} target="_blank" rel="noopener noreferrer">{paper.title}</a></p>)}</>}
      {tab==='published'&&<><h4>Published provincial outlooks</h4><p>These forecasts have separate dates and assumptions. Provincial budgets generally report expenditure-based GDP at market prices; this app models industry GDP at basic prices.</p>{official.length?official.map(r=><p key={`${r.region}-${r.year}`}><strong>{r.year}: {pct(r.growthPct)}</strong> · {r.publicationDate} · <a href={r.source.url} target="_blank" rel="noopener noreferrer">{r.source.title}</a></p>):<p>No published outlook is included for this jurisdiction.</p>}</>}
      {tab==='activity'&&<MonthlyEnergy region={row.region} context="forecast"/>}
    </div>
    <footer><button data-research-export onClick={()=>download(data,selection)}>Export forecast & evidence</button><span>Source snapshot {result.dataVersion}</span></footer>
  </dialog>;
}

export function ForecastExplorer({data,initial={},onChange,benchmarks=null,embedded=false,selection,update,shapes=[]}){
  const [local,setLocal]=useState(()=>({regions:initial.forecastRegions?.length?initial.forecastRegions:initial.region&&initial.region!=='CA'?[initial.region]:[],year:[data.forecastOriginYear,data.forecastOriginYear+1].includes(initial.forecastYear)?initial.forecastYear:data.forecastOriginYear}));
  const host=useRef(null),state=selection||local,result=summarizeProvincialForecast(data,state);
  const [focus,setFocus]=useState(initial.forecastFocus||state.regions[0]||'AB'),[display,setDisplay]=useState('outlook'),[evidence,setEvidence]=useState(false);
  const row=result.rows.find(r=>r.region===focus)||result.rows[0];
  const change=patch=>{const next={...state,...patch};if(update)update(next);else{setLocal(next);onChange?.({...next,focus});}};
  const inspect=code=>{setFocus(code);if(!embedded){const next={...state,regions:state.regions.length&&!state.regions.includes(code)?[...state.regions,code]:state.regions};setLocal(next);onChange?.({...next,focus:code});}};
  const showProvince=code=>{inspect(code);setDisplay('outlook');requestAnimationFrame(()=>{const heading=host.current?.querySelector('.pf-detail-heading h3');heading?.focus({preventScroll:true});heading?.scrollIntoView({block:'nearest',behavior:'instant'});});};
  return <section ref={host} className={`hw-shell pf-shell ${embedded?'pf-embedded':''}`} aria-label="Provincial GDP outlook">
    <header className="pf-heading">{!embedded&&<h2>Provincial GDP outlook</h2>}<button data-forecast-evidence className="pf-evidence-button" onClick={()=>setEvidence(true)}>Evidence</button></header>
    <div className="pf-toolbar">{display!=='outlook'&&<div className="hw-switch" aria-label="Forecast year">{result.years.map(year=><button key={year} aria-pressed={state.year===year} onClick={()=>change({year})}>{year}</button>)}</div>}<div className="hw-switch pf-displays" aria-label="Forecast display">{[['outlook','Outlook'],['compare','Compare'],['table','Table']].map(([id,label])=><button key={id} aria-pressed={display===id} onClick={()=>setDisplay(id)}>{label}</button>)}</div></div>
    {display==='outlook'?<div className="pf-story"><ProvinceSelector shapes={shapes} regions={embedded?data.regions.filter(r=>result.rows.some(row=>row.region===r.code)):data.regions} focus={row.region} onFocus={inspect}/><ForecastDetail data={data} row={row} year={state.year} onYear={year=>change({year})}/></div>:<>
      {!embedded&&<div className="pf-compare-places" role="group" aria-label="Provinces to compare"><button aria-pressed={!state.regions.length} onClick={()=>change({regions:[]})}>All</button>{data.regions.map(r=><button key={r.code} aria-label={`Compare ${r.name}`} aria-pressed={state.regions.includes(r.code)} onClick={()=>change({regions:state.regions.includes(r.code)?state.regions.filter(c=>c!==r.code):[...state.regions,r.code]})}>{r.code}</button>)}</div>}
      {display==='table'?<div className="hw-table-wrap" tabIndex={0} role="region" aria-label="Provincial GDP forecast table"><table><caption>{result.year} · annual real GDP growth at basic prices</caption><thead><tr><th scope="col">Province / territory</th><th scope="col">Forecast</th><th scope="col">Historical error range</th><th scope="col">Mean historical error</th></tr></thead><tbody>{result.rows.map(r=><tr key={r.region}><th scope="row"><button onClick={()=>showProvince(r.region)}>{r.name}</button></th><td>{pct(r.predictionPct)}</td><td>{range(r)}</td><td>{r.validation?`${n(r.validation.mae,2)} pp`:'Not available'}</td></tr>)}</tbody></table></div>:<ForecastRanges rows={result.rows} focus={row.region} onFocus={showProvince} year={result.year}/>}
    </>}
    <p className="pf-basis">All industries · GDP at basic prices · historical error ranges, not guarantees</p>
    {evidence&&<Evidence data={data} row={row} result={result} benchmarks={benchmarks} selection={state} onClose={()=>setEvidence(false)}/>}
  </section>;
}
export function mountProvincialForecast(element,options){validateProvincialForecast(options.data);const root=createRoot(element);root.render(<ForecastExplorer {...options}/>);return {unmount:()=>root.unmount()};}
