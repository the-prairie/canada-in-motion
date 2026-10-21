import React from 'react';

const value=(n,d=2)=>Number.isFinite(n)?new Intl.NumberFormat('en-CA',{maximumFractionDigits:d}).format(n):'Unavailable';
const pct=n=>`${n>0?'+':''}${value(n)}%`;
const cash=n=>Number.isFinite(n)?`${n<0?'−':n>0?'+':''}$${value(Math.abs(n),0)}`:'Unavailable';

export function HistoricalCheck({validation}) {
  if(!validation)return null;
  const records=validation.origins||[];
  const all=records.flatMap(r=>[r.actual,r.prediction,r.baseline]).filter(Number.isFinite);
  const low=Math.min(0,...all),high=Math.max(1,...all),span=high-low;
  const x=i=>36+i*520/Math.max(1,records.length-1),y=n=>152-(n-low)*120/span;
  return <details className="pr-validation"><summary>How it performed on historical outcomes</summary>
    <p>{validation.description}</p>
    <dl className="pr-error-grid"><div><dt>Price model error</dt><dd>{value(validation.mae)} pp</dd></div><div><dt>Simpler model error</dt><dd>{value(validation.baselineMae)} pp</dd></div><div><dt>Held-out observations</dt><dd>{value(validation.n,0)}</dd></div></dl>
    {records.length>1&&<figure className="pr-history"><svg viewBox="0 0 580 180" role="img" aria-label="Observed outcomes and estimates for held-out historical periods">
      <line x1="36" y1={y(0)} x2="556" y2={y(0)} stroke="#b5bbb2"/>
      {[['actual','#2b332d'],['prediction','#2c7567']].map(([field,color])=><polyline key={field} fill="none" stroke={color} strokeWidth="2" strokeDasharray={field==='prediction'?'5 3':undefined} points={records.map((r,i)=>`${x(i)},${y(r[field])}`).join(' ')}/>)}
      {records.map((r,i)=><circle key={r.period} cx={x(i)} cy={y(r.prediction)} r="3" fill="#2c7567"><title>{r.period}: observed {value(r.actual)}%, estimated {value(r.prediction)}%</title></circle>)}
      <text x="36" y="174">{records[0].period}</text><text x="556" y="174" textAnchor="end">{records.at(-1).period}</text>
      <text x="30" y="25" textAnchor="end">{value(high,1)}</text><text x="30" y="153" textAnchor="end">{value(low,1)}</text>
    </svg><figcaption><span>Observed</span><span>Price model</span> · {validation.outcomeLabel}</figcaption></figure>}
    {validation.auditNote&&<p className="pr-note">{validation.auditNote}</p>}
    {!!records.length&&<details><summary>View the historical results table</summary><div className="es-table" role="region" tabIndex={0} aria-label="Historical model evaluation"><table><thead><tr><th>Period</th><th>Observed</th><th>Price model</th><th>Simpler model</th></tr></thead><tbody>{records.map(r=><tr key={r.period}><th scope="row">{r.period}</th><td>{value(r.actual)}</td><td>{value(r.prediction)}</td><td>{value(r.baseline)}</td></tr>)}</tbody></table></div></details>}
  </details>;
}

function Effect({row}) {
  return <><strong className="pr-estimate">{pct(row.estimatePct)}</strong><p>Real GDP level relative to the model’s unchanged-price path</p><p className="pr-range">{pct(row.lowerPct)} to {pct(row.upperPct)} <span>{row.rangeLabel}</span></p></>;
}

