import React from 'react';

const value=(n,d=2)=>Number.isFinite(n)?new Intl.NumberFormat('en-CA',{maximumFractionDigits:d}).format(n):'Unavailable';
const pct=n=>`${n>0?'+':''}${value(n)}%`;
const cash=n=>Number.isFinite(n)?`${n<0?'−':n>0?'+':''}$${value(Math.abs(n),0)}`:'Unavailable';

export function HistoricalCheck({validation,expanded=false}) {
  if(!validation)return null;
  const records=validation.origins||[];
  const all=records.flatMap(r=>[r.actual,r.prediction,r.baseline]).filter(Number.isFinite);
  const low=Math.min(0,...all),high=Math.max(1,...all),span=high-low;
  const x=i=>36+i*520/Math.max(1,records.length-1),y=n=>152-(n-low)*120/span;
  const Container=expanded?'section':'details',Table=expanded?'div':'details';
  return <Container className="pr-validation">{expanded?<h4>Historical performance</h4>:<summary>How it performed on historical outcomes</summary>}
    <p>{validation.description}</p>
    <dl className="pr-error-grid"><div><dt>Price model error</dt><dd>{value(validation.mae)} pp</dd></div><div><dt>Simpler model error</dt><dd>{value(validation.baselineMae)} pp</dd></div><div><dt>Held-out observations</dt><dd>{value(validation.n,0)}</dd></div></dl>
    {!expanded&&records.length>1&&<figure className="pr-history"><svg viewBox="0 0 580 180" role="img" aria-label="Observed outcomes and estimates for held-out historical periods">
      <line x1="36" y1={y(0)} x2="556" y2={y(0)} stroke="#b5bbb2"/>
      {[['actual','#2b332d'],['prediction','#2c7567']].map(([field,color])=><polyline key={field} fill="none" stroke={color} strokeWidth="2" strokeDasharray={field==='prediction'?'5 3':undefined} points={records.map((r,i)=>`${x(i)},${y(r[field])}`).join(' ')}/>)}
      {records.map((r,i)=><circle key={r.period} cx={x(i)} cy={y(r.prediction)} r="3" fill="#2c7567"><title>{r.period}: observed {value(r.actual)}%, estimated {value(r.prediction)}%</title></circle>)}
      <text x="36" y="174">{records[0].period}</text><text x="556" y="174" textAnchor="end">{records.at(-1).period}</text>
      <text x="30" y="25" textAnchor="end">{value(high,1)}</text><text x="30" y="153" textAnchor="end">{value(low,1)}</text>
    </svg><figcaption><span>Observed</span><span>Price model</span> · {validation.outcomeLabel}</figcaption></figure>}
    {validation.auditNote&&<p className="pr-note">{validation.auditNote}</p>}
    {!!records.length&&<Table>{!expanded&&<summary>View the historical results table</summary>}<div className="es-table" role="region" tabIndex={0} aria-label="Historical model evaluation"><table><thead><tr><th>Period</th><th>Observed</th><th>Price model</th><th>Simpler model</th></tr></thead><tbody>{records.map(r=><tr key={r.period}><th scope="row">{r.period}</th><td>{value(r.actual)}</td><td>{value(r.prediction)}</td><td>{value(r.baseline)}</td></tr>)}</tbody></table></div></Table>}
  </Container>;
}

function Effect({row}) {
  return <><strong className="pr-estimate">{pct(row.estimatePct)}</strong><p>Real GDP level relative to the model's unchanged-price path</p><p className="pr-range">{pct(row.lowerPct)} to {pct(row.upperPct)} <span>{row.rangeLabel}</span></p></>;
}

export function ProvincialPriceResponse({channel,named,onHorizon}) {
  return <section className="pr-gdp" aria-label="Provincial GDP price response">
    <div className="es-section-heading"><h2>Provincial GDP response</h2><label>Response period<select aria-label="GDP price response period" value={channel.horizonYears} onChange={e=>onHorizon(Number(e.target.value))}><option value="0">Price-change year</option><option value="1">Through the following year</option></select></label></div>
    <p className="pr-scope">Historical relationship with an annual benchmark-price change. It does not isolate the cause of that change or alter the annual GDP forecast.</p>
    {!channel.available&&<button className="es-text-button" data-ec-action="retry-story">Reload published sources</button>}
    <div className="pr-cards">{channel.rows.map(row=><article key={row.region} data-price-region={row.region}>
      <h3 className="pr-place">{named(row.region)} <small>{row.benchmark||'No benchmark'}</small></h3>
      {row.status==='supported'?<><Effect row={row}/><p className="pr-status">Passed the stated historical screening tests.</p></>:<><p className="pr-result-status">{row.status==='exploratory'?'This relationship did not pass the historical checks.':'No supported GDP response for this selection.'}</p><p>{row.reasons[0]}</p></>}
    </article>)}</div>
  </section>;
}

