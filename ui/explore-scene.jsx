import React,{useMemo,useRef,useId} from 'react';
import {tradeMapGeometry} from '../trade-map-model.mjs';
import {useFlowMotion} from './flow-motion.jsx';
import './explore-scene.css';

const headings={overview:'A price change begins with sales.',trade:'Each sale has a buyer.', 'public-finances':'Some revenue reaches public budgets.',national:'The national economy responds differently.',outlook:'Provinces do not respond alike.',households:'A market price is not a household bill.'};
const scopes={overview:'Fixed quantities · receipts, not GDP',trade:'Recorded domestic sales · schematic connections','public-finances':'Budget sensitivity · other assumptions fixed',national:'National illustration · relative to baseline',outlook:'Historical price relationship · not the annual forecast',households:'Average spending equivalent · not an individual bill'};
export function ExploreScene({shapes,result,named,onFocus,money,percent}){
 const host=useRef(null),id=useId().replace(/:/g,'');
 const {selection:s,channels:c}=result;
 const trade=['overview','trade'].includes(s.chapter);
 const links=c.domestic.partners.filter(row=>row.origin===s.focus&&row.value>0).sort((a,b)=>b.value-a.value).slice(0,5);
 const geometry=useMemo(()=>tradeMapGeometry(shapes||[],{width:620,height:390,padding:20}),[shapes]);
 const motion=useFlowMotion(host,{enabled:trade&&links.length>0,initialPlaying:true});
 const maximum=Math.max(1,...links.map(row=>row.value));
 const places=[s.focus,...(s.compare?[s.compare]:[])];
 let readings;
 if(trade)readings=[{region:s.focus,value:money(c.domestic.focus.receiptsChange,true),label:'Domestic sellers’ receipts'},...(s.compare?[{region:s.compare,value:money(c.domestic.comparison?.receiptsChange,true),label:'Domestic sellers’ receipts'}]:[])];
 else if(s.chapter==='public-finances')readings=c.fiscal.rows.map(row=>({region:row.region,value:row.available?`${money(row.revenueChangeLow,true)}${row.revenueChangeHigh!==row.revenueChangeLow?` to ${money(row.revenueChangeHigh,true)}`:''}`:'No estimate',label:row.available?`${row.outcomeLabel} · ${row.fiscalYear}`:'No published sensitivity'}));
 else if(s.chapter==='national')readings=c.national.available?c.national.years.map(row=>({region:'CA',value:percent(row.realGdpPct),label:`Year ${row.yearAfterShock} · real GDP level`})): [{region:'CA',value:'No estimate',label:'No calibrated national response'}];
 else if(s.chapter==='outlook')readings=c.priceResponse.rows.map(row=>({region:row.region,value:row.status==='supported'?percent(row.estimatePct):'No supported estimate',label:row.status==='supported'?'Real GDP level':row.status==='exploratory'?'Historical checks not passed':'No calibrated provincial response'}));
 else readings=c.households.rows.map(row=>({region:row.region,value:['supported','retail-scenario'].includes(row.status)&&Number.isFinite(row.annualChangeCad)?`${row.annualChangeCad<0?'−':row.annualChangeCad>0?'+':''}$${new Intl.NumberFormat('en-CA',{maximumFractionDigits:0}).format(Math.abs(row.annualChangeCad))}`:'No supported estimate',label:['supported','retail-scenario'].includes(row.status)?`${row.categoryLabel} · per year`:'No reliable commodity-to-bill estimate'}));
 return <figure ref={host} className={`es-connected-scene ${motion.playing?'is-playing':''}`} data-scene={s.chapter} aria-label="Connected price scenario map">
  <div className="es-scene-heading"><span>{named(s.focus)}{s.compare?` / ${named(s.compare)}`:''}</span><strong>{percent(s.shockPct)}</strong></div>
  {geometry?<svg className="es-scene-map" viewBox="0 0 620 390" role="group" aria-label={`Select a province. ${headings[s.chapter]}`}>
   <defs><marker id={`${id}-arrow`} viewBox="0 0 10 10" refX="14" refY="5" markerWidth="7" markerHeight="7" markerUnits="userSpaceOnUse" orient="auto"><path d="M1 1L9 5L1 9" fill="none" stroke="#286b5d" strokeWidth="1.8"/></marker></defs>
   {geometry.paths.map(shape=><path key={shape.code} className={`es-scene-land ${shape.code===s.focus?'is-home':''} ${shape.code===s.compare?'is-comparison':''} ${s.chapter==='national'?'is-national':''}`} d={shape.d} tabIndex={0} role="button" aria-pressed={shape.code===s.focus} aria-label={`Investigate ${named(shape.code)}`} onClick={()=>onFocus(shape.code)} onKeyDown={event=>{if(['Enter',' '].includes(event.key)){event.preventDefault();onFocus(shape.code);}}}><title>{named(shape.code)}</title></path>)}
   {trade&&links.map(row=><g key={row.destination} pointerEvents="none"><path className="es-scene-link" d={geometry.path(row.origin,row.destination)} strokeWidth={1+4*Math.sqrt(row.value/maximum)} markerEnd={`url(#${id}-arrow)`}/><path className="es-scene-flow" d={geometry.path(row.origin,row.destination)}/></g>)}
   {places.map(code=>{const [x,y]=geometry.anchors[code];return <g key={code} pointerEvents="none" className={code===s.focus?'es-scene-anchor':'es-scene-anchor is-comparison'}><circle cx={x} cy={y} r="5"/><text x={x} y={y-12} textAnchor="middle">{code}</text></g>;})}
  </svg>:<p>Map unavailable. Calculations remain available.</p>}
  <div className="es-scene-readings" aria-live="polite" aria-atomic="true">{readings.map((row,i)=><div key={`${row.region}-${i}`} className={row.region===s.compare?'is-comparison':''}><span>{row.region==='CA'?'Canada':named(row.region)}</span><strong>{row.value}</strong><small>{row.label}</small></div>)}</div>
  <figcaption><span>{scopes[s.chapter]}</span>{trade&&links.length>0&&<button type="button" onClick={motion.toggle} disabled={motion.reduced} aria-pressed={motion.requested&&!motion.reduced} aria-label={motion.reduced?'Flow motion disabled by reduced-motion preference':motion.requested?'Pause trade flow':'Play trade flow'}>{motion.reduced?'Motion off':motion.requested?'Pause':'Play'}</button>}</figcaption>
 </figure>;
}
export {headings as exploreHeadings};
