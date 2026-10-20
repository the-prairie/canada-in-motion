import {normalizeEconomyState, summarizeEconomy, validateEconomy} from './economy-model.mjs';
import {project} from './atlas-model.mjs';
import {loadAnalysisStatus, requestChallengeToken} from './ai-client.mjs';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num = (value, digits=1) => Number.isFinite(value) ? new Intl.NumberFormat('en-CA',{maximumFractionDigits:digits}).format(value) : 'Unavailable';
const billions = value => Number.isFinite(value) ? value >= 1000 ? `$${num(value/1000,1)}B` : `$${num(value,0)}M` : 'Unavailable';
const signed = value => !Number.isFinite(value) ? 'Unavailable' : value !== 0 && Math.abs(value) < 0.05 ? `<0.1% ${value < 0 ? 'lower' : 'higher'}` : `${value>0?'+':''}${num(value === 0 ? 0 : value)}%`;
const choices = (rows,value) => rows.map(([id,label])=>`<option value="${esc(id)}" ${id===value?'selected':''}>${esc(label)}</option>`).join('');
const profiles = {
  AB:'Oil and gas production, processing and exports are major sources of income. Households and businesses also pay for fuels and electricity.',
  BC:'Natural gas, LNG, hydroelectricity and fuel use connect producers, utilities, consumers and coastal communities.',
  SK:'Oil production and royalties matter alongside industrial and household energy costs.',
  MB:'Hydroelectricity serves local users and export markets. Hydrology, investment and utility finances affect the benefits.',
  ON:'Electricity generation, refining and energy supply support a large manufacturing and consumer economy.',
  QC:'Hydroelectricity, refining and industrial energy use matter alongside imported oil and gas.',
  NB:'Refining and electricity production create value from both domestic and imported energy inputs.',
  NS:'Electricity imports, local generation and imported fuels affect affordability and the cost of changing the power system.',
  PE:'Wind generation and electricity imports serve local demand. Local generation and the energy people consume have different mixes.',
  NL:'Offshore oil and Labrador hydro contribute through different markets, royalty arrangements and electricity contracts.',
  YT:'Hydro, thermal backup and imported fuels support separate communities and mining activity. Seasonal demand and delivery costs matter.',
  NT:'Hydro and thermal systems serve different communities. Remote fuel delivery, hydrology and subsidies affect local costs.',
  NU:'Community electricity systems and imported fuels make resupply, storage and household affordability central questions.',
  CA:'Energy adds value through production, processing, electricity and transport. The income earned, public revenue collected and costs paid belong to different accounts.',
};

const nameOf = (data,code) => code==='CA'?'Canada':code==='QC'?'Québec':data.regions.find(row=>row.code===code)?.name||code;
const sourceAnchor = source => source && /^https:\/\//.test(source.url) ? `<a href="${esc(source.url)}" target="_blank" rel="noopener">${esc(source.title)}</a>` : '';

