import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {validateIncomePaths,summarizeIncomePaths} from '../income-path-model.mjs';
import {ContextDialog} from './context-dialog.jsx';
import './income-paths.css';

const n=(value,digits=1)=>new Intl.NumberFormat('en-CA',{maximumFractionDigits:digits}).format(value);
const evidenceNumber=new Intl.NumberFormat('en-CA',{maximumSignificantDigits:12});
const outcomes=[
 {id:'gdp',label:'GDP',heading:'Estimated Canadian GDP supported'},
 {id:'labour',label:'Labour income',heading:'Estimated Canadian labour income supported'},
 {id:'jobs',label:'Jobs',heading:'Estimated Canadian jobs supported'},
];
const industryLabels={'oil-gas':'Oil and gas, except oil sands','oil-sands':'Oil sands','electricity':'Electric power','gas-distribution':'Natural gas distribution','refining':'Petroleum refineries','oil-pipelines':'Crude oil and other pipelines','gas-pipelines':'Natural gas pipelines','oil-gas-services':'Oil and gas support services','oil-gas-construction':'Oil and gas construction','electricity-construction':'Electric power construction'};
const amount=(metric,value,exact=false)=>Number.isFinite(value)?metric.id==='jobs'?`${exact?evidenceNumber.format(value):n(value,0)} jobs`:`$${exact?evidenceNumber.format(value):n(value)}M`:'Not published';

