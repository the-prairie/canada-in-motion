import {MonthlyEnergy} from './monthly-energy.jsx';
import React,{useMemo,useRef,useState,useEffect,useLayoutEffect} from 'react';
import {createRoot} from 'react-dom/client';
import {summarizeEnergyStory,exportEnergyStory} from '../energy-story-model.mjs';
import {ExploreScene,exploreHeadings} from './explore-scene.jsx';
import {ProvincialPriceResponse,HouseholdPriceResponse,ProvincialPriceEvidence,HouseholdPriceEvidence} from './price-responses.jsx';
import {ContextDialog} from './context-dialog.jsx';

const commodities={oil:'Oil',gas:'Natural gas',electricity:'Electricity'};
const chapters=[['overview','Sales'],['trade','Trading partners'],['public-finances','Public revenue'],['national','National GDP'],['outlook','Provincial GDP'],['households','Household costs']];

const number=(value,digits=1)=>Number.isFinite(value)?new Intl.NumberFormat('en-CA',{maximumFractionDigits:digits}).format(value):'Not estimated';
const money=(value,signed=false)=>{
  if(!Number.isFinite(value))return 'Unavailable';
  const magnitude=Math.abs(value),prefix=value<0?'−':signed&&value>0?'+':'';
  return prefix+(magnitude>=1000?`$${number(magnitude/1000,2)}B`:magnitude>=1?`$${number(magnitude,1)}M`:magnitude>=.001?`$${number(magnitude*1000,1)}K`:magnitude>0?'<$1K':'$0');
};
const percent=value=>Number.isFinite(value)?`${value>0?'+':''}${number(value,2)}%`:'Not estimated';
const titleFor=selection=>selection.shockPct===0?`${commodities[selection.commodity]} prices stay unchanged.`:`What if ${commodities[selection.commodity].toLowerCase()} prices ${selection.shockPct<0?'fell':'rose'} ${number(Math.abs(selection.shockPct))}%?`;

function Metric({label,value,detail,sign=false}){
  return <div className="es-metric"><span>{label}</span><strong>{money(value,sign)}</strong>{detail&&<small>{detail}</small>}</div>;
}
function ValueChange({label,value,change,unit,max}){
  const after=Number.isFinite(value)&&Number.isFinite(change)?value+change:null;
  return <div className="es-value-change"><div><h3>{label}</h3><span>{unit}</span></div><div className="es-bar-row"><span>Recorded</span><i aria-hidden="true" style={{'--bar-width':`${Number.isFinite(value)?value/max*100:0}%`}}/><strong>{money(value)}</strong></div><div className="es-bar-row es-bar-after"><span>Repriced</span><i aria-hidden="true" style={{'--bar-width':`${Number.isFinite(after)?after/max*100:0}%`}}/><strong>{money(after)}</strong></div><p className="es-delta"><strong>{money(change,true)}</strong><span>change in sellers’ receipts</span></p></div>;
}

