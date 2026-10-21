import React,{useState,useEffect,useRef,useMemo} from 'react';
import {tradeMapGeometry} from '../trade-map-model.mjs';
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

const chapters=['Demand','Industry','Suppliers','Households','Across Canada'];

// Original diagram artwork: role illustrations, never named firms or measured facilities.
function IndustryDrawing({kind='industry',electric=false}){
 return <svg viewBox="0 0 240 140" aria-hidden="true" className="ip-drawing"><g fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
 {kind==='homes'?<><path d="M22 90 62 52 102 90v40H22Z" fill="var(--ip-paper)"/><path d="m12 94 50-49 50 49M55 130v-26h20v26M34 90h15v15H34ZM134 77l36-34 36 34v53h-72Z"/><path d="m126 81 44-46 44 46M148 87h14v15h-14ZM179 87h14v15h-14ZM165 130v-20h15v20"/><path d="M219 130v-23m-12 0 12-25 12 25Z"/></>:kind==='suppliers'?<><path d="M26 130V70l43-24v24l43-24v84ZM26 90h86M42 103h16v27m19-27h16v27M126 130V44h74v86M138 60h14v14h-14Zm28 0h14v14h-14Zm-28 28h14v14h-14Zm28 0h14v14h-14Z" fill="var(--ip-paper)"/><path d="M138 44V28h14v16M17 130h202"/></>:electric?<><path d="M67 129V52m0 0 8-38-8-7-7 45m7 0 32 26 10-4-42-22m0 0-37 11-3 11 40-22M160 130V37m0 0 5-27-5-5-5 32m5 0 26 21 8-3-34-18m0 0-29 8-3 8 32-16M26 130h185"/><path d="m92 130 16-32h78l18 32ZM103 115h91m-58-17-7 32m31-32 5 32"/></>:<><path d="M20 130h204M43 130 64 31h17l22 99M54 82h37M48 105h49M58 57h28M49 105l42-23-33-25M63 31V14h18v17M53 14h37M124 130V84c0-16 57-16 57 0v46M124 84c0 16 57 16 57 0M139 72V51h26v21M190 130V41h15v89M185 41h25M102 117h22" fill="var(--ip-paper)"/></>}
 </g></svg>;
}
function MoneyScene({step,state,result,metric,shapes,onJump}){
 const geometry=useMemo(()=>tradeMapGeometry(shapes||[],{width:620,height:370,padding:18}),[shapes]);
 const stages=metric.stages;
 return <div className={`ip-scene ip-scene-${step}`} aria-label="Economic contribution diagram">
  <div className="ip-scene-origin"><span>{result.region.name}</span><strong>${n(state.demandMillion)}M</strong><span>additional final demand</span></div>
  <div className="ip-mechanism" aria-hidden={step===4} inert={step===4?true:undefined}>
   <svg className="ip-links" viewBox="0 0 620 380" aria-hidden="true"><path className={step>=2?'is-revealed':''} d="M170 160C170 225 440 175 440 245"/><path className={step>=3&&state.includeInduced?'is-revealed':''} d="M440 265C440 335 170 285 170 355"/></svg>
   {[{id:'direct',label:'Selected industry',kind:'industry',chapter:1},{id:'indirect',label:'Suppliers',kind:'suppliers',chapter:2},{id:'induced',label:'Households',kind:'homes',chapter:3}].map((node,i)=>{
    const stage=stages.find(s=>s.id===node.id),active=step>=node.chapter,excluded=node.id==='induced'&&!state.includeInduced;
    return <button key={node.id} type="button" className={`ip-actor ip-actor-${i} ${active?'is-revealed':''} ${step===node.chapter?'is-current':''}`} onClick={()=>onJump(node.chapter)} aria-label={`Go to ${node.label.toLowerCase()} contribution`}>
     <IndustryDrawing kind={node.kind} electric={state.industry.includes('electric')}/><span className="ip-actor-label">{i===0?({'oil-gas':'Oil & gas','oil-sands':'Oil sands','electricity':'Electric power','refining':'Refineries'}[state.industry]||'Selected industry'):node.label}</span><strong>{active?(excluded?'Optional':amount(metric,stage?.canada)):' '}</strong><small>{active&&!excluded?(metric.id==='jobs'?'jobs supported':metric.id==='labour'?'labour income':'GDP supported'):' '}</small>
    </button>;
   })}
  </div>
  <div className="ip-geography" aria-hidden={step!==4} inert={step!==4?true:undefined}>
   {geometry&&<svg viewBox="0 0 620 370" role="img" aria-label={`${result.region.name} and the rest of Canada; no individual recipient provinces are estimated`}><title>Where the modelled contribution occurs</title>{geometry.paths.map(shape=><path key={shape.code} d={shape.d} className={shape.code===state.region?'ip-home-province':''}/>)}</svg>}
   <div className="ip-allocation">{metric.available?[['withinProvince',result.region.name],['restOfCanada','Rest of Canada']].map(([key,label])=><div className="ip-allocation-row" key={key}><div><span>{label}</span><strong>{amount(metric,metric[key])}</strong></div><div className="ip-allocation-track" aria-hidden="true"><i style={{width:`${metric.canada>0?Math.max(0,metric[key]/metric.canada*100):0}%`}}/></div></div>):<p className="ip-unavailable">This allocation is not published. Unavailable values are not zero.</p>}</div>
  </div>
  <p className="ip-scene-note">{step===4?'Rest of Canada is an aggregate, not a province-by-province allocation.':`${state.year} modelled contributions · relationships, not payments.`}</p>
 </div>;
}