function IncomePaths({data,initial={},onChange}){
 const [state,setState]=useState({region:initial.region==='CA'?'AB':initial.region||'AB',industry:initial.incomeIndustry||'oil-gas',demandMillion:initial.demandMillion??100,year:data.years.includes(initial.incomeYear)?initial.incomeYear:data.latestYear,includeInduced:initial.includeInduced===true,outcome:outcomes.some(item=>item.id===initial.incomeMeasure)?initial.incomeMeasure:'gdp'});
 const [evidenceOpen,setEvidenceOpen]=useState(false);
 const change=patch=>{const next={...state,...patch};setState(next);onChange?.(next);};
 const {outcome,...scenario}=state;
 let result;try{result=summarizeIncomePaths(data,scenario);}catch(error){return <p role="alert">The supply-chain calculation could not be verified: {error.message}</p>;}
 const region=result.region.name,selected=result.metrics.find(metric=>metric.id===outcome),selectedOutcome=outcomes.find(metric=>metric.id===outcome);
 const effects=state.includeInduced?'Direct + supplier + household-spending effects':'Direct + supplier effects';
 const allocation=[{id:'withinProvince',label:region},{id:'restOfCanada',label:'Rest of Canada'}];
 const exportData=()=>{const blob=URL.createObjectURL(new Blob([JSON.stringify({selection:state,result,sourceSnapshot:data},null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=blob;a.download='energy-supply-chain.json';a.click();setTimeout(()=>URL.revokeObjectURL(blob),1000);};
 return <section className="hw-shell hw-income-paths" aria-labelledby="income-path-title">
  <header className="ip-heading"><h2 id="income-path-title">Follow the dollar</h2><button type="button" onClick={()=>setEvidenceOpen(true)}>Evidence</button></header>
  <div className="ip-controls">
   <label>Industry province or territory<select aria-label="Demand origin province" value={state.region} onChange={event=>change({region:event.target.value})}>{data.regions.map(item=><option value={item.code} key={item.code}>{item.name}</option>)}</select></label>
   <label>Industry<select aria-label="Demand industry" value={state.industry} onChange={event=>change({industry:event.target.value})}>{data.industries.map(item=><option key={item.id} value={item.id}>{industryLabels[item.id]||item.label}</option>)}</select></label>
   <label>Additional final demand · $M<input aria-label="Additional final demand in million dollars" type="number" min="0" max={data.maxDemandMillion} step="10" value={state.demandMillion} onChange={event=>{const value=Number(event.target.value);if(Number.isFinite(value)&&value>=0&&value<=data.maxDemandMillion)change({demandMillion:value});}}/></label>
   <label>Reference year<select aria-label="Multiplier reference year" value={state.year} onChange={event=>change({year:Number(event.target.value)})}>{data.years.map(year=><option key={year}>{year}</option>)}</select></label>
  </div>
  <label className="ip-induced"><input type="checkbox" checked={state.includeInduced} onChange={event=>change({includeInduced:event.target.checked})}/><span>Include household spending <small>Induced effects may overstate impacts within one year.</small></span></label>
  <div className="ip-outcomes" role="group" aria-label="Outcome">{outcomes.map(item=><button type="button" key={item.id} aria-pressed={outcome===item.id} onClick={()=>change({outcome:item.id})}>{item.label}</button>)}</div>
  <div className="ip-result" aria-live="polite" aria-atomic="true">
   <p>{selectedOutcome.heading}</p><strong className="ip-total">{amount(selected,selected.canada)}</strong>
   {selected.available?<div className="ip-allocation" role="group" aria-label={`${selectedOutcome.label} allocation within Canada`}>{allocation.map(item=><div className="ip-allocation-row" key={item.id}><div><span>{item.label}</span><strong>{amount(selected,selected[item.id])}</strong></div><div className="ip-allocation-track" aria-hidden="true"><i style={{width:`${selected.canada>0?Math.max(0,selected[item.id]/selected.canada*100):0}%`}}/></div></div>)}</div>:<p className="ip-unavailable">This industry's {selectedOutcome.label.toLowerCase()} allocation is not published for {region}. Unavailable values are not zero.</p>}
  </div>
  <p className="ip-scope">{effects}. Fixed {state.year} coefficients{outcome==='jobs'?'':` and ${state.year} dollars`}; not a forecast.</p>
  <p className="ip-definition">{outcome==='jobs'?'Jobs include full- and part-time positions. They are not full-time equivalents or net hires.':'Labour income is part of GDP. These measures must not be added together.'}</p>
  {evidenceOpen&&<ContextDialog title="Follow the dollar evidence" onClose={()=>setEvidenceOpen(false)} className="ip-evidence">
   <p><strong>${n(state.demandMillion,12)}M</strong> of additional final demand for {result.industry.label.toLowerCase()} in {region}, in {state.year} dollars. {effects}.</p>
   <div className="hw-table-wrap" tabIndex={0} role="region" aria-label="Exact effects by measure"><table><caption>All measures · dollars in millions of {state.year} CAD; jobs in positions</caption><thead><tr><th scope="col">Measure</th><th scope="col">{region}</th><th scope="col">Rest of Canada</th><th scope="col">Canada</th></tr></thead><tbody>{result.metrics.map(metric=><tr key={metric.id}><th scope="row">{metric.label}</th><td>{amount(metric,metric.withinProvince,true)}</td><td>{amount(metric,metric.restOfCanada,true)}</td><td>{amount(metric,metric.canada,true)}</td></tr>)}</tbody></table></div>
   <div className="hw-table-wrap" tabIndex={0} role="region" aria-label={`${selectedOutcome.label} by stage`}><table><caption>{selectedOutcome.label} by stage · {outcome==='jobs'?'positions':`million ${state.year} CAD`}</caption><thead><tr><th scope="col">Stage</th><th scope="col">{region}</th><th scope="col">Rest of Canada</th><th scope="col">Canada</th></tr></thead><tbody>{selected.stages.map(stage=><tr key={stage.id}><th scope="row">{stage.label}</th><td>{amount(selected,stage.withinProvince,true)}</td><td>{amount(selected,stage.restOfCanada,true)}</td><td>{amount(selected,stage.canada,true)}</td></tr>)}</tbody></table></div>
   <p className="hw-caption">Published coefficients have three decimal places. Rounded stages can differ from the published total; the export retains that difference.</p>
   <h3>What the calculation means</h3>
   <ul><li>Final demand is output for consumption, investment or exports. Total industry sales include intermediate purchases and cannot be substituted without double counting.</li><li>GDP measures value added. Labour income is part of GDP. Gross output includes intermediate production. These measures overlap and must not be added.</li><li>Jobs are full- and part-time positions supported, not full-time equivalents, permanent jobs or a forecast of net hires.</li><li>The fixed {state.year} production structure assumes available capacity. This is not a forecast or a response to energy prices. It does not model substitution, displacement, financing, policy or supply constraints.</li><li>Rest of Canada is the national result minus the within-province result. Individual recipient provinces and supplier industries are not identified.</li><li>Induced effects add household spending associated with labour income. They can overstate impacts within a year and are excluded by default.</li><li>Not published means unavailable, not zero. Oil and gas extraction combines both fuels.</li></ul>
   <h3>Source</h3>{result.sources.map(source=><div className="hw-evidence-source" key={source.id}><a href={source.url} target="_blank" rel="noopener noreferrer">{source.publisher} · {source.title}</a><small>Released {source.releasedAt?.slice(0,10)} · retrieved {source.retrievedAt?.slice(0,10)}</small></div>)}
   <button type="button" data-research-export onClick={exportData}>Export calculation and source snapshot</button>
  </ContextDialog>}
 </section>;
}
export function mountIncomePaths(element,options){validateIncomePaths(options.data);const root=createRoot(element);root.render(<IncomePaths {...options}/>);return {unmount:()=>root.unmount()};}