function Story({snapshots:liveSnapshots,initial,shapes,onState,onAsk,onNavigate}){
  const [snapshots,setSnapshots]=useState(liveSnapshots);
  const initialResult=useMemo(()=>{try{return {result:summarizeEnergyStory(liveSnapshots,initial),notice:''};}catch{return {result:summarizeEnergyStory(liveSnapshots),notice:'That saved selection is outside the available data. Showing the default investigation.'};}},[]);
  const [selection,setSelection]=useState(initialResult.result.selection),[notice,setNotice]=useState(initialResult.notice),[history,setHistory]=useState([]),[pinned,setPinned]=useState(null),[dialog,setDialog]=useState(null),[evidenceTab,setEvidenceTab]=useState('sources'),[view,setView]=useState('map');
  const fileRef=useRef(null),chapterNavigation=useRef(null),revealChapter=useRef(false);
  const result=useMemo(()=>summarizeEnergyStory(snapshots,selection),[snapshots,selection]);
  const {channels}=result;
  const named=code=>code==='QC'?'Québec':snapshots.economy.regions.find(r=>r.code===code)?.name||code;
  const regions=snapshots.economy.regions.filter(r=>r.code!=='CA');
  const sources=result.provenance.sources;
  const domestic=channels.domestic.focus,foreign=channels.international.focus;
  const comparison=channels.domestic.comparison;
  const receiptDirection=Math.sign(domestic.receiptsChange),purchaseDirection=Math.sign(domestic.purchasesChange);
  const tradeHeading=!Number.isFinite(domestic.receiptsChange)||!Number.isFinite(domestic.purchasesChange)?'Some trade values are unavailable.':receiptDirection===0&&purchaseDirection===0?'No change in recorded domestic receipts or purchase costs.':receiptDirection===purchaseDirection?`${receiptDirection<0?'Lower':'Higher'} sales receipts, ${purchaseDirection<0?'lower':'higher'} purchase costs.`:'Sales receipts and purchase costs respond differently.';
  const fiscalRows=channels.fiscal.rows;
  const fiscalIds=fiscalRows.filter(r=>r.available).map(r=>r.sourceId);
  const outgoing=channels.domestic.partners.filter(r=>r.origin===selection.focus).sort((a,b)=>(b.value??-1)-(a.value??-1));
  const incoming=channels.domestic.partners.filter(r=>r.destination===selection.focus).sort((a,b)=>(b.value??-1)-(a.value??-1));
  const max=Math.max(1,domestic.exports||0,foreign?.exports||0)*(1+Math.max(0,selection.shockPct)/100);
  const update=patch=>{
    const next=summarizeEnergyStory(snapshots,{...selection,...patch}).selection;
    setHistory(old=>[...old.slice(-29),selection]);setSelection(next);setNotice('');if(next.chapter!==selection.chapter)setEvidenceTab('sources');onState?.(next);
  };
  const goChapter=chapter=>{revealChapter.current=true;update({chapter});};
  useLayoutEffect(()=>{
    if(!revealChapter.current)return;
    revealChapter.current=false;
    const navigation=chapterNavigation.current;
    navigation?.querySelector('[aria-current="step"]')?.focus({preventScroll:true});
    navigation?.scrollIntoView({block:'start',behavior:'instant'});
  },[selection.chapter]);
  const undo=()=>{const prior=history.at(-1);if(prior){setSelection(prior);setHistory(history.slice(0,-1));setNotice('Previous selection restored.');onState?.(prior);}};
  const save=()=>{
    const payload=exportEnergyStory(snapshots,selection);
    const url=URL.createObjectURL(new Blob([JSON.stringify(payload)],{type:'application/json'}));
    const link=document.createElement('a');link.href=url;link.download='canada-energy-investigation.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    setNotice('Exported the selection, calculations and source data.');
  };
  const restore=async file=>{
    if(!file)return;
    try{
      if(file.size>12_000_000)throw Error();
      const payload=JSON.parse(await file.text());
      if(payload.schemaVersion!==1||!payload.snapshots||!payload.selection)throw Error();
      const restored=summarizeEnergyStory(payload.snapshots,payload.selection);
      setSnapshots(payload.snapshots);setSelection(restored.selection);setHistory([]);setPinned(null);onState?.(restored.selection);
      setDialog(null);setEvidenceTab('sources');setNotice('Restored from the exported source data. This investigation now uses that saved snapshot.');
    }catch{setNotice('That file could not be verified. The current investigation is unchanged.');}
    if(fileRef.current)fileRef.current.value='';
  };
  const ask=()=>onAsk?.(`Current investigation: ${commodities[selection.commodity].toLowerCase()} prices ${selection.shockPct}% relative to baseline, ${named(selection.focus)}${selection.compare?` compared with ${named(selection.compare)}`:''}, ${selection.tradeYear} trade. GDP response horizon: ${selection.responseHorizon===0?'price-change year':'through the following year'}. Household basis: ${selection.householdBasis==='retail'?'explicit all-in retail-price scenario':'twelve-month benchmark-price response at fixed exchange rate'}. What explains these results?`);
  const selectedSources=selection.chapter==='public-finances'?fiscalIds:selection.chapter==='national'?channels.national.sourceIds:selection.chapter==='outlook'?channels.priceResponse.sourceIds:selection.chapter==='households'?channels.households.sourceIds:[...channels.domestic.sourceIds,...channels.international.sourceIds];
  const tradeYearControl=<label className="es-trade-year">Trade year<select aria-label="Investigation trade year" value={selection.tradeYear} onChange={e=>update({tradeYear:Number(e.target.value)})}>{snapshots.flows.trade.years.map(y=><option key={y}>{y}</option>)}</select></label>;
  useEffect(()=>{onState?.(selection);},[]);
  return <section className="es-shell es-focused" aria-label="Connected energy investigation">
    <header className="es-heading"><h1 id="es-title">{titleFor(selection)}</h1><button className="es-evidence-button" onClick={()=>setDialog('evidence')}>Evidence</button></header>
    <div className="es-story-controls"><button className="es-edit-scenario" onClick={()=>setDialog('scenario')}>{named(selection.focus)}{selection.compare?` / ${named(selection.compare)}`:''}<span>Change scenario ↗</span></button>      <div className="es-price"><label htmlFor="es-price">Price change<output htmlFor="es-price">{percent(selection.shockPct)}</output></label><input id="es-price" type="range" min="-20" max="20" step="1" value={selection.shockPct} onChange={e=>update({shockPct:Number(e.target.value)})}/><div><span>−20%</span><button onClick={()=>update({shockPct:0})}>Unchanged</button><span>+20%</span></div></div>
    </div>
    {dialog==='scenario'&&<ContextDialog title="Change the price scenario" onClose={()=>setDialog(null)} className="es-scenario-dialog">    <div className="es-assumptions">
      <div className="es-commodity" role="group" aria-label="Investigate an energy commodity">{Object.entries(commodities).map(([id,label])=><button key={id} aria-pressed={selection.commodity===id} onClick={()=>update({commodity:id})}>{label}</button>)}</div>
      <label>Province<select aria-label="Investigation province" value={selection.focus} onChange={e=>update({focus:e.target.value})}>{regions.map(r=><option key={r.code} value={r.code}>{r.name}</option>)}</select></label>
      <label>Compare with<select aria-label="Comparison province" value={selection.compare||''} onChange={e=>update({compare:e.target.value||null})}><option value="">No comparison</option>{regions.filter(r=>r.code!==selection.focus).map(r=><option key={r.code} value={r.code}>{r.name}</option>)}</select></label>
    </div>
<button className="es-edit-done" onClick={()=>setDialog(null)}>Done</button></ContextDialog>}
    <nav ref={chapterNavigation} className="es-chapters" aria-label="Investigation chapters">{chapters.map(([id,label])=><button key={id} aria-current={selection.chapter===id?'step':undefined} aria-pressed={selection.chapter===id} onClick={()=>goChapter(id)}>{label}</button>)}</nav>
    {snapshots!==liveSnapshots&&<p className="es-snapshot">Using the saved source snapshot. Share view opens the latest published data; export preserves these sources.</p>}
    {notice&&dialog!=='save'&&<p className="es-notice" role="status">{notice}</p>}
    {pinned&&<div className="es-pinned"><span>Pinned {commodities[pinned.commodity]} · {named(pinned.focus)} · {percent(pinned.shockPct)}</span><button onClick={()=>update(pinned)}>Return to pinned scenario</button><button onClick={()=>setPinned(null)}>Clear pin</button></div>}

    <div className="es-connected-layout">
      <aside className="es-connected-visual"><ExploreScene shapes={shapes} result={result} named={named} onFocus={focus=>update({focus})} money={money} percent={percent}/></aside>
      <div className="es-connected-account" data-account={selection.chapter}>
        <p className="es-account-premise">{exploreHeadings[selection.chapter]}</p>
    {selection.chapter==='overview'&&<div className="es-overview">
      <div className="es-section-heading"><h2>Sales from {named(selection.focus)}</h2>{tradeYearControl}</div>
      <div className="es-sales"><ValueChange label="Sales to other provinces" value={domestic.exports} change={domestic.receiptsChange} unit="Domestic basic prices · CAD" max={max}/><ValueChange label="Sales to international markets" value={foreign?.exports} change={foreign?.receiptsChange} unit="Free on board prices · CAD" max={max}/></div>
      <p className="es-caption">Fixed quantities. Domestic and international sales use different price bases. These receipts are not GDP or profit.</p>
      <div className="es-purchases"><Metric label="Purchases from other provinces" value={domestic.purchasesChange} sign detail="Change in buyers' costs at fixed quantities"/><p>{tradeHeading}</p></div>
      {comparison&&<div className="es-comparison"><h3>Change in domestic sales receipts</h3><div><Metric label={named(selection.focus)} value={domestic.receiptsChange} sign/><Metric label={named(selection.compare)} value={comparison.receiptsChange} sign/></div></div>}
    </div>}

    {selection.chapter==='trade'&&<div><div className="es-section-heading"><h2>{named(selection.focus)}'s trading partners</h2>{tradeYearControl}<div className="es-view-switch"><button aria-pressed={view==='map'} onClick={()=>setView('map')}>Map</button><button aria-pressed={view==='table'} onClick={()=>setView('table')}>Table</button></div></div>
      {view==='map'?<div className="es-trade-layout"><div className="es-partners"><h3>Largest domestic customers</h3><p>Select a partner to compare.</p>{outgoing.filter(r=>r.value>0).slice(0,5).map(r=><button key={r.destination} aria-pressed={selection.compare===r.destination} onClick={()=>update({compare:selection.compare===r.destination?null:r.destination})}><span>{named(r.destination)}</span><strong>{money(r.value)}</strong><small>{money(r.change,true)} with this price change</small></button>)}{!outgoing.some(r=>r.value>0)&&<p>No positive sales are published. The table distinguishes missing records from zero.</p>}<div className="es-international"><span>International markets</span><strong>{money(foreign?.exports)}</strong><small>{money(foreign?.receiptsChange,true)} change · FOB basis</small></div></div></div>:<div className="es-table" tabIndex={0} role="region" aria-label="Published trading partners"><table><caption>Modelled trade and fixed-quantity change · million CAD at basic prices</caption><thead><tr><th>Seller</th><th>Buyer</th><th>Recorded value</th><th>Change</th><th>Source status</th></tr></thead><tbody>{[...outgoing,...incoming].map(r=><tr key={`${r.origin}-${r.destination}`}><th scope="row">{named(r.origin)}</th><td>{named(r.destination)}</td><td>{number(r.value,3)}</td><td>{number(r.change,3)}</td><td>{r.status}</td></tr>)}</tbody></table></div>}
    </div>}

    {selection.chapter==='public-finances'&&<div><div className="es-section-heading"><h2>Public revenue</h2><p>Published budget sensitivity · full fiscal year</p></div><div className="es-fiscal">{fiscalRows.map(row=><article key={row.region}><h3>{named(row.region)}</h3>{row.available?<><p>{row.outcomeLabel} · {row.fiscalYear}</p><strong className="es-fiscal-value">{money(row.revenueChangeLow,true)}{row.revenueChangeHigh!==row.revenueChangeLow?` to ${money(row.revenueChangeHigh,true)}`:''}</strong><p>{row.benchmark} {number(row.baselinePrice,2)} → {number(row.scenarioPrice,2)} {row.priceUnit}</p></>:<><p className="pr-result-status">No estimate available here</p><p>{row.reason}</p></>}</article>)}</div><p className="es-caption">Other budget assumptions stay fixed. Revenue effects overlap with trade receipts and cannot be added to them.</p></div>}

    {selection.chapter==='national'&&<div><div className="es-section-heading"><h2>Canada's GDP</h2>{channels.national.available&&<label className="es-duration">Price change lasts<select aria-label="National shock duration" value={selection.duration} onChange={e=>update({duration:e.target.value})}><option value="persistent">Persistently</option><option value="temporary">Two quarters</option></select></label>}</div>{channels.national.available?<><div className="es-national">{channels.national.years.map(row=><article key={row.yearAfterShock}><h3>Year {row.yearAfterShock}</h3><strong>{percent(row.realGdpPct)}</strong><p>Real GDP level</p><p>{percent(row.nominalGdpPct)} nominal GDP</p></article>)}</div><p className="es-caption">National illustration relative to the Finance Canada baseline. Real GDP adjusts for price changes; nominal GDP includes them. Duration changes this national model only.</p></>:<p className="es-gap">A national GDP effect is not calibrated for {commodities[selection.commodity].toLowerCase()}. A missing estimate does not mean no effect.</p>}</div>}

    {selection.chapter==='outlook'&&<div><ProvincialPriceResponse channel={channels.priceResponse} named={named} onHorizon={responseHorizon=>update({responseHorizon})}/><div className="es-outlook-link"><span>The annual GDP forecast is independent of this price experiment.</span><button onClick={()=>onNavigate?.('outlook',{year:channels.outlook.year,focus:selection.focus,compare:selection.compare})}>Open provincial GDP outlook <span aria-hidden="true">→</span></button></div></div>}

    {selection.chapter==='households'&&<HouseholdPriceResponse channel={channels.households} named={named} onBasis={householdBasis=>update({householdBasis})}/>}

      <nav className="es-story-progress" aria-label="Continue the investigation"><button disabled={selection.chapter===chapters[0][0]} onClick={()=>goChapter(chapters[chapters.findIndex(([id])=>id===selection.chapter)-1][0])}>← Previous</button><span>{chapters.findIndex(([id])=>id===selection.chapter)+1} / {chapters.length}</span><button onClick={()=>goChapter(chapters[(chapters.findIndex(([id])=>id===selection.chapter)+1)%chapters.length][0])}>{selection.chapter==='households'?'Start again':'Next account'} →</button></nav>
      <p className="es-account-boundary">Separate, overlapping accounts. Do not add these effects together.</p>
      </div>
    </div>
    <footer className="es-tools"><button onClick={undo} disabled={!history.length}>Undo</button><button onClick={()=>setDialog('save')}>Save scenario</button><button onClick={ask}>Ask about this scenario</button></footer>
    <input ref={fileRef} type="file" accept=".json,application/json" aria-label="Open exported investigation" hidden onChange={e=>void restore(e.target.files[0])}/>
    {dialog==='save'&&<ContextDialog title="Save this scenario" onClose={()=>setDialog(null)} className="es-save-dialog"><div className="es-save-actions"><button onClick={save} data-story-export>Export investigation</button><button onClick={()=>fileRef.current?.click()}>Open an export</button><button onClick={()=>{setPinned(selection);setDialog(null);setNotice('Scenario pinned.');}}>Pin this scenario</button></div>{notice&&<p className="es-notice" role="status">{notice}</p>}<p>Exports include the selected scenario, calculations and source data. Share view at the top of the page copies a link to these selections with the latest data.</p></ContextDialog>}
    {dialog==='evidence'&&<ContextDialog title={`${chapters.find(([id])=>id===selection.chapter)[1]} evidence`} onClose={()=>setDialog(null)} className="es-evidence-dialog">
      {snapshots===liveSnapshots&&<nav className="es-evidence-tabs" aria-label="Scenario evidence"><button aria-pressed={evidenceTab==='sources'} onClick={()=>setEvidenceTab('sources')}>Sources & methods</button><button aria-pressed={evidenceTab==='monthly'} onClick={()=>setEvidenceTab('monthly')}>Monthly activity</button></nav>}
      {evidenceTab==='monthly'&&snapshots===liveSnapshots?<MonthlyEnergy region={selection.focus} compare={selection.compare} commodity={selection.commodity} context="story" detailsOnly showReadings/>:<>
        <p>This sensitivity experiment holds trade quantities and other stated assumptions fixed. The percentage applies to each account's named price benchmark. These accounts overlap and must not be added.</p>
        {['overview','trade'].includes(selection.chapter)&&<><p>Trade uses {selection.tradeYear} values. Statistics Canada models supplier-to-purchaser transactions, not physical shipments or pipeline routes. Gross sales differ from GDP, profit and household income.</p><div className="es-trade-balance"><h3>Domestic accounting</h3><div className="es-balance-grid"><Metric label={`${named(selection.focus)} trade balance`} value={domestic.netChange} sign/><Metric label="Other provinces and territories together" value={channels.domestic.restOfCanada.netChange} sign/></div><p>Every domestic purchase is another province's sale. These changes offset across Canada. That does not measure national welfare.</p></div></>}
        {selection.chapter==='public-finances'&&fiscalRows.filter(row=>row.available).map(row=><section key={row.region}><h3>{named(row.region)} · {row.fiscalYear}</h3><p>{row.method}. {row.assumptions}</p>{row.limitations?.map((text,i)=><p key={i}>{text}</p>)}</section>)}
        {selection.chapter==='national'&&<p>{channels.national.available?`${channels.national.method}. Provincial budgets still assume a full fiscal year. This illustration is not a provincial GDP estimate.`:'No national GDP response is calibrated for this commodity.'}</p>}
        {selection.chapter==='outlook'&&<ProvincialPriceEvidence channel={channels.priceResponse} named={named}/>}
        {selection.chapter==='households'&&<><HouseholdPriceEvidence channel={channels.households} named={named}/><p>These spending equivalents do not estimate wages, employment, public-service decisions, environmental costs or the effect on an individual home.</p></>}
        <h3>Sources</h3>{[...new Set(selectedSources||[])].map(id=>{const source=sources.find(s=>s.id===id);return source?<p key={id}><a href={source.url} target="_blank" rel="noopener noreferrer">{source.title||source.id}</a>{source.publishedAt&&<small> · Published {source.publishedAt}</small>}</p>:null;})}
        <button onClick={save} data-story-export>Download scenario & sources</button>
      </>}
    </ContextDialog>}
  </section>;
}

export function mountEnergyStory(element,options){
  summarizeEnergyStory(options.snapshots);
  const root=createRoot(element);root.render(<Story {...options}/>);
  return {unmount:()=>root.unmount()};
}
