import React,{useEffect,useRef,useState} from 'react';
import {GUIDE_STEPS} from '../guided-scenario-model.mjs';
import {ENERGY_COMMODITIES} from '../trade-workspace-model.mjs';
import {HistoricalCheck} from './price-responses.jsx';
import './guided-scenario.css';

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

export function GuidedScenario({result,selection,update,ready,loadStatus,retry,focusOnOpen,onEntered,onClose}){
  const step=GUIDE_STEPS.indexOf(selection.guideStep),heading=useRef(null),previous=useRef(selection.guideStep);
  useEffect(()=>{if(focusOnOpen){heading.current?.focus();onEntered?.();}},[]);
  useEffect(()=>{if(previous.current!==selection.guideStep){heading.current?.focus({preventScroll:true});const rect=heading.current?.getBoundingClientRect();if(rect&&(rect.top<0||rect.bottom>window.innerHeight))heading.current.scrollIntoView({block:'start',behavior:'instant'});previous.current=selection.guideStep;}},[selection.guideStep]);
  const link=result.exchange,[seller,buyer]=result.provinces;
  return <section className="gs-guide" aria-label="Guided trade scenario">
    <div className="gs-route"><div><span>{ENERGY_COMMODITIES[link.commodity]} · {link.year} trade</span><h3>{seller.name} <span aria-label="to">→</span> {buyer.name}</h3></div><button onClick={onClose}>Back to connections</button></div>
    <nav className="gs-steps" aria-label="Scenario stages">{GUIDE_STEPS.map((stage,i)=><button key={stage} aria-current={stage===selection.guideStep?'step':undefined} onClick={()=>update({guideStep:stage})}><span>{i+1}</span>{labels[i]}</button>)}</nav>
    <div className="gs-layout"><aside><PriceControl id="guided-commodity-price" label="Commodity price change" value={selection.priceShock} onChange={priceShock=>update({priceShock})}/><p>One price assumption, applied across the selected commodity. Quantities stay fixed in the trade calculation.</p>{step>0&&<p className="gs-anchor">This connection: <strong>{cash(link.change,true)}</strong> in seller receipts and buyer costs.</p>}</aside>
    <div className="gs-stage"><h4 ref={heading} tabIndex={-1}>{step===0?'What changes hands?':step===1?'What changes in each province?':'What could households spend?'}</h4>
      {step===0?<>
        <div className="gs-exchange"><div><span>Published trade value</span><strong>{amount(link.value)}</strong></div><span className="gs-arrow" aria-hidden="true">→</span><div><span>With the price change</span><strong>{amount(link.scenarioValue)}</strong></div></div>
        <p className="gs-unit">Annual value · current Canadian dollars · basic prices</p>
        <div className="gs-pair">{result.provinces.map(p=><article key={p.region}><span>{p.name} · {p.role}</span><strong className="gs-result">{cash(link.change,true)}</strong><p>{p.role==='seller'?'Change in sales receipts':'Change in purchase costs'}</p></article>)}</div>
        <p className="gs-boundary">The same transaction appears on both sides. Sales receipts are not profit, GDP or household income.</p>
        <details className="gs-details"><summary>How this is calculated</summary><p>{link.available?`$${number(link.value,6)} million × ${signed(selection.priceShock)}% = ${link.change<0?'−':link.change>0?'+':''}$${number(Math.abs(link.change),6)} million. Headline amounts are rounded.`:'This source does not publish a value for the selected connection.'} Full price pass-through, unchanged quantities and exchange rates. The source models trade relationships; it does not trace individual shipments.</p></details>
      </>:!ready?<div className="gs-loading" role="status"><p>{loadStatus==='error'?'The provincial and household sources could not load. Your trade calculation is still available.':'Loading the provincial and household sources…'}</p>{loadStatus==='error'&&<button onClick={retry}>Retry sources</button>}</div>:step===1?<>
        <p className="gs-boundary">These are separate province-wide price scenarios. They do not measure the effect of this one trade, or residents’ disposable income. GDP estimates describe historical associations, not identified causal effects.</p>
        <label className="gs-period">GDP response period<select aria-label="GDP response period" value={selection.guideHorizon} onChange={e=>update({guideHorizon:Number(e.target.value)})}><option value="0">Price-change year</option><option value="1">Through the following year</option></select></label>
        <div className="gs-pair">{result.provinces.map(p=><article key={p.region} data-guide-province={p.region}><h5>{p.name}</h5><span>Real GDP level · {p.gdp.benchmark||'No benchmark model'}</span>{p.gdp.status==='supported'?<><strong className="gs-result">{signed(p.gdp.estimatePct)}%</strong><p>Relative to the unchanged-price model path.</p><p className="gs-range">{signed(p.gdp.lowerPct)}% to {signed(p.gdp.upperPct)}% · parameter range</p></>:<><strong className="gs-unavailable">No supported estimate</strong><p>{p.gdp.status==='exploratory'?'This model did not pass the historical checks.':'No validated price-to-GDP model is available.'}</p></>}<ModelDetails row={p.gdp}/>
          <div className="gs-fiscal"><span>Provincial government revenue</span>{p.fiscal?.available?<><strong>{p.fiscal.revenueChangeLow===p.fiscal.revenueChangeHigh?cash(p.fiscal.revenueChangeLow,true):`${cash(p.fiscal.revenueChangeLow,true)} to ${cash(p.fiscal.revenueChangeHigh,true)}`}</strong><p>{p.fiscal.fiscalYear} · {p.fiscal.benchmark}</p><details className="gs-details"><summary>Budget sensitivity</summary><p>{p.fiscal.outcomeLabel}. A {signed(selection.priceShock)}% change from {number(p.fiscal.baselinePrice,2)} {p.fiscal.priceUnit}.</p>{p.fiscal.limitations?.map((text,i)=><p key={i}>{text}</p>)}</details></>:<p>No published sensitivity for this selection.</p>}</div>
        </article>)}</div>
        <p className="gs-unit">{selection.guideHorizon===1?'GDP is the cumulative level difference through the following year; later prices are not held fixed.':'GDP compares an annual benchmark-price change with an unchanged-price path.'} This does not change the GDP forecast. Budget and GDP effects cannot be added together.</p>
      </>:<>
        <div className="gs-basis" role="group" aria-label="Guided household basis"><button aria-pressed={selection.guideHouseholdBasis==='benchmark'} onClick={()=>update({guideHouseholdBasis:'benchmark'})}>From commodity prices</button><button aria-pressed={selection.guideHouseholdBasis==='retail'} onClick={()=>update({guideHouseholdBasis:'retail'})}>Set a retail-price scenario</button></div>
        {selection.guideHouseholdBasis==='retail'?<><PriceControl id="guided-retail-price" label="Retail price change" value={selection.guideRetailShock} onChange={guideRetailShock=>update({guideRetailShock})}/><p className="gs-boundary">A separate assumption about the price households pay. It is not inferred from the commodity-price change.</p></>:<p className="gs-boundary">The commodity benchmark is held at the changed level for 12 months. Historical retail-price responses are applied to average household spending.</p>}
        <div className="gs-pair">{result.provinces.map(p=>{const h=p.household;return <article key={p.region} data-guide-household={p.region}><h5>{p.name}</h5><span>{h.categoryLabel}</span>{selection.guideHouseholdBasis==='benchmark'&&h.priceBasis&&<p className="gs-unit">{h.priceBasis}</p>}{['supported','retail-scenario'].includes(h.status)?<><strong className="gs-result">{cash(h.annualChangeCad)}<small> / year</small></strong><p>{cash(h.monthlyEquivalentCad)} monthly equivalent · unchanged consumption</p><p className="gs-caution">Spending equivalent, not a validated bill forecast.{h.annualCheck&&` Annual CPI test error: ${number(h.annualCheck.mae,1)}%, versus ${number(h.annualCheck.baselineMae,1)}% for the simpler model.`}</p>{Number.isFinite(h.lowerAnnualCad)&&<p className="gs-range">{cash(h.lowerAnnualCad)} to {cash(h.upperAnnualCad)} · parameter range</p>}<details className="gs-details"><summary>Spending reference & calculation</summary><p>{cash(h.baselineAnnualCad).replace(/^\+/,'')} annual reference × {signed(h.retailChangePct)}% retail-price change.</p><p>{h.baselineLabel}</p><p>{h.interpretation}</p></details></>:<><strong className="gs-unavailable">No supported estimate</strong><p>{selection.guideHouseholdBasis==='retail'?(h.reasons?.join(' ')||'The spending reference is unavailable.'):(h.status==='exploratory'?'Commodity prices did not reliably predict these retail costs.':'No validated commodity-to-retail response is available.')}</p></>}<ModelDetails row={h}/></article>;})}</div>
        <p className="gs-unit">Average across all households, including those with no spending in this category. A particular home’s bill depends on its consumption, tariff and fixed charges.</p>
      </>}
    </div></div>
    <div className="gs-footer"><button disabled={step===0} onClick={()=>update({guideStep:GUIDE_STEPS[step-1]})}>← Back</button><span>{step+1} of 3</span>{step<2?<button onClick={()=>update({guideStep:GUIDE_STEPS[step+1]})}>{labels[step+1]} →</button>:<button onClick={onClose}>Explore another connection →</button>}</div>
    <details className="gs-details gs-sources"><summary>Scenario sources & snapshots</summary><p>{result.interpretation}</p>{result.sources.map((source,i)=><p key={`${source.id}-${i}`}><a href={source.url} target="_blank" rel="noopener noreferrer">{source.title}</a></p>)}<dl>{Object.entries(result.versions).map(([name,version])=><div key={name}><dt>{name}</dt><dd>{version}</dd></div>)}</dl></details>
  </section>;
}
