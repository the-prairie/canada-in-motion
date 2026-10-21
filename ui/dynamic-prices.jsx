import React,{useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {validateDynamicPriceHistory,summarizeDynamicPriceHistory,DYNAMIC_PRICE_REGIONS} from '../dynamic-price-model.mjs';
import {ContextDialog} from './context-dialog.jsx';
import './dynamic-prices.css';

const n=(v,d=1)=>Number.isFinite(v)?new Intl.NumberFormat('en-CA',{maximumFractionDigits:d}).format(v):'Not available';
const pct=v=>Number.isFinite(v)?`${v>0?'+':''}${n(v)}%`:'Not available';
const names={CA:'Canada',AB:'Alberta',BC:'British Columbia',SK:'Saskatchewan',MB:'Manitoba',ON:'Ontario',QC:'Québec',NB:'New Brunswick',NS:'Nova Scotia',PE:'Prince Edward Island',NL:'Newfoundland and Labrador',YT:'Yukon',NT:'Northwest Territories',NU:'Nunavut'};
const colors=['#356b60','#b65f3c','#506e9a','#916d91','#826c36','#577581','#a2485c'];
const seriesStyle=index=>({color:colors[index%colors.length],dash:index>=colors.length?'6 4':undefined});

function HistoryChart({episode}){
 const ref=useRef(null),[width,setWidth]=useState(600);
 useEffect(()=>{const observer=new ResizeObserver(([entry])=>setWidth(entry.contentRect.width));observer.observe(ref.current);return()=>observer.disconnect();},[]);
 const values=episode.gdp.flatMap(region=>region.path.map(point=>point.changePct));
 const lo=Math.min(-1,...values),hi=Math.max(1,...values),height=280,left=52,right=18,top=18,bottom=42;
 const x=offset=>left+(offset+1)/(episode.gdp[0].path.length-1)*(width-left-right);
 const y=value=>height-bottom-(value-lo)/(hi-lo)*(height-top-bottom);
 const ticks=[lo,(lo+hi)/2,hi];
 return <div ref={ref} className="oh-chart"><svg className="hw-history-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Observed real GDP change since ${episode.year-1}. Lines compare ${episode.gdp.map(region=>names[region.region]).join(', ')}. Select Table for exact values.`}>
  {ticks.map(value=><g key={value}><line x1={left} x2={width-right} y1={y(value)} y2={y(value)} className="oh-grid-line"/><text x={left-10} y={y(value)+4} textAnchor="end">{pct(value)}</text></g>)}
  <line x1={left} x2={width-right} y1={y(0)} y2={y(0)} className="oh-zero-line"/>
  {episode.gdp.map((region,index)=>{const style=seriesStyle(index);return <g key={region.region}><path d={region.path.map((point,i)=>`${i?'L':'M'}${x(point.offset)},${y(point.changePct)}`).join(' ')} fill="none" stroke={style.color} strokeWidth="2.5" strokeDasharray={style.dash}/>{region.path.map(point=><circle key={point.year} cx={x(point.offset)} cy={y(point.changePct)} r="3.5" fill={style.color}><title>{names[region.region]}, {point.year}, {pct(point.changePct)}</title></circle>)}</g>;})}
  {episode.gdp[0].path.map(point=><text key={point.year} x={x(point.offset)} y={height-14} textAnchor="middle">{point.year}</text>)}
 </svg><ul className="oh-legend" aria-label="Chart legend">{episode.gdp.map((region,index)=>{const style=seriesStyle(index);return <li key={region.region}><i aria-hidden="true" style={{borderColor:style.color,borderTopStyle:style.dash?'dashed':'solid'}}/>{names[region.region]}</li>;})}</ul></div>;
}

function DynamicPrices({data,initial={},onChange}){
 const [state,setState]=useState(()=>{const selected={regions:initial.historyRegions?.length?initial.historyRegions:['AB','ON','QC'],oilChangePct:initial.historyOilChange??10,horizonYears:initial.historyHorizon??2};if(summarizeDynamicPriceHistory(data,selected).years.includes(initial.historyYear))selected.selectedYear=initial.historyYear;return selected;});
 const [display,setDisplay]=useState('chart'),[evidenceOpen,setEvidenceOpen]=useState(false);
 const change=patch=>{const next={...state,...patch};if(!next.regions.length)return;if(next.selectedYear!==undefined&&!summarizeDynamicPriceHistory(data,{...next,selectedYear:undefined}).years.includes(next.selectedYear))delete next.selectedYear;setState(next);onChange?.(next);};
 const result=summarizeDynamicPriceHistory(data,state),selected=result.selected;
 const exportEvidence=()=>{const url=URL.createObjectURL(new Blob([JSON.stringify({selection:state,result,sourceSnapshot:data},null,2)],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download='oil-history-and-validation.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
 return <section className="hw-shell hw-oil-history" aria-labelledby="oil-history-title">
  <header className="oh-heading"><div><h2 id="oil-history-title">What followed past oil-price changes?</h2><p className="oh-scope">Observed GDP includes every economic influence. These paths do not isolate the effect of oil.</p></div><button type="button" onClick={()=>setEvidenceOpen(true)}>Evidence</button></header>
  <div className="oh-controls"><label>Annual oil-price change near<select aria-label="Historical oil price change" value={state.oilChangePct} onChange={event=>change({oilChangePct:Number(event.target.value),selectedYear:undefined})}>{[-60,-40,-20,-10,0,10,20,40,60,100].map(value=><option value={value} key={value}>{pct(value)}</option>)}</select></label><label>Follow GDP through<select aria-label="Historical GDP horizon" value={state.horizonYears} onChange={event=>change({horizonYears:Number(event.target.value)})}><option value="0">The price-change year</option><option value="1">One year afterward</option><option value="2">Two years afterward</option></select></label></div>
  <div className="oh-episode-picker"><p>Closest historical episodes</p><div className="hw-episodes" role="group" aria-label="Closest historical oil-price changes">{result.episodes.map(episode=><button type="button" key={episode.year} aria-pressed={episode.year===selected?.year} onClick={()=>change({selectedYear:episode.year})}><strong>{episode.year}</strong><span>WTI {pct(episode.oilChangePct)}</span></button>)}</div></div>
  <div className="oh-provinces"><p>Compare places</p><div className="hw-regions" role="group" aria-label="Provinces, territories and Canada">{DYNAMIC_PRICE_REGIONS.map(code=><button type="button" key={code} aria-label={names[code]} title={names[code]} aria-pressed={state.regions.includes(code)} disabled={state.regions.length===1&&state.regions[0]===code} onClick={()=>change({regions:state.regions.includes(code)?state.regions.filter(region=>region!==code):[...state.regions,code]})}>{code}</button>)}</div></div>
  {selected&&<section className="oh-result" aria-labelledby="oil-history-result-title"><header className="oh-result-heading"><div><h3 id="oil-history-result-title">Real GDP through {selected.year+state.horizonYears}</h3><p>In {selected.year}, WTI averaged US${n(selected.oilPrice,2)}/barrel, {pct(selected.oilChangePct)} that year.</p></div><div className="hw-switch" role="group" aria-label="Historical GDP display">{['chart','table'].map(view=><button type="button" key={view} aria-pressed={display===view} onClick={()=>setDisplay(view)}>{view==='chart'?'Chart':'Table'}</button>)}</div></header><p className="oh-baseline">Cumulative real GDP change since {selected.year-1}</p>
   {display==='chart'?<HistoryChart episode={selected}/>:<div className="hw-table-wrap oh-values" tabIndex={0} role="region" aria-label="Observed real GDP changes"><table><caption>Observed real GDP change since {selected.year-1}</caption><thead><tr><th scope="col">Place</th>{selected.gdp[0].path.map(point=><th key={point.year} scope="col">{point.year}</th>)}</tr></thead><tbody>{selected.gdp.map(region=><tr key={region.region}><th scope="row">{names[region.region]}</th>{region.path.map(point=><td key={point.year}>{pct(point.changePct)}</td>)}</tr>)}</tbody></table></div>}
  </section>}
  {evidenceOpen&&<ContextDialog title="Historical oil and GDP evidence" onClose={()=>setEvidenceOpen(false)} className="oh-evidence">
   <p>{result.interpretation}</p>
   <h3>How episodes are matched</h3><p>{result.matchMethod} Episodes are selected by oil prices, never by the GDP outcome. Their similarity is not a probability or a causal prediction.</p>
   <h3>Sources</h3>{result.sources.map(source=><p className="hw-evidence-source" key={source.id}><a href={source.url} target="_blank" rel="noopener noreferrer">{source.title}</a></p>)}
   <h3>Limits of the comparison</h3>{result.limitations.map((text,index)=><p key={index}>{text}</p>)}
   <h3>Can these models forecast provincial GDP?</h3><p>The candidate models have not cleared the public forecast gate. Their held-out errors are shown below; a lower error is better.</p>
   <div className="hw-table-wrap" tabIndex={0} role="region" aria-label="Candidate model validation"><table><caption>Mean absolute error in GDP percentage points, through {state.horizonYears} years after the price-change year</caption><thead><tr><th scope="col">Place</th><th scope="col">Candidate</th><th scope="col">Model error</th><th scope="col">No-oil baseline</th><th scope="col">Held-out years</th></tr></thead><tbody>{result.validation.map(row=><tr key={row.region+row.model}><th scope="row">{names[row.region]}</th><td>{row.label}</td><td>{n(row.maePctPoints,2)}</td><td>{n(row.baselineMaePctPoints,2)}</td><td>{row.heldoutCount}</td></tr>)}</tbody></table></div>
   <p>These checks use revised historical data and observed shocks, not information available at a real-time forecast date. A lower error alone does not establish causality or validate a future price scenario.</p>{result.forecastGate.requirements.map((text,index)=><p key={index}>{text}</p>)}
   <h3>Export this evidence</h3><p>The export includes this selection, the observed results, model validation and the complete source snapshot.</p><button type="button" data-research-export onClick={exportEvidence}>Export evidence</button>
  </ContextDialog>}
 </section>;
}
export function mountDynamicPrices(element,options){validateDynamicPriceHistory(options.data);const root=createRoot(element);root.render(<DynamicPrices {...options}/>);return {unmount:()=>root.unmount()};}
