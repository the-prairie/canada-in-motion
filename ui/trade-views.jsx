import React,{useState,useId,useEffect} from 'react';
import {tradeMatrix,tradeRobustness} from '../investigation-model.mjs';
import {project} from '../atlas-model.mjs';
import {ENERGY_COMMODITIES} from '../trade-workspace-model.mjs';

const anchors={BC:[-125,54],AB:[-115,54],SK:[-106,54],MB:[-98,54],ON:[-85,50],QC:[-71,51],NB:[-66,46.5],NS:[-63,45],PE:[-63.2,46.5],NL:[-57,53],YT:[-136,64],NT:[-120,65],NU:[-95,67]};
const n=(v,d=1)=>Number.isFinite(v)?new Intl.NumberFormat('en-CA',{maximumFractionDigits:d}).format(v):'Not published';
const money=v=>{if(!Number.isFinite(v))return 'Not published';const a=Math.abs(v),sign=v<0?'−':v>0?'+':'';return sign+(a>=1000?`$${n(a/1000)}B`:a>=1?`$${n(a)}M`:a>=.001?`$${n(a*1000)}K`:a>=.000001?`$${n(a*1e6,0)}`:a>0?'<$1':'$0');};
const valueMoney=v=>Number.isFinite(v)?money(v).replace(/^\+/,''):'Not published';

