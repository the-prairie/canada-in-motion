import {GUIDE_DEFAULTS,loadGuidedSnapshot} from '../guided-scenario-model.mjs';
import React, {createContext,useContext,useMemo,useState,useEffect,useRef,Component} from 'react';
import {createRoot} from 'react-dom/client';
import {Renderer,createLibrary,defineComponent} from '@openuidev/react-lang';
import {WorkspaceFindings} from './workspace-findings.jsx';
import {z} from 'zod/v4';
import {compileWorkspace,initialSelection,resolveWorkspace,validateWorkspace,normalizeWorkspaceTradeSelection} from '../workspace-contract.mjs';
import {project} from '../atlas-model.mjs';
import {createTradeViews} from './trade-views.jsx';
import {createTradeWorkspace,ENERGY_COMMODITIES} from '../trade-workspace-model.mjs';
import {captureInvestigation,compareTradeSelections} from '../investigation-model.mjs';
import {listInvestigations,saveInvestigation,deleteInvestigation} from './investigation-store.mjs';
import {ForecastExplorer} from './provincial-forecast.jsx';

const Context=createContext(null);
const number=(value,digits=1)=>Number.isFinite(value)?new Intl.NumberFormat('en-CA',{maximumFractionDigits:digits}).format(value):'No data';
const dollars=value=>Number.isFinite(value)?value>=1000?`$${number(value/1000)}B`:`$${number(value)}M`:'No data';
const percentage=value=>Number.isFinite(value)?`${number(value)}%`:'No data';
const name=code=>({QC:'Québec',NL:'Newfoundland & Labrador',NT:'Northwest Territories',PE:'Prince Edward Island'}[code]);
const pointsBounds=points=>[Math.min(...points.map(p=>p[0])),Math.min(...points.map(p=>p[1])),Math.max(...points.map(p=>p[0])),Math.max(...points.map(p=>p[1]))];
const usePanel=id=>{const context=useContext(Context);return {...context,panel:context.resolved.panels.find(p=>p.id===id)};};

function ActionMenu({children}){
  const ref=useRef(null);
  useEffect(()=>{
    const close=event=>{const menu=ref.current;if(!menu?.open)return;if(event.type==='keydown'&&event.key==='Escape'){menu.open=false;menu.querySelector('summary')?.focus();}else if(event.type==='pointerdown'&&!menu.contains(event.target))menu.open=false;};
    document.addEventListener('pointerdown',close);document.addEventListener('keydown',close);
    return()=>{document.removeEventListener('pointerdown',close);document.removeEventListener('keydown',close);};
  },[]);
  return <details className="hw-action-menu" ref={ref}><summary>Save & export</summary><div onClick={event=>{if(event.target.closest('button')){ref.current.open=false;ref.current.querySelector('summary')?.focus();}}}>{children}</div></details>;
}

