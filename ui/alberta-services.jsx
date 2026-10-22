import React,{useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {computeAlbertaServices} from '../alberta-services-model.mjs';
import {ContextDialog} from './context-dialog.jsx';
import './alberta-services.css';
import {CapacitySimulator} from './capacity-simulator.jsx';
import {normalizeCapacitySelection,validateCapacityData} from '../capacity-model.mjs';

const stages=['population','schools','health','housing'];
const names={population:'Population',schools:'Schools',health:'Health',housing:'Housing'};
const roles=[['demand','Demand'],['resources','Money'],['capacity','Capacity'],['outcomes','Outcomes']];
const number=(v,digits=1)=>Number.isFinite(v)?new Intl.NumberFormat('en-CA',{maximumFractionDigits:digits}).format(v):'Not published';
const safeStage=value=>stages.includes(value)?value:'population';
const valueLabel=(value,unit)=>!Number.isFinite(value)?'Not published':unit.startsWith('CAD')?`$${number(value,0)}`:unit==='%'?`${number(value)}%`:unit==='hours'?`${number(value)} h`:number(value);
const deltaLabel=(metric,series)=>{
 if(series.values.length<2||!series.values.every(Number.isFinite))return '';
 const change=series.values.at(-1)-series.values[0];
 const value=metric.changeKind==='percentage-points'?change:metric.changeKind==='absolute'?change:series.changePct??(series.values.at(-1)/series.values[0]-1)*100;
 return `${value>0?'+':''}${number(value)}${metric.changeKind==='percentage-points'?' pp':metric.changeKind==='absolute'?(metric.unit==='hours'?' h':''):'%'}`;
};
const copy={
 population:{heading:<>More people.<br/>More demand.</>,body:'Population growth changes the scale of public services Alberta needs.',detail:'The next chapters compare demand, money, service capacity and observed outcomes. Their dates differ; these are not estimates of what caused what.'},
 schools:{heading:<>Do resources keep<br/>pace with students?</>,body:'Student numbers, educator numbers and inflation-adjusted compensation grew at different rates.',detail:'Compensation measures spending. Educator counts measure people. Neither, on its own, measures the classroom experience.'},
 health:{heading:<>More beds.<br/>Fewer per resident.</>,body:'Acute-care beds increased, but the population grew faster. The capacity available per resident fell.',detail:'Hospital spending, beds and wait times answer different questions. New funding takes time to become staffed capacity.'},
 housing:{heading:<>Supply takes time.<br/>Rents can diverge.</>,body:'Turnover rents moved in opposite directions in Calgary and Edmonton.',detail:'These rents describe two-bedroom apartments with new tenants. They are not the rent paid by every household, or a measure of all housing costs.'},
};

function Comparison({metric}){
 const max=Math.max(...metric.series.flatMap(series=>series.values).filter(Number.isFinite),1)*1.03;
 const paired=metric.periods.length>1;
 return <div className="as-comparison" data-metric={metric.id}>
  <div className="as-chart-title"><h3>{metric.label}</h3><span>{metric.unit==='index'?'Index · starting period = 100':metric.unit}</span></div>
  <div className="as-chart-legend" aria-label="Observation dates">{metric.periods.map((period,i)=><span key={period}><i className={i?'as-end':'as-start'}/>{period}{metric.series.some(s=>s.forecast?.[i])?' · forecast':''}</span>)}</div>
  <div className="as-series-list">{metric.series.map(series=><div className="as-series" key={series.id}>
   <div className="as-series-heading"><span>{series.label}</span>{paired&&<strong>{deltaLabel(metric,series)}</strong>}</div>
   {series.values.map((value,i)=><div className={`as-observation ${i?'as-end':'as-start'} ${series.forecast?.[i]?'as-forecast':''}`} key={i}>
    <div className="as-bar-track" aria-hidden="true">{Number.isFinite(value)&&<i style={{width:`${value/max*100}%`}}/>}</div><span><span className="as-sr-only">{metric.periods[i]}{series.forecast?.[i]?' forecast':''}: </span>{valueLabel(value,metric.unit)}</span>
   </div>)}
  </div>)}</div>
 </div>;
}

function ObservedServices({data,initial={},onChange,externalStage}){
 const result=computeAlbertaServices(data);
 const [stage,setStage]=useState(safeStage(initial.stage));
 const [selected,setSelected]=useState({});
 const [evidence,setEvidence]=useState(false);
 const refs=useRef({}),current=useRef(stage),callback=useRef(onChange),toolbar=useRef(null),visual=useRef(null),scrollLock=useRef(0);
 callback.current=onChange;
 const chapter=result.chapters[stage],metrics=chapter.metrics;
 const preferred=stage==='health'?metrics.find(metric=>metric.role==='capacity'):metrics[0];
 const metric=metrics.find(item=>item.id===selected[stage])||preferred||metrics[0];
 const index=stages.indexOf(stage);
 const setChapter=next=>{next=safeStage(next);if(current.current===next)return;current.current=next;setStage(next);callback.current?.({stage:next});};
 const jump=(next,focus=true)=>{
  next=safeStage(next);scrollLock.current=performance.now()+250;setChapter(next);
  refs.current[next]?.scrollIntoView({block:'start',behavior:'auto'});
  if(focus)refs.current[next]?.querySelector('h3')?.focus({preventScroll:true});
 };
 useEffect(()=>{
  let frame,first;let live=true;
  const update=()=>{frame=null;if(!live||performance.now()<scrollLock.current||!refs.current[current.current]?.getClientRects().length)return;
   const stacked=innerWidth<=760&&innerHeight>560;
   const threshold=stacked?(visual.current?.getBoundingClientRect().bottom||0)+28:Math.max((toolbar.current?.getBoundingClientRect().bottom||0)+30,innerHeight*.4);
   let next=stages[0];stages.forEach(id=>{if(refs.current[id]?.getBoundingClientRect().top<=threshold)next=id;});setChapter(next);
  };
  const scroll=()=>{if(!frame)frame=requestAnimationFrame(update);};
  first=requestAnimationFrame(()=>{if(current.current!==stages[0])jump(current.current,false);});
  addEventListener('scroll',scroll,{passive:true});addEventListener('resize',scroll);
  return()=>{live=false;cancelAnimationFrame(frame);cancelAnimationFrame(first);removeEventListener('scroll',scroll);removeEventListener('resize',scroll);};
 },[]);
 useEffect(()=>{if(externalStage!==undefined&&safeStage(externalStage)!==current.current)jump(externalStage,false);},[externalStage]);
 const exportData=()=>{const url=URL.createObjectURL(new Blob([JSON.stringify({selection:{stage,metric:metric.id},result,sourceSnapshot:data},null,2)],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download='alberta-services-evidence.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
 return <section className="hw-shell hw-alberta-services" aria-labelledby="alberta-services-title">
  <header className="as-heading"><h2 id="alberta-services-title">Can services keep up?</h2><span>Alberta</span></header>
  <div className="as-toolbar" ref={toolbar}><nav className="as-chapters" aria-label="Alberta services chapters">{stages.map((id,i)=><button type="button" key={id} aria-current={stage===id?'step':undefined} onClick={()=>jump(id)}><span>{i+1}</span>{names[id]}</button>)}</nav><button className="as-evidence-button" type="button" onClick={()=>setEvidence(true)}>Evidence</button></div>
  <div className="as-story">
   <div className="as-visual" ref={visual}>
    <div className="as-scene" data-stage={stage}>
     <div className="as-framework" aria-label="Conceptual framework, not a causal estimate">{roles.map(([id,label])=><span key={id} className={metric.role===id?'is-current':''}>{label}</span>)}</div>
     <p className="as-framework-note">Conceptual framework · not a causal estimate</p>
     <Comparison metric={metric}/>
     {metrics.length>1&&<div className="as-metric-picker" role="group" aria-label={`${names[stage]} evidence measures`}>{metrics.map(item=><button type="button" key={item.id} aria-pressed={item.id===metric.id} onClick={()=>setSelected({...selected,[stage]:item.id})}>{item.shortLabel||({demand:'Students & resources',resources:'Spending',capacity:'Beds',outcomes:item.unit==='hours'?'Emergency waits':'Hip surgery'})[item.role]||item.label}</button>)}</div>}
     <p className="as-chart-note">{metric.note||'Published endpoint observations; no intervening values are estimated.'}</p>
    </div>
   </div>
   <div className="as-narrative">{stages.map((id,i)=><section className="as-chapter" data-chapter={id} ref={element=>refs.current[id]=element} key={id} aria-labelledby={`as-${id}`}>
    <h3 id={`as-${id}`} tabIndex={-1}>{copy[id].heading}</h3><p>{copy[id].body}</p><p className="as-supporting">{copy[id].detail}</p>
    <div className="as-chapter-actions">{i>0&&<button type="button" className="as-previous" onClick={()=>jump(stages[i-1])}>Previous</button>}<button className="as-next" type="button" onClick={()=>jump(stages[(i+1)%stages.length])}>{i===stages.length-1?'Back to population':'Next: '+names[stages[i+1]]}<span aria-hidden="true">{i===stages.length-1?'↑':'↓'}</span></button></div>
   </section>)}</div>
  </div>
  <p className="as-sr-only" aria-live="polite">Chapter {index+1} of 4: {names[stage]}</p>
  {evidence&&<ContextDialog title="Alberta services evidence" onClose={()=>setEvidence(false)} className="as-evidence">
   <p>{data.scopeNote}</p><p>{data.updatePolicy}</p><p>Reviewed {data.reviewedAt}. Each measure retains its own dates and units. Forecasts are explicitly marked.</p>
   {stages.map(id=><section key={id}><h3>{names[id]}</h3>{result.chapters[id].metrics.map(item=><div key={item.id} className="as-evidence-metric"><div className="hw-table-wrap" tabIndex={0} role="region" aria-label={item.label}><table><caption>{item.label} · {item.unit}</caption><thead><tr><th scope="col">Series</th>{item.periods.map(period=><th scope="col" key={period}>{period}</th>)}{item.periods.length>1&&<th scope="col">Change</th>}</tr></thead><tbody>{item.series.map(series=><tr key={series.id}><th scope="row">{series.label}</th>{series.values.map((value,i)=><td key={i}>{number(value,8)}{series.forecast?.[i]?' (forecast)':''}</td>)}{item.periods.length>1&&<td>{deltaLabel(item,series)}</td>}</tr>)}</tbody></table></div>{item.note&&<p>{item.note}</p>}<p>Source: {data.sources.filter(source=>source.id===item.sourceId).map(source=><a key={source.id} href={source.url} target="_blank" rel="noopener noreferrer">{source.title}</a>)}</p></div>)}{result.chapters[id].notes?.map((note,i)=><p key={i}>{note}</p>)}{result.chapters[id].policy&&<p><strong>{result.chapters[id].policy.period}: </strong>{result.chapters[id].policy.text}</p>}</section>)}
   <h3>How to read the story</h3><p>Money is a flow. Staff, beds and buildings provide capacity over time; counts do not automatically describe usable or staffed capacity. Population is one demand indicator. Outcomes also reflect need, access, distribution and other conditions. The comparisons do not isolate a causal effect of population growth or funding. No continuous series is inferred between endpoints.</p>
   <p>The conceptual distinction between flows, stocks, delays and outcomes is informed by Donella Meadows, <em>Leverage Points: Places to Intervene in a System</em> (1999), pp. 4, 7–9 and 12–16.</p>
   <h3>Sources</h3>{data.sources.map(source=><div className="hw-evidence-source" key={source.id}><a href={source.url} target="_blank" rel="noopener noreferrer">{source.publisher?source.publisher+' · ':''}{source.title}</a><small>{source.publishedAt?'Published '+source.publishedAt+' · ':''}{source.retrievedAt?'Retrieved '+source.retrievedAt:'Reviewed '+data.reviewedAt}</small>{source.note&&<p>{source.note}</p>}</div>)}
   <button type="button" data-research-export onClick={exportData}>Export evidence and source snapshot</button>
  </ContextDialog>}
 </section>;
}

function AlbertaServices({data,initial={},onChange,externalStage}){
 const [mode,setMode]=useState(initial.mode==='capacity'?'capacity':'observed');
 const [stage,setStage]=useState(safeStage(initial.stage));
 const [capacity,setCapacity]=useState(()=>normalizeCapacitySelection(initial.capacity));
 const [snapshot,setSnapshot]=useState(null),[error,setError]=useState(null),[attempt,setAttempt]=useState(0);
 useEffect(()=>{
  if(mode!=='capacity'||snapshot)return;
  const controller=new AbortController();setError(null);
  fetch('capacity-data.json',{signal:controller.signal}).then(response=>{if(!response.ok)throw new Error('Capacity data could not be loaded.');return response.json();}).then(value=>{validateCapacityData(value);setSnapshot(value);}).catch(cause=>{if(cause.name!=='AbortError')setError('Capacity data could not be loaded. Please try again.');});
  return()=>controller.abort();
 },[mode,snapshot,attempt]);
 const changeMode=next=>{setMode(next);onChange?.({mode:next,stage,capacity});};
 return <div className="as-workspace">
  <nav className="as-view-switch" aria-label="Alberta services view"><button type="button" aria-pressed={mode==='observed'} onClick={()=>changeMode('observed')}>Observed change</button><button type="button" aria-pressed={mode==='capacity'} onClick={()=>changeMode('capacity')}>Test capacity</button></nav>
  {mode==='observed'?<ObservedServices data={data} initial={{stage}} externalStage={externalStage} onChange={selection=>{setStage(selection.stage);onChange?.({mode,stage:selection.stage,capacity});}}/>:snapshot?<CapacitySimulator data={snapshot} initial={capacity} onChange={selection=>{setCapacity(selection);onChange?.({mode,stage,capacity:selection});}} onObserved={()=>changeMode('observed')}/>:<div className="as-capacity-loading" role="status">{error?<><p>{error}</p><button type="button" onClick={()=>setAttempt(value=>value+1)}>Try again</button></>:'Loading capacity evidence…'}</div>}
 </div>;
}

export function mountAlbertaServices(element,options){
 computeAlbertaServices(options.data);
 const root=createRoot(element);let current={...options};
 const render=()=>root.render(<AlbertaServices {...current}/>);render();
 return {unmount:()=>root.unmount(),update:patch=>{current={...current,...patch,externalStage:patch.stage??patch.initial?.stage??current.externalStage};render();}};
}