export function createTradeViews({usePanel,Panel,Table,ViewSwitch}) {
  function EnergyTradeView({id}){
    const {panel,shapes,economy,selection,update,workspace}=usePanel(id);
    const [display,setDisplay]=useState('matrix');const [active,setActive]=useState(null);const [focused,setFocused]=useState(null);const [seller,setSeller]=useState(null);
    const marker=useId().replace(/:/g,'');
    const summary=panel.summary;
    const named=code=>economy.regions.find(r=>r.code===code)?.name||code;
    const links=[...summary.links].sort((a,b)=>(b.value??-1)-(a.value??-1));
    const top=links.filter(r=>Number.isFinite(r.value)&&r.value>0).slice(0,12);
    const picked=links.find(r=>`${r.origin}-${r.destination}`===active);
    const shown=picked&&picked.value>0&&!top.includes(picked)?[...top,picked]:top;
    const matrix=tradeMatrix(summary);
    const sellers=matrix.filter(r=>links.some(link=>link.origin===r.origin));
    const selectedSeller=sellers.some(r=>r.origin===seller)?seller:links[0]?.origin||'';
    const first=links[0]?`${links[0].origin}-${links[0].destination}`:null;
    useEffect(()=>{if(active&&!links.some(r=>`${r.origin}-${r.destination}`===active))setActive(null);},[active,summary.year,summary.commodity,selection.regions.join(','),selection.linkScope]);
    const history=picked?workspace.tradeSnapshot.trade.observations.filter(r=>r.origin===picked.origin&&r.destination===picked.destination&&r.commodity===summary.commodity).sort((a,b)=>a.year-b.year):[];
    const move=event=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(event.key))return;event.preventDefault();const table=event.currentTarget.closest('table'),row=Number(event.currentTarget.dataset.row),col=Number(event.currentTarget.dataset.col);let r=row,c=col;const dr=event.key==='ArrowUp'?-1:event.key==='ArrowDown'?1:0,dc=event.key==='ArrowLeft'?-1:event.key==='ArrowRight'?1:0;
      if(event.key==='Home'||event.key==='End'){const targets=[...table.querySelectorAll(`button[data-row="${row}"]`)];(event.key==='Home'?targets[0]:targets.at(-1))?.focus();return;}
      for(let i=0;i<13;i++){r+=dr;c+=dc;if(r<0||c<0||r>=13||c>=13){if(dc){const all=[...table.querySelectorAll('button')],i=all.indexOf(event.currentTarget);all[(i+dc+all.length)%all.length]?.focus();}return;}const target=table.querySelector(`button[data-row="${r}"][data-col="${c}"]`);if(target){target.focus();return;}}};
    const max=Math.max(1,...shown.map(r=>r.value));
    const points=shapes.flatMap(s=>s.rings.flat());
    const west=Math.min(...points.map(p=>p[0])),east=Math.max(...points.map(p=>p[0])),south=Math.min(...points.map(p=>p[1])),north=Math.max(...points.map(p=>p[1]));
    const width=east-west,height=north-south;
    const convert=([x,y])=>[x-west,north-y];
    const xy=code=>convert(project(...anchors[code]));
    const route=r=>{const [x,y]=xy(r.origin),[u,v]=xy(r.destination),dx=u-x,dy=v-y;return `M${x},${y} Q${(x+u)/2-dy*.18},${(y+v)/2+dx*.18} ${u},${v}`;};
    const key=r=>`${r.origin}-${r.destination}`;
    return <Panel panel={panel} className={display==='matrix'?'hw-matrix-panel':''} subtitle="Modelled trade value · seller → buyer" tools={<div className="hw-switch" aria-label="Energy trade display">{['matrix','map','table'].map(v=><button key={v} aria-pressed={display===v} onClick={()=>setDisplay(v)}>{v==='matrix'?<><span className="hw-desktop-label">Matrix</span><span className="hw-mobile-label">Partners</span></>:v[0].toUpperCase()+v.slice(1)}</button>)}</div>}>
      <div className="hw-trade-total"><strong>{valueMoney(summary.totals.value)}</strong><span>{summary.totals.value===null?'Some records are unpublished':`${links.length} directed trade records · ${summary.year}`}</span></div>
      {selection.regions.length>1&&<label className="hw-measure">Connections<select aria-label="Trade connections" value={selection.linkScope||'touching'} onChange={e=>update({linkScope:e.target.value})}><option value="touching">To or from selected provinces</option><option value="between">Between selected provinces</option></select></label>}
      {display==='table'?<Table caption={`${ENERGY_COMMODITIES[summary.commodity]} · ${summary.year} · million current CAD`} headers={['Seller','Buyer','Trade value','Source status']} rows={links.map(r=>[named(r.origin),named(r.destination),Number.isFinite(r.value)?n(r.value,3):'Not published',r.status||'Published'])}/>:display==='matrix'?<><p className="hw-caption"><span className="hw-desktop-label">Rows sell · columns buy · million CAD. </span>Select a connection to inspect it.</p><div className="hw-partner-list"><label>Seller<select aria-label="Trade seller" value={selectedSeller} disabled={!sellers.length} onChange={e=>setSeller(e.target.value)}>{!sellers.length&&<option value="">No available sellers</option>}{sellers.map(r=><option value={r.origin} key={r.origin}>{named(r.origin)}</option>)}</select></label><ul>{links.filter(r=>r.origin===selectedSeller).map(r=><li key={key(r)}><button onClick={()=>setActive(key(r))} aria-pressed={active===key(r)}><span>{named(r.destination)}</span><strong>{valueMoney(r.value)}</strong></button></li>)}</ul>{!links.some(r=>r.origin===selectedSeller)&&<p>No connections from this seller in the current selection.</p>}</div><div className="hw-matrix-scroll" role="region" aria-label="Interprovincial trade matrix" tabIndex={0}><table className="hw-matrix"><caption>{ENERGY_COMMODITIES[summary.commodity]} · {summary.year} · million current CAD</caption><thead><tr><th scope="col">Seller ↓<br/>Buyer →</th>{matrix.map(r=><th key={r.origin} scope="col" title={named(r.origin)}>{r.origin}</th>)}</tr></thead><tbody>{matrix.map((row,ri)=><tr key={row.origin}><th scope="row" title={named(row.origin)}>{row.origin}</th>{row.cells.map((c,ci)=><td key={c.destination}>{['same-region','outside-selection'].includes(c.status)?<span title={c.status==='same-region'?'Within-province trade is outside this dataset':'Outside selection'}>—</span>:<button data-row={ri} data-col={ci} tabIndex={(links.some(r=>key(r)===focused)?focused:first)===key(c)?0:-1} onFocus={()=>setFocused(key(c))} onKeyDown={move} onClick={()=>setActive(active===key(c)?null:key(c))} aria-pressed={active===key(c)} aria-label={`${named(c.origin)} to ${named(c.destination)}: ${c.value===null?c.status:n(c.value,3)+' million CAD'}`} style={{backgroundColor:c.value===null?'#efefea':`rgba(53,107,96,${.04+.44*Math.sqrt(Math.max(0,c.value)/max)})`}}>{c.value===null?'…':c.value>0&&c.value<.1?'<0.1':n(c.value,c.value<10?1:0)}</button>}</td>)}</tr>)}</tbody></table></div><div className="hw-matrix-key"><span>0 = published zero</span><span>… = unpublished</span><span>— = outside scope</span></div></>:<>
        <svg className="hw-map hw-trade-map" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Largest interprovincial trade-value links, with exact values listed below. These connections do not show physical routes.">
          <defs><marker id={marker} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#356b60"/></marker></defs>
          {shapes.map(s=><path key={s.code} d={s.rings.map(r=>r.map((p,i)=>`${i?'L':'M'}${convert(p).join(',')}`).join(' ')+'Z').join(' ')} fill={selection.regions.includes(s.code)?'#d3ded2':'#e8eae1'} stroke="#fffdf7" strokeWidth="1" vectorEffect="non-scaling-stroke"/>)}
          {shown.slice().reverse().map(r=><path key={key(r)} d={route(r)} fill="none" stroke={active===key(r)?'#b44f2f':'#356b60'} strokeWidth={1+6*Math.sqrt(r.value/max)} opacity={active&&active!==key(r)?.2:.75} vectorEffect="non-scaling-stroke" markerEnd={`url(#${marker})`}/>)}
          {[...new Set(shown.flatMap(r=>[r.origin,r.destination]))].map(code=>{const [x,y]=xy(code);return <g key={code}><circle cx={x} cy={y} r={width*.004} fill="#203f38"/><text x={x+width*.009} y={y-height*.009} fontSize={width*.022} fill="#203f38" stroke="#f7f7ef" strokeWidth={width*.005} paintOrder="stroke">{code}</text></g>;})}
        </svg>
        <p className="hw-caption">Largest {top.length} transactions{shown.length>top.length?' + selected connection':''} · schematic connections</p>
        <ol className="hw-flow-links">{shown.map(r=><li key={key(r)}><button aria-pressed={active===key(r)} onClick={()=>setActive(active===key(r)?null:key(r))}><span>{r.origin} <span aria-label="to">→</span> {r.destination}</span><strong>{valueMoney(r.value)}</strong></button></li>)}</ol>
        {!shown.length&&<p>No positive published trade values for this selection. Use the table to distinguish zero from missing records.</p>}
      </>}
      {picked&&<div className="hw-link-detail" aria-live="polite"><div><h4>{named(picked.origin)} → {named(picked.destination)}</h4><strong>{valueMoney(picked.value)} <small>· {summary.year}</small></strong><button onClick={()=>setDisplay(display==='map'?'matrix':'map')}>{display==='map'?'Show in matrix':'Show on map'}</button></div><Table caption="Published trade history · million current CAD" headers={['Year',...history.map(r=>String(r.year))]} rows={[[ENERGY_COMMODITIES[summary.commodity],...history.map(r=>n(r.value,3))]]}/></div>}
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
    const {panel,selection,update,economy,workspace}=usePanel(id);const [channel,setChannel]=useState('trade');
    const result=panel.result;
    const rows=result.trade.rows;
    const named=code=>economy.regions.find(r=>r.code===code)?.name||code;
    return <Panel panel={panel} subtitle={`${ENERGY_COMMODITIES[result.commodity]} · ${result.shockPct>0?'+':''}${n(result.shockPct)}% price experiment`}>
      <div className="hw-price-control"><label htmlFor={`price-${id}`}>Price change <output>{result.shockPct>0?'+':''}{n(result.shockPct)}%</output></label><input id={`price-${id}`} aria-label="Energy price change" type="range" min="-20" max="20" step="1" value={selection.priceShock} onChange={e=>update({priceShock:Number(e.target.value)})}/><div><span>−20%</span><button onClick={()=>update({priceShock:0})}>No change</button><span>+20%</span></div></div>
      <div className="hw-switch hw-impact-tabs" aria-label="Price effect channel"><button aria-pressed={channel==='trade'} onClick={()=>setChannel('trade')}>Trade balances</button><button aria-pressed={channel==='fiscal'} onClick={()=>setChannel('fiscal')}>Provincial budgets</button></div>
      {channel==='trade'?<><p className="hw-caption">Same volumes · full price pass-through. Each selected province’s trade with all other provinces, including those outside the map selection.</p><Table caption={`Change in annual interprovincial trade value · ${result.year} trade values · CAD`} headers={['Province','Sales receipts','Purchase costs','Net change']} rows={rows.map(r=>[named(r.region),money(r.receiptsChange),money(r.purchasesChange),money(r.netChange)])}/><details className="hw-method-inline"><summary>What this calculation means</summary><p>A {n(result.shockPct)}% price change is applied to both ends of every published {ENERGY_COMMODITIES[result.commodity].toLowerCase()} transaction. Quantities, exchange rates and other prices are held fixed. Sellers’ additional receipts equal buyers’ additional costs across domestic transactions; this accounting identity does not imply zero effect on Canadian GDP.</p><p>GDP, profits, investment, household bills and international sales are outside this calculation. Missing values remain unpublished.</p></details></>:<><p className="hw-caption">Separate published fiscal sensitivities. The same percentage is applied to each province’s own benchmark baseline, using the response defined in that province’s budget.</p><Table caption="Illustrative annual fiscal effect · CAD" headers={['Province','Fiscal year','Benchmark change','Published fiscal effect']} rows={result.fiscal.rows.map(r=>[named(r.region),r.fiscalYear||'—',r.available?`${n(r.priceChange,2)} ${r.priceUnit}`:'Not calibrated',r.available?(r.revenueChangeLow===r.revenueChangeHigh?money(r.revenueChangeLow):`${money(r.revenueChangeLow)} to ${money(r.revenueChangeHigh)}`):'Not calibrated'])}/><details className="hw-method-inline"><summary>Budget assumptions and limitations</summary>{result.fiscal.rows.filter(r=>r.available).map(r=><div key={r.region}><h4>{named(r.region)} · {r.outcomeLabel}</h4><p>{r.benchmark} baseline: {n(r.baselinePrice,2)} {r.priceUnit}. {r.fiscalYear}.</p>{(r.limitations||[]).map((text,i)=><p key={i}>{text}</p>)}</div>)}<p>Budget effects and trade balances overlap. Do not add them together.</p></details></>}
      <details className="hw-robustness"><summary>What changes this result?</summary><Robustness flows={workspace.tradeSnapshot} selection={selection} named={named}/></details>
    </Panel>;
  }
  function Robustness({flows,selection,named}){
    const result=tradeRobustness(flows,selection);
    const complete=result.rows.filter(r=>r.complete),changing=complete.filter(r=>!r.stable);
    return <><p>{changing.length?`${changing.map(r=>named(r.region)).join(', ')} changed net trade position across the published years.`:`The net seller/buyer classification stays the same in all ${result.years.length} published years for ${complete.length} jurisdictions with complete records.`}</p><Table caption={`Same ${result.shockPct}% price change, different reference years · net trade-value change · CAD`} headers={['Province',...result.years.map(String),'Net trade position']} rows={result.rows.map(r=>[named(r.region),...r.years.map(y=>money(y.netChange)),!r.complete?'Incomplete':r.stable?(r.direction>0?'Net seller':r.direction<0?'Net buyer':'Balanced'):'Changes with year'])}/><p className="hw-caption">{result.scope}. These are alternative historical baselines, not probabilities or GDP forecasts. Quantities stay fixed in each year. Budget sensitivities are separate.</p></>;
  }
  return {EnergyTrade:EnergyTradeView,EnergyTransfers:EnergyTransfersView,ProvincialImpact:ProvincialImpactView};
}
