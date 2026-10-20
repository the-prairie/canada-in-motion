import React,{useState,useId} from 'react';
import {project} from '../atlas-model.mjs';
import {ENERGY_COMMODITIES} from '../trade-workspace-model.mjs';

const anchors={BC:[-125,54],AB:[-115,54],SK:[-106,54],MB:[-98,54],ON:[-85,50],QC:[-71,51],NB:[-66,46.5],NS:[-63,45],PE:[-63.2,46.5],NL:[-57,53],YT:[-136,64],NT:[-120,65],NU:[-95,67]};
const n=(v,d=1)=>Number.isFinite(v)?new Intl.NumberFormat('en-CA',{maximumFractionDigits:d}).format(v):'Not published';
const money=v=>!Number.isFinite(v)?'Not published':`${v<0?'−':v>0?'+':''}$${n(Math.abs(v)>=1000?Math.abs(v)/1000:Math.abs(v))}${Math.abs(v)>=1000?'B':'M'}`;
const valueMoney=v=>Number.isFinite(v)?money(v).replace(/^\+/,''):'Not published';

export function createTradeViews({usePanel,Panel,Table,ViewSwitch}) {
  function EnergyTradeView({id}){
    const {panel,shapes,economy,selection,update}=usePanel(id);
    const [table,setTable]=useState(false);const [active,setActive]=useState(null);
    const marker=useId().replace(/:/g,'');
    const summary=panel.summary;
    const named=code=>economy.regions.find(r=>r.code===code)?.name||code;
    const links=[...summary.links].sort((a,b)=>(b.value??-1)-(a.value??-1));
    const shown=links.filter(r=>Number.isFinite(r.value)&&r.value>0).slice(0,12);
    const max=Math.max(1,...shown.map(r=>r.value));
    const points=shapes.flatMap(s=>s.rings.flat());
    const west=Math.min(...points.map(p=>p[0])),east=Math.max(...points.map(p=>p[0])),south=Math.min(...points.map(p=>p[1])),north=Math.max(...points.map(p=>p[1]));
    const width=east-west,height=north-south;
    const convert=([x,y])=>[x-west,north-y];
    const xy=code=>convert(project(...anchors[code]));
    const route=r=>{const [x,y]=xy(r.origin),[u,v]=xy(r.destination),dx=u-x,dy=v-y;return `M${x},${y} Q${(x+u)/2-dy*.18},${(y+v)/2+dx*.18} ${u},${v}`;};
    const key=r=>`${r.origin}-${r.destination}`;
    return <Panel panel={panel} subtitle="Modelled trade value · seller → buyer" tools={<ViewSwitch table={table} setTable={setTable} label="Energy trade display"/>}>
      <div className="hw-trade-total"><strong>{valueMoney(summary.totals.value)}</strong><span>{summary.totals.value===null?'Some records are unpublished':`${links.length} directed trade records · ${summary.year}`}</span></div>
      {selection.regions.length>1&&<label className="hw-measure">Connections<select aria-label="Trade connections" value={selection.linkScope||'touching'} onChange={e=>update({linkScope:e.target.value})}><option value="touching">To or from selected provinces</option><option value="between">Between selected provinces</option></select></label>}
      {table?<Table caption={`${ENERGY_COMMODITIES[summary.commodity]} · ${summary.year} · million current CAD`} headers={['Seller','Buyer','Trade value','Source status']} rows={links.map(r=>[named(r.origin),named(r.destination),Number.isFinite(r.value)?n(r.value,3):'Not published',r.status||'Published'])}/>:<>
        <svg className="hw-map hw-trade-map" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Largest interprovincial trade-value links, with exact values listed below. These connections do not show physical routes.">
          <defs><marker id={marker} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#356b60"/></marker></defs>
          {shapes.map(s=><path key={s.code} d={s.rings.map(r=>r.map((p,i)=>`${i?'L':'M'}${convert(p).join(',')}`).join(' ')+'Z').join(' ')} fill={selection.regions.includes(s.code)?'#d3ded2':'#e8eae1'} stroke="#fffdf7" strokeWidth="1" vectorEffect="non-scaling-stroke"/>)}
          {shown.slice().reverse().map(r=><path key={key(r)} d={route(r)} fill="none" stroke={active===key(r)?'#b44f2f':'#356b60'} strokeWidth={1+6*Math.sqrt(r.value/max)} opacity={active&&active!==key(r)?.2:.75} vectorEffect="non-scaling-stroke" markerEnd={`url(#${marker})`}/>)}
          {[...new Set(shown.flatMap(r=>[r.origin,r.destination]))].map(code=>{const [x,y]=xy(code);return <g key={code}><circle cx={x} cy={y} r={width*.004} fill="#203f38"/><text x={x+width*.009} y={y-height*.009} fontSize={width*.022} fill="#203f38" stroke="#f7f7ef" strokeWidth={width*.005} paintOrder="stroke">{code}</text></g>;})}
        </svg>
        <p className="hw-caption">{shown.length} largest transactions · schematic connections</p>
        <ol className="hw-flow-links">{shown.map(r=><li key={key(r)}><button aria-pressed={active===key(r)} onClick={()=>setActive(active===key(r)?null:key(r))}><span>{r.origin} <span aria-label="to">→</span> {r.destination}</span><strong>{valueMoney(r.value)}</strong></button></li>)}</ol>
        {!shown.length&&<p>No positive published trade values for this selection. Use the table to distinguish zero from missing records.</p>}
      </>}
    </Panel>;
  }
  function EnergyTransfersView({id}){
    const {panel,selection,update,economy}=usePanel(id);const [table,setTable]=useState(false);
    const d=panel.dataset;const rows=d.observations.filter(r=>!selection.regions.length||selection.regions.includes(r.region));
    const max=Math.max(1,...rows.map(r=>Math.abs(r.netReceipts||0)));
    return <Panel panel={panel} subtitle={`${d.period}${d.publicationStatus==='preliminary'?' preliminary':''} · ${d.unit} · physical energy`} tools={<ViewSwitch table={table} setTable={setTable} label="Physical energy transfers display"/>}>
      <label className="hw-measure">Published series<select aria-label="Physical transfer series" value={d.id} onChange={e=>update({transferSet:e.target.value})}>{panel.sets.map(s=><option key={s.id} value={s.id}>{ENERGY_COMMODITIES[s.commodity]} · {s.period} · {s.frequency}</option>)}</select></label>
      <p className="hw-caption">Net receipts = received − delivered. Partner provinces are not reported.{d.commodity==='oil'?' This physical series includes condensate and pentanes plus.':''}</p>
      {table?<Table caption={`Physical interprovincial transfers · ${d.period} · ${d.unit}`} headers={['Province','Received','Delivered','Net received']} rows={rows.map(r=>[economy.regions.find(p=>p.code===r.region)?.name||r.region,n(r.receipts),n(r.deliveries),n(r.netReceipts)])}/>:<div className="hw-balance-list"><div className="hw-balance-key"><span>Net delivered</span><span>Net received</span></div>{rows.map(r=><div className="hw-balance-row" key={r.region}><span>{r.region}</span><div className="hw-balance-track" aria-hidden="true">{Number.isFinite(r.netReceipts)&&<i className={r.netReceipts<0?'negative':'positive'} style={{left:r.netReceipts<0?`${50-Math.abs(r.netReceipts)/max*50}%`:'50%',width:`${Math.abs(r.netReceipts)/max*50}%`}}/>}</div><strong>{n(r.netReceipts)}</strong></div>)}</div>}
    </Panel>;
  }
  function ProvincialImpactView({id}){
    const {panel,selection,update,economy}=usePanel(id);const [channel,setChannel]=useState('trade');
    const result=panel.result;
    const rows=result.trade.rows;
    const named=code=>economy.regions.find(r=>r.code===code)?.name||code;
    return <Panel panel={panel} subtitle={`${ENERGY_COMMODITIES[result.commodity]} · ${result.shockPct>0?'+':''}${n(result.shockPct)}% price experiment`}>
      <div className="hw-price-control"><label htmlFor={`price-${id}`}>Price change <output>{result.shockPct>0?'+':''}{n(result.shockPct)}%</output></label><input id={`price-${id}`} aria-label="Energy price change" type="range" min="-20" max="20" step="1" value={selection.priceShock} onChange={e=>update({priceShock:Number(e.target.value)})}/><div><span>−20%</span><button onClick={()=>update({priceShock:0})}>No change</button><span>+20%</span></div></div>
      <div className="hw-switch hw-impact-tabs" aria-label="Price effect channel"><button aria-pressed={channel==='trade'} onClick={()=>setChannel('trade')}>Trade balances</button><button aria-pressed={channel==='fiscal'} onClick={()=>setChannel('fiscal')}>Provincial budgets</button></div>
      {channel==='trade'?<><p className="hw-caption">Same volumes · full price pass-through. Each selected province’s trade with all other provinces, including those outside the map selection.</p><Table caption={`Change in annual interprovincial trade value · ${result.year} trade values · CAD`} headers={['Province','Sales receipts','Purchase costs','Net change']} rows={rows.map(r=>[named(r.region),money(r.receiptsChange),money(r.purchasesChange),money(r.netChange)])}/><details className="hw-method-inline"><summary>What this calculation means</summary><p>A {n(result.shockPct)}% price change is applied to both ends of every published {ENERGY_COMMODITIES[result.commodity].toLowerCase()} transaction. Quantities, exchange rates and other prices are held fixed. Sellers’ additional receipts equal buyers’ additional costs across domestic transactions; this accounting identity does not imply zero effect on Canadian GDP.</p><p>GDP, profits, investment, household bills and international sales are outside this calculation. Missing values remain unpublished.</p></details></>:<><p className="hw-caption">Separate published fiscal sensitivities. The same percentage is applied to each province’s own benchmark baseline, using the response defined in that province’s budget.</p><Table caption="Illustrative annual fiscal effect · CAD" headers={['Province','Fiscal year','Benchmark change','Published fiscal effect']} rows={result.fiscal.rows.map(r=>[named(r.region),r.fiscalYear||'—',r.available?`${n(r.priceChange,2)} ${r.priceUnit}`:'Not calibrated',r.available?(r.revenueChangeLow===r.revenueChangeHigh?money(r.revenueChangeLow):`${money(r.revenueChangeLow)} to ${money(r.revenueChangeHigh)}`):'Not calibrated'])}/><details className="hw-method-inline"><summary>Budget assumptions and limitations</summary>{result.fiscal.rows.filter(r=>r.available).map(r=><div key={r.region}><h4>{named(r.region)} · {r.outcomeLabel}</h4><p>{r.benchmark} baseline: {n(r.baselinePrice,2)} {r.priceUnit}. {r.fiscalYear}.</p>{(r.limitations||[]).map((text,i)=><p key={i}>{text}</p>)}</div>)}<p>Budget effects and trade balances overlap. Do not add them together.</p></details></>}
    </Panel>;
  }
  return {EnergyTrade:EnergyTradeView,EnergyTransfers:EnergyTransfersView,ProvincialImpact:ProvincialImpactView};
}
