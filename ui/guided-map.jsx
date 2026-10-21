import React,{useEffect,useId,useMemo,useRef,useState} from 'react';
import {guidedMapScene,tradeMapGeometry} from '../trade-map-model.mjs';
import {useFlowMotion} from './flow-motion.jsx';
import {ENERGY_COMMODITIES} from '../trade-workspace-model.mjs';

export function GuidedMap({shapes,result,ready,loadStatus,focused,onFocus,onHover,onInspect,money,percent}){
  const host=useRef(null),svg=useRef(null),id=useId().replace(/:/g,'');
  const [size,setSize]=useState({width:620,height:360});
  useEffect(()=>{if(!svg.current)return;const observer=new ResizeObserver(entries=>{const {width,height}=entries[0].contentRect;if(width>0&&height>0)setSize(old=>old.width===width&&old.height===height?old:{width,height});});observer.observe(svg.current);return()=>observer.disconnect();},[]);
  const scene=guidedMapScene(result),regions=scene.rows.map(row=>row.region);
  const geometry=useMemo(()=>tradeMapGeometry(shapes||[],{regions,...size,padding:size.height<200?24:32}),[shapes,regions.join('-'),size]);
  const motion=useFlowMotion(host,{enabled:scene.step==='exchange'&&scene.hasFlow,initialPlaying:true});
  const format=row=>!ready&&scene.step!=='exchange'?(loadStatus==='error'?'Unavailable':'Loading…'):row.value===null?'No estimate':row.unit==='percent'?`${percent(row.value)}%`:money(row.value,row.unit==='million-cad')+(row.unit==='cad-year'?' / yr':'');
  return <figure ref={host} className={`gsm-map ${motion.playing?'is-playing':''}`} data-scene={scene.step} aria-label="Selected trade and provincial results">
    {geometry?<svg ref={svg} viewBox={`0 0 ${size.width} ${size.height}`} aria-label={`${scene.rows[0].name} to ${scene.rows[1].name}, ${scene.step==='exchange'?'trade direction':'selected provinces'}`} role="img" aria-describedby={`${id}-description`}><desc id={`${id}-description`}>{scene.step==='exchange'?scene.motionMeaning:'The selected connection is context. Results are separate province-wide estimates.'}</desc>
      <defs><marker id={`${id}-arrow`} viewBox="0 0 10 10" refX="20" refY="5" markerWidth="8" markerHeight="8" markerUnits="userSpaceOnUse" orient="auto"><path d="M1,1 L9,5 L1,9" fill="none" stroke="currentColor" strokeWidth="1.8"/></marker></defs>
      {geometry.paths.map(shape=>{const row=scene.rows.find(row=>row.region===shape.code);return <path key={shape.code} className={`gsm-land ${row?`gsm-${row.role}`:''} ${focused===shape.code?'is-focused':''}`} d={shape.d}/>;})}
      <path className={`gsm-link ${scene.step!=='exchange'||!scene.hasFlow?'is-context':''}`} d={geometry.path(...regions)} markerEnd={scene.hasFlow?`url(#${id}-arrow)`:undefined}/>
      {scene.step==='exchange'&&scene.hasFlow&&<path className="gsm-flow" d={geometry.path(...regions)} aria-hidden="true"/>}
      {scene.rows.map(row=>{const [x,y]=geometry.anchors[row.region],[tx,ty]=geometry.labels[row.region];return <g key={row.region} className={`gsm-anchor gsm-${row.role}`}>{scene.step==='households'?<path className="gsm-house" d={`M${x-10},${y+8}v-13l10-9 10 9v13h-7v-9h-6v9Z`}/>:<circle cx={x} cy={y} r="6"/>}<text x={tx} y={ty} textAnchor="middle">{row.region}</text></g>;})}
    </svg>:<p className="gsm-map-missing">Map unavailable. Provincial results remain below.</p>}
    <div className="gsm-endpoints">{scene.rows.map(row=>{const Tag=scene.step==='exchange'?'div':'button';return <Tag key={row.region} className={`gsm-endpoint gsm-${row.role} ${focused===row.region?'is-focused':''}`} onPointerEnter={()=>onHover(row.region)} onPointerLeave={()=>onHover(null)} onFocus={()=>onFocus(row.region)} onBlur={()=>onFocus(null)} disabled={Tag==='button'&&!ready?true:undefined} onClick={scene.step==='exchange'?undefined:()=>onInspect(row.region)} aria-label={Tag==='button'?`Inspect ${row.name}: ${row.label}, ${format(row)}`:undefined}><span>{row.name}</span><strong>{format(row)}</strong><small>{row.label}</small></Tag>;})}</div>
    <figcaption><span>{scene.step==='exchange'?`${ENERGY_COMMODITIES[result.exchange.commodity]} · ${result.exchange.year} · direction only`:'Separate province-wide results'}</span>{scene.step==='exchange'&&scene.hasFlow&&<button onClick={motion.toggle} disabled={motion.reduced} aria-pressed={motion.requested&&!motion.reduced} aria-label={motion.reduced?'Flow motion disabled by reduced-motion preference':motion.requested?'Pause trade flow':'Play trade flow'}>{motion.reduced?'Motion off':motion.requested?'Pause':'Play'}</button>}</figcaption>
  </figure>;
}
