import React,{useId,useState,useEffect,useRef} from 'react';
import {TRADE_ANCHORS,tradeMapGeometry} from '../trade-map-model.mjs';
import {useFlowMotion} from './flow-motion.jsx';
import {networkConnections,tradeLinkKey} from '../trade-network-model.mjs';

const anchors=TRADE_ANCHORS;
const order=Object.keys(anchors);
const compact={NL:'Nfld. & Labrador',PE:'P.E.I.',NT:'Northwest Terr.',YT:'Yukon',NU:'Nunavut'};
const labelOffsets={NB:[-42,18],NS:[16,44],PE:[34,-16]};
const format=value=>new Intl.NumberFormat('en-CA',{maximumFractionDigits:1}).format(value);
const activate=(event,action)=>{if(['Enter',' '].includes(event.key)){event.preventDefault();action();}};

export function TradeNetwork({links,shapes,named,valueMoney,active,onSelect,focus,onFocus,onClear,onGuide,year,commodity}) {
  const [narrow,setNarrow]=useState(()=>globalThis.matchMedia?.('(max-width: 760px)').matches||false);
  useEffect(()=>{const media=matchMedia('(max-width: 760px)'),change=()=>setNarrow(media.matches);media.addEventListener('change',change);return()=>media.removeEventListener('change',change);},[]);
  const [hover,setHover]=useState(null);
  const host=useRef(null),marker=useId().replace(/:/g,'');
  const motion=useFlowMotion(host);
  const network=networkConnections(links,{focus,active});
  const {shown}=network;
  const selected=shown.find(row=>tradeLinkKey(row)===(hover||active))||shown[0];
  const selectedKey=selected?tradeLinkKey(selected):null;
  const max=Math.max(1,...shown.map(row=>row.value));
  const geometry=tradeMapGeometry(shapes),xy=code=>geometry.anchors[code];
  const mapPath=row=>geometry.path(row.origin,row.destination);
  const sellers=order.filter(code=>shown.some(row=>row.origin===code)),buyers=order.filter(code=>shown.some(row=>row.destination===code));
  const graphWidth=narrow?360:480,leftX=narrow?110:132,rightX=narrow?250:348;
  const rowHeight=narrow?78:52;
  const graphHeight=Math.max(220,Math.max(sellers.length,buyers.length)*rowHeight+44);
  const graphY=(code,side)=>{const values=side==='seller'?sellers:buyers;return 48+(values.indexOf(code)+.5)*(graphHeight-64)/values.length;};
  const graphPath=row=>`M${leftX+10},${graphY(row.origin,'seller')} C${graphWidth*.47},${graphY(row.origin,'seller')} ${graphWidth*.53},${graphY(row.destination,'buyer')} ${rightX-10},${graphY(row.destination,'buyer')}`;
  const choose=row=>onSelect(tradeLinkKey(row)===active?null:tradeLinkKey(row));
  const path=(row,d,diagram=false)=>{const key=tradeLinkKey(row),highlight=key===selectedKey;return <g key={key} className={`tn-connection ${highlight?'is-highlighted':''}`} style={{opacity:selectedKey&&!highlight?.15:1}}>
    <path d={d} fill="none" stroke={highlight?'#ae492f':'#38776b'} strokeWidth={1+5*Math.sqrt(row.value/max)} vectorEffect="non-scaling-stroke" markerEnd={`url(#${marker}-${diagram?'graph':'map'})`}/>
    {highlight&&motion.playing&&<path className="tn-direction" d={d} fill="none" stroke="#fffdf6" strokeWidth="2" strokeDasharray="2 14" vectorEffect="non-scaling-stroke" aria-hidden="true"/>}
    <path d={d} className="tn-edge-target" fill="none" stroke="transparent" strokeWidth="18" vectorEffect="non-scaling-stroke" role="button" tabIndex={0} aria-pressed={active===key} aria-label={`${named(row.origin)} to ${named(row.destination)}: ${valueMoney(row.value)} in ${year}`} onPointerEnter={()=>setHover(key)} onPointerLeave={()=>setHover(null)} onFocus={()=>setHover(key)} onBlur={()=>setHover(null)} onClick={()=>choose(row)} onKeyDown={event=>activate(event,()=>choose(row))}/>
  </g>;};
  const definitions=kind=><defs><marker id={`${marker}-${kind}`} viewBox="0 0 10 10" refX="9" refY="5" markerUnits="userSpaceOnUse" markerWidth="10" markerHeight="10" orient="auto"><path d="M0,1 L9,5 L0,9" fill="none" stroke="#ae492f" strokeWidth="1.5"/></marker></defs>;
  const codes=order.filter(code=>shown.some(row=>row.origin===code||row.destination===code));
  const step=direction=>{const index=shown.findIndex(row=>tradeLinkKey(row)===selectedKey);const row=shown[(index+direction+shown.length)%shown.length];if(row)onSelect(tradeLinkKey(row));};
  return <div ref={host} className="tn-explorer">
    <div className="tn-toolbar"><label>Focus on<select aria-label="Network province focus" value={focus||''} onChange={event=>onFocus(event.target.value||null)}><option value="">All selected provinces</option>{order.filter(code=>links.some(row=>row.origin===code||row.destination===code)).map(code=><option key={code} value={code}>{named(code)}</option>)}</select></label><button onClick={onClear} disabled={!focus&&!active}>Clear focus</button><button aria-pressed={motion.requested&&!motion.reduced} onClick={motion.toggle} disabled={!shown.length||motion.reduced}>{motion.reduced?'Motion off':motion.requested?'Stop direction':'Animate direction'}</button></div>
    <div className="tn-linked-views">
      <div className="tn-geography"><svg className="hw-trade-map tn-map" viewBox="0 0 620 464" role="group" aria-label="Geographic trade connections; select a connection or province">
        {definitions('map')}
        {geometry.paths.map(shape=><path key={shape.code} className="tn-land" d={shape.d} fill={selected&&(shape.code===selected.origin||shape.code===selected.destination)?'#d9ddd0':'#eaebe3'} stroke="#faf9f2" strokeWidth="1"/>)}
        {shown.slice().reverse().map(row=>path(row,mapPath(row)))}
        {codes.map(code=>{const [x,y]=xy(code),[dx,dy]=labelOffsets[code]||[8,-9];const selectedProvince=selected&&(code===selected.origin||code===selected.destination);return <g key={code} className={`tn-map-node ${selectedProvince?'is-highlighted':''}`} role="button" tabIndex={0} aria-pressed={focus===code} aria-label={`Focus on ${named(code)}`} onClick={()=>onFocus(focus===code?null:code)} onKeyDown={event=>activate(event,()=>onFocus(focus===code?null:code))}><circle cx={x} cy={y} r="13" fill="transparent"/>{labelOffsets[code]&&<path d={`M${x},${y} L${x+dx+10},${y+dy-7}`} fill="none" stroke="#65766c" strokeWidth="1"/>}<circle cx={x} cy={y} r={selectedProvince?5:3} fill={selectedProvince?'#ae492f':'#3f665d'}/><text x={x+dx} y={y+dy} fontSize="12" fill="#243d35" stroke="#f7f6ee" strokeWidth="4" paintOrder="stroke">{code}</text></g>;})}
      </svg><p className="tn-map-note">Connections show trade relationships, not shipment routes.</p></div>
      <div className="tn-relationships"><svg className="tn-diagram" viewBox={`0 0 ${graphWidth} ${graphHeight}`} role="group" aria-label="Linked seller and buyer diagram">
        {definitions('graph')}<text x={leftX-12} y="23" textAnchor="end" className="tn-column-label">SELLERS</text><text x={rightX+12} y="23" className="tn-column-label">BUYERS</text>
        {shown.slice().reverse().map(row=>path(row,graphPath(row),true))}
        {[['seller',sellers,leftX],['buyer',buyers,rightX]].flatMap(([side,values,x])=>values.map(code=>{const y=graphY(code,side),left=side==='seller',highlight=selected&&(left?selected.origin===code:selected.destination===code);const label=compact[code]||named(code),words=label.split(' '),lines=[];for(const word of words){if(lines.length&&(lines.at(-1)+' '+word).length<=12)lines[lines.length-1]+=' '+word;else lines.push(word);}
          return <g key={`${side}-${code}`} className="tn-diagram-node" role="button" tabIndex={0} aria-pressed={focus===code} aria-label={`Focus on ${named(code)}`} onClick={()=>onFocus(focus===code?null:code)} onKeyDown={event=>activate(event,()=>onFocus(focus===code?null:code))}><rect x={left?8:x-10} y={y-(narrow?31:21)} width={narrow?112:134} height={narrow?62:42} rx="3" fill={highlight?'#f2e4d8':'#f8f8f1'}/><circle cx={x} cy={y} r="5" fill={highlight?'#ae492f':'#3f665d'}/><text x={left?x-15:x+15} y={y-(narrow?12:2)} textAnchor={left?'end':'start'} className="tn-node-code">{code}</text><text x={left?x-15:x+15} y={y+(narrow?5:12)} textAnchor={left?'end':'start'} className="tn-node-name">{narrow?lines.map((line,i)=><tspan key={i} x={left?x-15:x+15} dy={i?15:0}>{line}</tspan>):label}</text></g>;}))}
      </svg></div>
    </div>
    <div className="tn-inspector" aria-live="polite">{selected?<><div><span>{commodity} · {year}</span><h4>{named(selected.origin)} <span aria-label="to">→</span> {named(selected.destination)}</h4><p><strong>{valueMoney(selected.value)}</strong> <span>in modelled trade value</span></p>{onGuide&&<button className="gs-entry" onClick={()=>onGuide(selectedKey)}>Follow this trade →</button>}</div><div className="tn-step"><button aria-label="Previous trade connection" onClick={()=>step(-1)}>←</button><span>{shown.findIndex(row=>tradeLinkKey(row)===selectedKey)+1} / {shown.length}</span><button aria-label="Next trade connection" onClick={()=>step(1)}>→</button></div></>:<p>No positive published trade values in this selection. The table distinguishes zero from unpublished records.</p>}</div>
    <p className="tn-coverage">{shown.length?`${shown.length} connections · ${format(network.share)}% of published positive trade value${focus?` involving ${named(focus)}`:' in this selection'}. `:''}Line width follows the square root of value. {motion.requested?'Motion indicates direction only. ':''}{network.unpublished?`${network.unpublished} unpublished records. `:''}{network.omitted?`${network.omitted} smaller connections remain in the table.`:''}{active&&links.some(row=>tradeLinkKey(row)===active&&!(row.value>0))?' The selected zero or unpublished record has no flow line.':''}</p>
    <details className="tn-connection-list"><summary>Connection values ({shown.length})</summary><ol className="hw-flow-links">{shown.map(row=><li key={tradeLinkKey(row)}><button aria-pressed={active===tradeLinkKey(row)} onClick={()=>choose(row)}><span>{row.origin} → {row.destination}</span><strong>{valueMoney(row.value)}</strong></button></li>)}</ol></details>
  </div>;
}