function Sources({panel}){
  const {workspace}=useContext(Context);
  return <details className="hw-sources"><summary>Sources & definitions</summary>{panel.note&&<p>{panel.note}</p>}{panel.sourceIds.map(id=>{
    const source=workspace.sources.find(s=>s.id===id);
    return <div key={id}><a href={source.url} target="_blank" rel="noopener noreferrer">{source.title}</a>{(source.asOf||source.retrievedAt)&&<small>{source.asOf?`Published period: ${source.asOf}`:`Retrieved ${source.retrievedAt.slice(0,10)}`}</small>}{source.method&&<p>{source.method}</p>}</div>;
  })}</details>;
}
function Panel({panel,children,tools,subtitle,className=''}){
  return <section className={`hw-panel hw-${panel.type} ${className}`} aria-labelledby={`hw-title-${panel.id}`}><header><div><p className="hw-eyebrow">{panel.role==='context'?'Supporting context':panel.type==='scenario-comparison'?'Published scenario':panel.type==='oil-sensitivity'?'National model':panel.type==='energy-trade'?'Modelled trade':panel.type==='provincial-impact'?'Price experiment':panel.type==='gdp-forecast'?'Statistical forecast':'Observed data'} · {panel.period}</p><h3 id={`hw-title-${panel.id}`}>{panel.title}</h3>{subtitle&&<p className="hw-caption">{subtitle}</p>}</div>{tools}</header>{children}<Sources panel={panel}/></section>;
}
function Table({caption,headers,rows}){
  return <div className="hw-table-wrap" tabIndex={0} role="region" aria-label={caption}><table><caption>{caption}</caption><thead><tr>{headers.map(label=><th key={label} scope="col">{label}</th>)}</tr></thead><tbody>{rows.map((row,index)=><tr key={index}>{row.map((value,i)=>i===0?<th key={i} scope="row">{value}</th>:<td key={i}>{value}</td>)}</tr>)}</tbody></table></div>;
}
function ViewSwitch({table,setTable,label}){
  return <div className="hw-switch" aria-label={label}><button aria-pressed={!table} onClick={()=>setTable(false)}>Chart</button><button aria-pressed={table} onClick={()=>setTable(true)}>Table</button></div>;
}
function ProvinceComparisonView({id}){
  const {panel,toggle,selection}=usePanel(id);const [table,setTable]=useState(false);const [measure,setMeasure]=useState('value');
  const rows=[...panel.rows].sort((a,b)=>(b[measure]??-Infinity)-(a[measure]??-Infinity));
  const max=Math.max(...rows.map(r=>r[measure]||0),1);const format=measure==='value'?dollars:percentage;
  return <Panel panel={panel} subtitle="Energy-sector value added. Current Canadian dollars at basic prices." tools={<ViewSwitch table={table} setTable={setTable} label="GDP comparison display"/>}>
    <label className="hw-measure">Compare by<select aria-label="Compare by" value={measure} onChange={e=>setMeasure(e.target.value)}><option value="value">Energy GDP</option><option value="sharePct">Share of each economy</option><option value="nationalSharePct">Share of Canadian energy GDP</option></select></label>
    {table?<Table caption={`Energy-sector GDP · ${panel.period}`} headers={['Province / territory',`Energy GDP · ${panel.period}`,'Share of local GDP',...(panel.activityYear?[`Energy growth · ${panel.activityYear}`,`Economy growth · ${panel.activityYear}`]:['Share of Canadian energy GDP'])]} rows={rows.map(r=>[name(r.code)||r.name,dollars(r.value),percentage(r.sharePct),...(panel.activityYear?[percentage(r.activity?.energyGrowthPct),percentage(r.activity?.totalGrowthPct)]:[percentage(r.nationalSharePct)])])}/>:<ol className="hw-bars">{rows.map(r=><li key={r.code}><button onClick={()=>toggle(r.code)} aria-pressed={selection.regions.includes(r.code)} aria-label={`${name(r.code)||r.name}, ${format(r[measure])}; toggle comparison`}><span className="hw-bar-label">{name(r.code)||r.name}</span><span className="hw-bar-track" aria-hidden="true"><span style={{width:`${(r[measure]||0)/max*100}%`}}/></span><strong>{format(r[measure])}</strong></button></li>)}</ol>}
    {panel.activityYear&&!table&&<Table caption={`Real activity growth · ${panel.previousActivityYear} to ${panel.activityYear}`} headers={['Province / territory','Energy sector','Whole economy']} rows={rows.map(r=>[name(r.code)||r.name,percentage(r.activity?.energyGrowthPct),percentage(r.activity?.totalGrowthPct)])}/>}
    {panel.activityYear&&<><p className="hw-caption">Growth uses inflation-adjusted GDP. Dollar contributions and shares retain their {panel.period} current-price basis.</p><details><summary>Real GDP levels and basis</summary><Table caption={`Observed GDP in ${panel.activityYear} · million chained 2017 CAD at basic prices`} headers={['Province / territory','Energy sector','Whole economy']} rows={rows.map(r=>[name(r.code)||r.name,number(r.activity?.energy),number(r.activity?.total)])}/><p className="hw-caption">These inflation-adjusted levels measure activity. They are not current-dollar income and cannot be summed across provinces or divided to calculate sector shares.</p></details></>}
  </Panel>;
}
function ProvinceMapView({id}){
  const {panel,shapes,toggle,selection}=usePanel(id);const [table,setTable]=useState(false);
  const [west,south,east,north]=pointsBounds(shapes.flatMap(s=>s.rings.flat()));
  const path=ring=>ring.map(([x,y],i)=>`${i?'L':'M'}${x-west},${north-y}`).join(' ')+'Z';
  return <Panel panel={panel} subtitle="Colour shows energy’s share of the local economy." tools={<ViewSwitch table={table} setTable={setTable} label="Province map display"/>}>
    {table?<Table caption={`Energy's share of local GDP · ${panel.period}`} headers={['Province / territory','Share of GDP']} rows={panel.rows.map(r=>[name(r.code)||r.name,percentage(r.sharePct)])}/>:<><svg className="hw-map" viewBox={`0 0 ${east-west} ${north-south}`} role="group" aria-label={`Energy share of provincial and territorial GDP in ${panel.period}; select a province to change the comparison`}>{shapes.map(shape=>{
      const row=panel.rows.find(r=>r.code===shape.code);const selected=selection.regions.includes(shape.code);
      return <path key={shape.code} d={shape.rings.map(path).join(' ')} fill={Number.isFinite(row?.sharePct)?`hsl(170 28% ${92-Math.min(row.sharePct,40)*1.55}%)`:'#e7e7df'} stroke={selected?'#b84e2a':'#fbfaf5'} strokeWidth={selected?2.5:1} vectorEffect="non-scaling-stroke" className={selected?'selected':''} tabIndex={0} role="button" aria-pressed={selected} aria-label={`${name(shape.code)||shape.name}: ${percentage(row?.sharePct)} of GDP. Toggle comparison.`} onClick={()=>toggle(shape.code)} onKeyDown={e=>{if(['Enter',' '].includes(e.key)){e.preventDefault();toggle(shape.code);}}}><title>{shape.name} · {percentage(row?.sharePct)}</title></path>;
    })}</svg><div className="hw-map-key"><span>0%</span><i/><span>40% of local GDP</span><span className="hw-selected-key">Selected</span></div></>}

  </Panel>;
}
function ScenarioComparisonView({id}){
  const {panel}=usePanel(id);const [table,setTable]=useState(false);
  const max=Math.max(1,...panel.rows.flatMap(row=>[row.baseline,row.selected]).filter(Number.isFinite));
  return <Panel panel={panel} subtitle={`${panel.unit} · ${panel.year||panel.period}`} tools={<ViewSwitch table={table} setTable={setTable} label={`${panel.title} display`}/>}>
    <div className="hw-series-key"><span><i/>Current Measures</span><span><i/>{panel.scenario}</span></div>
    {table?<Table caption={`${panel.title} · ${panel.year||panel.period} · ${panel.unit}`} headers={['Region','Current Measures',panel.scenario,'Difference']} rows={panel.rows.map(r=>[name(r.code)||r.name,number(r.baseline),number(r.selected),number(r.delta)])}/>:<ol className="hw-pairs">{panel.rows.map(row=><li key={row.code}><span className="hw-bar-label">{name(row.code)||row.name}</span>{Number.isFinite(row.baseline)&&Number.isFinite(row.selected)?<><div className="hw-paired-bars" aria-label={`Current Measures ${number(row.baseline)}; ${panel.scenario} ${number(row.selected)} ${panel.unit}`}><div><i style={{width:`${row.baseline/max*100}%`}}/><span>{number(row.baseline)}</span></div><div><i style={{width:`${row.selected/max*100}%`}}/><span>{number(row.selected)}</span></div></div></>:<p className="hw-missing">{row.reason||'No comparable published series for this jurisdiction.'}</p>}</li>)}</ol>}
    <p className="hw-caption">Scenario assumptions change together. These differences do not isolate the effect of a single price change.{panel.unit?.includes('index')?' Price indices compare scenarios within each province; they do not compare absolute provincial bills.':''}</p>
  </Panel>;
}
function InfrastructureMapView({id}){
  const {panel,network,shapes}=usePanel(id);const [active,setActive]=useState(null);const [fit,setFit]=useState(true);
  if(!network)return <Panel panel={panel}><p className="hw-missing">The infrastructure snapshot is unavailable. The economic comparisons are still available.</p></Panel>;
  const routes=network.routes.filter(r=>panel.routeIds.includes(r.id));const facilities=network.facilities.filter(f=>panel.facilityIds.includes(f.id));
  const route=routes.find(r=>r.id===active);const facility=facilities.find(f=>f.id===active);
  const coordinates=[...routes.flatMap(r=>r.coordinates),...facilities.map(f=>f.coordinates)].map(([lon,lat])=>project(lon,lat));
  const bounds=pointsBounds(fit&&coordinates.length?coordinates:shapes.flatMap(s=>s.rings.flat()));
  const [west,south,east,north]=bounds;const width=Math.max(east-west,3),height=Math.max(north-south,3);const pad=Math.max(width,height)*.12;
  const path=ring=>ring.map(([x,y],i)=>`${i?'L':'M'}${x},${-y}`).join(' ');
  return <Panel panel={panel} subtitle="Routes touching the selected provinces · approximate locations" tools={<button onClick={()=>setFit(!fit)}>{fit?'Show Canada':'Fit routes'}</button>}>
    <p className="hw-context-note">These lines show general routes. They do not show measured flows, direction or pipeline alignment.</p>
    {coordinates.length?<svg className="hw-map hw-network-map" viewBox={`${west-pad} ${-north-pad} ${width+pad*2} ${height+pad*2}`} role="img" aria-label="Approximate infrastructure map. Select a named route or facility below for details."><g>{shapes.map(shape=><path key={shape.code} d={shape.rings.map(r=>path(r)+'Z').join(' ')} fill="#e4e7dd" stroke="#fbfaf5" strokeWidth="1" vectorEffect="non-scaling-stroke"/>)}</g>{routes.map(r=><path key={r.id} d={path(r.coordinates.map(([lon,lat])=>project(lon,lat)))} fill="none" stroke={r.commodity==='gas'?'#246b64':'#b74e2c'} strokeWidth={active===r.id?4:2} vectorEffect="non-scaling-stroke" opacity={active&&active!==r.id?0.5:1}/>)}{facilities.map(f=>{const [x,y]=project(...f.coordinates);return <circle key={f.id} cx={x} cy={-y} r={Math.max(width,height)/100} fill={active===f.id?'#b74e2c':'#243d3a'} stroke="#fff" strokeWidth="1" vectorEffect="non-scaling-stroke"/>;})}</svg>:<p className="hw-missing">No overview routes or facilities are included for these provinces.</p>}
    <div className="hw-series-key"><span><i style={{background:'#b74e2c'}}/>Oil corridor</span><span><i style={{background:'#246b64'}}/>Gas corridor</span><span>● Facility</span></div>
    <label className="hw-measure">Inspect a route or facility<select aria-label="Inspect a route or facility" value={active||''} onChange={e=>setActive(e.target.value||null)}><option value="">All included infrastructure</option>{routes.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}{facilities.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select></label>
    {route&&<div className="hw-inspector"><h4>{route.name}</h4><p>{route.origin} → {route.destination}</p><p>{route.description}</p><p>{route.geometryNote}</p></div>}
    {facility&&<div className="hw-inspector"><h4>{facility.name}</h4><p>Listed capacity: {number(facility.capacity)} {facility.unit} · {facility.asOf}</p><p>{facility.note}</p><p>Capacity is not actual throughput.</p></div>}
    <details><summary>Included locations ({routes.length+facilities.length})</summary><Table caption="Infrastructure overview" headers={['Name','Location / route','Meaning']} rows={[...routes.map(r=>[r.name,`${r.origin} → ${r.destination}`,'Indicative corridor']),...facilities.map(f=>[f.name,f.note,'Approximate facility'])]}/></details>
  </Panel>;
}
function OilSensitivityView({id}){
  const {panel,update}=usePanel(id);
  return <Panel panel={panel} subtitle="Canada only · a published model sensitivity"><div className="hw-scenario-controls"><label>WTI price change<select aria-label="Answer oil price change" value={panel.shockPct} onChange={e=>update({oilShock:Number(e.target.value)})}>{[...new Set([-20,-10,0,10,20,panel.shockPct])].sort((a,b)=>a-b).map(value=><option key={value} value={value}>{value>0?'+':''}{value}%</option>)}</select></label><label>Duration<select aria-label="Answer oil shock duration" value={panel.duration} onChange={e=>update({duration:e.target.value})}><option value="persistent">Persistent</option><option value="temporary">Two quarters</option></select></label></div><p className="hw-context-note">WTI price change: {panel.shockPct>0?'+':''}{number(panel.shockPct)}%, {panel.duration==='temporary'?'lasting two quarters':'persistent'}. {panel.method}.</p><Table caption="Estimated national effects after the oil-price change" headers={['Measure','Effect','Period']} rows={panel.rows.map(row=>[row.label,`${number(row.value)} ${row.unit}`,row.period])}/><p className="hw-caption">A national estimate cannot be allocated to provinces using their energy-sector shares.</p></Panel>;
}
function CoverageNoteView({id}){
  const {panel}=usePanel(id);return <aside className="hw-coverage" role="note"><p className="hw-eyebrow">Evidence gap</p><h3>{panel.title}</h3><p>{panel.message}</p>{panel.sourceIds.length>0&&<Sources panel={panel}/>}</aside>;
}
function ProvincialForecastView({id}){
  const {panel,workspace,selection,update}=usePanel(id);
  return <Panel panel={panel}><ForecastExplorer data={workspace.forecastSnapshot} embedded selection={{regions:selection.regions,year:panel.year}} update={next=>update({regions:next.regions,forecastYearsByPanel:{...selection.forecastYearsByPanel,[id]:next.year}})}/></Panel>;
}
const tradeViews=createTradeViews({usePanel,Panel,Table,ViewSwitch});
const components=Object.entries({...tradeViews,ProvinceMap:ProvinceMapView,ProvinceComparison:ProvinceComparisonView,ScenarioComparison:ScenarioComparisonView,InfrastructureMap:InfrastructureMapView,OilSensitivity:OilSensitivityView,CoverageNote:CoverageNoteView,ProvincialForecast:ProvincialForecastView}).map(([name,View])=>defineComponent({name,description:`A verified ${name} panel resolved from source data.`,props:z.object({id:z.string()}),component:({props})=><View id={props.id}/>}));
const EnergyWorkspace=defineComponent({name:'EnergyWorkspace',description:'Linked energy evidence panels.',props:z.object({panels:z.array(z.union(components.map(component=>component.ref)))}),component:({props,renderNode})=><div className="hw-grid">{renderNode(props.panels)}</div>});
export const energyLibrary=createLibrary({root:'EnergyWorkspace',components:[EnergyWorkspace,...components]});

class WorkspaceBoundary extends Component{
  state={failed:false};static getDerivedStateFromError(){return {failed:true};}
  render(){return this.state.failed?<p role="alert" className="hw-coverage">The interactive views could not load. The written findings and original data views remain available.</p>:this.props.children;}
}
function Workspace({workspace:seed,economy:providedEconomy,network:providedNetwork,shapes,question:initialQuestion,saved,onState,onReady,onRestore}){
  const [workspace,setWorkspace]=useState(seed),[question,setQuestion]=useState(initialQuestion);
  const economy=workspace.economySnapshot||providedEconomy,network=workspace.networkSnapshot||providedNetwork;
  const [library,setLibrary]=useState([]),[notice,setNotice]=useState(''),[baseline,setBaseline]=useState(null);
  useEffect(()=>{listInvestigations().then(items=>{setLibrary(items);if(items.invalidCount)setNotice(`${items.invalidCount} saved investigations could not be verified and were omitted.`);}).catch(()=>setNotice('Saved investigations are unavailable in this browser. Export data still works.'));},[]);
  useEffect(()=>{onReady?.();},[]);
  const original=useMemo(()=>initialSelection(workspace),[workspace]);const [selection,setSelection]=useState(()=>normalizeWorkspaceTradeSelection(workspace,saved||original));const [history,setHistory]=useState([]);const [renderError,setRenderError]=useState(false);
  const [guideLoad,setGuideLoad]=useState('idle'),[guideAttempt,setGuideAttempt]=useState(0);
  const guideOpen=Boolean(selection.guideStep);
  useEffect(()=>{
    if(!guideOpen||workspace.guidedSnapshot)return;
    const controller=new AbortController();setGuideLoad('loading');
    loadGuidedSnapshot(workspace.fiscalSnapshot,fetch,controller.signal).then(snapshot=>{
      if(!controller.signal.aborted){setWorkspace(old=>({...old,guidedSnapshot:snapshot}));setGuideLoad('ready');}
    }).catch(()=>{if(!controller.signal.aborted)setGuideLoad('error');});
    return()=>controller.abort();
  },[guideOpen,workspace.guidedSnapshot,workspace.tradeSnapshot,guideAttempt]);
  const guidePending=guideOpen&&!workspace.guidedSnapshot;
  const compatible=workspace.dataVersion===economy.generatedAt;
  const resolved=useMemo(()=>resolveWorkspace(workspace,selection,economy),[workspace,selection,economy]);
  const focusId=workspace.panels.some(p=>p.id===selection.panelId&&p.type!=='coverage-note')?selection.panelId:original.panelId;
  const visiblePanels=workspace.panels.filter(p=>selection.viewMode==='all'||p.id===focusId||p.type==='coverage-note');
  const response=useMemo(()=>compileWorkspace({...workspace,panels:visiblePanels}),[workspace,focusId,selection.viewMode]);
  const panelLabel=p=>({'energy-trade':'Trade value','energy-transfers':'Physical transfers','provincial-impact':'Price exposure','province-map':'Map','province-comparison':'Provincial comparison','infrastructure-map':'Infrastructure','oil-sensitivity':'National oil effect'}[p.type]||(p.type==='gdp-forecast'?`GDP outlook ${resolved.panels.find(r=>r.id===p.id)?.year}`:p.title));
  const update=patch=>{setHistory(old=>[...old.slice(-19),selection]);const next=normalizeWorkspaceTradeSelection(workspace,{...selection,...patch});setSelection(next);onState?.(next);};
  const toggle=code=>{if(!compatible)return;update({regions:selection.regions.includes(code)?selection.regions.filter(r=>r!==code):[...selection.regions,code]});};
  const headingId=workspace.authored?'hw-trade-heading':'hw-heading';
  const hasScenario=visiblePanels.some(p=>p.type==='scenario-comparison');
  const hasTrade=visiblePanels.some(p=>['energy-trade','energy-transfers','provincial-impact'].includes(p.type));
  const hasMonetary=visiblePanels.some(p=>p.type==='energy-trade'||p.type==='provincial-impact');
  const hasImpact=visiblePanels.some(p=>p.type==='provincial-impact');
  const hasRegions=hasTrade||workspace.panels.some(p=>p.type.startsWith('province-')||p.type==='scenario-comparison'||p.type==='infrastructure-map'||p.type==='gdp-forecast');
  const store=async()=>{try{if(library.length>=8){setNotice('Eight investigations are saved. Remove one before saving another.');return;}const value=captureInvestigation({workspace,selection,question,baseline});await saveInvestigation(value);setLibrary(await listInvestigations());setNotice('Saved on this device with its original data.');}catch{setNotice('This browser could not save the investigation. You can still export its data.');}};
  const restore=value=>{setWorkspace(value.workspace);setQuestion(value.title);setSelection(value.selection);setHistory([]);setBaseline(value.baseline||null);setRenderError(false);setNotice('Restored with the original source snapshot.');onState?.(value.selection);onRestore?.(value);};
  const comparison=baseline&&hasTrade?compareTradeSelections(workspace,baseline,selection):null;
  const download=()=>{const url=URL.createObjectURL(new Blob([JSON.stringify({schemaVersion:1,workspace:resolved,selection,sourceDataVersion:economy.generatedAt},null,2)],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download='energy-workspace.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
  return <Context.Provider value={{workspace,resolved,economy,network,shapes,selection,toggle,update,guideLoad,retryGuide:()=>setGuideAttempt(n=>n+1)}}><div className={`hw-shell ${selection.viewMode!=='all'?'hw-focused':''}`} role="region" aria-labelledby={headingId}>
    <div className="hw-heading"><div>{!workspace.authored&&<p className="hw-eyebrow">Interactive answer</p>}<h2 tabIndex={-1} id={headingId}>{question}</h2></div><div className="hw-actions"><button onClick={()=>{const previous=history.at(-1);if(previous){setSelection(previous);onState?.(previous);setHistory(history.slice(0,-1));}}} disabled={!history.length}>Undo</button><ActionMenu><button onClick={store} disabled={guidePending}>Save investigation</button><button data-workspace-export onClick={download} disabled={guidePending}>Export data</button><button onClick={()=>update(original)} disabled={!compatible}>Reset comparison</button>{hasMonetary&&<button onClick={()=>setBaseline(structuredClone(selection))}>{baseline?'Replace pinned baseline':'Pin this comparison'}</button>}{workspace.panels.filter(p=>p.type!=='coverage-note').length>1&&<button aria-pressed={selection.viewMode==='all'} onClick={()=>update({viewMode:selection.viewMode==='all'?'focus':'all'})}>All views</button>}</ActionMenu></div></div>
    {workspace.panels.filter(p=>p.type!=='coverage-note').length>1&&<nav className="hw-view-nav" aria-label="Result views">{workspace.panels.filter(p=>p.type!=='coverage-note').map(p=><button key={p.id} aria-pressed={selection.viewMode!=='all'&&focusId===p.id} onClick={()=>update({panelId:p.id,viewMode:'focus'})}>{panelLabel(p)}</button>)}</nav>}
    {notice&&<p className="hw-save-notice" role="status">{notice}</p>}

    {!compatible&&<p className="hw-coverage">This answer uses an earlier data snapshot. Its values are preserved; ask again to use the latest data and enable the comparison controls.</p>}
    <div className="hw-control-bar">
    {hasRegions&&<details className="hw-selection"><summary>Compare {selection.regions.length?selection.regions.map(code=>name(code)||economy.regions.find(r=>r.code===code)?.name||code).join(', '):'all provinces and territories'}</summary><div className="hw-regions"><button disabled={!compatible} aria-pressed={!selection.regions.length} onClick={()=>update({regions:[]})}>All</button>{economy.regions.filter(r=>r.code!=='CA').map(r=><button key={r.code} title={name(r.code)||r.name} aria-label={name(r.code)||r.name} aria-pressed={selection.regions.includes(r.code)} disabled={!compatible} onClick={()=>toggle(r.code)}>{r.code}</button>)}</div></details>}

    {hasTrade&&<div className="hw-scenario-controls hw-trade-controls"><label>Energy<select aria-label="Energy commodity" value={selection.tradeCommodity} onChange={e=>update({tradeCommodity:e.target.value,transferSet:null})}>{Object.entries(ENERGY_COMMODITIES).map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label>{hasMonetary&&<label>Trade year<select aria-label="Trade year" value={selection.tradeYear} onChange={e=>update({tradeYear:Number(e.target.value)})}>{workspace.tradeSnapshot.trade.years.map(y=><option key={y}>{y}</option>)}</select></label>}</div>}
    {hasScenario&&<div className="hw-scenario-controls"><label>Published scenario<select aria-label="Published scenario" disabled={!compatible} value={selection.scenario} onChange={e=>update({scenario:e.target.value})}>{economy.scenarios.map(s=><option key={s}>{s}</option>)}</select></label><label>Year<select aria-label="Scenario year" disabled={!compatible} value={selection.year} onChange={e=>update({year:Number(e.target.value)})}>{economy.years.map(y=><option key={y}>{y}</option>)}</select></label><p>Updates use the published series. No additional model call.</p></div>}
    </div>
    {hasTrade&&<p className="hw-current-question" aria-live="polite"><strong>{ENERGY_COMMODITIES[selection.tradeCommodity]}</strong> · {selection.regions.join(' + ')||'All provinces'} · {hasMonetary?selection.tradeYear:resolved.panels.find(p=>p.type==='energy-transfers')?.period} · {!hasMonetary?'provincial totals':selection.linkScope==='between'&&selection.regions.length>1?'between selected provinces':'all their trading partners'}{hasImpact?` · ${selection.priceShock>0?'+':''}${selection.priceShock}% price change`:''}</p>}
    {hasMonetary&&baseline&&<div className="hw-branch-actions"><button onClick={()=>update(baseline)}>Return to baseline</button><button onClick={()=>setBaseline(null)}>Clear baseline</button></div>}
    {comparison&&<details className="hw-branch-comparison" open><summary>Baseline vs current investigation</summary><p className="hw-caption">Baseline: {ENERGY_COMMODITIES[comparison.left.commodity]} · {comparison.left.year}{hasImpact?` · ${comparison.left.shockPct}%`:''}. Current: {ENERGY_COMMODITIES[comparison.right.commodity]} · {comparison.right.year}{hasImpact?` · ${comparison.right.shockPct}%`:''}.</p><Table caption={`${comparison.measure} · million current CAD · all domestic partners`} headers={['Province','Pinned baseline','Current','Difference']} rows={comparison.rows.map(r=>[name(r.region)||economy.regions.find(p=>p.code===r.region)?.name||r.region,number(r.left),number(r.right),number(r.difference)])}/><p className="hw-caption">Same source snapshot. Different years use their own current-dollar values; differences can reflect prices and quantities. Missing selections show No data. These are trade-value calculations, not GDP effects.</p></details>}
    {!workspace.authored&&<WorkspaceFindings workspace={resolved} selection={selection}/>}
    {renderError?<p role="alert" className="hw-coverage">The interactive layout could not be verified. The written findings remain below.</p>:<Renderer response={response} library={energyLibrary} isStreaming={false} publishObservability={false} onError={errors=>{if(errors.some(error=>error.severity!=='warning'))setRenderError(true);}}/>}
    <details className="hw-saved"><summary>Saved investigations{library.length?` (${library.length})`:''}</summary><p className="hw-caption">Saved on this device with the original data.</p>{!library.length?<p>No saved investigations yet.</p>:<ul>{library.map(item=><li key={item.id}><button onClick={()=>restore(item)}><strong>{item.title}</strong><small>{new Date(item.savedAt).toLocaleDateString('en-CA')} · {item.workspace.panels.some(p=>p.type==='gdp-forecast')?`GDP outlook ${[...new Set(Object.values(item.selection.forecastYearsByPanel||{}))].sort().join(' / ')}`:item.selection.tradeCommodity||item.selection.scenario} · {item.selection.regions.join(', ')||'Canada'}</small></button><button aria-label={`Delete saved investigation ${item.title}`} onClick={async()=>{try{await deleteInvestigation(item.id);setLibrary(await listInvestigations());}catch{setNotice('Could not remove the saved investigation.');}}}>Remove</button></li>)}</ul>}</details>
    <details className="hw-method"><summary>{workspace.authored?'Methods & coverage':'How this workspace was assembled'}</summary>{workspace.localComparison?<p>This built-in comparison uses published data and fixed view rules. No language model or Jev request was made. OpenUI displays the checked maps and comparisons; changing controls recalculates locally.</p>:workspace.authored?<p>Published trade estimates, measured physical transfers and price calculations use separate sources and periods. Every view includes its definition and source. Controls recalculate locally without an AI request.</p>:<p>The language model selected the topics and regions. {workspace.decision?.provider==='jev'?'Jev suggested the display order and assessed whether the evidence addressed the question.':'The app used its standard view rules; Jev was not used for this answer.'} Code checked the available measures and retrieved every displayed value from the cited data. Jev’s decision affects display order; coverage labels follow the app’s data checks. OpenUI arranges the registered maps and comparisons.</p>}<p>Data snapshot: {workspace.dataVersion?.slice(0,10)}. {workspace.decision?.status==='budget-exhausted'?'The Jev allowance has been reached.':''}</p>{workspace.limitations?.length>0&&<ul>{workspace.limitations.map((text,i)=><li key={i}>{text}</li>)}</ul>}</details>
  </div></Context.Provider>;
}
export function mountWorkspace(element,options){
  validateWorkspace(options.workspace);
  const pinned={...options,economy:options.workspace.economySnapshot||options.economy};
  const root=createRoot(element);root.render(<WorkspaceBoundary><Workspace {...pinned}/></WorkspaceBoundary>);
  return {unmount:()=>root.unmount()};
}

export function mountTradeExplorer(element,{economy,flows,fiscal,selection,regions,shapes,onState}) {
  const workspace=createTradeWorkspace({economy,flows,fiscal,selection,regions});
  const saved={...initialSelection(workspace),...Object.fromEntries(Object.entries(GUIDE_DEFAULTS).map(([key,value])=>[key,selection[key]??value])),tradeDisplay:selection.tradeDisplay||'matrix',tradeConnection:selection.tradeConnection||null,tradeFocus:selection.tradeFocus||null,...(workspace.panels.some(p=>p.id===selection.tradePanelId)?{panelId:selection.tradePanelId}:{}),viewMode:selection.tradeViewMode==='all'?'all':'focus'};
  return mountWorkspace(element,{workspace,economy,shapes,saved,question:'Energy between provinces',onState});
}

export {mountIncomePaths} from './income-paths.jsx';
export {mountDynamicPrices} from './dynamic-prices.jsx';

export {mountProvincialForecast} from './provincial-forecast.jsx';
export {mountEnergyStory} from './energy-story.jsx';

export {mountMonthlyEnergy} from './monthly-energy.jsx';

export {loadLocalInvestigation} from '../local-investigations.mjs';