export function HouseholdPriceResponse({channel,named,onBasis}) {
  return <section className="pr-households" aria-label="Household energy spending">
    <div className="es-section-heading"><h2>Household energy spending</h2></div>
    <div className="pr-basis" role="group" aria-label="Household price basis"><button aria-pressed={channel.basis==='benchmark'} onClick={()=>onBasis('benchmark')}>Commodity-price response</button><button aria-pressed={channel.basis==='retail'} onClick={()=>onBasis('retail')}>Retail-price scenario</button></div>
    <p className="pr-scope">{channel.basis==='retail'?'The selected percentage changes retail prices directly. This scenario does not estimate a wholesale-to-retail response.':'The named benchmark is held at the changed level for twelve months, with the exchange rate fixed. The model estimates the retail-price response.'}</p>
    {!channel.available&&<button className="es-text-button" data-ec-action="retry-story">Reload published sources</button>}
    <div className="pr-cards">{channel.rows.map(row=><article key={row.region} data-household-region={row.region}>
      <h3 className="pr-place">{named(row.region)} <small>{row.categoryLabel}</small></h3>
      {['supported','retail-scenario'].includes(row.status)?<>
        <strong className="pr-estimate">{cash(row.annualChangeCad)}<small> per year</small></strong>
        <p>{cash(row.monthlyEquivalentCad)} monthly equivalent at unchanged consumption.</p>
        <p className="pr-note">A price-only spending equivalent, not a validated annual bill forecast.</p>
        {Number.isFinite(row.lowerAnnualCad)&&<p className="pr-range">{cash(row.lowerAnnualCad)} to {cash(row.upperAnnualCad)} <span>{row.rangeLabel}</span></p>}
        <dl className="pr-household-values"><div><dt>Annual spending reference</dt><dd>${value(row.baselineAnnualCad,0)}</dd></div><div><dt>Retail-price change</dt><dd>{pct(row.retailChangePct)}</dd></div></dl>
        <p className="pr-note">{row.baselineLabel}</p>
      </>:<><p className="pr-result-status">{row.status==='exploratory'?'Commodity prices did not reliably predict these retail costs.':'A commodity-to-bill estimate is unavailable.'}</p><p>{row.reasons.join(' ')}</p>{Number.isFinite(row.baselineAnnualCad)&&channel.basis==='benchmark'&&<button className="es-text-button" onClick={()=>onBasis('retail')}>Use a retail-price scenario →</button>}</>}
    </article>)}</div>
    <p className="pr-population">Average across all households, including those with no spending in this category. This is not an individual household bill.</p>
  </section>;
}

export function ProvincialPriceEvidence({channel,named}){
  return channel.rows.map(row=><section key={row.region} data-price-evidence={row.region}><h3>{named(row.region)} · {row.benchmark||'No benchmark'}</h3>{row.status==='exploratory'&&<><p>This estimate failed the historical checks and remains exploratory.</p><Effect row={row}/></>}{row.reasons.map((reason,index)=><p key={index}>{reason}</p>)}<HistoricalCheck validation={row.validation} expanded/></section>);
}

export function HouseholdPriceEvidence({channel,named}){
  return channel.rows.map(row=><section key={row.region} data-household-evidence={row.region}><h3>{named(row.region)} · {row.categoryLabel}</h3>{row.priceBasis&&<p>{row.priceBasis}. The changed benchmark level is held for twelve months.</p>}<p>{row.baselineLabel}</p><p>{row.interpretation}</p>{row.reasons?.map((reason,index)=><p key={index}>{reason}</p>)}{row.annualCheck&&<p>Annual CPI test error averaged {value(row.annualCheck.mae,1)}%, versus {value(row.annualCheck.baselineMae,1)}% for the simpler model. This does not measure individual bill accuracy.</p>}<HistoricalCheck validation={row.validation} expanded/></section>);
}
