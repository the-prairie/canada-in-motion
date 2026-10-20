import React,{useEffect,useState,useId} from 'react';
import {createRoot} from 'react-dom/client';
import {validateMonthlyEnergy,summarizeMonthlyEnergy} from '../monthly-energy-model.mjs';

let pending;
function load(){
  if(!pending)pending=fetch('data/monthly-energy.json').then(r=>{if(!r.ok)throw Error();return r.json();}).then(validateMonthlyEnergy).catch(error=>{pending=null;throw error;});
  return pending;
}
const number=(n,d=2)=>new Intl.NumberFormat('en-CA',{maximumFractionDigits:d}).format(n);
const period=m=>new Date(`${m}-01T12:00:00Z`).toLocaleDateString('en-CA',{month:'long',year:'numeric',timeZone:'UTC'});
const unavailable={suppressed:'Confidential',missing:'Not available','not-reported':'Not reported','not-applicable':'Not applicable',unreliable:'Not reliable'};
const growth=n=>n===null?'Annual change unavailable':n!==0&&Math.abs(n)<.05?`${n<0?'Down':'Up'} <0.1% from a year earlier`:`${n>0?'+':''}${number(n,1)}% from a year earlier`;
function formatted(value,unit){
  if(value===null)return '';
  const scale=value>=1e6?1e6:value>=1e3?1e3:1;
  return `${number(value/scale)} ${scale===1e6?'million ':scale===1e3?'thousand ':''}${unit}`;
}
function Trend({metric}){
  const history=metric.history,max=Math.max(1,...history.map(r=>r.value??0));
  const x=i=>16+i/(history.length-1)*448,y=value=>108-value/max*92;
  let path='';history.forEach((r,i)=>{if(r.value!==null)path+=`${i&&history[i-1].value!==null?'L':'M'}${x(i)},${y(r.value)} `;});
  return <div className="monthly-trend"><svg viewBox="0 0 480 140" role="img" aria-label={`${metric.label}, 24 monthly observations. Exact values are in the table below.`}><path d="M16 108H464" className="monthly-axis"/><path d={path} className="monthly-line"/>{history.map((r,i)=>r.value===null?null:<circle key={r.month} cx={x(i)} cy={y(r.value)} r="2.5"><title>{period(r.month)}: {number(r.value,3)} {metric.unit}</title></circle>)}<text x="16" y="130">{history[0].month}</text><text x="464" y="130" textAnchor="end">{history.at(-1).month}</text><text x="16" y="10">{number(max,0)} {metric.unit}</text></svg>
    <details><summary>Monthly values</summary><div className="monthly-table" tabIndex={0} role="region" aria-label={`${metric.label} history`}><table><caption>{metric.label} · {metric.unit} · not seasonally adjusted</caption><thead><tr><th scope="col">Month</th><th scope="col">Value</th><th scope="col">Annual change</th><th scope="col">Source status</th></tr></thead><tbody>{[...history].reverse().map(r=><tr key={r.month}><th scope="row">{period(r.month)}</th><td>{r.value===null?unavailable[r.status]:number(r.value,3)}</td><td>{r.yoyPct===null?'Unavailable':`${number(r.yoyPct,2)}%`}</td><td>{r.status==='available'?(r.sourceStatus||r.sourceSymbol||'Published'):unavailable[r.status]}</td></tr>)}</tbody></table></div></details>
  </div>;
}
function Reading({row,metric,name,comparison=false}){
  return <div className={`monthly-reading ${comparison?'monthly-comparison':''}`} data-monthly-region={row.region}>
    {comparison&&<span>{name}</span>}<strong className="monthly-value">{row.value===null?unavailable[row.status]:formatted(row.value,metric.unit)}</strong>
    <span className="monthly-growth">{row.value===null?'No published value to compare':growth(row.yoyPct)}</span>
  </div>;
}
export function MonthlyEnergy({region='CA',commodity=null,compare=null,context='income'}){
  const [data,setData]=useState(null),[error,setError]=useState(false),[attempt,setAttempt]=useState(0);const id=useId();
  useEffect(()=>{let active=true;setError(false);load().then(d=>{if(active)setData(d);}).catch(()=>{if(active)setError(true);});return ()=>{active=false;};},[attempt]);
  if(!data)return <section className="monthly-energy" aria-label="Latest energy activity"><p role="status">{error?'Monthly energy data could not load.':'Loading monthly energy activity…'}</p>{error&&<button onClick={()=>setAttempt(a=>a+1)}>Retry monthly data</button>}</section>;
  const summary=summarizeMonthlyEnergy(data,{region,commodity,compare});
  const named=code=>code==='QC'?'Québec':data.regions.find(r=>r.code===code)?.name;
  const save=()=>{const url=URL.createObjectURL(new Blob([JSON.stringify({selection:{region,commodity,compare},summary,sourceSnapshot:data},null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='canada-monthly-energy.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
  return <section className="monthly-energy" aria-labelledby={id} data-monthly-ready data-monthly-focus={region}>
    <header><h2 id={id}>Latest energy activity <span>· {named(region)}</span></h2><span className="monthly-observed">Observed monthly</span></header>
    <div className="monthly-grid">{summary.metrics.map(metric=><article key={metric.id} data-monthly-metric={metric.id}><h3>{metric.label}</h3><p className="monthly-date">{period(metric.latestMonth)}</p><Reading row={metric.latest} metric={metric}/>{metric.comparison&&<Reading row={metric.comparison} metric={metric} name={named(compare)} comparison/>}</article>)}</div>
    <p className="monthly-basis">{context==='forecast'?'Current observations; the annual forecast above keeps its original inputs.':context==='futures'?'Monthly actuals and annual scenarios use separate periods and definitions.':context==='story'?'Observed production stays unchanged in this price experiment.':'Monthly production and annual GDP measure different things.'}</p>
    <details className="monthly-details"><summary>Trends, definitions & sources</summary><p>Changes compare the same month a year earlier. Figures are not seasonally adjusted; weather, shutdowns and calendar differences can affect them. Production is not GDP, sales or a price forecast.</p>
      {summary.metrics.map(metric=><div key={metric.id} className="monthly-source"><h3>{metric.label} · {named(region)}</h3><p>{metric.definition}</p><Trend metric={metric}/><p>Released {metric.source.releasedAt}. Retrieved {metric.source.retrievedAt.slice(0,10)}. {metric.latest.vector?`Series ${metric.latest.vector}.`:''} {metric.latest.previousValue===0?'The year-earlier value is zero, so a percentage change is undefined.':''}</p><a href={metric.source.url} target="_blank" rel="noopener noreferrer">Statistics Canada · {metric.sourceId.replace('statcan-','')}</a></div>)}
      <p>Confidential and missing observations are not zero. Canada uses the published national series, not a sum of the displayed provinces. Gas is measured in energy units (GJ); electricity uses MWh and crude oil uses cubic metres.</p><button onClick={save} data-monthly-export>Download monthly data & sources</button>
    </details>
  </section>;
}
export function mountMonthlyEnergy(element,options){const root=createRoot(element);root.render(<MonthlyEnergy {...options}/>);return {unmount:()=>root.unmount()};}
