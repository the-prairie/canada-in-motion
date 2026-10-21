import {normalizeEconomyState, summarizeEconomy, validateEconomy} from './economy-model.mjs';
import {project} from './atlas-model.mjs';
import {loadAnalysisStatus, requestChallengeToken, analysisFailure, readAnalysisCooldown, saveAnalysisCooldown, analysisLimitMessage} from './ai-client.mjs';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num = (value, digits=1) => Number.isFinite(value) ? new Intl.NumberFormat('en-CA',{maximumFractionDigits:digits}).format(value) : 'Unavailable';
const metricDigits = id => ['electricity-generation','end-use-demand','oil-production'].includes(id) ? 0 : 2;
const billions = value => Number.isFinite(value) ? value >= 1000 ? `$${num(value/1000,1)}B` : `$${num(value,0)}M` : 'Unavailable';
const signed = value => !Number.isFinite(value) ? 'Unavailable' : value !== 0 && Math.abs(value) < 0.05 ? `<0.1% ${value < 0 ? 'lower' : 'higher'}` : `${value>0?'+':''}${num(value === 0 ? 0 : value)}%`;
const choices = (rows,value) => rows.map(([id,label])=>`<option value="${esc(id)}" ${id===value?'selected':''}>${esc(label)}</option>`).join('');
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
    root.addEventListener('cancel',event=>{if(event.target.matches('.ec-composer'))this.tradeQuestionOpen=false;if(event.target.matches('dialog.ec-evidence')){event.preventDefault();event.target.close();this.root.querySelector('[data-ec-action=sources]')?.focus({preventScroll:true});}},true);
    root.addEventListener('change',event=>{const key=event.target.dataset.econField;if(key==='futureMeasure')this.change(event.target.value==='electricity-price'?{metric:'retail'}:{metric:'production',futureIndicator:event.target.value});else if(key)this.change({[key]:event.target.value});});
    window.addEventListener('resize',()=>{clearTimeout(this.resizeTimer);this.resizeTimer=setTimeout(()=>{if(this.state.section==='futures')this.render();},100);});
    root.addEventListener('input',event=>{if(event.target.id==='energy-question')this.question=event.target.value;});
    root.addEventListener('submit',event=>{if(event.target.id==='energy-question-form'){event.preventDefault();void this.ask();}});
    root.addEventListener('keydown',event=>{if(event.target.tagName.toLowerCase()==='path' && event.target.dataset.ecRegion && ['Enter',' '].includes(event.key)){event.preventDefault();this.change({region:event.target.dataset.ecRegion});}});
    try{this.aiLimit=readAnalysisCooldown(globalThis.sessionStorage);}catch{}
    this.scheduleLimitReset();
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
  deactivate() {this.request?.abort();this.request=null;this.busy=false;this.verifying=false;this.localLoading=false;}
  update(state) {const next=normalizeEconomyState(state);if(next.section!==this.state.section)this.evidenceView='sources';if(JSON.stringify(next)!==JSON.stringify(this.state))this.deactivate();this.state=next;this.render();}
  change(patch) {
    this.deactivate();this.aiError=null;
    if(Object.hasOwn(patch,'section')){this.answerVisible=false;this.evidenceView='sources';}
    if(Object.hasOwn(patch,'region'))patch={tradeRegions:patch.region==='CA'?[]:[patch.region],forecastRegions:patch.region==='CA'?[]:[patch.region],...patch};
    this.state=normalizeEconomyState({...this.state,...patch});this.onChange(this.state);this.render();
  }
  click(event) {
    const target=event.target.closest('[data-ec-local],[data-ec-prompt],[data-ec-region],[data-ec-question],[data-ec-action],[data-ec-section],[data-ec-display],[data-ec-metric]');if(!target)return;
    if(target.dataset.ecLocal){void this.openComparison(target.dataset.ecLocal);return;}
    if(target.dataset.ecPrompt){this.tradeQuestionOpen=true;this.question=target.dataset.ecPrompt;this.render();this.root.querySelector('#energy-question')?.focus();return;}
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
    if(action==='retry-story'){const host=this.root.querySelector('#ec-energy-story');if(host){this.storyMount?.unmount();this.storyMount=null;host.innerHTML='<p role="status">Loading the investigation…</p>';void this.mountStory(host);}}
    if(action==='retry-research'){const kind=target.dataset.researchKind,host=this.root.querySelector(({income:'#ec-income-paths',history:'#ec-oil-history',forecast:'#ec-provincial-forecast'})[kind]);if(host){host.innerHTML='<p role="status">Loading data…</p>';void this.mountResearchView(host,kind);}}
    if(action==='inventory')this.onInventory(this.state.region==='CA'?'all':this.state.region);
    if(action==='ask'){this.tradeQuestionOpen=true;this.root.querySelector('.ec-composer')?.showModal();this.root.querySelector(this.status.available?'#energy-question':'#ec-ai-title')?.focus({preventScroll:true});}
    if(action==='close-ask'){this.tradeQuestionOpen=false;this.root.querySelector('.ec-composer')?.close();this.root.querySelector('[data-ec-action=ask]')?.focus({preventScroll:true});}
    if(action==='sources'){this.root.querySelector('dialog.ec-evidence')?.showModal();if(this.evidenceView==='monthly')void this.mountMonthlyEvidence();}
    if(action==='evidence-tab'){this.evidenceView=target.dataset.evidenceView;this.render();if(this.evidenceView==='monthly')void this.mountMonthlyEvidence();}
    if(action==='retry-monthly-evidence'){this.root.querySelector('#ec-monthly-evidence')?.replaceChildren();void this.mountMonthlyEvidence();}
    if(action==='oil-view')this.change({oilView:target.dataset.oilView});
    if(action==='close-sources'){this.root.querySelector('dialog.ec-evidence')?.close();this.root.querySelector('[data-ec-action=sources]')?.focus({preventScroll:true});}
    if(action==='cancel'){this.deactivate();this.aiError=null;this.render();}
    if(action==='ask-again')void this.ask();
    if(action==='show-answer'){this.answerVisible=true;this.render();}
    if(action==='browse-data'){this.answerVisible=false;this.render();}
    if(action==='download'){
      if(this.state.section==='explore'&&target.closest('.ec-context-actions')){this.root.querySelector('[data-story-export]')?.click();return;}
      if(['supply','outlook'].includes(this.state.section)&&target.closest('.ec-context-actions')){this.root.querySelector('[data-research-export]')?.click();return;}
      if(this.state.section==='trade'&&target.closest('.ec-context-actions')){this.root.querySelector('#ec-trade-workspace [data-workspace-export]')?.click();return;}
      const calculationState=this.state.section==='oil'?{...this.state,region:'CA'}:this.state;
      const payload={dataVersion:this.data.generatedAt,state:calculationState,summary:summarizeEconomy(this.data,calculationState),sourceSnapshot:this.data,analysis:this.answer||null};
      const url=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}));
      const link=document.createElement('a');link.href=url;link.download='canada-energy-analysis.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    }
  }
  async ask() {
    if(!this.status.available||this.busy||!this.question.trim()||this.activeLimit())return;
    this.request?.abort();const request=this.request=new AbortController();
    const {region,scenario,year,oilShock,duration}=this.state;const apiState={region,scenario,year,oilShock,duration};
    if(this.state.section==='trade')this.tradeQuestionOpen=true;
    const submittedQuestion=this.question;this.busy=true;this.verifying=false;this.localLoading=false;this.localErrorId=null;this.aiError=null;this.render();
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
      const result=await response.json();if(!response.ok)throw analysisFailure(response,result);
      if(this.request!==request)return;
      this.state=normalizeEconomyState({...this.state,...result.state});this.onChange(this.state);this.answer={...result,question:submittedQuestion};this.answerVisible=true;this.tradeQuestionOpen=false;this.workspaceSelection=null;this.focusWorkspace=true;
    } catch(error) {if(this.request===request&&error.name!=='AbortError'){
      this.aiError=error.name==='TimeoutError'?'The analysis took too long. Try again.':error.message;
      if(error.resetAt){this.aiLimit={code:error.code,resetAt:error.resetAt};try{saveAnalysisCooldown(error,globalThis.sessionStorage);}catch{}this.scheduleLimitReset();}
    }}
    finally {if(this.request===request){this.busy=false;this.verifying=false;this.render();}}
  }
  sourceLink(id,label) {
    const source=this.data.sources.find(s=>s.id===id);
    return sourceAnchor(source&&{...source,title:label||source.title});
  }
  placeControl() {
    return `<label class="ec-place-control">Place<select id="ec-region" data-econ-field="region">${choices([['CA','Canada'],...this.data.regions.filter(r=>r.code!=='CA').map(r=>[r.code,nameOf(this.data,r.code)])],this.state.region)}</select></label>`;
  }
  map(summary) {
    const [west,,east,north]=this.bounds;const south=this.bounds[1];
    const path=ring=>ring.map(([x,y],i)=>`${i?'L':'M'}${(x-west).toFixed(1)},${(north-y).toFixed(1)}`).join(' ')+'Z';
    return `<svg class="ec-map" viewBox="0 0 ${east-west} ${north-south}" aria-label="Energy share of provincial and territorial GDP, ${summary.gdp.year}" role="group">${this.shapes.map(shape=>{
      const row=summary.gdp.ranking.find(r=>r.code===shape.code);const share=row?.sharePct;
      return `<path id="ec-map-${esc(shape.code)}" d="${shape.rings.map(path).join(' ')}" fill="${Number.isFinite(share)?`hsl(19 43% ${92-Math.min(share,40)*1.2}%)`:'#deded8'}" class="${this.state.region===shape.code?'selected':''}" tabindex="0" role="button" data-ec-region="${esc(shape.code)}" aria-label="${esc(shape.name)}, energy ${num(share)} percent of GDP" aria-pressed="${this.state.region===shape.code}"><title>${esc(shape.name)} · ${num(share)}% of GDP</title></path>`;
    }).join('')}</svg><div class="ec-map-legend"><span>Share of provincial GDP</span><span>0%</span><i aria-hidden="true"></i><span>40%</span></div>`;
  }
  activity(summary) {
    const activity=summary.activity;if(!activity)return '';
    const selected=activity.selected,growing=activity.regions.filter(row=>row.energyGrowthPct>0).length;
    return `<aside class="ec-latest-activity" aria-label="Latest observed activity"><h2>${activity.year} growth</h2>${selected?`<dl><div><dt>Energy sector</dt><dd>${signed(selected.energyGrowthPct)}</dd></div><div><dt>Whole economy</dt><dd>${signed(selected.totalGrowthPct)}</dd></div></dl>`:`<p class="ec-activity-national"><strong>${growing} of ${activity.regions.length}</strong> energy sectors grew</p>`}<p class="ec-caption">Real GDP · change from ${activity.previousYear}</p></aside>`;
  }
  income(summary) {
    const selected=summary.gdp.selected;const region=nameOf(this.data,this.state.region);const rows=summary.gdp.ranking;
    const max=rows[0].energy;const province=this.state.region!=='CA';
    const growth=code=>summary.activity?.regions.find(row=>row.code===code);
    const activityYear=summary.activity?.year;
    const bars=`<ol class="ec-ranking" aria-label="Provinces and territories ranked by energy-sector GDP">${rows.map((row,index)=>`<li><button id="ec-rank-${row.code}" data-ec-region="${row.code}" aria-pressed="${row.code===this.state.region}"><span class="ec-rank-number">${String(index+1).padStart(2,'0')}</span><span class="ec-rank-name">${esc(nameOf(this.data,row.code))}</span><span class="ec-bar-track" aria-hidden="true"><i style="width:${row.energy/max*100}%"></i></span><strong>${billions(row.energy)}</strong><span class="ec-rank-share">${num(row.sharePct)}% <small>of local GDP</small></span></button></li>`).join('')}</ol>`;
    const table=`<div class="ec-table-wrap"><table><caption>Energy-sector GDP in ${summary.gdp.year}, current Canadian dollars at basic prices.</caption><thead><tr><th scope="col">Province or territory</th><th scope="col">Energy GDP</th><th scope="col">Share of local GDP</th>${activityYear?`<th scope="col">${activityYear} energy growth</th><th scope="col">${activityYear} economy growth</th>`:''}</tr></thead><tbody>${rows.map(row=>`<tr class="${row.code===this.state.region?'selected':''}"><th scope="row"><button id="ec-table-${row.code}" data-ec-region="${row.code}" aria-pressed="${row.code===this.state.region}">${esc(nameOf(this.data,row.code))}</button></th><td>${billions(row.energy)}</td><td>${num(row.sharePct)}%</td>${activityYear?`<td>${signed(growth(row.code)?.energyGrowthPct)}</td><td>${signed(growth(row.code)?.totalGrowthPct)}</td>`:''}</tr>`).join('')}</tbody></table></div>`;
    return `<section class="ec-focused-view" aria-labelledby="ec-workspace-title"><header class="ec-view-heading"><h1 id="ec-workspace-title" tabindex="-1">${esc(province?region+'’s energy economy':'Canada’s energy economy')}</h1><button data-ec-action="sources">Evidence</button></header>${this.placeControl()}<div class="ec-answerline"><div><p class="ec-lead"><strong>${billions(selected.energy)}</strong> energy GDP <span class="ec-value-period">${summary.gdp.year} · current dollars</span></p><p class="ec-answer-share"><strong>${num(selected.sharePct)}%</strong> of ${province?esc(region)+'’s economy':'combined provincial and territorial GDP'}${province?` <span>· ${num(selected.nationalEnergySharePct)}% of Canada’s energy-sector GDP</span>`:''}</p></div>${this.activity(summary)}</div>
      <div class="ec-chart-toolbar"><div><h2>${this.state.display==='map'?'Energy share of each economy':'Compare provinces'}</h2><p class="ec-caption">${summary.gdp.year} · ${this.state.display==='map'?'share of local GDP':'energy GDP in current dollars'}</p></div><div class="ec-segmented" aria-label="GDP comparison view">${[['bars','Ranking'],['map','Map'],['table','Table']].map(([id,label])=>`<button id="ec-display-${id}" data-ec-display="${id}" aria-pressed="${this.state.display===id}">${label}</button>`).join('')}</div></div>
      <div class="ec-income-chart">${this.state.display==='map'?this.map(summary):this.state.display==='table'?table:bars}</div>
      <div id="ec-monthly-energy"></div>
    </section>`;
  }
  trend(metric) {
    const definition=this.data.metrics.find(m=>m.id===metric.id),region=metric.kind==='benchmark'?'CA':this.state.region;
    const baseline=definition.series.find(s=>s.region===region&&s.scenario==='Current Measures'),alternative=definition.series.find(s=>s.region===region&&s.scenario===this.state.scenario);
    if(!baseline||!alternative)return '<p class="ec-missing">No published series for this jurisdiction.</p>';
    const values=[...baseline.values,...alternative.values].filter(Number.isFinite);if(!values.length)return '<p class="ec-missing">No published values for this jurisdiction.</p>';
    const layout=getComputedStyle(this.root),availableWidth=this.root.clientWidth-parseFloat(layout.paddingLeft)-parseFloat(layout.paddingRight);
    const width=Math.max(270,Math.min(1120,availableWidth)),height=width<500?230:300,left=54,right=width-14,bottom=height-36,top=32;
    const lo=Math.min(...values),hi=Math.max(...values),span=hi-lo||Math.max(hi*.1,1),low=lo-span*.1,high=hi+span*.1;
    const x=i=>left+i/(this.data.years.length-1)*(right-left),y=value=>bottom-(value-low)/(high-low)*(bottom-top);
    const path=series=>{let gap=true;return series.values.map((value,i)=>{if(value===null){gap=true;return '';}const mark=`${gap?'M':'L'}${x(i)},${y(value)}`;gap=false;return mark;}).join(' ');};
    const index=this.data.years.indexOf(this.state.year),selected=alternative.values[index];
    const boundary=x(Math.max(0,this.data.years.indexOf(definition.historicalThrough))+.5);
    const ticks=width<500?[2023,2035,2050]:[2023,2030,2040,2050];
    return `<svg class="ec-trend" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(metric.label)}. Observed through ${definition.historicalThrough}, then conditional projections. Selected year ${this.state.year}: ${num(selected)} ${esc(metric.unit)}."><rect x="${boundary}" y="${top}" width="${right-boundary}" height="${bottom-top}" fill="#edf0e8"/>${[lo,(lo+hi)/2,hi].map(value=>`<line class="ec-trend-grid" x1="${left}" x2="${right}" y1="${y(value)}" y2="${y(value)}"/><text x="${left-8}" y="${y(value)+4}" text-anchor="end">${num(value,hi>=100?0:1)}</text>`).join('')}<text x="${boundary+8}" y="18">Projected</text>${this.state.scenario==='Current Measures'?'':`<path class="ec-trend-base" d="${path(baseline)}"/>`}<path class="ec-trend-case" d="${path(alternative)}"/><line class="ec-trend-year" x1="${x(index)}" x2="${x(index)}" y1="${top}" y2="${bottom}"/>${Number.isFinite(selected)?`<circle cx="${x(index)}" cy="${y(selected)}" r="5"/>`:''}${ticks.map(year=>`<text x="${x(this.data.years.indexOf(year))}" y="${height-9}" text-anchor="${year===2023?'start':year===2050?'end':'middle'}">${year}</text>`).join('')}</svg>`;
  }
  metricCard(metric) {
    const definition=this.data.metrics.find(m=>m.id===metric.id),digits=metricDigits(metric.id);
    return `<article class="ec-metric"><div class="ec-series-reading"><div><h2>${esc(metric.label)}</h2><div class="ec-metric-value">${num(metric.selected,digits)} <small>${esc(metric.unit)}</small></div></div><div class="ec-series-period"><strong>${metric.year}</strong><span>${metric.status==='observed'?'Observed':metric.status==='projected'?'Projected':'Not available'}</span></div></div><p class="ec-metric-change">${metric.selected===null?'Not published for this jurisdiction':metric.kind==='benchmark'?'Global benchmark · same price assumption for every province':metric.status==='observed'?'Published historical observation':this.state.scenario==='Current Measures'?'Current Measures baseline':`${signed(metric.deltaPct)} versus Current Measures`}</p>${this.trend(metric)}<div class="ec-line-key"><span><i></i>${esc(this.state.scenario)}</span>${this.state.scenario==='Current Measures'?'':'<span><i></i>Current Measures</span>'}<span>Observed through ${definition.historicalThrough}</span></div></article>`;
  }
  retail() {
    const definition=this.data.metrics.find(m=>m.id==='electricity-price');const index=this.data.years.indexOf(this.state.year);
    const rows=this.data.regions.filter(r=>r.code!=='CA').map(region=>({code:region.code,name:nameOf(this.data,region.code),value:definition.series.find(s=>s.region===region.code&&s.scenario===this.state.scenario)?.values[index]??null}));
    const range=Math.max(20,...rows.filter(row=>row.value!==null).map(row=>Math.abs(row.value-100)));
    return `<div class="ec-retail-intro"><h2>Residential electricity prices</h2><p>Each province’s Current Measures case = 100. These are scenario comparisons, not bills or price levels between provinces.</p></div><div class="ec-retail-axis"><span>Lower</span><span>100</span><span>Higher</span></div><ol class="ec-retail-list" aria-label="Residential electricity price indices">${rows.map(row=>`<li><button id="ec-retail-${row.code}" data-ec-region="${row.code}" aria-pressed="${row.code===this.state.region}"><span>${esc(row.name)}</span><span class="ec-diverging" aria-hidden="true">${row.value!==null?`<i style="left:${row.value<100?50-(100-row.value)/range*48:50}%;width:${Math.abs(row.value-100)/range*48}%"></i><b style="left:${50+(row.value-100)/range*48}%"></b>`:''}</span><strong>${row.value===null?'No data':num(row.value)}</strong></button></li>`).join('')}</ol>`;
  }
  futures(summary) {
    const metrics=summary.metrics.filter(m=>['wti','henry-hub','oil-production','gas-production','electricity-generation','end-use-demand','electricity-price'].includes(m.id));
    const indicator=this.state.metric==='retail'?'electricity-price':this.state.futureIndicator,lead=metrics.find(m=>m.id===indicator);
    return `<section class="ec-focused-view" aria-labelledby="ec-workspace-title"><header class="ec-view-heading"><h1 id="ec-workspace-title" tabindex="-1">Energy futures</h1><button data-ec-action="sources">Evidence</button></header><div class="ec-future-controls">${this.placeControl()}<label>Indicator<select aria-label="Energy indicator" data-econ-field="futureMeasure">${choices(metrics.map(m=>[m.id,m.label]),indicator)}</select></label><label>Scenario<select id="ec-scenario" data-econ-field="scenario">${choices(this.data.scenarios.map(s=>[s,s]),this.state.scenario)}</select></label><label>Year<select id="ec-year" data-econ-field="year">${choices(this.data.years.map(y=>[String(y),String(y)]),String(this.state.year))}</select></label></div>${this.state.metric==='retail'?this.retail():`<div class="ec-metrics ec-focused-metric">${this.metricCard(lead)}</div>`}<p class="ec-scope-note">${this.state.year<=this.data.metrics.find(m=>m.id===indicator).historicalThrough?'Historical observation.':'Conditional scenario, not a prediction.'} ${lead.kind==='benchmark'?'Global price assumption.':esc(nameOf(this.data,this.state.region))+` · ${this.state.year}`}</p><div id="ec-monthly-energy"></div></section>`;
  }
  oil() {
    const history=this.state.oilView==='history',sensitivity=summarizeEconomy(this.data,{...this.state,region:'CA'}).publishedOilSensitivity;
    const max=Math.max(.1,...sensitivity.years.flatMap(row=>[Math.abs(row.nominalGdpPct),Math.abs(row.realGdpPct)]));
    const bar=value=>`<span class="ec-oil-track" aria-hidden="true"><i style="left:${value<0?50-Math.abs(value)/max*48:50}%;width:${Math.abs(value)/max*48}%"></i></span>`;
    return `<section class="ec-focused-view" aria-labelledby="ec-workspace-title"><header class="ec-view-heading"><h1 id="ec-workspace-title" tabindex="-1">Oil & the economy</h1>${history?'':'<button data-ec-action="sources">Evidence</button>'}</header><nav class="ec-oil-views ec-segmented" aria-label="Oil evidence view">${[['experiment','Price experiment'],['history','Historical record']].map(([id,label])=>`<button data-ec-action="oil-view" data-oil-view="${id}" aria-pressed="${this.state.oilView===id}">${label}</button>`).join('')}</nav>${history?'<div id="ec-oil-history"><p role="status">Loading historical oil and GDP paths…</p></div>':`<div class="ec-future-controls"><label>WTI price change<select id="ec-oil" data-econ-field="oilShock">${choices([-20,-10,0,10,20].map(v=>[String(v),signed(v)]),String(this.state.oilShock))}</select></label><label>Duration<select id="ec-duration" data-econ-field="duration">${choices([['persistent','Persistent'],['temporary','Two quarters']],this.state.duration)}</select></label></div><div class="ec-oil-chart" aria-label="Modelled national GDP level changes"><h2>Canada’s GDP after the price change</h2><div class="ec-oil-scale"><span>Lower</span><span>0</span><span>Higher</span></div>${sensitivity.years.map(year=>`<section class="ec-oil-year"><h3>Year ${year.yearAfterShock}</h3><div class="ec-oil-row"><span>Nominal GDP</span>${bar(year.nominalGdpPct)}<strong>${signed(year.nominalGdpPct)}</strong></div><div class="ec-oil-row ec-oil-real"><span>Real GDP</span>${bar(year.realGdpPct)}<strong>${signed(year.realGdpPct)}</strong></div></section>`).join('')}</div><p class="ec-scope-note">National GDP level change. Nominal includes price changes; real measures output after inflation. ${this.state.oilShock===10?'Published +10% illustration.':this.state.oilShock===0?'No price change.':'Linear approximation of the published +10% illustration.'}</p>`}</section>`;
  }
  evidence(summary) {
    const section=this.state.section,monthly=['income','futures'].includes(section),tab=monthly&&this.evidenceView==='monthly'?'monthly':'sources';
    let content='';
    if(section==='income'){
      const a=summary.activity,row=a?.selected;
      content=`<h3>GDP and growth</h3><p>${summary.gdp.year} is the latest common year for detailed current-dollar GDP. Real GDP is available through ${a?.year} and measures activity after adjusting for price changes.</p>${row?`<p>${a.year} energy GDP: ${num(row.energy)} million chained 2017 Canadian dollars, compared with ${num(row.previousEnergy)} million in ${a.previousYear}. Source vector ${esc(row.energyVector)}.</p>`:''}<p>GDP measures value added after intermediate inputs. Sales, royalties and wages cannot be added to it. Chained-dollar values are used for growth, not sector shares or summed national totals.</p><div class="ec-links">${[summary.gdp.sourceId,a?.sourceId].filter(Boolean).map(id=>this.sourceLink(id)).join('')}</div>`;
    }else if(section==='futures'){
      const id=this.state.metric==='retail'?'electricity-price':this.state.futureIndicator,metric=summary.metrics.find(m=>m.id===id),definition=this.data.metrics.find(m=>m.id===id),region=metric.kind==='benchmark'?'CA':this.state.region;
      const series=definition.series.find(s=>s.region===region&&s.scenario===this.state.scenario),baseline=definition.series.find(s=>s.region===region&&s.scenario==='Current Measures');
      content=`<h3>${esc(metric.label)}</h3><p>${esc(this.scenarioText())} These cases change growth, technology and energy assumptions together. Differences do not isolate a single price effect.</p><p>Observed through ${definition.historicalThrough}; projected from ${definition.historicalThrough+1}. ${metric.kind==='benchmark'?'Global benchmark, not a provincial received price.':''} ${esc(metric.basisNote||'')}</p><div class="ec-links">${metric.sourceIds.map(id=>this.sourceLink(id)).join('')}</div>${series?`<div class="ec-table-wrap" tabindex="0" role="region" aria-label="Annual scenario values"><table><caption>${esc(metric.unit)}</caption><thead><tr><th>Year</th><th>${esc(this.state.scenario)}</th>${this.state.scenario==='Current Measures'?'':'<th>Current Measures</th>'}</tr></thead><tbody>${this.data.years.map((year,i)=>`<tr><th scope="row">${year}</th><td>${num(series.values[i],metricDigits(id))}</td>${this.state.scenario==='Current Measures'?'':`<td>${num(baseline?.values[i],metricDigits(id))}</td>`}</tr>`).join('')}</tbody></table></div>`:'<p>Select a province for its residential price series.</p>'}`;
    }else if(section==='oil'){
      const result=summarizeEconomy(this.data,{...this.state,region:'CA'}).publishedOilSensitivity;
      content=`<h3>National oil-price experiment</h3><p>${esc(result.method)}. This estimates national GDP levels relative to the model baseline in the first two years after the price change.</p><ul>${result.limitations.map(text=>`<li>${esc(text)}</li>`).join('')}</ul><div class="ec-links">${result.sourceIds.map(id=>this.sourceLink(id)).join('')}</div>`;
    }else content=`<ul>${summary.limitations.map(text=>`<li>${esc(text)}</li>`).join('')}</ul><div class="ec-links">${this.data.sources.map(source=>this.sourceLink(source.id)).join('')}</div>${this.debate()}`;
    return `<dialog class="ec-evidence context-dialog" aria-labelledby="ec-evidence-title"><div class="context-dialog-content"><header><h2 id="ec-evidence-title">Sources and methods</h2><button data-ec-action="close-sources">Close</button></header>${monthly?`<nav class="ec-evidence-tabs ec-segmented" aria-label="Evidence sections"><button id="ec-evidence-sources" data-ec-action="evidence-tab" data-evidence-view="sources" aria-pressed="${tab==='sources'}">Sources & methods</button><button id="ec-evidence-monthly" data-ec-action="evidence-tab" data-evidence-view="monthly" aria-pressed="${tab==='monthly'}">Monthly history</button></nav>`:''}<div ${tab==='sources'?'':'hidden'}>${content}<p>Retrieved ${esc(this.data.generatedAt?.slice(0,10))}.</p><button data-ec-action="download">Download selected data</button></div>${monthly?`<div id="ec-monthly-evidence" ${tab==='monthly'?'':'hidden'}></div>`:''}</div></dialog>`;
  }
  debate() {
    if(!this.context?.facts?.length)return '';
    const labels={equalization:'Federal transfers',trade:'Trade and transportation', 'oil-shock':'Producer income and fuel costs','rights-positions':'Indigenous ownership and rights',labour:'Workers and investment',producer:'Producer priorities',climate:'Emissions and climate','lng-risk':'LNG market risk',electricity:'Electricity supply and reliability',households:'Household affordability'};
    return `<section class="ec-debate"><h3>Who benefits and who pays?</h3><p>Economic totals do not settle how income, costs and risks are shared. These sources address different parts of the debate.</p><p class="ec-caption">Research reviewed ${esc(this.context.reviewDate)}. Stakeholder statements describe the named organization’s position. This selection is not a complete account of every community or project.</p><div class="ec-debate-grid">${this.context.facts.map(fact=>`<article><h3>${esc(labels[fact.id]||fact.id)}</h3><p>${esc(fact.text)}</p><div class="ec-links">${fact.sourceIds.map(id=>sourceAnchor(this.context.sources.find(source=>source.id===id))).join('')}</div></article>`).join('')}</div></section>`;
  }
  activeLimit() {return this.aiLimit?.resetAt>Date.now()?this.aiLimit:null;}
  scheduleLimitReset() {
    clearTimeout(this.limitTimer);
    if(!this.activeLimit())return;
    this.limitTimer=setTimeout(()=>{if(this.activeLimit())this.scheduleLimitReset();else{this.aiLimit=null;this.aiError=null;this.render();}},Math.min(this.aiLimit.resetAt-Date.now()+50,2147483647));
  }
  async openComparison(id) {
    if(this.busy)return;
    this.deactivate();const request=this.request=new AbortController();
    this.busy=true;this.localLoading=true;this.localErrorId=null;this.aiError=null;this.render();
    try{
      const {loadLocalInvestigation}=await import('./vendor/energy-workspace.js');
      request.signal.throwIfAborted();
      const result=await loadLocalInvestigation(id,{data:this.data,state:this.state},fetch,request.signal);
      if(this.request!==request)return;
      this.state=normalizeEconomyState({...this.state,...result.state});this.onChange(this.state);
      this.answer=result;this.answerVisible=true;this.tradeQuestionOpen=false;this.workspaceSelection=null;this.focusWorkspace=true;
    }catch(error){if(this.request===request&&error.name!=='AbortError'){this.aiError='The comparison could not load. Check your connection and try again.';this.localErrorId=id;}}
    finally{if(this.request===request){this.busy=false;this.localLoading=false;this.render();}}
  }
  analyst() {
    const limit=this.activeLimit();
    const error=this.aiError||limit;
    const status=this.busy?(this.localLoading?'Opening comparison…':'Working…'):limit?(['busy','rate_limit'].includes(limit.code)?'AI busy':'AI allowance used'):this.aiError?'Could not complete':this.answer?'Answer ready':this.status.available?'AI ready':this.statusLoading?'Checking connection…':'AI offline';
    const presets=[['outlook','Provincial GDP outlook'],['contributions','Provincial contributions'],['electricity','Electricity in 2040'],['trade','Energy trade'],['prices','Provincial price effects']];
    return `<section class="ec-intelligence"><dialog class="ec-trade-question ec-composer context-dialog" aria-labelledby="ec-ai-title"><div class="context-dialog-content"><button class="ec-dialog-close" data-ec-action="close-ask">Close</button>
      <div class="ec-ai-heading"><div><h2 id="ec-ai-title" tabindex="-1">Explore Canada’s energy economy</h2></div><span class="ec-ai-status">${status}</span></div>
      <p class="ec-caption">Open a comparison. No AI allowance needed.</p><div class="ec-question-presets">${presets.map(([id,label])=>`<button data-ec-local="${id}" ${this.busy?'disabled':''}>${label}</button>`).join('')}</div>
      <form id="energy-question-form"><label for="energy-question">Your question</label><div class="ec-ask"><textarea id="energy-question" maxlength="1200" rows="2" placeholder="If oil prices fall, what changes for Alberta and Canada?">${esc(this.question)}</textarea><button class="primary-button" type="submit" ${!this.status.available||this.busy||limit?'disabled':''}>${this.busy?'Working…':'Analyse'}</button>${this.busy?'<button class="secondary-button" type="button" data-ec-action="cancel">Cancel</button>':''}</div></form>
      <details class="ec-question-info"><summary>Privacy & usage</summary><p class="ec-caption">Built-in comparisons run in your browser using the published data.${this.status.available?` AI questions and selected public data are sent to ${this.status.provider==='cloudflare'?'Cloudflare Workers AI':'OpenAI'}${this.status.jevEnabled?' and TypeSafe (Jev)':''}. Do not include personal information.`:this.statusLoading?' Checking the AI connection.':' AI is offline. The comparisons and data tools still work.'}</p>${this.status.turnstileSiteKey?`<p class="ec-caption">Up to ${esc(this.status.limits?.visitorDaily||3)} AI questions per network each day, shared by people on the same connection. The service also has daily and monthly limits. Cloudflare checks for automated requests. We store temporary usage counts, not your questions or answers.</p>`:''}</details>
      <div id="ec-ai-progress" role="status" aria-live="polite">${this.busy?`${this.localLoading?'Opening published data…':this.status.turnstileSiteKey?'Complete the security check to send your question.':'Checking the available evidence.'}${this.answer?' Your previous answer remains below.':''}`:''}</div>${this.busy&&!this.localLoading?'<div id="ec-verification"></div>':''}
      ${error?`<div class="ec-analysis-error" role="alert"><p>${esc(this.localErrorId?this.aiError:limit?analysisLimitMessage(limit):this.aiError)}</p>${this.localErrorId?`<button data-ec-local="${esc(this.localErrorId)}">Reload comparison</button>`:limit?'':this.status.available?'<button data-ec-action="ask-again">Try again</button>':''}</div>`:''}</div></dialog>
      ${this.answer?.workspace&&this.answerVisible!==false?'<div id="ec-dynamic-workspace" class="ec-workspace-host"><p class="ec-workspace-load" role="status">Loading the maps and comparisons…</p></div>':''}${this.renderAnswer()}</section>`;
  }
  renderAnswer() {
    if(!this.answer?.analysis||this.answerVisible===false)return '';
    const analysis=this.answer.analysis;const sources=[...(analysis.sources||[]),...(this.answer.summary?.sources||[])];
    const renderBlock=block=>`<div class="ec-answer-block"><p>${esc(block.text)}</p><div class="ec-links">${[...new Set(block.sourceIds||[])].map(id=>sourceAnchor(sources.find(source=>source.id===id))).join('')}</div></div>`;
    const blocks=analysis.blocks||[];const extra=blocks.slice(2);const limitations=analysis.limitations||[];
    return `${this.answer.workspace?'<details class="ec-answer"><summary>Written analysis & citations</summary>':'<article class="ec-answer">'}<p class="ec-kicker">${this.answer.answerMode==='local-data-workspace'?'PUBLISHED DATA COMPARISON':'COMPLETED ANALYSIS'}</p><p class="ec-answer-question">${esc(this.answer.question||'')}</p><h3>${esc(analysis.headline)}</h3>${blocks.slice(0,2).map(renderBlock).join('')}${extra.length?`<details><summary>Read the supporting analysis</summary>${extra.map(renderBlock).join('')}</details>`:''}${limitations.length?`<details><summary>Assumptions and limits (${limitations.length})</summary><ul>${limitations.map(text=>`<li>${esc(text)}</li>`).join('')}</ul></details>`:''}<p class="ec-caption">${this.answer.answerMode==='source-backed-findings'?'AI selected these published findings; figures and citations come from the app’s data. ':''}These findings describe the original submitted question. Current-selection explanations appear beside the interactive results above.</p><button class="text-link" data-ec-action="download">Download answer, calculations and sources</button>${this.answer.workspace?'</details>':'</article>'}`;
  }
  render() {
    if(this.verifying&&this.busy)return;
    if(this.loading||!this.data){this.root.innerHTML=`<div class="ec-loading"><h1>${this.error?'Economic data unavailable':'Loading the energy account'}</h1><p role="status">${esc(this.error||'Reading provincial GDP and official energy scenarios.')}</p>${this.error?'<button data-ec-action="retry" class="primary-button">Retry</button>':''}</div>`;return;}
    const monthlyKey=JSON.stringify([this.state.region,this.state.section]);
    const previousMonthly=this.monthlyMountKey===monthlyKey?this.root.querySelector('#ec-monthly-energy'):null;
    const previousMonthlyEvidence=this.monthlyMountKey===monthlyKey?this.root.querySelector('#ec-monthly-evidence'):null;
    if(!previousMonthly){this.monthlyMount?.unmount();this.monthlyMount=null;}
    if(!previousMonthlyEvidence){this.monthlyEvidenceMount?.unmount();this.monthlyEvidenceMount=null;}
    this.monthlyMountKey=monthlyKey;
    const previousHost=this.workspaceAnswer===this.answer?this.root.querySelector('#ec-dynamic-workspace'):null;
    if(!previousHost){this.workspaceMount?.unmount();this.workspaceMount=null;}
    const tradeKey=JSON.stringify([this.state.tradeCommodity,this.state.tradeYear,this.state.priceShock,this.state.linkScope,this.state.tradeRegions,this.state.transferSet,this.state.tradePanelId,this.state.tradeViewMode,this.state.tradeDisplay,this.state.tradeConnection,this.state.tradeFocus,this.state.guideStep,this.state.guideHorizon,this.state.guideHouseholdBasis,this.state.guideRetailShock]);
    const previousTrade=this.state.section==='trade'&&this.tradeMountKey===tradeKey?this.root.querySelector('#ec-trade-workspace'):null;
    if(!previousTrade){this.tradeMount?.unmount();this.tradeMount=null;}
    const storyKey=JSON.stringify(this.state.story);
    const previousStory=this.state.section==='explore'&&this.storyMountKey===storyKey?this.root.querySelector('#ec-energy-story'):null;
    if(!previousStory){this.storyMount?.unmount();this.storyMount=null;}
    const previousResearch={};
    for(const [kind,section,id] of [['income','supply','#ec-income-paths'],['history','oil','#ec-oil-history'],['forecast','outlook','#ec-provincial-forecast']]){
      const host=this.state.section===section&&this[`${kind}MountKey`]===this.researchKey(kind)?this.root.querySelector(id):null;
      if(host)previousResearch[kind]=host;else{this[`${kind}Mount`]?.unmount();this[`${kind}Mount`]=null;}
    }
    const openDialogs=[...this.root.querySelectorAll('dialog[open]')].map(node=>({node,scroll:node.scrollTop}));
    const evidenceOpen=Boolean(this.root.querySelector('dialog.ec-evidence')?.open);
    const activeElement=this.root.contains(document.activeElement)?document.activeElement:null;
    const activeId=activeElement?.id;
    const start=activeId==='energy-question'?document.activeElement.selectionStart:null;
    const summary=summarizeEconomy(this.data,this.state);
    const isResearch=!this.answer?.workspace||this.answerVisible===false;
    const sections=[['income','Income'],['outlook','Provincial outlook'],['trade','Trade & prices'],['supply','Follow the dollar'],['futures','Energy futures'],['oil','Oil & the economy']];
    const sectionButtons=sections.map(([id,label])=>`<button id="ec-section-${id}" data-ec-section="${id}" aria-current="${this.state.section===id?'page':'false'}">${label}</button>`).join('');
    const exploring=this.state.section==='explore';
    this.root.innerHTML=`<div class="ec-context ${exploring?'ec-context-explore':''}">${this.state.section==='supply'?this.placeControl():''}<nav aria-label="Energy economy accounts"><button id="ec-section-explore" data-ec-section="explore" aria-current="${exploring?'page':'false'}">Explore a question</button>${sectionButtons}</nav><div class="ec-context-actions">${this.answer?.workspace?`<button data-ec-action="${isResearch?'show-answer':'browse-data'}">${isResearch?'Previous answer':'Return to data'}</button>`:''}<button data-ec-action="ask">Ask a question</button>${['income','futures','oil','trade','outlook'].includes(this.state.section)?'':`<button data-ec-action="sources">Sources</button><button data-ec-action="download" aria-label="Download selected economic data and analysis">Download</button>`}</div></div>
    ${isResearch?'':this.analyst()}${this.answer?.workspace&&!isResearch?'<details class="ec-authored-data"><summary>Browse the original data views</summary>':''}<div class="ec-workspace">${exploring?'<div id="ec-energy-story"><p role="status">Loading the connected investigation…</p></div>':this.state.section==='outlook'?'<div id="ec-provincial-forecast"><p role="status">Loading provincial GDP forecasts…</p></div>':this.state.section==='trade'?'<div id="ec-trade-workspace"><p role="status">Loading energy trade and price effects…</p></div>':this.state.section==='futures'?this.futures(summary):this.state.section==='oil'?this.oil():this.state.section==='supply'?'<div id="ec-income-paths"><p role="status">Loading supply-chain effects…</p></div>':this.income(summary)}</div>${isResearch?this.analyst():''}${this.answer?.workspace&&!isResearch?'</details>':''}${this.evidence(summary)}`;
    const accountNav=this.root.querySelector('.ec-context nav'),activeAccount=accountNav?.querySelector('[aria-current=page]');
    if(accountNav&&activeAccount&&accountNav.scrollWidth>accountNav.clientWidth)accountNav.scrollLeft=Math.max(0,activeAccount.offsetLeft-accountNav.offsetLeft-(accountNav.clientWidth-activeAccount.offsetWidth)/2);
    const monthlyHost=this.root.querySelector('#ec-monthly-energy');if(monthlyHost&&previousMonthly)monthlyHost.replaceWith(previousMonthly);else if(monthlyHost)void this.mountMonthly(monthlyHost);
    const monthlyEvidenceHost=this.root.querySelector('#ec-monthly-evidence');if(monthlyEvidenceHost&&previousMonthlyEvidence){monthlyEvidenceHost.replaceWith(previousMonthlyEvidence);previousMonthlyEvidence.hidden=this.evidenceView!=='monthly';}
    for(const [kind,id] of [['income','#ec-income-paths'],['history','#ec-oil-history'],['forecast','#ec-provincial-forecast']]){const host=this.root.querySelector(id);if(host&&previousResearch[kind])host.replaceWith(previousResearch[kind]);else if(host)void this.mountResearchView(host,kind);}
    const storyHost=this.root.querySelector('#ec-energy-story');
    if(storyHost&&previousStory)storyHost.replaceWith(previousStory);else if(storyHost)void this.mountStory(storyHost);
    const tradeHost=this.root.querySelector('#ec-trade-workspace');
    if(tradeHost&&previousTrade)tradeHost.replaceWith(previousTrade);else if(tradeHost)void this.mountTrade(tradeHost,tradeKey);
    const workspaceHost=this.root.querySelector('#ec-dynamic-workspace');
    if(workspaceHost&&previousHost){workspaceHost.replaceWith(previousHost);}else if(workspaceHost){void this.mountDynamicWorkspace(workspaceHost);}
    for(const {node,scroll} of openDialogs){if(node.isConnected){node.close();node.showModal();node.scrollTop=scroll;}}
    if(evidenceOpen)this.root.querySelector('dialog.ec-evidence')?.showModal();
    if(this.tradeQuestionOpen)this.root.querySelector('.ec-composer')?.showModal();
    if(activeElement?.isConnected)activeElement.focus({preventScroll:true});
    else if(activeId){const node=this.root.querySelector(`#${CSS.escape(activeId)}`);node?.focus({preventScroll:true});if(start!==null)node?.setSelectionRange?.(start,start);}
  }
  async mountMonthly(host) {
    try {const {mountMonthlyEnergy}=await import('./vendor/energy-workspace.js');if(host.isConnected)this.monthlyMount=mountMonthlyEnergy(host,{region:this.state.region,context:this.state.section,compact:true});}
    catch {if(host.isConnected)host.innerHTML='<p role="status">Monthly activity could not load. Reload to try again.</p>';}
  }
  async mountMonthlyEvidence() {
    const host=this.root.querySelector('#ec-monthly-evidence');if(!host||host.childElementCount)return;
    host.innerHTML='<p role="status">Loading monthly history…</p>';
    try {const {mountMonthlyEnergy}=await import('./vendor/energy-workspace.js');if(host.isConnected){host.replaceChildren();this.monthlyEvidenceMount=mountMonthlyEnergy(host,{region:this.state.region,context:this.state.section,detailsOnly:true});}}
    catch {if(host.isConnected)host.innerHTML='<p>Monthly history could not load.</p><button data-ec-action="retry-monthly-evidence">Retry monthly history</button>'; }
  }
  async mountStory(host) {
    this.storyMountKey=JSON.stringify(this.state.story);
    try {
      const [{mountEnergyStory},flows,fiscal,forecast,priceResponses,householdCosts]=await Promise.all([
        import('./vendor/energy-workspace.js'),
        this.flows||fetch('data/energy-flows.json').then(r=>{if(!r.ok)throw Error();return r.json();}),
        this.fiscal||fetch('data/provincial-impacts.json').then(r=>{if(!r.ok)throw Error();return r.json();}),
        this.forecast||fetch('data/provincial-forecasts.json').then(r=>r.ok?r.json():null).catch(()=>null),
        fetch('data/provincial-price-response.json').then(r=>r.ok?r.json():null).catch(()=>null),
        fetch('data/household-energy-costs.json').then(r=>r.ok?r.json():null).catch(()=>null),
      ]);
      if(!host.isConnected)return;
      this.flows=flows;this.fiscal=fiscal;this.forecast=forecast;host.replaceChildren();
      this.storyMount=mountEnergyStory(host,{snapshots:{economy:this.data,flows,fiscal,forecast,priceResponses,householdCosts},initial:this.state.story,shapes:this.shapes,onState:story=>{
        this.state=normalizeEconomyState({...this.state,story});this.storyMountKey=JSON.stringify(this.state.story);this.onChange(this.state);
      },onAsk:question=>{
        this.question=question;this.tradeQuestionOpen=true;this.render();this.root.querySelector('#energy-question')?.focus();
      },onNavigate:(section,selection)=>{this.change({section,region:selection.compare?'CA':selection.focus,forecastYear:selection.year,forecastFocus:selection.focus,forecastRegions:[selection.focus,...(selection.compare?[selection.compare]:[])]});}});
    }catch{if(host.isConnected)host.innerHTML='<p role="alert">The source data for this investigation could not load.</p><button data-ec-action="retry-story">Retry investigation</button>';}
  }
  researchKey(kind) {
    const s=this.state;return JSON.stringify(kind==='forecast'?[s.region,s.forecastRegions,s.forecastYear,s.forecastFocus]:kind==='income'?[s.region,s.incomeIndustry,s.incomeYear,s.demandMillion,s.includeInduced]:[s.historyRegions,s.historyOilChange,s.historyHorizon,s.historyYear]);
  }
  async mountResearchView(host,kind) {
    this[`${kind}MountKey`]=this.researchKey(kind);
    try {
      const module=await import('./vendor/energy-workspace.js');
      const file=kind==='forecast'?'provincial-forecasts':kind==='income'?'income-paths':'dynamic-price-history';
      const response=await fetch(`data/${file}.json`);if(!response.ok)throw Error();const data=await response.json();
      const benchmarks=kind==='forecast'?await fetch('data/provincial-outlook-benchmarks.json').then(r=>r.ok?r.json():null).catch(()=>null):null;
      if(!host.isConnected)return;
      host.replaceChildren();
      this[`${kind}Mount`]=module[kind==='forecast'?'mountProvincialForecast':kind==='income'?'mountIncomePaths':'mountDynamicPrices'](host,{data,benchmarks,shapes:this.shapes,initial:this.state,onChange:selection=>{
        this.state=normalizeEconomyState({...this.state,...(kind==='forecast'?{region:selection.regions.length===1?selection.regions[0]:'CA',forecastRegions:selection.regions,forecastYear:selection.year,forecastFocus:selection.focus}:kind==='income'?{region:selection.region,incomeIndustry:selection.industry,incomeYear:selection.year,demandMillion:selection.demandMillion,includeInduced:selection.includeInduced}:{historyRegions:selection.regions,historyOilChange:selection.oilChangePct,historyHorizon:selection.horizonYears,historyYear:selection.selectedYear??null})});this[`${kind}MountKey`]=this.researchKey(kind);const place=this.root.querySelector('#ec-region');if(place)place.value=this.state.region;this.onChange(this.state);
      }});
    }catch{if(host.isConnected)host.innerHTML=`<p role="alert">This dataset could not load.</p><button data-ec-action="retry-research" data-research-kind="${kind}">Retry data</button>`;}
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
        this.state=normalizeEconomyState({...this.state,tradeCommodity:next.tradeCommodity,tradeYear:next.tradeYear,priceShock:next.priceShock,linkScope:next.linkScope,tradeRegions:next.regions,transferSet:next.transferSet,tradePanelId:next.panelId,tradeViewMode:next.viewMode,tradeDisplay:next.tradeDisplay,tradeConnection:next.tradeConnection,tradeFocus:next.tradeFocus,guideStep:next.guideStep,guideHorizon:next.guideHorizon,guideHouseholdBasis:next.guideHouseholdBasis,guideRetailShock:next.guideRetailShock});
        this.tradeMountKey=JSON.stringify([this.state.tradeCommodity,this.state.tradeYear,this.state.priceShock,this.state.linkScope,this.state.tradeRegions,this.state.transferSet,this.state.tradePanelId,this.state.tradeViewMode,this.state.tradeDisplay,this.state.tradeConnection,this.state.tradeFocus,this.state.guideStep,this.state.guideHorizon,this.state.guideHouseholdBasis,this.state.guideRetailShock]);
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