export function ProvincialPriceResponse({channel,named,onHorizon}) {
  return <section className="pr-gdp" aria-label="Provincial GDP price response">
    <div className="es-section-heading"><div><h2>What the price history suggests.</h2><p>A conditional relationship with provincial real GDP</p></div><label>Response period<select aria-label="GDP price response period" value={channel.horizonYears} onChange={e=>onHorizon(Number(e.target.value))}><option value="0">Price-change year</option><option value="1">Through the following year</option></select></label></div>
    <p className="pr-scope">This compares an annual benchmark-price change with an unchanged-price path. It does not identify the effect of a particular supply or demand shock, and does not alter the separate GDP forecast.</p>
    {!channel.available&&<button className="es-text-button" data-ec-action="retry-story">Reload published sources</button>}
    <div className="pr-cards">{channel.rows.map(row=><article key={row.region} data-price-region={row.region}>
      <p className="es-eyebrow">{named(row.region)} · {row.benchmark||'No benchmark'}</p>
      {row.status==='supported'?<Effect row={row}/>:<><h3>{row.status==='exploratory'?'This relationship did not pass the historical checks.':'No supported GDP response for this selection.'}</h3><p>{row.reasons.join(' ')}</p>{row.status==='exploratory'&&<details className="pr-exploratory"><summary>Inspect the exploratory estimate</summary><Effect row={row}/><p>This fit failed at least one stability or predictive-performance check. It is not promoted as a supported estimate.</p></details>}</>}
      {row.status==='supported'&&<p className="pr-status">Passed the stated historical screening tests.</p>}
      <HistoricalCheck validation={row.validation}/>
    </article>)}</div>
  </section>;
}

export function HouseholdPriceResponse({channel,named,onBasis}) {
  return <section className="pr-households" aria-label="Household energy spending">
    <div className="es-section-heading"><div><h2>What it means for energy spending.</h2><p>First 12 months · average across all households</p></div></div>
    <div className="pr-basis" role="group" aria-label="Household price basis"><button aria-pressed={channel.basis==='benchmark'} onClick={()=>onBasis('benchmark')}>Commodity-price response</button><button aria-pressed={channel.basis==='retail'} onClick={()=>onBasis('retail')}>Retail-price scenario</button></div>
    <p className="pr-scope">{channel.basis==='retail'?'This separate scenario applies the chosen percentage directly to household retail energy prices. It does not estimate a change in retail prices from wholesale markets.':'The model estimates how retail prices have responded to the named commodity benchmark, then applies that response to observed household spending.'}</p>
    {!channel.available&&<button className="es-text-button" data-ec-action="retry-story">Reload published sources</button>}
    <div className="pr-cards">{channel.rows.map(row=><article key={row.region} data-household-region={row.region}>
      <p className="es-eyebrow">{named(row.region)} · {row.categoryLabel}</p>
      {row.priceBasis&&channel.basis==='benchmark'&&<p className="pr-note">{row.priceBasis}. The changed benchmark level is held for twelve months.</p>}
      {['supported','retail-scenario'].includes(row.status)?<>
        <strong className="pr-estimate">{cash(row.annualChangeCad)}<small> per year</small></strong>
        <p>{cash(row.monthlyEquivalentCad)} monthly equivalent at unchanged consumption.</p>
        <p className="pr-note">A price-only spending equivalent, not a validated annual bill forecast.</p>
        {row.annualCheck&&<p className="pr-note">Annual CPI test error averaged {value(row.annualCheck.mae,1)}%, versus {value(row.annualCheck.baselineMae,1)}% for the simpler model. This does not measure individual bill accuracy.</p>}
        {Number.isFinite(row.lowerAnnualCad)&&<p className="pr-range">{cash(row.lowerAnnualCad)} to {cash(row.upperAnnualCad)} <span>{row.rangeLabel}</span></p>}
        <dl className="pr-household-values"><div><dt>Annual spending reference</dt><dd>${value(row.baselineAnnualCad,0)}</dd></div><div><dt>Retail-price change</dt><dd>{pct(row.retailChangePct)}</dd></div></dl>
        <p className="pr-note">{row.baselineLabel}</p>
        <p className="pr-note">{row.interpretation}</p>
      </>:<><h3>{row.status==='exploratory'?'Commodity prices did not reliably predict these retail costs.':'A commodity-to-bill estimate is unavailable.'}</h3><p>{row.reasons.join(' ')}</p>{Number.isFinite(row.baselineAnnualCad)&&channel.basis==='benchmark'&&<button className="es-text-button" onClick={()=>onBasis('retail')}>Use a retail-price scenario →</button>}</>}
      <HistoricalCheck validation={row.validation}/>
    </article>)}</div>
    <p className="pr-population">The spending reference includes households that spend nothing on this category. It is not a quote for a particular home or a bill for a typical connected customer.</p>
  </section>;
}
