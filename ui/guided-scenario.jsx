import React,{useEffect,useRef,useState} from 'react';
import {GUIDE_STEPS} from '../guided-scenario-model.mjs';
import {HistoricalCheck} from './price-responses.jsx';
import './guided-scenario.css';
import {GuidedMap} from './guided-map.jsx';

const number=(value,d=1)=>new Intl.NumberFormat('en-CA',{maximumFractionDigits:d}).format(value);
const signed=value=>`${value>0?'+':value<0?'−':''}${number(Math.abs(value),2)}`;
const cash=(value,millions=false)=>{
  if(!Number.isFinite(value))return 'Unavailable';
  const amount=Math.abs(value)*(millions?1e6:1),scale=amount>=1e9?1e9:amount>=1e6?1e6:amount>=1e3&&millions?1e3:1;
  return `${value<0?'−':value>0?'+':''}$${number(amount/scale,scale===1?0:1)}${scale===1e9?'B':scale===1e6?'M':scale===1e3?'K':''}`;
};
const amount=value=>cash(value,true).replace(/^\+/,'');
const labels=['The exchange','Provincial economy','Household spending'];

function PriceControl({label,value,onChange,id}){
  const [draft,setDraft]=useState(String(value));
  useEffect(()=>setDraft(String(value)),[value]);
  const commit=()=>{const next=draft.trim()===''||!Number.isFinite(Number(draft))?value:Math.max(-20,Math.min(20,Number(draft)));setDraft(String(next));if(next!==value)onChange(next);};
  return <div className="gs-price"><label htmlFor={id}>{label}</label><div><input id={id} type="range" min="-20" max="20" step="1" value={value} onChange={e=>onChange(Number(e.target.value))}/><label className="gs-number"><span className="sr-only">{label} percent</span><input aria-label={`${label} percent`} type="number" min="-20" max="20" step="1" value={draft} onBlur={commit} onKeyDown={e=>{if(e.key==='Enter')commit();}} onChange={e=>{setDraft(e.target.value);if(e.target.value!==''&&Number.isFinite(e.target.valueAsNumber)&&Math.abs(e.target.valueAsNumber)<=20)onChange(e.target.valueAsNumber);}}/><span>%</span></label></div><div className="gs-presets">{[-10,0,10].map(n=><button key={n} aria-pressed={value===n} onClick={()=>onChange(n)}>{n===0?'No change':`${n>0?'+':''}${n}%`}</button>)}</div></div>;
}

function ModelDetails({row}){
  if(!row.reasons?.length&&!row.rangeLabel&&!row.validation)return null;
  return <details className="gs-details"><summary>Model & historical checks</summary>{row.reasons?.map((reason,i)=><p key={i}>{reason}</p>)}{row.rangeLabel&&<p>Range: {row.rangeLabel}. This is not a forecast-error interval.</p>}<HistoricalCheck validation={row.validation}/></details>;
}