function IncomePaths({data,initial={},onChange,shapes=[]}){
 const [state,setState]=useState({region:initial.region==='CA'?'AB':initial.region||'AB',industry:initial.incomeIndustry||'oil-gas',demandMillion:initial.demandMillion??100,year:data.years.includes(initial.incomeYear)?initial.incomeYear:data.latestYear,includeInduced:initial.includeInduced===true,outcome:outcomes.some(item=>item.id===initial.incomeMeasure)?initial.incomeMeasure:'gdp'});
 const [evidenceOpen,setEvidenceOpen]=useState(false);
 const [editOpen,setEditOpen]=useState(false);
 const [step,setStep]=useState(Number.isInteger(initial.incomeStep)?Math.min(4,Math.max(0,initial.incomeStep)):0);
 const sectionRefs=useRef([]),currentStep=useRef(step),latest=useRef(null);
 latest.current={state,onChange};
 const setChapter=index=>{if(currentStep.current===index)return;currentStep.current=index;setStep(index);latest.current.onChange?.({...latest.current.state,step:index});};
 const jump=index=>{setChapter(index);sectionRefs.current[index]?.scrollIntoView({block:'start',behavior:'auto'});sectionRefs.current[index]?.querySelector('h3')?.focus({preventScroll:true});};
 useEffect(()=>{
  let frame;let mounted=true;
  const update=()=>{frame=null;if(!mounted)return;const threshold=innerWidth<=760&&innerHeight>560?Math.min(310,innerHeight*.38)+122:innerHeight*.45;let next=0;sectionRefs.current.forEach((el,i)=>{if(el&&el.getBoundingClientRect().top<=threshold+4)next=i;});setChapter(next);};
  const scroll=()=>{if(!frame)frame=requestAnimationFrame(update);};
  const initialFrame=requestAnimationFrame(()=>{if(currentStep.current>0)sectionRefs.current[currentStep.current]?.scrollIntoView({block:'start',behavior:'auto'});scroll();});
  addEventListener('scroll',scroll,{passive:true});addEventListener('resize',scroll);
  return()=>{mounted=false;cancelAnimationFrame(frame);cancelAnimationFrame(initialFrame);removeEventListener('scroll',scroll);removeEventListener('resize',scroll);};
 },[]);
 const change=patch=>{const next={...state,...patch};setState(next);onChange?.({...next,step:currentStep.current});};
 const {outcome,...scenario}=state;
 let result;try{result=summarizeIncomePaths(data,scenario);}catch(error){return <p role="alert">The supply-chain calculation could not be verified: {error.message}</p>;}
 const region=result.region.name,selected=result.metrics.find(metric=>metric.id===outcome),selectedOutcome=outcomes.find(metric=>metric.id===outcome);
 const effects=state.includeInduced?'Direct + supplier + household-spending effects':'Direct + supplier effects';
 const allocation=[{id:'withinProvince',label:region},{id:'restOfCanada',label:'Rest of Canada'}];
 const exportData=()=>{const blob=URL.createObjectURL(new Blob([JSON.stringify({selection:state,result,sourceSnapshot:data},null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=blob;a.download='energy-supply-chain.json';a.click();setTimeout(()=>URL.revokeObjectURL(blob),1000);};
 return <section className="hw-shell hw-income-paths" aria-labelledby="income-path-title">
  <header className="ip-heading"><h2 id="income-path-title">Follow the dollar</h2></header>
  <div className="ip-story-toolbar"><nav className="ip-chapters" aria-label="Follow the dollar chapters">{chapters.map((label,index)=><button key={label} type="button" aria-current={step===index?'step':undefined} onClick={()=>jump(index)}><span>{index+1}</span>{label}</button>)}</nav><div className="ip-tools"><button type="button" onClick={()=>setEditOpen(true)}>Change scenario</button><button type="button" onClick={()=>setEvidenceOpen(true)}>Evidence</button></div></div>
  <div className="ip-story">
   <div className="ip-visual"><MoneyScene step={step} state={state} result={result} metric={selected} shapes={shapes} onJump={jump}/></div>
   <div className="ip-narrative">
    <section className="ip-chapter" ref={el=>sectionRefs.current[0]=el} data-chapter="0" aria-labelledby="ip-demand">
     <h3 id="ip-demand" tabIndex={-1}>Start with<br/><em>${n(state.demandMillion)} million.</em></h3>
     <p>Additional demand for <strong>{industryLabels[state.industry].toLowerCase()}</strong> in <strong>{region}</strong>.</p>
     <p className="ip-supporting">What economic activity could that support?</p>
     <button className="ip-continue" type="button" onClick={()=>jump(1)}>Follow the effects <span aria-hidden="true">↓</span></button>
     <p className="ip-scope">A modelled scenario in {state.year} dollars. Fixed production structure; not a forecast.</p>
    </section>
    <section className="ip-chapter" ref={el=>sectionRefs.current[1]=el} data-chapter="1" aria-labelledby="ip-direct">
     <h3 id="ip-direct" tabIndex={-1}>It starts with<br/>the industry.</h3>
     <strong className="ip-stage-total" data-stage-value="direct">{amount(selected,selected.stages.find(s=>s.id==='direct')?.canada)}</strong>
     <p>{outcome==='gdp'?'GDP supported within the selected industry. This is the value it adds, after purchased inputs.':outcome==='labour'?'Labour income supported within the selected industry. This is part of its GDP contribution.':'Full- and part-time positions supported within the selected industry, not net new hires.'}</p>
     <button className="ip-continue" type="button" onClick={()=>jump(2)}>Then its suppliers <span aria-hidden="true">↓</span></button>
    </section>
    <section className="ip-chapter" ref={el=>sectionRefs.current[2]=el} data-chapter="2" aria-labelledby="ip-suppliers">
     <h3 id="ip-suppliers" tabIndex={-1}>The effect reaches<br/>its suppliers.</h3>
     <strong className="ip-stage-total" data-stage-value="indirect">{amount(selected,selected.stages.find(s=>s.id==='indirect')?.canada)}</strong>
     <p>Additional {outcome==='gdp'?'GDP':outcome==='labour'?'labour income':'jobs'} supported across the supply chain, including suppliers’ own suppliers.</p>
     <p className="ip-supporting">The data estimate their combined contribution, without identifying individual businesses.</p>
     <button className="ip-continue" type="button" onClick={()=>jump(3)}>What about households? <span aria-hidden="true">↓</span></button>
    </section>
    <section className="ip-chapter" ref={el=>sectionRefs.current[3]=el} data-chapter="3" aria-labelledby="ip-households">
     <h3 id="ip-households" tabIndex={-1}>Earnings can<br/>support more spending.</h3>
     <p>When workers spend their earnings, that can support activity elsewhere in the economy.</p>
     <label className="ip-induced"><input type="checkbox" checked={state.includeInduced} onChange={event=>change({includeInduced:event.target.checked})}/><span>Include household spending</span></label>
     {state.includeInduced&&<strong className="ip-stage-total" data-stage-value="induced">{amount(selected,selected.stages.find(s=>s.id==='induced')?.canada)}</strong>}
     <p className="ip-supporting">{state.includeInduced?`Additional ${outcome==='gdp'?'GDP':outcome==='labour'?'labour income':'jobs'} from induced spending. `:'Excluded by default. '}These effects may overstate impacts within one year. They are not household bill savings.</p>
     <button className="ip-continue" type="button" onClick={()=>jump(4)}>See where the effects occur <span aria-hidden="true">↓</span></button>
    </section>
    <section className="ip-chapter ip-conclusion" ref={el=>sectionRefs.current[4]=el} data-chapter="4" aria-labelledby="ip-canada">
     <h3 id="ip-canada" tabIndex={-1}>An effect at home.<br/>And beyond.</h3>
     <div className="ip-outcomes" role="group" aria-label="Outcome">{outcomes.map(item=><button type="button" key={item.id} aria-pressed={outcome===item.id} onClick={()=>change({outcome:item.id})}>{item.label}</button>)}</div>
     <div className="ip-result" aria-live="polite" aria-atomic="true"><p>{selectedOutcome.heading}</p><strong className="ip-total">{amount(selected,selected.canada)}</strong></div>
     <p className="ip-scope">{effects}. Fixed {state.year} coefficients{outcome==='jobs'?'':` and ${state.year} dollars`}; not a forecast.</p>
     <p className="ip-definition">{outcome==='jobs'?'Jobs include full- and part-time positions. They are not full-time equivalents or net hires.':'Labour income is part of GDP. These measures must not be added together.'}</p>
     <p className="ip-supporting">Rounded stage values may differ from the published total.</p>
     <button className="ip-continue" type="button" onClick={()=>setEditOpen(true)}>Try another scenario <span aria-hidden="true">↗</span></button>
     <button className="ip-restart" type="button" onClick={()=>jump(0)}>Back to the beginning</button>
    </section>
   </div>
  </div>
  {editOpen&&<ContextDialog title="Change the demand scenario" onClose={()=>setEditOpen(false)} className="ip-edit">
  <div className="ip-controls">
   <label>Industry province or territory<select aria-label="Demand origin province" value={state.region} onChange={event=>change({region:event.target.value})}>{data.regions.map(item=><option value={item.code} key={item.code}>{item.name}</option>)}</select></label>
   <label>Industry<select aria-label="Demand industry" value={state.industry} onChange={event=>change({industry:event.target.value})}>{data.industries.map(item=><option key={item.id} value={item.id}>{industryLabels[item.id]||item.label}</option>)}</select></label>
   <label>Additional final demand · $M<input aria-label="Additional final demand in million dollars" type="number" min="0" max={data.maxDemandMillion} step="10" value={state.demandMillion} onChange={event=>{const value=Number(event.target.value);if(Number.isFinite(value)&&value>=0&&value<=data.maxDemandMillion)change({demandMillion:value});}}/></label>
   <label>Reference year<select aria-label="Multiplier reference year" value={state.year} onChange={event=>change({year:Number(event.target.value)})}>{data.years.map(year=><option key={year}>{year}</option>)}</select></label>
  </div>
   <p className="ip-supporting">Final demand means output for consumption, investment or exports. It is not total industry sales or an energy-price change.</p>
   <button type="button" onClick={()=>setEditOpen(false)}>Done</button>
  </ContextDialog>}
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
