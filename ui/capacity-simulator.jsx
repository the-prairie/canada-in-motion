import React,{useEffect,useRef,useState} from 'react';
import {simulateCapacity,normalizeCapacitySelection} from '../capacity-model.mjs';
import {ContextDialog} from './context-dialog.jsx';
import './capacity-simulator.css';

const topics=[['workforce','Nursing supply'],['construction','School openings'],['funding','Funding rules']];
const fmt=(value,digits=0)=>Number.isFinite(value)?new Intl.NumberFormat('en-CA',{maximumFractionDigits:digits}).format(value):'—';
const signed=(value,digits=0)=>`${value>0?'+':''}${fmt(value,digits)}`;
const ruleNames={previous:'20 / 30 / 50',current:'30 / 70',projection:'100% projection'};
const month=value=>new Date(`${String(value).slice(0,7)}-15T12:00:00Z`).toLocaleDateString('en-CA',{month:'short',year:'numeric',timeZone:'UTC'});

function useWidth(){const ref=useRef(null),[width,setWidth]=useState(600);useEffect(()=>{const observer=new ResizeObserver(entries=>setWidth(Math.max(200,entries[0].contentRect.width)));observer.observe(ref.current);return()=>observer.disconnect();},[]);return [ref,width];}
function LineChart({series,unit,label,ticks,step=false,origin}){
 const [ref,width]=useWidth(),height=258,pad={left:48,right:16,top:20,bottom:36};
 const points=series.flatMap(item=>item.points),minX=Math.min(...points.map(p=>p.x)),maxX=Math.max(...points.map(p=>p.x));
 const minValue=step?0:Math.floor(Math.min(...points.map(p=>p.y))*.94/1000)*1000,maxValue=Math.ceil(Math.max(...points.map(p=>p.y))*1.06/1000)*1000;
 const x=value=>pad.left+(value-minX)/(maxX-minX||1)*(width-pad.left-pad.right),y=value=>height-pad.bottom-(value-minValue)/(maxValue-minValue||1)*(height-pad.top-pad.bottom);
 const path=values=>values.map((p,i)=>`${i?(step?'H':'L'):'M'}${x(p.x).toFixed(2)}${i&&step?'V':','}${y(p.y).toFixed(2)}`).join(' ');
 return <div className="cs-chart" ref={ref}><span className="cs-unit">{unit}</span><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label}>
  <title>{label}</title>{[0,1,2,3].map(i=>{const value=minValue+(maxValue-minValue)*i/3;return <g key={i}><line className="cs-grid" x1={pad.left} x2={width-pad.right} y1={y(value)} y2={y(value)}/><text x={pad.left-8} y={y(value)+4} textAnchor="end">{fmt(value/1000,1)}k</text></g>;})}
  {origin!==undefined&&<g><rect className="cs-future" x={x(origin)} y={pad.top} width={Math.max(0,width-pad.right-x(origin))} height={height-pad.bottom-pad.top}/><line className="cs-origin" x1={x(origin)} x2={x(origin)} y1={pad.top} y2={height-pad.bottom}/></g>}
  {series.map(item=><path key={item.id} className={`cs-line cs-${item.id}`} d={path(item.points)} fill="none"/>)}
  {ticks.filter((tick,i)=>i===0||i===ticks.length-1||(x(tick.x)-x(ticks[0].x)>50&&x(ticks.at(-1).x)-x(tick.x)>50)).map(tick=><text key={tick.x} x={x(tick.x)} y={height-10} textAnchor={tick.x===minX?'start':tick.x===maxX?'end':'middle'}>{tick.label}</text>)}
 </svg><div className="cs-legend">{series.map(item=><span key={item.id}><i className={`cs-${item.id}`}/>{item.label}</span>)}</div></div>;
}
function Range({name,label,value,min,max,step=1,onChange,display,note}){return <div className="cs-control"><label htmlFor={`cs-${name}`}><span>{label}</span><output htmlFor={`cs-${name}`}>{display??value}</output></label><input id={`cs-${name}`} type="range" min={min} max={max} step={step} value={value} onChange={event=>onChange({[name]:Number(event.target.value)})}/>{note&&<small>{note}</small>}</div>;}
function DataTable({caption,headers,rows}){return <div className="cs-table-wrap" tabIndex={0} role="region" aria-label={caption}><table><caption>{caption}</caption><thead><tr>{headers.map(h=><th scope="col" key={h}>{h}</th>)}</tr></thead><tbody>{rows.map((row,i)=><tr key={i}>{row.map((v,j)=>j?<td key={j}>{v}</td>:<th scope="row" key={j}>{v}</th>)}</tr>)}</tbody></table></div>;}
function FundingChart({result,selected}){
 const [ref,width]=useWidth(),height=220,left=8,right=18,top=24,bottom=34,all=[...result.values.map(v=>v.value),result.actual];
 const low=Math.floor(Math.min(...all)*.97/1000)*1000,high=Math.ceil(Math.max(...all)*1.025/1000)*1000,x=v=>left+(v-low)/(high-low)*(width-left-right);
 return <div className="cs-chart cs-funding-chart" ref={ref}><span className="cs-unit">Calculated funding-weighted eligible FTE</span><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Three funding rule calculations compared with later reported eligible enrolment"><title>Weighted eligible FTE; rule calculations, not grant dollars</title>
 {[0,1,2].map(i=>{const value=low+(high-low)*i/2;return <g key={i}><line className="cs-grid" x1={x(value)} x2={x(value)} y1={top} y2={height-bottom}/><text x={x(value)} y={height-9} textAnchor={i===0?'start':i===2?'end':'middle'}>{fmt(value/1000,1)}k</text></g>;})}
 {result.values.map((row,i)=><line key={row.id} className="cs-actual-marker" x1={x(result.actual)} x2={x(result.actual)} y1={top+i*55+4} y2={top+i*55+24}/>)}
 {result.values.map((row,i)=><g key={row.id} className={selected===row.id?'cs-funding-selected':''}><text x={left} y={top+i*55-5}>{ruleNames[row.id]} · {fmt(row.value,1)}</text><line className="cs-dot-track" x1={left} x2={width-right} y1={top+i*55+14} y2={top+i*55+14}/><circle className="cs-rule-dot" cx={x(row.value)} cy={top+i*55+14} r={selected===row.id?6:4}/></g>)}
 </svg><div className="cs-legend"><span><i className="cs-reported"/>Later reported: {fmt(result.actual)} eligible FTE</span></div></div>;
}
function Evidence({data,result,onClose,onExport}){
 const w=result.workforce,c=result.construction,f=result.funding,topic=result.selection.topic;
 const sourceIds=new Set(topic==='workforce'?[...data.workforce.history.map(row=>row.sourceId),'cihi-methods-2025','ahs-2025','ahs-2022']:topic==='construction'?[...data.schools.construction.projects.flatMap(project=>['actualSourceId','approvalSourceId','plannedSourceId','capacitySourceId','observedCapacitySourceId'].map(key=>project[key])),data.schools.construction.guidance.sourceId,'ab-northtrail']:[...data.schools.funding.actuals.map(row=>row.sourceId),...data.schools.funding.vintages.map(row=>row.sourceId),'ab-funding-model']);
 return <ContextDialog title="Capacity evidence" onClose={onClose} className="cs-evidence">
 <p>Reviewed {data.reviewedAt}. These are conditional accounting scenarios. The controls do not estimate the effect of a policy or funding decision.</p>
 {topic==='workforce'&&<><h3>Nursing supply</h3><p>{data.workforce.unit}. {data.workforce.model.calibration}</p>
 <DataTable caption="Alberta RN registration observations" headers={['Year','Registered people','Entrants','Non-renewals in next year']} rows={data.workforce.history.map(r=>[r.year,fmt(r.supply),fmt(r.inflow),fmt(r.outflow)])}/>
 <p>Entrants are people registered this year but not the preceding year in Alberta. Non-renewals refer to the following registration year. Supply includes eligible registrants who are not employed.</p>
 <p>Scenario equation: next supply = current supply × (1 − assumed non-renewal rate) + annual entrants + extra entrants after the waiting period. Baseline entrants: {fmt(w.entrants,2)} per year; non-renewal rate: {fmt(w.exitRate*100,3)}%. Retention improvement reduces that rate by percentage points from the first projected year. A one-year wait adds extra entrants first in 2027.</p>
 <h3>Nursing historical test</h3><p>Parameters frozen using information through 2020; test years 2021–2025. The revised 2026 series is used, so this is a retrospective holdout, not a real-time vintage test. Model mean absolute error: {fmt(w.validation.model.mae)} people; simple trend: {fmt(w.validation.drift.mae)}; no-change baseline: {fmt(w.validation.persistence.mae)}. No improvement over a simple trend.</p>
 <DataTable caption="Nursing holdout predictions and observations" headers={['Year','Observed','Model','Simple trend','No change']} rows={w.validation.rows.map(r=>[r.year,fmt(r.actual,2),fmt(r.predicted,2),fmt(r.drift,2),fmt(r.persistence,2)])}/>
 <p>The accounting replay has {fmt(w.validation.replay.mae)} mean absolute error because it uses realized flows. This confirms the accounting identity, not forecast accuracy.</p>
 <DataTable caption="Selected conditional nursing scenario" headers={['Year','Baseline','Scenario','Extra entrants','Avoided non-renewals']} rows={w.rows.map(r=>[r.year,fmt(r.baseline,2),fmt(r.scenario,2),fmt(r.extraEntries),fmt(r.avoidedExits,2)])}/>
 <ul>{[...data.workforce.limitations,'Chosen gains are assumptions. Migration, pay, funding and recruitment policies are not assigned causal effects; registrations are not converted to service outcomes or dollars.'].map(note=><li key={note}>{note}</li>)}</ul>
 {data.employerContext&&<p>AHS employer context is separate: {data.employerContext.scopeWarning} {data.employerContext.recruitmentEvidence.note} These employer measures are not inputs to the registration model.</p>}
 </>}
 {topic==='construction'&&<><h3>School openings</h3><p>{data.schools.construction.scope} Calculations use {data.schools.construction.capacityUnit} and month-level opening dates.</p>
 <DataTable caption="Five CBE projects: plans, observations and scenario" headers={['Project','Design places','Approved','2022 plan','Actual opening','Scenario opening','Actual − plan (months)']} rows={c.projects.map(p=>[p.name,fmt(p.places),month(p.approved),month(p.plannedOpening),month(p.actualOpening),month(p.scenarioOpening),signed(p.scheduleErrorMonths)])}/>
 <p>Historical plans missed actual openings by {fmt(c.scheduleMaeMonths,1)} months on average in absolute terms. This selected cohort is not a representative delivery model. Place-months sum the monthly difference in cumulative design places between the scenario and actual opening dates; one place available one month earlier adds one place-month.</p>
 <ul>{data.schools.construction.limitations.map(note=><li key={note}>{note}</li>)}</ul>
 </>}
 {topic==='funding'&&<><h3>Funding rules</h3><p>{data.schools.funding.scope} Weighted calculations use the original budget vintage. The 20/30/50 rule weights prior, current-at-budget and projected target enrolment; 30/70 uses the latter two. The selected projection adjustment is an assumption.</p>
 <DataTable caption="Original CBE budget vintages" headers={['Target year','Published','Prior actual','Current at budget','Target projection','Later reported','Rule in force']} rows={data.schools.funding.vintages.map(r=>[r.schoolYear,r.vintageDate,fmt(r.previousActual),fmt(r.currentActualAtBudget),fmt(r.forecast),fmt(r.realized),r.actualRule])}/>
 <DataTable caption="Original forecast validation (unadjusted)" headers={['Year','Reported actual','Budget forecast','Forecast error','No-growth forecast']} rows={f.validation.rows.map(r=>[r.year,fmt(r.actual),fmt(r.predicted),signed(r.predicted-r.actual),fmt(r.persistence)])}/>
 <p>Mean absolute error: published forecast {fmt(f.validation.forecast.mae,1)} eligible FTE; no-growth forecast {fmt(f.validation.persistence.mae,1)}. Three years compare forecast accuracy only; they do not validate a funding policy.</p>
 <DataTable caption="Selected rule comparison" headers={['Rule','Weighted eligible FTE']} rows={f.values.map(r=>[ruleNames[r.id],fmt(r.value,2)])}/>
 <ul>{data.schools.funding.limitations.map(note=><li key={note}>{note}</li>)}</ul>
 </>}
 <h3>Sources</h3>{data.sources.filter(source=>sourceIds.has(source.id)).map(source=><div className="cs-source" key={source.id}><a href={source.url} target="_blank" rel="noopener noreferrer">{source.title}</a><small>{source.publisher?`${source.publisher} · `:''}{source.publishedAt||source.publicationDate||'Publication date not specified'}{source.retrievedAt?` · Retrieved ${source.retrievedAt}`:''}</small><p>{source.locator}</p>{source.note&&<p>{source.note}</p>}</div>)}
 <button type="button" data-research-export onClick={onExport}>Export scenario & evidence JSON</button>
 </ContextDialog>;
}