export function GuidedScenario({shapes,result,selection,update,ready,loadStatus,retry,focusOnOpen,onEntered,onClose}){
  const step=GUIDE_STEPS.indexOf(selection.guideStep),heading=useRef(null),guide=useRef(null),previous=useRef(selection.guideStep),provinceCards=useRef(new Map());
  const [hovered,setHovered]=useState(null),[focusRegion,setFocusRegion]=useState(null);
  const focused=hovered||focusRegion;
  const reveal=target=>{
    if(!target)return;
    target.focus({preventScroll:true});
    const map=guide.current?.querySelector('.gsm-map');
    const inset=map&&getComputedStyle(map).position==='sticky'?map.getBoundingClientRect().height+12:16;
    const rect=target.getBoundingClientRect();
    if(rect.top<inset||rect.top>window.innerHeight-80)window.scrollBy({top:rect.top-inset,behavior:'instant'});
  };
  useEffect(()=>{if(focusOnOpen){reveal(heading.current);onEntered?.();}},[]);
  useEffect(()=>{if(previous.current!==selection.guideStep){setHovered(null);setFocusRegion(null);reveal(heading.current);previous.current=selection.guideStep;}},[selection.guideStep]);
  const inspect=region=>{setHovered(null);setFocusRegion(region);reveal(provinceCards.current.get(region));};
  const cardProps=region=>({ref:node=>{if(node)provinceCards.current.set(region,node);else provinceCards.current.delete(region);},tabIndex:-1,onPointerEnter:()=>setHovered(region),onPointerLeave:()=>setHovered(null),onFocus:()=>setFocusRegion(region),onBlur:()=>setFocusRegion(null),'data-highlighted':focused===region});
  const link=result.exchange,[seller,buyer]=result.provinces;
  return <section ref={guide} className="gs-guide" aria-label="Guided trade scenario">
    <div className="gs-route"><div><h3>{seller.name} <span aria-label="to">→</span> {buyer.name}</h3></div><button onClick={onClose}>Back to connections</button></div>
    <nav className="gs-steps" aria-label="Scenario stages">{GUIDE_STEPS.map((stage,i)=><button key={stage} aria-current={stage===selection.guideStep?'step':undefined} onClick={()=>update({guideStep:stage})}>{labels[i]}</button>)}</nav>
    <div className="gs-layout"><div className="gs-map-column"><GuidedMap shapes={shapes} result={result} ready={ready} loadStatus={loadStatus} focused={focused} onFocus={setFocusRegion} onHover={setHovered} onInspect={inspect} money={cash} percent={signed}/><PriceControl id="guided-commodity-price" label="Commodity price change" value={selection.priceShock} onChange={priceShock=>update({priceShock})}/></div>
    <div className="gs-stage"><h4 ref={heading} tabIndex={-1}>{step===0?'What changes hands?':step===1?'What changes in each province?':'What could households spend?'}</h4>
      {step===0?<>
        <div className="gs-exchange"><div><span>Published trade value</span><strong>{amount(link.value)}</strong></div><span className="gs-arrow" aria-hidden="true">→</span><div><span>With the price change</span><strong>{amount(link.scenarioValue)}</strong></div></div>
        <p className="gs-unit">Annual value · current Canadian dollars · basic prices</p>
        <p className="gs-boundary">Same quantity, new price. Sales receipts and purchase costs change equally.</p>
        <details className="gs-details"><summary>How this is calculated</summary><p>{link.available?`$${number(link.value,6)} million × ${signed(selection.priceShock)}% = ${link.change<0?'−':link.change>0?'+':''}$${number(Math.abs(link.change),6)} million. Headline amounts are rounded.`:'This source does not publish a value for the selected connection.'} Full price pass-through, unchanged quantities and exchange rates. Sales receipts are not profit, GDP or household income. The source models trade relationships, not individual shipments.</p></details>
      </>:!ready?<div className="gs-loading" role="status"><p>{loadStatus==='error'?'The provincial and household sources could not load. Your trade calculation is still available.':'Loading the provincial and household sources…'}</p>{loadStatus==='error'&&<button onClick={retry}>Retry sources</button>}</div>:step===1?<>
        <p className="gs-boundary">Province-wide scenarios, not effects of this single trade. GDP shows historical associations, not causal estimates.</p>
        <label className="gs-period">GDP response period<select aria-label="GDP response period" value={selection.guideHorizon} onChange={e=>update({guideHorizon:Number(e.target.value)})}><option value="0">Price-change year</option><option value="1">Through the following year</option></select></label>
        <div className="gs-pair">{result.provinces.map(p=><article key={p.region} {...cardProps(p.region)} data-guide-province={p.region}><h5>{p.name}</h5><span>Real GDP level · {p.gdp.benchmark||'No benchmark model'}</span>{p.gdp.status==='supported'?<><strong className="gs-result">{signed(p.gdp.estimatePct)}%</strong><p>Relative to the unchanged-price model path.</p><p className="gs-range">{signed(p.gdp.lowerPct)}% to {signed(p.gdp.upperPct)}% · parameter range</p></>:<><strong className="gs-unavailable">No supported estimate</strong><p>{p.gdp.status==='exploratory'?'This model did not pass the historical checks.':'No validated price-to-GDP model is available.'}</p></>}<ModelDetails row={p.gdp}/>
          <div className="gs-fiscal"><span>Provincial government revenue</span>{p.fiscal?.available?<><strong>{p.fiscal.revenueChangeLow===p.fiscal.revenueChangeHigh?cash(p.fiscal.revenueChangeLow,true):`${cash(p.fiscal.revenueChangeLow,true)} to ${cash(p.fiscal.revenueChangeHigh,true)}`}</strong><p>{p.fiscal.fiscalYear} · {p.fiscal.benchmark}</p><details className="gs-details"><summary>Budget sensitivity</summary><p>{p.fiscal.outcomeLabel}. A {signed(selection.priceShock)}% change from {number(p.fiscal.baselinePrice,2)} {p.fiscal.priceUnit}.</p>{p.fiscal.limitations?.map((text,i)=><p key={i}>{text}</p>)}</details></>:<p>No published sensitivity for this selection.</p>}</div>
        </article>)}</div>
        <p className="gs-unit">{selection.guideHorizon===1?'GDP is the cumulative level difference through the following year; later prices are not held fixed.':'GDP compares an annual benchmark-price change with an unchanged-price path.'} This does not change the GDP forecast. Budget and GDP effects cannot be added together.</p>
      </>:<>
        <div className="gs-basis" role="group" aria-label="Guided household basis"><button aria-pressed={selection.guideHouseholdBasis==='benchmark'} onClick={()=>update({guideHouseholdBasis:'benchmark'})}>From commodity prices</button><button aria-pressed={selection.guideHouseholdBasis==='retail'} onClick={()=>update({guideHouseholdBasis:'retail'})}>Set a retail-price scenario</button></div>
        {selection.guideHouseholdBasis==='retail'?<><PriceControl id="guided-retail-price" label="Retail price change" value={selection.guideRetailShock} onChange={guideRetailShock=>update({guideRetailShock})}/><p className="gs-boundary">A separate retail-price assumption, independent of the commodity price.</p></>:<p className="gs-boundary">Benchmark held for 12 months; consumption unchanged.</p>}
        <div className="gs-pair">{result.provinces.map(p=>{const h=p.household;return <article key={p.region} {...cardProps(p.region)} data-guide-household={p.region}><h5>{p.name}</h5><span>{h.categoryLabel}</span>{selection.guideHouseholdBasis==='benchmark'&&h.priceBasis&&<p className="gs-unit">{h.priceBasis}</p>}{['supported','retail-scenario'].includes(h.status)?<><strong className="gs-result">{cash(h.annualChangeCad)}<small> / year</small></strong><p>{cash(h.monthlyEquivalentCad)} monthly equivalent · unchanged consumption</p><p className="gs-caution">Spending equivalent, not a validated bill forecast.{h.annualCheck&&` Annual CPI test error: ${number(h.annualCheck.mae,1)}%, versus ${number(h.annualCheck.baselineMae,1)}% for the simpler model.`}</p>{Number.isFinite(h.lowerAnnualCad)&&<p className="gs-range">{cash(h.lowerAnnualCad)} to {cash(h.upperAnnualCad)} · parameter range</p>}<details className="gs-details"><summary>Spending reference & calculation</summary><p>{cash(h.baselineAnnualCad).replace(/^\+/,'')} annual reference × {signed(h.retailChangePct)}% retail-price change.</p><p>{h.baselineLabel}</p><p>{h.interpretation}</p></details></>:<><strong className="gs-unavailable">No supported estimate</strong><p>{selection.guideHouseholdBasis==='retail'?(h.reasons?.join(' ')||'The spending reference is unavailable.'):(h.status==='exploratory'?'Commodity prices did not reliably predict these retail costs.':'No validated commodity-to-retail response is available.')}</p></>}<ModelDetails row={h}/></article>;})}</div>
        <p className="gs-unit">Average across all households, including those with no spending in this category.</p>
      </>}
    </div></div>
    <div className="gs-footer">{step>0?<button onClick={()=>update({guideStep:GUIDE_STEPS[step-1]})}>← Back</button>:<span/>}{step<2?<button onClick={()=>update({guideStep:GUIDE_STEPS[step+1]})}>{labels[step+1]} →</button>:null}</div>
    <details className="gs-details gs-sources"><summary>Sources & methods</summary><p>{result.interpretation}</p>{result.sources.map((source,i)=><p key={`${source.id}-${i}`}><a href={source.url} target="_blank" rel="noopener noreferrer">{source.title}</a></p>)}<dl>{Object.entries(result.versions).map(([name,version])=><div key={name}><dt>{name}</dt><dd>{version}</dd></div>)}</dl></details>
  </section>;
}