export class EnergyEconomy {
  constructor(root,{provinces,onChange,onInventory}) {
    this.root=root;this.onChange=onChange;this.onInventory=onInventory;
    this.state=normalizeEconomyState();this.status={available:false};this.statusLoading=true;this.question='';this.loading=true;
    this.shapes=provinces.features.filter(f=>f.properties.admin==='Canada').map(f=>{
      const polygons=f.geometry.type==='MultiPolygon'?f.geometry.coordinates:[f.geometry.coordinates];
      return {code:f.properties.postal,name:f.properties.name,rings:polygons.flat().map(ring=>ring.map(([lon,lat])=>project(lon,lat)))};
    });
    const points=this.shapes.flatMap(s=>s.rings.flat());
    this.bounds=[Math.min(...points.map(p=>p[0])),Math.min(...points.map(p=>p[1])),Math.max(...points.map(p=>p[0])),Math.max(...points.map(p=>p[1]))];
    root.addEventListener('click',event=>this.click(event));
    root.addEventListener('toggle',event=>{if(event.target.matches('.ec-trade-question'))this.tradeQuestionOpen=event.target.open;},true);
    root.addEventListener('change',event=>{const key=event.target.dataset.econField;if(key)this.change({[key]:event.target.value});});
    root.addEventListener('input',event=>{if(event.target.id==='energy-question')this.question=event.target.value;});
    root.addEventListener('submit',event=>{if(event.target.id==='energy-question-form'){event.preventDefault();void this.ask();}});
    root.addEventListener('keydown',event=>{if(event.target.tagName.toLowerCase()==='path' && event.target.dataset.ecRegion && ['Enter',' '].includes(event.key)){event.preventDefault();this.change({region:event.target.dataset.ecRegion});}});
    void this.load();
    fetch('data/energy-debate.json').then(response=>response.ok?response.json():null).then(context=>{if(context){this.context=context;this.render();}}).catch(()=>{});
    loadAnalysisStatus().then(status=>{this.status=status;}).catch(()=>{}).finally(()=>{this.statusLoading=false;this.render();});
  }
  async load() {
    this.loading=true;this.error=null;this.render();
    try {const response=await fetch('data/economy.json');if(!response.ok)throw Error();this.data=await response.json();validateEconomy(this.data);}
    catch {this.error='Economic data could not load. The well atlas and transport views remain available.';}
    this.loading=false;this.render();
  }
  deactivate() {this.request?.abort();this.request=null;this.busy=false;this.verifying=false;}
  update(state) {const next=normalizeEconomyState(state);if(JSON.stringify(next)!==JSON.stringify(this.state))this.deactivate();this.state=next;this.render();}
  change(patch) {
    this.deactivate();this.aiError=null;
    if(Object.hasOwn(patch,'region'))patch={...patch,tradeRegions:patch.region==='CA'?[]:[patch.region]};
    this.state=normalizeEconomyState({...this.state,...patch});this.onChange(this.state);this.render();
  }
  click(event) {
    const target=event.target.closest('[data-ec-prompt],[data-ec-region],[data-ec-question],[data-ec-action],[data-ec-section],[data-ec-display],[data-ec-metric]');if(!target)return;
    if(target.dataset.ecPrompt){this.question=target.dataset.ecPrompt;this.render();this.root.querySelector('#energy-question')?.focus();return;}
    if(target.dataset.ecRegion){this.change({region:target.dataset.ecRegion});return;}
    for(const field of ['section','display','metric'])if(target.dataset[`ec${field[0].toUpperCase()}${field.slice(1)}`]){this.change({[field]:target.dataset[`ec${field[0].toUpperCase()}${field.slice(1)}`]});return;}
    if(target.dataset.ecQuestion){
      const id=target.dataset.ecQuestion;
      if(id==='alberta')this.change({section:'income',region:'AB'});
      if(id==='prices')this.change({section:'oil'});
      if(id==='electricity')this.change({section:'futures',metric:'retail',region:this.state.region==='CA'?'AB':this.state.region});
      this.root.querySelector('#ec-workspace-title')?.scrollIntoView({behavior:'auto',block:'start'});
      this.root.querySelector('#ec-workspace-title')?.focus({preventScroll:true});
      return;
    }
    const action=target.dataset.ecAction;
    if(action==='retry')void this.load();
    if(action==='inventory')this.onInventory(this.state.region==='CA'?'all':this.state.region);
    if(action==='ask'){const disclosure=this.root.querySelector('.ec-trade-question');if(disclosure){this.tradeQuestionOpen=true;disclosure.open=true;}this.root.querySelector('#ec-ai-title')?.scrollIntoView({behavior:'auto',block:'start'});this.root.querySelector(this.status.available?'#energy-question':'#ec-ai-title')?.focus({preventScroll:true});}
    if(action==='cancel'){this.deactivate();this.aiError=null;this.render();}
    if(action==='ask-again')void this.ask();
    if(action==='download'){
      if(['supply','oil'].includes(this.state.section)&&target.closest('.ec-context-actions')){this.root.querySelector('[data-research-export]')?.click();return;}
      if(this.state.section==='trade'&&target.closest('.ec-context-actions')){this.root.querySelector('#ec-trade-workspace [data-workspace-export]')?.click();return;}
      const payload={dataVersion:this.data.generatedAt,state:this.state,summary:summarizeEconomy(this.data,this.state),analysis:this.answer||null};
      const url=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}));
      const link=document.createElement('a');link.href=url;link.download='canada-energy-analysis.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    }
  }
  async ask() {
    if(!this.status.available||this.busy||!this.question.trim())return;
    this.request?.abort();const request=this.request=new AbortController();
    const {region,scenario,year,oilShock,duration}=this.state;const apiState={region,scenario,year,oilShock,duration};
    if(this.state.section==='trade')this.tradeQuestionOpen=true;
    const submittedQuestion=this.question;this.busy=true;this.verifying=false;this.aiError=null;this.render();
    try {
      const headers={'Content-Type':'application/json'};
      if(this.status.turnstileSiteKey){
        this.verifying=true;
        headers['X-Turnstile-Token']=await requestChallengeToken(this.status.turnstileSiteKey,this.root.querySelector('#ec-verification'),request.signal);
        this.verifying=false;
        const progress=this.root.querySelector('#ec-ai-progress');if(progress)progress.textContent='Checking the available evidence.';
      }
      request.signal.throwIfAborted();
      const response=await fetch(this.status.endpoint||'api/analysis',{method:'POST',credentials:'omit',headers,body:JSON.stringify({question:submittedQuestion,state:apiState}),signal:AbortSignal.any([request.signal,AbortSignal.timeout(80000)])});
      const result=await response.json();if(!response.ok)throw Error(result.error?.message||'Analysis is unavailable.');
      if(this.request!==request)return;
      this.state=normalizeEconomyState({...this.state,...result.state});this.onChange(this.state);this.answer={...result,question:submittedQuestion};this.workspaceSelection=null;this.focusWorkspace=true;
    } catch(error) {if(this.request===request&&error.name!=='AbortError')this.aiError=error.name==='TimeoutError'?'The analysis took too long. Try again.':error.message;}
    finally {if(this.request===request){this.busy=false;this.verifying=false;this.render();}}
  }
  sourceLink(id,label) {
    const source=this.data.sources.find(s=>s.id===id);
    return sourceAnchor(source&&{...source,title:label||source.title});
  }
  map(summary) {
    const [west,,east,north]=this.bounds;const south=this.bounds[1];
    const path=ring=>ring.map(([x,y],i)=>`${i?'L':'M'}${(x-west).toFixed(1)},${(north-y).toFixed(1)}`).join(' ')+'Z';
    return `<svg class="ec-map" viewBox="0 0 ${east-west} ${north-south}" aria-label="Energy share of provincial and territorial GDP, ${summary.gdp.year}" role="group">${this.shapes.map(shape=>{
      const row=summary.gdp.ranking.find(r=>r.code===shape.code);const share=row?.sharePct;
      return `<path id="ec-map-${esc(shape.code)}" d="${shape.rings.map(path).join(' ')}" fill="${Number.isFinite(share)?`hsl(19 43% ${92-Math.min(share,40)*1.2}%)`:'#deded8'}" class="${this.state.region===shape.code?'selected':''}" tabindex="0" role="button" data-ec-region="${esc(shape.code)}" aria-label="${esc(shape.name)}, energy ${num(share)} percent of GDP" aria-pressed="${this.state.region===shape.code}"><title>${esc(shape.name)} · ${num(share)}% of GDP</title></path>`;
    }).join('')}</svg><div class="ec-map-legend"><span>Share of provincial GDP</span><span>0%</span><i aria-hidden="true"></i><span>40%</span></div><p class="ec-caption">Colour shows dependence on energy, not total contribution. Select a province or use the place selector above.</p>`;
  }
  income(summary) {
    const selected=summary.gdp.selected;const region=nameOf(this.data,this.state.region);const rows=summary.gdp.ranking;
    const max=rows[0].energy;const province=this.state.region!=='CA';
    const bars=`<ol class="ec-ranking" aria-label="Provinces and territories ranked by energy-sector GDP">${rows.map((row,index)=>`<li><button id="ec-rank-${row.code}" data-ec-region="${row.code}" aria-pressed="${row.code===this.state.region}"><span class="ec-rank-number">${String(index+1).padStart(2,'0')}</span><span class="ec-rank-name">${esc(nameOf(this.data,row.code))}</span><span class="ec-bar-track" aria-hidden="true"><i style="width:${row.energy/max*100}%"></i></span><strong>${billions(row.energy)}</strong><span class="ec-rank-share">${num(row.sharePct)}% <small>of local GDP</small></span></button></li>`).join('')}</ol>`;
    const table=`<div class="ec-table-wrap"><table><caption>Energy-sector GDP in ${summary.gdp.year}, current Canadian dollars at basic prices.</caption><thead><tr><th scope="col">Province or territory</th><th scope="col">Energy GDP</th><th scope="col">Share of local GDP</th></tr></thead><tbody>${rows.map(row=>`<tr class="${row.code===this.state.region?'selected':''}"><th scope="row"><button id="ec-table-${row.code}" data-ec-region="${row.code}" aria-pressed="${row.code===this.state.region}">${esc(nameOf(this.data,row.code))}</button></th><td>${billions(row.energy)}</td><td>${num(row.sharePct)}%</td></tr>`).join('')}</tbody></table></div>`;
    return `<section aria-labelledby="ec-workspace-title"><div class="ec-answerline"><div><p class="ec-kicker">OBSERVED · ${summary.gdp.year} · CURRENT CANADIAN DOLLARS</p><h1 id="ec-workspace-title" tabindex="-1">${esc(province?region+'’s energy economy':'Canada’s energy economy')}</h1><p class="ec-lead"><strong>${billions(selected.energy)}</strong> in energy-sector value added</p><p class="ec-answer-share"><strong>${num(selected.sharePct)}%</strong> of ${province?esc(region)+'’s economy':'combined provincial and territorial GDP'}${province?` <span>· ${num(selected.nationalEnergySharePct)}% of Canada’s energy-sector GDP</span>`:''}</p></div><div class="ec-answer-context"><p>${esc(profiles[this.state.region])}</p><details><summary>What does this measure?</summary><p>GDP measures value added after intermediate inputs. Sales, exports, royalties and wages cannot be added to this figure. The location of production does not identify who ultimately receives the income.</p><p>Canada totals sum the 13 jurisdictions. ${summary.gdp.year} is the latest common current-price observation in this release.</p>${this.sourceLink(summary.gdp.sourceId,'Statistics Canada data')}</details></div></div>
      <div class="ec-chart-toolbar"><div><h2>Where energy adds value</h2><p class="ec-caption">Compare the size of the sector and its share of each economy.</p></div><div class="ec-segmented" aria-label="GDP comparison view">${[['bars','Ranking'],['map','Map'],['table','Table']].map(([id,label])=>`<button id="ec-display-${id}" data-ec-display="${id}" aria-pressed="${this.state.display===id}">${label}</button>`).join('')}</div></div>
      <div class="ec-income-chart">${this.state.display==='map'?this.map(summary):this.state.display==='table'?table:bars}</div>
      <div class="ec-source-row"><span>${summary.gdp.year} observation · value added at basic prices</span>${this.sourceLink(summary.gdp.sourceId,'Source and definition')}<button class="text-link" data-ec-action="inventory">Well records for ${esc(region)}</button></div>
      <div class="ec-next"><button data-ec-question="prices">What changes when oil prices rise? <span aria-hidden="true">→</span></button><button data-ec-question="electricity">Compare future electricity prices <span aria-hidden="true">→</span></button></div>
    </section>`;
  }
  trend(metric) {
    const definition=this.data.metrics.find(m=>m.id===metric.id);const region=metric.kind==='benchmark'?'CA':this.state.region;
    const baseline=definition.series.find(s=>s.region===region&&s.scenario==='Current Measures');
    const alternative=definition.series.find(s=>s.region===region&&s.scenario===this.state.scenario);
    if(!baseline||!alternative)return '<p class="ec-missing">No published series for this jurisdiction.</p>';
    const values=[...baseline.values,...alternative.values].filter(Number.isFinite);if(!values.length)return '<p class="ec-missing">No published values for this jurisdiction.</p>';
    const low=Math.min(...values),high=Math.max(...values);const span=high-low||Math.max(high*.1,1);const bottom=low-span*.1;const top=high+span*.1;
    const x=i=>48+i/(this.data.years.length-1)*260;const y=value=>88-(value-bottom)/(top-bottom)*70;
    const path=series=>{let gap=true;return series.values.map((value,i)=>{if(value===null){gap=true;return '';}const mark=`${gap?'M':'L'}${x(i).toFixed(1)},${y(value).toFixed(1)}`;gap=false;return mark;}).join(' ');};
    const index=this.data.years.indexOf(this.state.year);const selected=alternative.values[index];
    const historicalEnd=x(Math.max(0,this.data.years.indexOf(definition.historicalThrough))+.5);
    return `<svg class="ec-trend" viewBox="0 0 320 115" role="img" aria-label="${esc(metric.label)} annual published series, ${this.data.years[0]} to ${this.data.years.at(-1)}. Observed through ${definition.historicalThrough}, then projected. Selected year ${this.state.year}: ${num(selected)} ${esc(metric.unit)}."><rect x="48" y="8" width="${historicalEnd-48}" height="80" fill="#e4e8e3"/><line class="ec-trend-grid" x1="48" x2="308" y1="${y(high)}" y2="${y(high)}"/><line class="ec-trend-grid" x1="48" x2="308" y1="${y(low)}" y2="${y(low)}"/><text x="42" y="${y(high)+3}" text-anchor="end">${num(high,high>=100?0:1)}</text>${high!==low?`<text x="42" y="${y(low)+3}" text-anchor="end">${num(low,low>=100?0:1)}</text>`:''}<path class="ec-trend-base" d="${path(baseline)}"/><path class="ec-trend-case" d="${path(alternative)}"/><line class="ec-trend-year" x1="${x(index)}" x2="${x(index)}" y1="8" y2="88"/>${Number.isFinite(selected)?`<circle cx="${x(index)}" cy="${y(selected)}" r="3.5"/>`:''}<text x="48" y="109">${this.data.years[0]}</text><text x="308" y="109" text-anchor="end">${this.data.years.at(-1)}</text></svg><p class="ec-caption">Observed through ${definition.historicalThrough}; projected from ${definition.historicalThrough+1}.</p>`;
  }
  metricCard(metric) {
    const units={'oil-production':'thousand barrels/day','gas-production':'billion cubic feet/day','electricity-generation':'GWh/year','end-use-demand':'PJ/year'};
    const digits=['electricity-generation','end-use-demand','oil-production'].includes(metric.id)?0:2;
    return `<article class="ec-metric"><p class="ec-kicker">${metric.status === "observed" ? "OBSERVED" : metric.status === "projected" ? "PROJECTED" : "UNAVAILABLE"} · ${metric.year}</p><h3>${esc(metric.label)}</h3><div class="ec-metric-value">${num(metric.selected,digits)} <small>${esc(units[metric.id]||metric.unit)}</small></div><p class="ec-metric-change">${metric.selected===null?'Not published for this jurisdiction':metric.status==='observed'?'Historical value in the published series':this.state.scenario==='Current Measures'?'Current Measures baseline':`${signed(metric.deltaPct)} versus Current Measures`}</p>${this.trend(metric)}<details><summary>Values and source</summary><p>${this.state.year} baseline: ${num(metric.baseline,digits)} ${esc(metric.unit)}.</p><p>${this.state.year} ${esc(this.state.scenario)}: ${num(metric.selected,digits)} ${esc(metric.unit)}.</p><p>Each chart uses its own vertical scale. The dotted line is Current Measures. The solid line is the selected case.</p><div class="ec-links">${metric.sourceIds.map(id=>this.sourceLink(id)).join('')}</div></details></article>`;
  }
  retail() {
    const definition=this.data.metrics.find(m=>m.id==='electricity-price');const index=this.data.years.indexOf(this.state.year);
    const rows=this.data.regions.filter(r=>r.code!=='CA').map(region=>({code:region.code,name:nameOf(this.data,region.code),value:definition.series.find(s=>s.region===region.code&&s.scenario===this.state.scenario)?.values[index]??null}));
    const range=Math.max(20,...rows.filter(row=>row.value!==null).map(row=>Math.abs(row.value-100)));
    return `<div class="ec-retail-intro"><h2>Residential electricity prices</h2><p class="ec-kicker">${this.state.year<=definition.historicalThrough?"HISTORICAL PRICE BASIS":"PROJECTED"} · ${this.state.year}</p><p>Change from each province’s own Current Measures case in ${this.state.year}. These indices compare scenarios, not electricity bills or price levels between provinces.</p><p class="ec-caption">Current Measures = 100. An index of 110 means 10% above that province’s baseline.</p></div><div class="ec-retail-axis"><span>Lower</span><span>100</span><span>Higher</span></div><ol class="ec-retail-list" aria-label="Residential electricity price indices">${rows.map(row=>`<li><button id="ec-retail-${row.code}" data-ec-region="${row.code}" aria-pressed="${row.code===this.state.region}"><span>${esc(row.name)}</span><span class="ec-diverging" aria-hidden="true">${row.value!==null?`<i style="left:${row.value<100?50-(100-row.value)/range*48:50}%;width:${Math.abs(row.value-100)/range*48}%"></i><b style="left:${50+(row.value-100)/range*48}%"></b>`:''}</span><strong>${row.value===null?'No data':num(row.value)}</strong></button></li>`).join('')}</ol><div class="ec-source-row"><span>Residential price index · ${this.state.year} · ${esc(this.state.scenario)}</span>${this.sourceLink(definition.sourceId,'CER source data')}</div>`;
  }
  futures(summary) {
    const metrics=summary.metrics.filter(m=>['wti','henry-hub','oil-production','gas-production','electricity-generation','end-use-demand'].includes(m.id));
    const statuses=this.state.metric==='retail'?new Set([this.state.year<=this.data.metrics.find(m=>m.id==='electricity-price').historicalThrough?'observed':'projected']):new Set(metrics.filter(m=>m.status!=='unavailable').map(m=>m.status));
    const period=statuses.size===1&&statuses.has('observed')?'HISTORICAL OBSERVATIONS':statuses.has('observed')?'OBSERVED & PROJECTED SERIES':'CONDITIONAL PROJECTIONS';
    const historical=period==='HISTORICAL OBSERVATIONS';
    const leadMetric=summary.metrics.find(metric=>metric.id===(this.state.metric==='retail'?'electricity-price':'electricity-generation'));
    const leadValue=this.state.metric==='retail' ? leadMetric.selected===null ? '13 jurisdictions compared below' : `${num(leadMetric.selected)} · residential electricity price index` : `${num(leadMetric.selected,0)} GWh/year · electricity generation`;
    return `<section aria-labelledby="ec-workspace-title"><div class="ec-answerline ec-answerline-compact"><div><p class="ec-kicker">CER ENERGY FUTURES 2026 · ${period}</p><h1 id="ec-workspace-title" tabindex="-1">${esc(nameOf(this.data,this.state.region))} in ${this.state.year}</h1><p class="ec-future-answer">${esc(leadValue)}</p><p class="ec-lead-text">${historical?'Historical reference year':this.state.scenario==='Current Measures'?'Current Measures baseline':`${esc(this.state.scenario)} compared with Current Measures`}</p></div><p>${historical?"This selected year is historical. Scenario assumptions apply to the projected portions of the series, not to these observations.":this.scenarioText()}</p></div><div class="ec-future-controls"><label>Scenario<select id="ec-scenario" data-econ-field="scenario">${choices(this.data.scenarios.map(s=>[s,s]),this.state.scenario)}</select></label><label>Year<select id="ec-year" data-econ-field="year">${choices(this.data.years.map(y=>[String(y),String(y)]),String(this.state.year))}</select></label><div class="ec-segmented" aria-label="Energy future measures">${[['production','Energy & prices'],['retail','Electricity prices']].map(([id,label])=>`<button id="ec-metric-${id}" data-ec-metric="${id}" aria-pressed="${this.state.metric===id}">${label}</button>`).join('')}</div></div><p class="ec-model-note">These cases change economic growth, technology and energy assumptions together. Their differences are not isolated price effects.</p>${this.state.metric==='retail'?this.retail():`<div class="ec-line-key"><span><i></i>${esc(this.state.scenario)}</span><span><i></i>Current Measures</span><span>Annual series · independent chart scales</span></div><h2 class="ec-metric-group-title">International benchmark prices</h2><div class="ec-metrics ec-metrics-benchmarks">${metrics.filter(metric=>metric.kind==='benchmark').map(metric=>this.metricCard(metric)).join('')}</div><h2 class="ec-metric-group-title">${esc(nameOf(this.data,this.state.region))} · production and use</h2><div class="ec-metrics">${metrics.filter(metric=>metric.kind!=='benchmark').map(metric=>this.metricCard(metric)).join('')}</div>`}</section>`;
  }
  oil() {
    const sensitivity=summarizeEconomy(this.data,{...this.state,region:'CA'}).publishedOilSensitivity;
    return `<section aria-labelledby="ec-workspace-title"><div class="ec-answerline ec-answerline-compact"><div><p class="ec-kicker">NATIONAL PRICE EXPERIMENT · FINANCE CANADA MODEL</p><h1 id="ec-workspace-title" tabindex="-1">Oil prices and Canada’s economy</h1><p class="ec-lead-text">${signed(this.state.oilShock)} WTI price change, ${this.state.duration==='persistent'?'persistent':'lasting two quarters'}.</p></div><p>This calculation estimates national effects in the first two years after a price change. Provincial GDP responses have not been calibrated.</p></div><div class="ec-future-controls"><label>WTI price change<select id="ec-oil" data-econ-field="oilShock">${choices([-20,-10,0,10,20].map(v=>[String(v),signed(v)]),String(this.state.oilShock))}</select></label><label>Duration<select id="ec-duration" data-econ-field="duration">${choices([['persistent','Persistent'],['temporary','Two quarters']],this.state.duration)}</select></label><p class="ec-caption">${esc(sensitivity.method)}.</p></div><div class="ec-oil-results">${sensitivity.years.map(year=>`<article><p class="ec-kicker">YEAR ${year.yearAfterShock} AFTER THE SHOCK</p><strong>${signed(year.nominalGdpPct)}</strong><h2>Nominal GDP level</h2><p class="ec-real"><b>${signed(year.realGdpPct)}</b> real GDP level</p><p class="ec-caption">Nominal GDP includes price effects. Real GDP measures output after price adjustment.</p></article>`).join('')}</div><div class="ec-channels"><article><h3>Producers and public revenue</h3><p>Realized prices affect producer income and government receipts. Costs, the exchange rate and the cause of the shock affect the result.</p></article><article><h3>Households and businesses</h3><p>A price change affects both fuel buyers’ costs and producers’ receipts. National GDP does not describe the distribution of these gains and costs.</p></article></div><details class="ec-evidence"><summary>Model, assumptions and limits</summary><ul>${sensitivity.limitations.map(text=>`<li>${esc(text)}</li>`).join('')}</ul><p>Changes other than the published +10% case use a local linear approximation, limited to ±20%.</p><div class="ec-links">${sensitivity.sourceIds.map(id=>this.sourceLink(id)).join('')}</div></details></section>`;
  }
  debate() {
    if(!this.context?.facts?.length)return '';
    const labels={equalization:'Federal transfers',trade:'Trade and transportation', 'oil-shock':'Producer income and fuel costs','rights-positions':'Indigenous ownership and rights',labour:'Workers and investment',producer:'Producer priorities',climate:'Emissions and climate','lng-risk':'LNG market risk',electricity:'Electricity supply and reliability',households:'Household affordability'};
    return `<details class="ec-debate"><summary>Who benefits and who pays?</summary><p>Economic totals do not settle how income, costs and risks are shared. These sources address different parts of the debate.</p><p class="ec-caption">Research reviewed ${esc(this.context.reviewDate)}. Stakeholder statements describe the named organization’s position. This selection is not a complete account of every community or project.</p><div class="ec-debate-grid">${this.context.facts.map(fact=>`<article><h3>${esc(labels[fact.id]||fact.id)}</h3><p>${esc(fact.text)}</p><div class="ec-links">${fact.sourceIds.map(id=>sourceAnchor(this.context.sources.find(source=>source.id===id))).join('')}</div></article>`).join('')}</div></details>`;
  }
  analyst() {
    return `<section class="ec-intelligence" aria-labelledby="ec-ai-title"><div class="ec-ai-heading"><div><p class="ec-kicker">ASK ABOUT THE EVIDENCE</p><h2 id="ec-ai-title" tabindex="-1">Ask about Canada’s energy economy</h2></div><span class="ec-ai-status">${this.aiError?'Analysis unavailable':this.busy?'Working…':this.answer?'Answer ready':this.status.available?'Ready for a question':this.statusLoading?'Checking connection…':'Analysis offline'}</span></div><div class="ec-question-presets">${[['Provincial contributions','Compare energy GDP in Alberta, Ontario and Québec. Include a map.'],['Electricity in 2040','Compare electricity generation in Alberta, Ontario and Québec in the Higher scenario in 2040.'],['Energy trade','Show the value of oil traded between Alberta and British Columbia.'],['Provincial price effects','If oil prices rise 10%, compare trade exposure and published budget sensitivities in Alberta and Saskatchewan.']].map(([label,question])=>`<button data-ec-prompt="${esc(question)}">${label}</button>`).join('')}</div><form id="energy-question-form"><label for="energy-question">Your question</label><div class="ec-ask"><textarea id="energy-question" maxlength="1200" rows="2" placeholder="If oil prices fall, what changes for Alberta and Canada?" ${!this.status.available?'disabled':''}>${esc(this.question)}</textarea><button class="primary-button" type="submit" ${!this.status.available||this.busy?'disabled':''}>${this.busy?'Analysing…':'Analyse'}</button>${this.busy?'<button class="secondary-button" type="button" data-ec-action="cancel">Cancel</button>':''}</div></form><details class="ec-question-info"><summary>Privacy & usage</summary><p class="ec-caption">${this.status.available?`Your question and selected public data are sent to ${this.status.provider==='cloudflare'?'Cloudflare Workers AI':'OpenAI'}${this.status.jevEnabled?' and TypeSafe (Jev)':''}. Do not include personal information.`:this.statusLoading?'Checking the analysis service.':'Live AI is not connected here. The observed data, official scenarios and oil-price calculation work without it.'}</p>${this.status.turnstileSiteKey?'<p class="ec-caption">Up to three questions per network each day. Cloudflare checks for automated requests. We store temporary usage counts, not your questions or answers.</p>':''}</details><div id="ec-ai-progress" role="status" aria-live="polite">${this.busy?`${this.status.turnstileSiteKey?'Complete the security check to send your question.':'Checking the available evidence.'}${this.answer?' Your previous answer remains below.':''}`:''}</div>${this.busy?'<div id="ec-verification"></div>':''}${this.aiError?`<div class="ec-analysis-error" role="alert"><p>${esc(this.aiError)}</p><button data-ec-action="ask-again">Try again</button></div>`:''}${this.answer?.workspace?'<div id="ec-dynamic-workspace" class="ec-workspace-host"><p class="ec-workspace-load" role="status">Loading the maps and comparisons…</p></div>':''}${this.renderAnswer()}</section>`;
  }
  renderAnswer() {
    if(!this.answer?.analysis)return '';
    const analysis=this.answer.analysis;const sources=[...(analysis.sources||[]),...(this.answer.summary?.sources||[])];
    const renderBlock=block=>`<div class="ec-answer-block"><p>${esc(block.text)}</p><div class="ec-links">${[...new Set(block.sourceIds||[])].map(id=>sourceAnchor(sources.find(source=>source.id===id))).join('')}</div></div>`;
    const blocks=analysis.blocks||[];const extra=blocks.slice(2);const limitations=analysis.limitations||[];
    return `<article class="ec-answer"><p class="ec-kicker">COMPLETED ANALYSIS</p><p class="ec-answer-question">${esc(this.answer.question||'')}</p><h3>${esc(analysis.headline)}</h3>${blocks.slice(0,2).map(renderBlock).join('')}${extra.length?`<details><summary>Read the supporting analysis</summary>${extra.map(renderBlock).join('')}</details>`:''}${limitations.length?`<details><summary>Assumptions and limits (${limitations.length})</summary><ul>${limitations.map(text=>`<li>${esc(text)}</li>`).join('')}</ul></details>`:''}<p class="ec-caption">${this.answer.answerMode==='source-backed-findings'?'AI selected these published findings; figures and citations come from the app’s data. ':''}These written findings use the original question and inputs. The interactive charts update separately when you change their controls.</p><button class="text-link" data-ec-action="download">Download answer, calculations and sources</button></article>`;
  }
  render() {
    if(this.verifying&&this.busy)return;
    if(this.loading||!this.data){this.root.innerHTML=`<div class="ec-loading"><h1>${this.error?'Economic data unavailable':'Loading the energy account'}</h1><p role="status">${esc(this.error||'Reading provincial GDP and official energy scenarios.')}</p>${this.error?'<button data-ec-action="retry" class="primary-button">Retry</button>':''}</div>`;return;}
    const previousHost=this.workspaceAnswer===this.answer?this.root.querySelector('#ec-dynamic-workspace'):null;
    if(!previousHost){this.workspaceMount?.unmount();this.workspaceMount=null;}
    const tradeKey=JSON.stringify([this.state.tradeCommodity,this.state.tradeYear,this.state.priceShock,this.state.linkScope,this.state.tradeRegions,this.state.transferSet]);
    const previousTrade=this.state.section==='trade'&&this.tradeMountKey===tradeKey?this.root.querySelector('#ec-trade-workspace'):null;
    if(!previousTrade){this.tradeMount?.unmount();this.tradeMount=null;}
    const previousResearch={};
    for(const [kind,section,id] of [['income','supply','#ec-income-paths'],['history','oil','#ec-oil-history']]){
      const host=this.state.section===section&&this[`${kind}MountKey`]===this.researchKey(kind)?this.root.querySelector(id):null;
      if(host)previousResearch[kind]=host;else{this[`${kind}Mount`]?.unmount();this[`${kind}Mount`]=null;}
    }
    const activeElement=this.root.contains(document.activeElement)?document.activeElement:null;
    const activeId=activeElement?.id;
    const start=activeId==='energy-question'?document.activeElement.selectionStart:null;
    const summary=summarizeEconomy(this.data,this.state);
    const isResearch=['trade','supply','oil'].includes(this.state.section);
    this.root.innerHTML=`<div class="ec-context"><label>Place<select id="ec-region" data-econ-field="region">${choices([['CA','Canada'],...this.data.regions.filter(r=>r.code!=='CA').map(r=>[r.code,nameOf(this.data,r.code)])],this.state.region)}</select></label><nav aria-label="Energy economy accounts">${[['income','Income'],['trade','Trade & prices'],['supply','Follow the dollar'],['futures','Energy futures'],['oil','Oil & the economy']].map(([id,label])=>`<button id="ec-section-${id}" data-ec-section="${id}" aria-current="${this.state.section===id?'page':'false'}">${label}</button>`).join('')}</nav><div class="ec-context-actions"><button data-ec-action="ask">${this.status.available?"Ask a question":"Live analysis status"}</button><button data-ec-action="download" aria-label="Download selected economic data and analysis">Download</button></div></div>
    ${isResearch?'':this.analyst()}${this.answer?.workspace&&!isResearch?'<details class="ec-authored-data"><summary>Browse the original data views</summary>':''}<div class="ec-workspace">${this.state.section==='trade'?'<div id="ec-trade-workspace"><p role="status">Loading energy trade and price effects…</p></div>':this.state.section==='futures'?this.futures(summary):this.state.section==='oil'?this.oil()+'<div id="ec-oil-history"><p role="status">Loading historical oil and GDP paths…</p></div>':this.state.section==='supply'?'<div id="ec-income-paths"><p role="status">Loading supply-chain effects…</p></div>':this.income(summary)}</div>${isResearch?`<details class="ec-trade-question" ${this.tradeQuestionOpen||this.busy?'open':''}><summary>Ask a question about this data</summary>${this.analyst()}</details>`:''}${this.debate()}${this.answer?.workspace&&!isResearch?'</details>':''}<details class="ec-methods"><summary>Data coverage and methods</summary><ul>${summary.limitations.map(text=>`<li>${esc(text)}</li>`).join('')}</ul><p>Retrieved ${esc(this.data.generatedAt?.slice(0,10))}. Economic series are separate from well inventories. Trade & prices includes modelled bilateral trade value, provincial physical energy balances and explicit price sensitivities. Causal provincial GDP and employment forecasts, bilateral physical shipments and household income distribution remain incomplete.</p><div class="ec-links">${this.data.sources.map(source=>this.sourceLink(source.id)).join('')}</div></details>`;
    for(const [kind,id] of [['income','#ec-income-paths'],['history','#ec-oil-history']]){const host=this.root.querySelector(id);if(host&&previousResearch[kind])host.replaceWith(previousResearch[kind]);else if(host)void this.mountResearchView(host,kind);}
    const tradeHost=this.root.querySelector('#ec-trade-workspace');
    if(tradeHost&&previousTrade)tradeHost.replaceWith(previousTrade);else if(tradeHost)void this.mountTrade(tradeHost,tradeKey);
    const workspaceHost=this.root.querySelector('#ec-dynamic-workspace');
    if(workspaceHost&&previousHost){workspaceHost.replaceWith(previousHost);}else if(workspaceHost){void this.mountDynamicWorkspace(workspaceHost);}
    if(activeElement?.isConnected)activeElement.focus({preventScroll:true});
    else if(activeId){const node=this.root.querySelector(`#${CSS.escape(activeId)}`);node?.focus({preventScroll:true});if(start!==null)node?.setSelectionRange?.(start,start);}
  }
  researchKey(kind) {
    const s=this.state;return JSON.stringify(kind==='income'?[s.region,s.incomeIndustry,s.incomeYear,s.demandMillion,s.includeInduced]:[s.historyRegions,s.historyOilChange,s.historyHorizon,s.historyYear]);
  }
  async mountResearchView(host,kind) {
    this[`${kind}MountKey`]=this.researchKey(kind);
    try {
      const module=await import('./vendor/energy-workspace.js');
      const file=kind==='income'?'income-paths':'dynamic-price-history';
      const response=await fetch(`data/${file}.json`);if(!response.ok)throw Error();const data=await response.json();
      if(!host.isConnected)return;
      host.replaceChildren();
      this[`${kind}Mount`]=module[kind==='income'?'mountIncomePaths':'mountDynamicPrices'](host,{data,initial:this.state,onChange:selection=>{
        this.state=normalizeEconomyState({...this.state,...(kind==='income'?{region:selection.region,incomeIndustry:selection.industry,incomeYear:selection.year,demandMillion:selection.demandMillion,includeInduced:selection.includeInduced}:{historyRegions:selection.regions,historyOilChange:selection.oilChangePct,historyHorizon:selection.horizonYears,historyYear:selection.selectedYear??null})});this[`${kind}MountKey`]=this.researchKey(kind);const place=this.root.querySelector('#ec-region');if(place)place.value=this.state.region;this.onChange(this.state);
      }});
    }catch{if(host.isConnected)host.innerHTML='<p role="alert">This dataset could not load. Reload to try again.</p>';}
  }
  async mountTrade(host,key) {
    this.tradeMountKey=key;
    try {
      const [{mountTradeExplorer},flows,fiscal]=await Promise.all([
        import('./vendor/energy-workspace.js'),
        this.flows?Promise.resolve(this.flows):fetch('data/energy-flows.json').then(r=>{if(!r.ok)throw Error();return r.json();}),
        this.fiscal?Promise.resolve(this.fiscal):fetch('data/provincial-impacts.json').then(r=>{if(!r.ok)throw Error();return r.json();})
      ]);
      if(!host.isConnected||this.tradeMountKey!==key)return;
      this.flows=flows;this.fiscal=fiscal;host.replaceChildren();
      const selection={...this.state,tradeYear:flows.trade.years.includes(this.state.tradeYear)?this.state.tradeYear:flows.trade.latestYear};
      this.tradeMount=mountTradeExplorer(host,{economy:this.data,flows,fiscal,shapes:this.shapes,selection,regions:this.state.tradeRegions,onState:next=>{
        this.state=normalizeEconomyState({...this.state,tradeCommodity:next.tradeCommodity,tradeYear:next.tradeYear,priceShock:next.priceShock,linkScope:next.linkScope,tradeRegions:next.regions,transferSet:next.transferSet});
        this.tradeMountKey=JSON.stringify([this.state.tradeCommodity,this.state.tradeYear,this.state.priceShock,this.state.linkScope,this.state.tradeRegions,this.state.transferSet]);
        this.onChange(this.state);
      }});
    }catch{if(host.isConnected)host.innerHTML='<p role="alert">Trade data could not load. Reload to try again. The other economic views remain available.</p>';}
  }
  async mountDynamicWorkspace(host) {
    const answer=this.answer;this.workspaceAnswer=answer;
    try {
      const {mountWorkspace}=await import('./vendor/energy-workspace.js');
      const network=answer.workspace.networkSnapshot||null;
      if(this.answer!==answer||!host.isConnected)return;
      this.network=network;host.replaceChildren();
      this.workspaceMount=mountWorkspace(host,{workspace:answer.workspace,economy:this.data,network,shapes:this.shapes,question:answer.question,saved:this.workspaceSelection,onState:selection=>{this.workspaceSelection=selection;},onRestore:value=>{this.answer={...this.answer,workspace:value.workspace,question:value.title,analysis:null};this.workspaceAnswer=this.answer;this.root.querySelector('.ec-answer')?.remove();},onReady:()=>{if(this.focusWorkspace&&this.answer===answer){this.focusWorkspace=false;host.querySelector('#hw-heading')?.focus({preventScroll:true});host.scrollIntoView({block:'start',behavior:'auto'});}}});
    } catch {if(host.isConnected)host.innerHTML='<p class="ec-analysis-error" role="alert">The interactive views could not load. The written findings and original data views remain available. Reload the page to try again.</p>';}
  }
  scenarioText() {
    return {'Current Measures':'Current Measures is the comparison baseline. It is one conditional future, not a prediction of the most likely outcome.','Higher':'Stronger economic growth, higher oil and gas prices, greater LNG exports and more data-centre electricity demand.','Lower':'Weaker economic growth, lower oil and gas prices, fewer LNG exports and less data-centre electricity demand.','Canada Net-zero':'A pathway to net-zero emissions in Canada with stronger global climate action. Technology, energy demand and fuel prices change together.'}[this.state.scenario];
  }
}