export function CapacitySimulator({data,initial={},onChange,onObserved}){
 const [selection,setSelection]=useState(()=>normalizeCapacitySelection(initial)),[evidence,setEvidence]=useState(false);
 const initialKey=JSON.stringify(normalizeCapacitySelection(initial));
 useEffect(()=>{setSelection(normalizeCapacitySelection(initial));},[initialKey]);
 const result=simulateCapacity(data,selection),w=result.workforce,c=result.construction,f=result.funding;
 const update=patch=>{const next=normalizeCapacitySelection({...selection,...patch});setSelection(next);onChange?.(next);};
 const exportData=()=>{const url=URL.createObjectURL(new Blob([JSON.stringify({selection,result,sourceSnapshot:data},null,2)],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download='alberta-capacity-evidence.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
 const first=data.workforce.history[0],last=w.last;
 const constructionTicks=[c.rows[0],c.rows[Math.floor(c.rows.length/2)],c.rows.at(-1)].map(r=>({x:r.month,label:month(r.label)}));
 return <section className="capacity-simulator" aria-labelledby="cs-title" data-topic={selection.topic}>
  <header className="cs-heading"><div><h2 id="cs-title">What changes capacity?</h2><p>Test the assumptions behind Alberta’s services.</p></div><div className="cs-header-actions"><button className="as-evidence-button" type="button" onClick={()=>setEvidence(true)}>Evidence</button></div></header>
  <nav className="cs-topics" aria-label="Capacity topics">{topics.map(([id,label])=><button type="button" key={id} aria-pressed={selection.topic===id} onClick={()=>update({topic:id})}>{label}</button>)}</nav>
  <div className="cs-workspace">
   <div className="cs-visual">
    {selection.topic==='workforce'&&<><h3>Registrations accumulate over time</h3><p className="cs-intro">Add annual entrants or reduce non-renewals. Both change the pool of eligible registered nurses.</p><LineChart unit="RN registered people" label="Observed Alberta RN registered people from 2016 to 2025, followed by conditional baseline and scenario" origin={2025} ticks={[{x:first.year,label:first.year},{x:2025,label:2025},{x:last.year,label:last.year}]} series={[{id:'observed',label:'Observed',points:data.workforce.history.map(r=>({x:r.year,y:r.supply}))},{id:'baseline',label:'Conditional baseline',points:w.rows.map(r=>({x:r.year,y:r.baseline}))},{id:'scenario',label:'Your scenario',points:w.rows.map(r=>({x:r.year,y:r.scenario}))}]}/><p className="cs-limit">Registrations are eligible people, not employer hires, working FTE or staffed beds. CIHI links the 2024 jump to new registration pathways.</p></>}
    {selection.topic==='construction'&&<><h3>Opening dates change when places arrive</h3><p className="cs-intro">Shift five known Calgary Board of Education projects while keeping their approved design size fixed.</p><LineChart unit="Cumulative approved design places" label="Cumulative approved design places for five CBE projects: historical plan, actual openings and shifted scenario" ticks={constructionTicks} step series={[{id:'planned',label:'2022 plan',points:c.rows.map(r=>({x:r.month,y:r.planned}))},{id:'observed',label:'Actual openings',points:c.rows.map(r=>({x:r.month,y:r.actual}))},{id:'scenario',label:'Shifted openings',points:c.rows.map(r=>({x:r.month,y:r.scenario}))}]}/><p className="cs-limit">{fmt(c.totalPlaces)} design places in five projects. This is not staffed capacity or a representative sample of all school construction.</p></>}
    {selection.topic==='funding'&&<><h3>The rule changes the weighted count</h3><p className="cs-intro">Apply three formulas to the same CBE budget vintage, then test its enrolment projection.</p><FundingChart result={f} selected={selection.fundingRule}/><p className="cs-limit">Eligible Grade 1–12 student FTE. These are reconstructed rule calculations, not final funded counts or grant dollars.</p></>}
   </div>
   <div className="cs-assumptions"><h3>Your assumptions</h3>
    {selection.topic==='workforce'&&<><Range name="extraEntrants" label="Extra registrants each year" value={selection.extraEntrants} min={0} max={3000} step={100} display={fmt(selection.extraEntrants)} onChange={update}/><Range name="retentionPp" label="Lower annual non-renewal rate" value={selection.retentionPp} min={0} max={2} step={.1} display={`${fmt(selection.retentionPp,1)} pp`} onChange={update} note={`${fmt(w.exitRate*100,2)}% → ${fmt(w.scenarioExitRate*100,2)}% of registered people`}/><Range name="delayYears" label="Wait before extra entrants" value={selection.delayYears} min={0} max={3} display={`${selection.delayYears} ${selection.delayYears===1?'year':'years'}`} onChange={update} note={`First extra entrants: ${2026+selection.delayYears}. Retention changes start in 2026.`}/><Range name="years" label="Years ahead" value={selection.years} min={1} max={10} display={`To ${2025+selection.years}`} onChange={update}/></>}
    {selection.topic==='construction'&&<Range name="openingShiftMonths" label="Shift actual opening dates" value={selection.openingShiftMonths} min={-12} max={24} display={selection.openingShiftMonths===0?'No shift':`${Math.abs(selection.openingShiftMonths)} ${Math.abs(selection.openingShiftMonths)===1?'month':'months'} ${selection.openingShiftMonths<0?'earlier':'later'}`} onChange={update} note="All five projects move by the same number of months."/>}
    {selection.topic==='funding'&&<><label className="cs-select" htmlFor="cs-fundingYear">Budget target year<select id="cs-fundingYear" value={selection.fundingYear} onChange={event=>update({fundingYear:Number(event.target.value)})}>{[2023,2024,2025].map(year=><option key={year} value={year}>{year}/{String(year+1).slice(2)}</option>)}</select></label><label className="cs-select" htmlFor="cs-fundingRule">Compare a rule<select id="cs-fundingRule" value={selection.fundingRule} onChange={event=>update({fundingRule:event.target.value})}>{Object.entries(ruleNames).map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label><Range name="projectionChangePct" label="Change the budget projection" value={selection.projectionChangePct} min={-10} max={10} step={.5} display={`${signed(selection.projectionChangePct,1)}%`} onChange={update} note={`${fmt(f.vintage.forecast)} → ${fmt(f.projection)} eligible FTE`}/><p className="cs-vintage">Published {f.vintage.vintageDate}. Rule in force: {f.vintage.actualRule}.</p></>}
    <button className="cs-reset" type="button" onClick={()=>update(selection.topic==='workforce'?{extraEntrants:0,retentionPp:0,delayYears:1,years:5}:selection.topic==='construction'?{openingShiftMonths:0}:{projectionChangePct:0,fundingRule:'current',fundingYear:2025})}>Reset assumptions</button>
   </div>
   <div className="cs-outcome" aria-live="polite" aria-atomic="true">
    {selection.topic==='workforce'&&<><p><strong>{signed(w.additional)}</strong><span>registered people versus baseline in {last.year}</span></p><div>Scenario {fmt(last.scenario)} · baseline {fmt(last.baseline)}. Conditional on recent registration flows continuing; not a validated forecast.</div></>}
    {selection.topic==='construction'&&<><p><strong>{signed(c.placeMonthsDifference)}</strong><span>design place-months {c.placeMonthsDifference<0?'lost':c.placeMonthsDifference>0?'gained':'changed'}</span></p><div>The final total remains {fmt(c.totalPlaces)} design places. Earlier or later openings change availability over time.</div></>}
    {selection.topic==='funding'&&<><p><strong>{fmt(typeof f.selected==='number'?f.selected:f.values.find(r=>r.id===selection.fundingRule)?.value,1)}</strong><span>funding-weighted eligible FTE</span></p><div>{ruleNames[selection.fundingRule]} rule · {signed((typeof f.selected==='number'?f.selected:f.values.find(r=>r.id===selection.fundingRule)?.value)-f.actual,1)} versus later reported enrolment. The gap does not measure a dollar surplus or shortfall.</div></>}
   </div>
  </div>
  <p className="cs-validation">{selection.topic==='workforce'?`Historical test: no improvement over a simple trend. Mean absolute error ${fmt(w.validation.model.mae)} vs ${fmt(w.validation.drift.mae)} registered people.`:selection.topic==='construction'?`Historical check: openings differed from the 2022 plan by ${fmt(c.scheduleMaeMonths)} months on average. A check of five known projects, not a delivery forecast.`:`Historical check: original budget forecasts missed by ${fmt(f.validation.forecast.mae)} eligible FTE on average, vs ${fmt(f.validation.persistence.mae)} with no growth. Three years do not validate a funding policy.`}</p>
  {evidence&&<Evidence data={data} result={result} onClose={()=>setEvidence(false)} onExport={exportData}/>}
 </section>;
}
