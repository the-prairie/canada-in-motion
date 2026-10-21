import {project,unproject,normalizeArea,JURISDICTIONS,STATUSES,statusIndex,summarize,statusAvailability,inventoryScope,matchingJurisdictions} from './atlas-model.mjs';
import {filterWells} from './model.mjs';
import {ALBERTA_LIFECYCLE,validateAlbertaWellStatus} from './alberta-status-model.mjs';

const format = value => Number(value).toLocaleString('en-CA');
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const names = Object.fromEntries(JURISDICTIONS);
const anchors = {BC:[-126,55],AB:[-115,57],SK:[-106,57],MB:[-98,57],ON:[-85,51],QC:[-72,54],NB:[-68,46.4],NS:[-60,44],PE:[-61,47],NL:[-57,54],YT:[-136,65],NT:[-121,66],NU:[-96,71]};
const vertex = `attribute vec2 a_geo;attribute vec2 a_compare;attribute float a_status;attribute float a_match;uniform vec2 u_resolution;uniform vec2 u_offset;uniform float u_scale;uniform float u_morph;uniform float u_size;varying vec4 v_colour;void main(){vec2 map=vec2(a_geo.x,-a_geo.y)*u_scale+u_offset;vec2 p=mix(map,a_compare,u_morph);gl_Position=vec4(p.x/u_resolution.x*2.-1.,1.-p.y/u_resolution.y*2.,0.,1.);vec3 colour=vec3(.506,.529,.514);if(a_status<.5)colour=vec3(.639,.298,.196);else if(a_status<1.5)colour=vec3(.631,.518,.212);else if(a_status<2.5)colour=vec3(.153,.463,.431);float alpha=a_match>.5?.72:.035*(1.-u_morph);gl_PointSize=a_match>.5?u_size:1.;v_colour=vec4(colour,alpha);}`;
const fragment = `precision mediump float;varying vec4 v_colour;void main(){if(v_colour.a<.001)discard;vec2 p=gl_PointCoord-.5;if(dot(p,p)>.25)discard;gl_FragColor=v_colour;}`;

export class RecordAtlas {
  constructor(host, options) {
    this.host = host;
    this.options = options;
    this.wells = options.wells;
    this.inventory = summarize(this.wells);
    this.catalog = options.catalog;
    this.projected = this.wells.map(well => project(well.lon,well.lat));
    this.ids = new Map(this.wells.map((well,index) => [well.id,index]));
    this.buffer = new Float32Array(this.wells.length * 6);
    this.wells.forEach((well,index) => this.buffer.set([...this.projected[index],0,0,statusIndex(well),1],index*6));
    this.shapes = (options.provinces.features || []).filter(feature=>names[feature.properties.postal] && feature.properties.admin!=='United States of America').map(feature => ({code:feature.properties.postal,paths:(feature.geometry.type==='Polygon' ? [feature.geometry.coordinates] : feature.geometry.coordinates).flat().map(ring=>ring.map(point=>project(...point)))}));
    const bounds = [Infinity,Infinity,-Infinity,-Infinity];
    for (const shape of this.shapes) for (const ring of shape.paths) for (const [x,y] of ring) {
      bounds[0]=Math.min(bounds[0],x);bounds[1]=Math.min(bounds[1],y);bounds[2]=Math.max(bounds[2],x);bounds[3]=Math.max(bounds[3],y);
    }
    for(const [x,y] of this.projected){bounds[0]=Math.min(bounds[0],x);bounds[1]=Math.min(bounds[1],y);bounds[2]=Math.max(bounds[2],x);bounds[3]=Math.max(bounds[3],y);}
    this.bounds = bounds.every(Number.isFinite) ? bounds : [-650,-350,650,500];
    this.camera = {zoom:1,pan:[0,0]};
    this.visible = false;
    this.intersecting = true;
    this.mode = 'pan';
    this.progress = 0;
    this.reduced = matchMedia('(prefers-reduced-motion: reduce)');
    this.abort = new AbortController();
    this.build();
    void this.loadAlbertaTotals();
    this.initGL();
    this.resizeObserver = new ResizeObserver(()=>this.resize());
    this.resizeObserver.observe(this.stage);
    this.intersectionObserver = new IntersectionObserver(entries=>{this.intersecting=entries[0].isIntersecting;if(!this.intersecting){cancelAnimationFrame(this.animation);this.progress=this.state?.exploration?.arrangement==='compare'?1:0;}else this.draw();});
    this.intersectionObserver.observe(host);
    document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelAnimationFrame(this.animation);this.progress=this.state?.exploration?.arrangement==='compare'?1:0;}else this.draw();},{signal:this.abort.signal});
  }
  build() {
    this.host.innerHTML = `<section class="ra-workspace" aria-label="Well record atlas">
      <div class="ra-main">
        <header class="ra-toolbar"><div class="ra-arrangements" role="group" aria-label="Arrange well records"><button type="button" data-ra-arrangement="geography" aria-pressed="true">Geography</button><button type="button" data-ra-arrangement="compare" aria-pressed="false">Compare inventories</button><button type="button" data-ra-arrangement="table" aria-pressed="false">Table</button></div><span class="ra-record-key">One point · one source record</span></header><div class="ra-legend" aria-label="Recorded closure status legend">${STATUSES.map(status=>`<span><i style="background:${status.colour}"></i>${status.label}</span>`).join('')}</div>
        <div class="ra-comparison-summary" hidden><div><strong>Inventory by province</strong><p class="ra-comparison-selection" aria-live="polite"></p><p class="ra-comparison-key">Full bars show published records. Dark strips show matches.</p></div><button type="button" data-ra-command="clear-filters">Clear filters</button></div>
        <div class="ra-stage" tabindex="0" role="group" aria-label="Map of published well records. Arrow keys pan. Plus and minus zoom. Enter starts an area selection." aria-describedby="ra-map-help"><canvas class="ra-boundaries" aria-hidden="true"></canvas><canvas class="ra-points" aria-hidden="true"></canvas><div class="ra-map-tools" role="group" aria-label="Map controls"><button type="button" data-ra-command="pan" aria-pressed="true">Pan</button><button type="button" data-ra-command="select" aria-pressed="false">Select area</button><button type="button" data-ra-command="in" aria-label="Zoom in">+</button><button type="button" data-ra-command="out" aria-label="Zoom out">−</button><button type="button" data-ra-command="fit">Fit Canada</button></div><div class="ra-coordinate" aria-hidden="true"></div><div class="ra-chart" hidden></div><div class="ra-table-wrap" hidden></div><div class="ra-renderer-note" hidden>A simpler map is shown. All records and counts remain available.</div></div>
        <footer class="ra-stage-footer"><details class="ra-guide"><summary>About this view</summary><p class="ra-record-key-detail"></p><p class="ra-map-help" id="ra-map-help">Drag to pan. Select an area to inspect its records.</p><p class="ra-comparison-note" hidden></p><span class="ra-projection">Canada Albers · equal area<br><a href="https://www.naturalearthdata.com/about/terms-of-use/" target="_blank" rel="noopener">Boundaries · Natural Earth</a></span></details></footer>
      </div>
      <aside class="ra-inspector" aria-label="Matching well records">
        <div class="ra-selection-heading"><h2 class="ra-place">Canada</h2><p class="ra-coverage-label"></p><div class="ra-total" aria-live="polite" aria-atomic="true">0</div><p class="ra-match-label">matching records</p></div>
        <div class="ra-region-picker"><button type="button" class="ra-province-toggle" data-ra-command="province-picker" aria-haspopup="dialog" aria-expanded="false" aria-controls="ra-province-dialog"><span class="ra-picker-value">All provinces & territories</span><svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><path d="m5 8 5 5 5-5" fill="none" stroke="currentColor" stroke-width="1.5"/></svg></button><div id="ra-province-dialog" class="ra-province-dialog" role="dialog" aria-label="Choose a province or territory" hidden><div class="ra-picker-search"><input type="search" class="ra-province-search" aria-label="Find province or territory" placeholder="Find a province or territory" autocomplete="off"><button type="button" data-ra-command="close-picker" aria-label="Close province picker">×</button></div><div class="ra-province-options" role="group" aria-label="Provinces and territories"></div><p class="ra-picker-empty" hidden>No matching province or territory.</p></div></div>
        <div class="ra-filter-summary"></div><button class="ra-clear-filters" type="button" data-ra-command="clear-filters" hidden>Clear all filters</button><button class="ra-clear-area" type="button" data-ra-command="clear-area" hidden>Clear selected area</button>
        <div class="ra-status-heading"><h3>Recorded closure status</h3><button type="button" data-ra-command="all-status" hidden>Show all</button></div><div class="ra-statuses" role="group" aria-label="Filter by recorded closure status">${STATUSES.map(status=>`<button type="button" data-ra-status="${status.id}" aria-pressed="false" style="--ra-status:${status.colour}"><span class="ra-swatch"></span><span>${status.label}</span><strong>0</strong><span class="ra-status-track"><i></i></span></button>`).join('')}</div>
        <div class="ra-actions"><button type="button" data-ra-command="records">View matching records <span aria-hidden="true">↗</span></button><button type="button" data-ra-command="export">Download CSV <span aria-hidden="true">↓</span></button></div>
        <button class="ra-evidence-button" type="button" data-ra-command="evidence">Sources</button><dialog class="ra-evidence" aria-labelledby="ra-evidence-title"><header><h2 id="ra-evidence-title">Sources and coverage</h2><button type="button" data-ra-command="close-evidence">Close</button></header><p class="ra-scope"></p><div class="ra-source-list"></div><div class="ra-evidence-guide"></div></dialog>
        <section class="ra-preview"><h3>Matching records</h3><div class="ra-preview-list"></div></section>
      </aside>
    </section>`;
    this.stage=this.host.querySelector('.ra-stage');
    const inspector=this.host.querySelector('.ra-inspector');
    const provincePicker=this.host.querySelector('.ra-region-picker');
    const context=document.createElement('header');context.className='ra-place-context';
    this.host.querySelector('.ra-workspace').prepend(context);
    context.append(provincePicker,this.host.querySelector('.ra-selection-heading'));
    const guide=this.host.querySelector('.ra-guide');
    this.host.querySelector('.ra-evidence-guide').append(...Array.from(guide.children).filter(child=>child.tagName!=='SUMMARY'));
    this.host.querySelector('.ra-stage-footer').remove();
    context.append(this.host.querySelector('.ra-evidence-button'));
    const provinceSummary=document.createElement('section');
    provinceSummary.className='ra-provincial-summary';provinceSummary.hidden=true;
    provinceSummary.setAttribute('aria-label','Alberta province-wide well totals');
    context.append(provinceSummary);
    if(typeof this.host.querySelector('.ra-province-dialog').showPopover==='function')this.host.querySelector('.ra-province-dialog').setAttribute('popover','manual');
    this.stage.after(this.host.querySelector('.ra-renderer-note'));
    this.base=this.host.querySelector('.ra-boundaries');
    this.canvas=this.host.querySelector('.ra-points');
    this.ctx=this.base.getContext('2d');
    this.listen(this.host,'click',event=>this.click(event));
    this.listen(this.host.querySelector('.ra-province-search'),'input',()=>this.renderProvinceOptions());
    this.listen(this.host.querySelector('.ra-region-picker'),'keydown',event=>this.pickerKey(event));
    this.listen(document,'pointerdown',event=>{if(this.pickerOpen&&!this.host.querySelector('.ra-region-picker').contains(event.target))this.closePicker(false);});
    this.listen(document,'focusin',event=>{if(this.pickerOpen&&!this.host.querySelector('.ra-region-picker').contains(event.target))this.closePicker(false);});
    this.listen(this.stage,'pointerdown',event=>this.pointerDown(event));
    this.listen(this.stage,'pointermove',event=>this.pointerMove(event));
    this.listen(this.stage,'pointerup',event=>this.pointerUp(event));
    this.listen(this.stage,'pointercancel',()=>{this.drag=null;this.draft=null;this.draw();});
    this.listen(this.stage,'keydown',event=>this.key(event));
    this.listen(this.stage,'wheel',event=>{if(!this.isMap()||event.target.closest('button'))return;event.preventDefault();this.zoom(Math.exp(-event.deltaY*.001),this.pointer(event));},{passive:false});
    this.listen(this.canvas,'webglcontextlost',event=>{event.preventDefault();this.gl=null;this.fallback();});
  }
  listen(target,event,handler,options={}) { target.addEventListener(event,handler,{...options,signal:this.abort.signal}); }
  change(patch) { this.options.onChange(patch); }
  openPicker() {
    this.pickerOpen=true;
    const dialog=this.host.querySelector('.ra-province-dialog');dialog.hidden=false;
    if(typeof dialog.showPopover==='function'){
      const bounds=this.host.querySelector('.ra-province-toggle').getBoundingClientRect();
      const width=Math.min(360,window.innerWidth-32),height=Math.min(430,window.innerHeight-32);
      dialog.style.width=`${width}px`;dialog.style.left=`${Math.max(16,Math.min(bounds.right-width,window.innerWidth-width-16))}px`;
      dialog.style.top=`${Math.max(16,Math.min(bounds.bottom+8,window.innerHeight-height-16))}px`;
      dialog.style.maxHeight=`${height}px`;dialog.showPopover();
    }
    this.host.querySelector('.ra-province-toggle').setAttribute('aria-expanded','true');
    const search=this.host.querySelector('.ra-province-search');search.value='';
    this.renderProvinceOptions();search.focus({preventScroll:true});
  }
  closePicker(restore=true) {
    this.pickerOpen=false;
    const dialog=this.host.querySelector('.ra-province-dialog');
    if(typeof dialog.hidePopover==='function'&&dialog.matches(':popover-open'))dialog.hidePopover();
    dialog.hidden=true;
    this.host.querySelector('.ra-province-toggle').setAttribute('aria-expanded','false');
    if(restore)this.host.querySelector('.ra-province-toggle').focus({preventScroll:true});
  }
  renderProvinceOptions() {
    const choices=matchingJurisdictions(this.host.querySelector('.ra-province-search').value);
    this.host.querySelector('.ra-province-options').innerHTML=choices.map(([code,name])=>{
      const total=code==='all'?this.inventory.total:this.inventory.rows.find(row=>row.code===code)?.total || 0;
      const scope=inventoryScope(this.catalog,code);
      return `<button type="button" data-ra-pick="${code}" aria-pressed="${this.state?.province===code}"><span class="ra-picker-name">${escape(name)}</span><span class="ra-picker-count">${format(total)}</span><span class="ra-picker-scope">${escape(scope.label)}</span><span class="ra-picker-check" aria-hidden="true">${this.state?.province===code?'✓':''}</span></button>`;
    }).join('');
    this.host.querySelector('.ra-picker-empty').hidden=choices.length>0;
  }
  pickerKey(event) {
    if(event.key==='Escape'&&this.pickerOpen){event.preventDefault();event.stopPropagation();this.closePicker();return;}
    if(!this.pickerOpen&&['ArrowDown','ArrowUp'].includes(event.key)){event.preventDefault();this.openPicker();return;}
    if(!this.pickerOpen||!['ArrowDown','ArrowUp','Home','End'].includes(event.key))return;
    const options=[...this.host.querySelectorAll('[data-ra-pick]')];
    if(!options.length)return;
    const index=options.indexOf(document.activeElement);
    if(index<0&&event.key!=='ArrowDown')return;
    event.preventDefault();
    const next=event.key==='Home'?0:event.key==='End'?options.length-1:event.key==='ArrowDown'?Math.min(index+1,options.length-1):Math.max(index-1,0);
    options[next].focus({preventScroll:true});options[next].scrollIntoView({block:'nearest'});
  }
  exploration(patch) { this.change({exploration:{arrangement:'geography',area:null,...this.state.exploration,...patch}}); }
  isMap() { return this.state?.exploration?.arrangement === 'geography'; }
  click(event) {
    const button=event.target.closest('button');
    if(!button || button.disabled || !this.state)return;
    if(button.dataset.raPick){const province=button.dataset.raPick;this.closePicker();this.change({province});return;}
    if(button.dataset.raArrangement){this.exploration({arrangement:button.dataset.raArrangement});return;}
    if(button.dataset.raStatus){this.change(button.dataset.raSegmentProvince ? {province:button.dataset.raSegmentProvince,closure:button.dataset.raStatus} : {closure:this.state.closure===button.dataset.raStatus?'all':button.dataset.raStatus});return;}
    if(button.dataset.raProvince){this.change({province:this.state.province===button.dataset.raProvince?'all':button.dataset.raProvince});return;}
    if(button.dataset.raWell){this.inspectRecord(button.dataset.raWell);return;}
    if(button.dataset.raSource){this.options.onSource(button.dataset.raSource);return;}
    switch(button.dataset.raCommand){
      case 'retry-alberta-totals': void this.loadAlbertaTotals();break;
      case 'province-picker':this.pickerOpen?this.closePicker():this.openPicker();break;
      case 'close-picker':this.closePicker();break;
      case 'pan': case 'select': this.mode=button.dataset.raCommand;this.syncMode();break;
      case 'in':this.zoom(1.5);break;
      case 'out':this.zoom(1/1.5);break;
      case 'fit':this.autoProvince=false;this.camera={zoom:1,pan:[0,0]};this.draw();break;
      case 'clear-filters':this.change({province:'all',closure:'all',orphan:'all',query:'',eventYear:'all',eventType:'all',cohort:'all',exploration:{...this.state.exploration,area:null}});break;
      case 'clear-area':this.draft=null;this.exploration({area:null});break;
      case 'all-status':this.change({closure:'all'});break;
      case 'records':this.options.onRecords();break;
      case 'evidence':this.host.querySelector('.ra-evidence').showModal();break;
      case 'close-evidence':this.host.querySelector('.ra-evidence').close();this.host.querySelector('[data-ra-command=evidence]').focus();break;
      case 'export':this.options.onExport();break;
    }
  }
  update(state, filtered) {
    const oldArrangement=this.state?.exploration?.arrangement;
    const oldProvince=this.lastProvince;
    this.state=state;
    this.filtered=filtered;
    this.summary=summarize(filtered);
    this.facets=summarize(filterWells(this.wells,{...state,closure:'all'}));
    this.matched=new Set(filtered.map(well=>well.id));
    for(let index=0;index<this.wells.length;index++)this.buffer[index*6+5]=this.matched.has(this.wells[index].id)?1:0;
    this.updateInspector();
    this.updateChart();
    this.resize();
    if(state.province!==oldProvince){this.lastProvince=state.province;this.fitProvince(state.province);}
    const arrangement=state.exploration?.arrangement || 'geography';
    this.host.dataset.arrangement=arrangement;
    this.host.querySelectorAll('[data-ra-arrangement]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.raArrangement===arrangement)));
    this.host.querySelector('.ra-chart').hidden=arrangement!=='compare';
    this.host.querySelector('.ra-table-wrap').hidden=arrangement!=='table';
    this.host.querySelector('.ra-map-tools').hidden=arrangement!=='geography';
    this.host.querySelector('.ra-comparison-note').hidden=arrangement==='geography';
    this.host.querySelector('.ra-comparison-summary').hidden=arrangement!=='compare';
    this.host.querySelector('.ra-record-key').textContent=arrangement==='table'?'Provincial totals and mapped inventories':arrangement==='compare'?'Published inventory + matching subset':'One point · one source record';
    this.host.querySelector('.ra-record-key-detail').textContent=this.host.querySelector('.ra-record-key').textContent;
    this.host.querySelector('.ra-projection').innerHTML=arrangement==='geography'?'Canada Albers · equal area<br><a href="https://www.naturalearthdata.com/about/terms-of-use/" target="_blank" rel="noopener">Boundaries · Natural Earth</a>':arrangement==='compare'?'100% = published records in that row':'Matching counts follow your filters. Provincial totals and inventory counts stay fixed.';
    this.host.querySelector('.ra-comparison-note').textContent=(arrangement==='compare'?'Bars retain the full published inventory. Dark strips show the matching subset. ':'')+'Inventories have different scopes and dates. Alberta’s mapped records come from the published abandoned-well layer. '+(arrangement==='table'?'AER provincial totals appear in a separate row. ':'')+'These counts do not measure provincial closure performance.';
    this.stage.setAttribute('aria-label',arrangement==='geography'?'Map of published well records. Arrow keys pan. Plus and minus zoom. Enter starts an area selection.':'Published inventory composition and matching subset by province and recorded closure status');
    this.syncMode();
    if(arrangement!==oldArrangement)this.animate(arrangement==='compare'?1:0);else this.draw();
  }
  async loadAlbertaTotals() {
    this.albertaTotalsLoading=true;this.albertaTotalsError=false;this.updateAlbertaTotals();
    try{
      const response=await fetch('data/alberta-well-status.json',{signal:this.abort.signal});
      if(!response.ok)throw Error();
      this.albertaTotals=validateAlbertaWellStatus(await response.json());
    }catch(error){if(error.name!=='AbortError')this.albertaTotalsError=true;}
    finally{this.albertaTotalsLoading=false;if(!this.abort.signal.aborted)this.updateAlbertaTotals();}
  }
  albertaTableCells() {
    const data=this.albertaTotals;
    if(!data)return `<th scope="row">Alberta<small>AER provincial totals</small></th><td colspan="6" class="ra-aer-load" role="status">${this.albertaTotalsLoading?'Loading AER totals…':'Alberta’s provincial totals could not load. <button type="button" data-ra-command="retry-alberta-totals">Retry totals</button>'}</td>`;
    const row=data.latest;
    const notApplicable='<td class="ra-not-applicable"><abbr title="Not applicable: AER uses different lifecycle categories; map filters do not apply">N/A</abbr></td>';
    return `<th scope="row">Alberta<small><a href="${escape(data.source.url)}" target="_blank" rel="noopener">AER well licences</a> · ${row.year}</small><small>${format(row.operating)} operating</small></th><td>${format(row.total)}</td>${notApplicable.repeat(3)}<td class="ra-aer-active"><strong data-ra-aer-active>${format(row.counts.active)}</strong><small>+ ${format(row.counts.marginal)} marginal</small></td>${notApplicable}`;
  }
  updateAlbertaTotals() {
    const tableRow=this.host.querySelector('[data-ra-aer-row]');
    if(tableRow)tableRow.innerHTML=this.albertaTableCells();
    const host=this.host.querySelector('.ra-provincial-summary');
    if(!host)return;host.hidden=this.state?.province!=='AB';
    const existing=this.host.querySelector('.ra-alberta-evidence');if(existing)existing.hidden=host.hidden;
    if(host.hidden)return;
    if(!this.albertaTotals){host.innerHTML=this.albertaTotalsLoading?'<p role="status">Loading AER’s provincial totals…</p>':'<p>Alberta’s provincial totals could not load.</p><button type="button" data-ra-command="retry-alberta-totals">Retry totals</button>';return;}
    const data=this.albertaTotals,row=data.latest;
    host.innerHTML=`<div><strong class="ra-operating-total">${format(row.operating)}</strong><span>operating licences · Alberta · ${row.year}</span></div><p>Active ${format(row.counts.active)} + marginal ${format(row.counts.marginal)}. Province-wide total; these are not mapped points.</p>`;
    this.albertaEvidence=`<h3>Alberta well licences · ${row.year}</h3><p>${escape(row.periodLabel)}. Map filters do not change these provincial totals.</p><dl>${ALBERTA_LIFECYCLE.map(([id,label])=>`<div><dt>${label}</dt><dd>${format(row.counts[id])}</dd></div>`).join('')}</dl><p>${escape(data.definitions.marginal)}</p><p>The publisher does not identify the month for the current-year snapshot. Retrieved ${escape(data.retrievedAt.slice(0,10))}.</p><table><caption>Operating licences over time</caption><thead><tr><th>Year</th><th>Active + marginal</th></tr></thead><tbody>${data.observations.map(item=>`<tr><th>${item.year}</th><td>${format(item.operating)}</td></tr>`).join('')}</tbody></table><p>${escape(data.attribution)}</p><a href="${escape(data.source.url)}" target="_blank" rel="noopener">AER well status</a>`;
    let evidence=this.host.querySelector('.ra-alberta-evidence');if(!evidence){evidence=document.createElement('section');evidence.className='ra-alberta-evidence';this.host.querySelector('.ra-evidence').append(evidence);}evidence.innerHTML=this.albertaEvidence;
  }
  updateInspector() {
    const {state,summary}=this;
    const availability=statusAvailability(this.catalog,state.province,this.inventory);
    const selectedStatus=STATUSES.findIndex(status=>status.id===state.closure);
    const outsideScope=selectedStatus>=0&&!availability[selectedStatus];
    const scope=inventoryScope(this.catalog,state.province);
    this.host.querySelector('.ra-place').textContent=names[state.province] || 'Canada';
    this.host.querySelector('.ra-coverage-label').textContent=scope.label;
    this.host.querySelector('.ra-total').textContent=outsideScope?'—':format(summary.total);
    this.host.querySelector('.ra-match-label').textContent=outsideScope?`${STATUSES[selectedStatus].label} wells not mapped`:summary.total===1?'matching record':'matching records';
    this.updateAlbertaTotals();
    this.host.querySelector('.ra-picker-value').textContent=names[state.province] || 'All provinces & territories';
    this.host.querySelector('.ra-province-toggle').setAttribute('aria-label',`Province or territory: ${names[state.province] || 'All provinces & territories'}`);
    this.host.querySelector('.ra-clear-area').hidden=!state.exploration?.area;
    const filters=[];
    if(state.cohort==='cleanup')filters.push('Cleanup records');
    if(state.orphan!=='all')filters.push(`Orphan status · ${state.orphan}`);
    if(state.query)filters.push(`Search · ${state.query}`);
    if(state.eventYear!=='all')filters.push(`Event year · ${state.eventYear}`);
    if(state.eventType!=='all')filters.push(`Event type · ${state.eventType}`);
    if(state.exploration?.area)filters.push('Selected geographic area');
    this.host.querySelector('.ra-filter-summary').textContent=filters.join(' / ');
    this.host.querySelector('.ra-clear-filters').hidden=!filters.length && state.province==='all' && state.closure==='all';
    this.host.querySelector('[data-ra-command="all-status"]').hidden=state.closure==='all';
    this.host.querySelectorAll('.ra-statuses [data-ra-status]').forEach((button,index)=>{
      button.setAttribute('aria-pressed',String(state.closure===STATUSES[index].id));
      button.disabled=!availability[index];
      button.querySelector('strong').textContent=availability[index]?format(this.facets.counts[index]):state.province==='AB'?'Not mapped':'Not covered';
      button.querySelector('i').style.width=`${this.facets.total?this.facets.counts[index]/this.facets.total*100:0}%`;
      button.querySelector('.ra-status-track').hidden=!availability[index];
      button.setAttribute('aria-label',availability[index]?`${STATUSES[index].label}: ${format(this.facets.counts[index])} source records. Filter by status.`:`${STATUSES[index].label}: not included in these mapped records.`);
    });
    this.host.querySelector('[data-ra-command="export"]').disabled=!summary.total;
    const sourceIds=new Set(this.filtered.map(well=>well.sourceId));
    const sources=this.catalog.sources.filter(source=>sourceIds.has(source.id) || (!summary.total && (state.province==='all'||source.province===state.province)));
    const historical=sources.some(source=>source.observationsThrough);
    this.host.querySelector('.ra-scope').textContent=scope.detail+' Status options count all records that match your other filters. These are source-record counts, not a census of wells.'+(historical?' Some observations are historical.':'');

    this.host.querySelector('.ra-source-list').innerHTML=sources.map(source=>{
      let date=source.sourceObservationDate || source.sourceDateText;
      if(!date&&source.upstreamModifiedAt){const parsed=new Date(source.upstreamModifiedAt);if(Number.isFinite(parsed.getTime()))date=parsed.toISOString().slice(0,10);}
      return `<article><button type="button" data-ra-source="${escape(source.id)}">${escape(source.title)} <span aria-hidden="true">↗</span></button><p>${escape(source.observationsThrough ? 'Historical inventory · '+source.observationsThrough : date ? 'Source updated '+date : 'Source date not supplied')}</p><p>Downloaded ${escape(source.retrievedAt?.slice(0,10) || 'date unavailable')}</p></article>`;
    }).join('');
    this.host.querySelector('.ra-preview-list').innerHTML=this.filtered.length?this.filtered.slice(0,3).map(well=>`<button type="button" data-ra-well="${escape(well.id)}"><span>${escape(well.name || well.license || 'Well record')}</span><small>${escape(well.province)} · ${escape(well.identifierLabel || 'Licence')} ${escape(well.license)}${well.observationsThrough?' · Historical':''}</small></button>`).join(''):`<p>${outsideScope?'This source does not cover the selected status. Choose Show all to see its published records.':'No records match these filters. Clear the area or change the province and status.'}</p>`;
  }
  updateChart() {
    const chart=this.host.querySelector('.ra-chart');
    const table=this.host.querySelector('.ra-table-wrap');
    const focused=this.host.contains(document.activeElement)?document.activeElement:null;
    const focusRegion=focused?.dataset.raSegmentProvince || focused?.dataset.raProvince;
    const focusStatus=focused?.dataset.raStatus;
    const focusContainer=focused && chart.contains(focused)?chart:focused && table.contains(focused)?table:null;
    const matches=new Map(this.summary.rows.map(row=>[row.code,row]));
    const filtered=this.summary.total!==this.inventory.total;
    const selection=[names[this.state.province],STATUSES.find(status=>status.id===this.state.closure)?.label,this.state.orphan!=='all'?'Orphan designation filter':null,this.state.query?'Search filter':null,this.state.exploration?.area?'Selected area':null,this.state.cohort==='cleanup'?'Cleanup records':null,this.state.eventYear!=='all'||this.state.eventType!=='all'?'Event filter':null].filter(Boolean);
    this.host.querySelector('.ra-comparison-selection').textContent=selection.length?selection.join(' · '):'All published records';
    this.host.querySelector('.ra-comparison-summary button').hidden=!filtered&&!selection.length;
    chart.innerHTML=`<div class="ra-chart-axis"><span>0%</span><span>50%</span><span>100%</span></div><div class="ra-count-heading">Matching / published</div>${this.inventory.rows.map(row=>{
      const match=matches.get(row.code);
      const available=statusAvailability(this.catalog,row.code,this.inventory);
      const statusIndex=STATUSES.findIndex(status=>status.id===this.state.closure);
      const outsideScope=statusIndex>=0&&!available[statusIndex];
      const count=outsideScope?'—':format(match.total);
      const matchingLabel=outsideScope?`${STATUSES[statusIndex].label} status is not covered`:`${format(match.total)} match filters`;
      return `<div class="ra-chart-row" data-ra-row="${row.code}"><button type="button" data-ra-province="${row.code}" aria-pressed="${this.state.province===row.code}" aria-label="${row.name}. ${matchingLabel}. ${format(row.total)} published records. Select province." title="${row.name}"><span>${row.code}</span><small>${row.code==='AB'?'Abandoned layer':row.code==='SK'?'Orphan inventory':row.name}</small></button><div class="ra-row-bar" aria-label="${escape(row.name)}. Published inventory ${format(row.total)} records. ${matchingLabel}.">${STATUSES.map((status,i)=>`<button type="button" data-ra-status="${status.id}" data-ra-segment-province="${row.code}" aria-label="Filter ${status.label} in ${row.name}. ${format(match.counts[i])} matching of ${format(row.counts[i])} published records." aria-pressed="${this.state.province===row.code&&this.state.closure===status.id}" title="${status.label}: ${format(match.counts[i])} matching / ${format(row.counts[i])} published" style="width:${row.total?row.counts[i]/row.total*100:0}%;--ra-status:${status.colour}" ${row.counts[i]?'':'hidden'} tabindex="-1"><span class="ra-subset" aria-hidden="true" style="width:${row.counts[i]?match.counts[i]/row.counts[i]*100:0}%"></span></button>`).join('')}${row.total?'':'<span>No published records</span>'}</div><div class="ra-row-count"><strong>${count}</strong><span>/ ${format(row.total)}</span></div></div>`;
    }).join('')}`;
    table.innerHTML=`<table><caption>AER totals cover all Alberta well licences. Mapped status counts show each full inventory; Matching follows your filters.</caption><thead><tr><th scope="col">Province / territory</th><th scope="col">Total</th><th scope="col">Matching</th>${STATUSES.map(status=>`<th scope="col">${status.label}</th>`).join('')}</tr></thead><tbody>${this.inventory.rows.map(row=>{
      const match=matches.get(row.code);
      const available=statusAvailability(this.catalog,row.code,this.inventory);
      const selected=STATUSES.findIndex(status=>status.id===this.state.closure);
      const count=selected>=0&&!available[selected]?'—':format(match.total);
      return `${row.code==='AB'?`<tr class="ra-aer-row" data-ra-aer-row aria-label="Alberta province-wide well licences">${this.albertaTableCells()}</tr>`:''}<tr data-ra-mapped-row="${row.code}"><th scope="row"><button type="button" data-ra-province="${row.code}" aria-pressed="${this.state.province===row.code}">${row.name}</button>${row.code==='AB'?'<small>Mapped source records</small>':''}</th><td>${format(row.total)}</td><td data-ra-matching>${count}</td>${row.counts.map((count,index)=>`<td><button type="button" data-ra-status="${STATUSES[index].id}" data-ra-segment-province="${row.code}" aria-pressed="${this.state.province===row.code&&this.state.closure===STATUSES[index].id}" aria-label="${row.name}, ${STATUSES[index].label}. ${available[index]?format(count)+' published source records. Select status.':'Not included in these mapped records.'}" ${available[index]?'':'disabled'}>${available[index]?format(count):row.code==='AB'?'Not mapped':'—'}</button></td>`).join('')}</tr>`;
    }).join('')}</tbody></table>`;
    if(focusContainer&&focusRegion){
      const selector=focusStatus?`[data-ra-segment-province="${focusRegion}"][data-ra-status="${focusStatus}"]`:`[data-ra-province="${focusRegion}"]`;
      focusContainer.querySelector(selector)?.focus({preventScroll:true});
    }
  }
  chartPositions() {
    if(!this.summary)return;
    const left=this.width<600?56:180, right=this.width<600?98:124;
    const span=Math.max(60,this.width-left-right);
    const top=64, step=(this.height-top-20)/13;
    const rows=new Map(this.inventory.rows.map((row,index)=>[row.code,{...row,index,cursor:[0,0,0,0],offsets:row.counts.map((_,status)=>row.counts.slice(0,status).reduce((a,b)=>a+b,0))}]));
    this.wells.forEach((well,index)=>{
      const row=rows.get(well.province), status=statusIndex(well);
      if(!row)return;
      const rank=row.offsets[status]+row.cursor[status]++;
      this.buffer[index*6+2]=left+(row.total?(rank+.5)/row.total:0)*span;
      const seed=Math.sin((index+1)*127.1)*43758.5453;
      this.buffer[index*6+3]=top+(row.index+.5)*step+(seed-Math.floor(seed)-.5)*Math.min(18,step*.5);
    });
    this.host.style.setProperty('--ra-chart-left',`${left}px`);
    this.host.style.setProperty('--ra-chart-right',`${right}px`);
    if(this.gl){this.gl.bindBuffer(this.gl.ARRAY_BUFFER,this.gpuBuffer);this.gl.bufferData(this.gl.ARRAY_BUFFER,this.buffer,this.gl.DYNAMIC_DRAW);}
  }
  initGL() {
    try {
      const gl=this.canvas.getContext('webgl',{alpha:true,antialias:false});
      if(!gl)throw new Error('WebGL unavailable');
      const compile=(type,source)=>{const shader=gl.createShader(type);gl.shaderSource(shader,source);gl.compileShader(shader);if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw new Error('Map shader could not compile');return shader;};
      const program=gl.createProgram();
      this.shaders=[compile(gl.VERTEX_SHADER,vertex),compile(gl.FRAGMENT_SHADER,fragment)];
      this.shaders.forEach(shader=>gl.attachShader(program,shader));gl.linkProgram(program);
      if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error('Map shader could not link');
      gl.useProgram(program);
      this.gpuBuffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,this.gpuBuffer);gl.bufferData(gl.ARRAY_BUFFER,this.buffer,gl.DYNAMIC_DRAW);
      for(const [name,size,offset] of [['a_geo',2,0],['a_compare',2,2],['a_status',1,4],['a_match',1,5]]){const location=gl.getAttribLocation(program,name);gl.enableVertexAttribArray(location);gl.vertexAttribPointer(location,size,gl.FLOAT,false,24,offset*4);}
      this.uniforms=Object.fromEntries(['resolution','offset','scale','morph','size'].map(name=>[name,gl.getUniformLocation(program,'u_'+name)]));
      gl.enable(gl.BLEND);gl.blendFuncSeparate(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA,gl.ONE,gl.ONE_MINUS_SRC_ALPHA);
      this.gl=gl;this.program=program;
    } catch { this.fallback(); }
  }
  fallback() {
    if(this.state?.exploration?.arrangement==='compare')this.host.querySelector('.ra-record-key').textContent='Published inventory + matching subset';
    this.canvas.hidden=true;
    this.host.querySelector('.ra-renderer-note').hidden=false;
    this.draw();
  }
  resize() {
    const box=this.stage.getBoundingClientRect();
    if(!box.width||!box.height)return;
    this.width=box.width;this.height=box.height;this.dpr=Math.min(devicePixelRatio||1,1.75);
    for(const canvas of [this.base,this.canvas]) {canvas.width=Math.round(this.width*this.dpr);canvas.height=Math.round(this.height*this.dpr);}
    const [x1,y1,x2,y2]=this.bounds;
    this.fit=Math.min((this.width-48)/(x2-x1),(this.height-90)/(y2-y1));
    this.offset=[this.width/2-(x1+x2)/2*this.fit,this.height/2+(y1+y2)/2*this.fit+12];
    this.chartPositions();if(this.autoProvince&&this.state?.province!=='all')this.fitProvince(this.state.province);else this.draw();
  }
  inspectRecord(id) {this.selectedId=id;this.draw();this.options.onWell(id);}
  fitProvince(code) {
    this.autoProvince=true;
    const shape=this.shapes.find(item=>item.code===code);
    if(!shape||!this.fit){this.camera={zoom:1,pan:[0,0]};this.draw();return;}
    const points=shape.paths.flat(),xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);
    const x1=Math.min(...xs),x2=Math.max(...xs),y1=Math.min(...ys),y2=Math.max(...ys);
    const zoom=Math.min(12,Math.max(1,Math.min((this.width-90)/(x2-x1),(this.height-130)/(y2-y1))/this.fit));
    const scale=this.fit*zoom;
    this.camera={zoom,pan:[this.width/2-(x1+x2)/2*scale-this.offset[0],this.height/2+(y1+y2)/2*scale-this.offset[1]+20]};this.draw();
  }
  screen([x,y]) { const scale=this.fit*this.camera.zoom;return [x*scale+this.offset[0]+this.camera.pan[0],-y*scale+this.offset[1]+this.camera.pan[1]]; }
  world([x,y]) { const scale=this.fit*this.camera.zoom;return [(x-this.offset[0]-this.camera.pan[0])/scale,-(y-this.offset[1]-this.camera.pan[1])/scale]; }
  draw() {
    if(!this.visible||!this.intersecting||document.hidden||!this.width||!this.state)return;
    const {ctx,width,height,dpr}=this;
    ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,width,height);
    const table=this.state.exploration?.arrangement==='table';
    if(!table){
      ctx.globalAlpha=1-this.progress;
      this.drawMap();
      ctx.globalAlpha=1;
    }
    if(this.gl){
      const gl=this.gl;gl.viewport(0,0,this.canvas.width,this.canvas.height);gl.clear(gl.COLOR_BUFFER_BIT);
      if(!table){gl.useProgram(this.program);gl.uniform2f(this.uniforms.resolution,width,height);gl.uniform2f(this.uniforms.offset,this.offset[0]+this.camera.pan[0],this.offset[1]+this.camera.pan[1]);gl.uniform1f(this.uniforms.scale,this.fit*this.camera.zoom);gl.uniform1f(this.uniforms.morph,this.progress);gl.uniform1f(this.uniforms.size,Math.min(4,Math.max(1.6,this.camera.zoom))*dpr);gl.drawArrays(gl.POINTS,0,this.wells.length);}
    }else if(!table&&this.progress<1){
      ctx.globalAlpha=.7*(1-this.progress);
      for(const well of this.filtered||[]){const index=this.ids.get(well.id),p=this.screen(this.projected[index]);ctx.fillStyle=STATUSES[statusIndex(well)].colour;ctx.fillRect(p[0],p[1],1.7,1.7);}
      ctx.globalAlpha=1;
    }
    if(this.isMap()){
      this.drawArea();
      if(this.selectedId&&this.matched.has(this.selectedId)){const point=this.screen(this.projected[this.ids.get(this.selectedId)]);ctx.beginPath();ctx.arc(...point,9,0,Math.PI*2);ctx.strokeStyle='#173b36';ctx.lineWidth=2;ctx.stroke();}
    }
  }
  drawMap() {
    const {ctx,width}=this;
    ctx.lineWidth=.6;ctx.setLineDash([2,7]);ctx.strokeStyle='#d9d9ce';
    for(let lon=-140;lon<=-40;lon+=20){ctx.beginPath();for(let lat=40;lat<=84;lat++){const p=this.screen(project(lon,lat));lat===40?ctx.moveTo(...p):ctx.lineTo(...p);}ctx.stroke();}
    for(let lat=40;lat<=80;lat+=10){ctx.beginPath();for(let lon=-145;lon<=-40;lon++){const p=this.screen(project(lon,lat));lon===-145?ctx.moveTo(...p):ctx.lineTo(...p);}ctx.stroke();}
    ctx.setLineDash([]);
    for(const shape of this.shapes){ctx.beginPath();for(const ring of shape.paths){ring.forEach((point,index)=>index?ctx.lineTo(...this.screen(point)):ctx.moveTo(...this.screen(point)));ctx.closePath();}ctx.fillStyle=this.state.province===shape.code?'#e3e3d4':'#eeeee3';ctx.strokeStyle=this.state.province===shape.code?'#8b8e7d':'#bac0b4';ctx.lineWidth=this.state.province===shape.code?1.2:.65;ctx.fill('evenodd');ctx.stroke();}
    ctx.font=`${width<600?10:11}px ui-monospace,monospace`;ctx.textAlign='center';ctx.textBaseline='middle';
    for(const [code,anchor] of Object.entries(anchors)){const [x,y]=this.screen(project(...anchor));ctx.fillStyle='#555e55';ctx.fillText(code,x,y);}
  }
  drawArea() {
    const area=this.draft || this.state.exploration?.area;
    if(!area)return;
    const [x,y]=this.screen([area[0],area[3]]),[x2,y2]=this.screen([area[2],area[1]]);
    const ctx=this.ctx;ctx.fillStyle='rgba(163,76,50,.07)';ctx.strokeStyle='#833c2b';ctx.lineWidth=1.5;ctx.setLineDash([5,4]);ctx.fillRect(x,y,x2-x,y2-y);ctx.strokeRect(x,y,x2-x,y2-y);ctx.setLineDash([]);
    ctx.fillStyle='#833c2b';for(const [cx,cy] of [[x,y],[x2,y],[x,y2],[x2,y2]])ctx.fillRect(cx-3,cy-3,6,6);
  }
  animate(target) {
    cancelAnimationFrame(this.animation);
    if(this.reduced.matches||!this.visible||!this.intersecting||document.hidden){this.progress=target;this.draw();return;}
    const start=this.progress,began=performance.now();
    const frame=now=>{const t=Math.min(1,(now-began)/650);this.progress=start+(target-start)*(t*t*(3-2*t));this.draw();if(t<1&&this.visible&&this.intersecting&&!document.hidden)this.animation=requestAnimationFrame(frame);else this.progress=target;};
    this.animation=requestAnimationFrame(frame);
  }
  setVisible(visible) {
    this.visible=visible;
    if(!visible){cancelAnimationFrame(this.animation);this.progress=this.state?.exploration?.arrangement==='compare'?1:0;}
    else this.resize();
  }
  syncMode() {
    this.stage.classList.toggle('ra-selecting',this.mode==='select');
    for(const mode of ['pan','select'])this.host.querySelector(`[data-ra-command="${mode}"]`).setAttribute('aria-pressed',String(this.mode===mode));
    this.host.querySelector('.ra-map-help').textContent=!this.isMap()?'Select a province or status to filter. Use the Table for keyboard access to every status. Bar widths retain the published inventory.':this.mode==='select'?'Drag a rectangle. Keyboard: Enter starts an area; arrows move it, Shift + arrows resize it. Escape returns to pan.':'Drag to pan. Use + / − to zoom. Faint points are outside your filters.';
  }
  zoom(factor, point=[this.width/2,this.height/2]) {
    if(!this.isMap())return;
    const before=this.world(point);
    this.autoProvince=false;
    this.camera.zoom=Math.max(.75,Math.min(24,this.camera.zoom*factor));
    const after=this.screen(before);this.camera.pan[0]+=point[0]-after[0];this.camera.pan[1]+=point[1]-after[1];this.draw();
  }
  pointer(event) { const box=this.stage.getBoundingClientRect();return [event.clientX-box.left,event.clientY-box.top]; }
  pointerDown(event) {
    if(!this.isMap()||event.target.closest('button')||event.button!==0)return;
    this.stage.focus({preventScroll:true});this.stage.setPointerCapture(event.pointerId);
    this.autoProvince=false;
    this.drag={start:this.pointer(event),pan:[...this.camera.pan],moved:false};
  }
  pointerMove(event) {
    if(!this.isMap())return;
    const point=this.pointer(event),[lon,lat]=unproject(...this.world(point));
    this.host.querySelector('.ra-coordinate').textContent=`${Math.abs(lat).toFixed(2)}° ${lat>=0?'N':'S'}  ${Math.abs(lon).toFixed(2)}° ${lon>=0?'E':'W'}`;
    if(!this.drag)return;
    this.drag.moved ||= Math.hypot(point[0]-this.drag.start[0],point[1]-this.drag.start[1])>4;
    if(this.mode==='pan')this.camera.pan=[this.drag.pan[0]+point[0]-this.drag.start[0],this.drag.pan[1]+point[1]-this.drag.start[1]];
    else this.draft=normalizeArea([...this.world(this.drag.start),...this.world(point)]);
    this.draw();
  }
  pointerUp(event) {
    if(!this.drag)return;
    const {moved}=this.drag;this.drag=null;
    if(this.mode==='select'&&moved&&this.draft){const area=this.draft;this.draft=null;this.exploration({area});}
    else if(!moved&&this.mode==='pan'){
      const point=this.pointer(event);let closest=null,distance=10;
      for(const well of this.filtered){const p=this.screen(this.projected[this.ids.get(well.id)]),d=Math.hypot(point[0]-p[0],point[1]-p[1]);if(d<distance){distance=d;closest=well;}}
      if(closest)this.inspectRecord(closest.id);
    }
  }
  key(event) {
    if(event.target!==this.stage||!this.isMap())return;
    if(event.key==='Escape'){event.preventDefault();this.mode='pan';this.draft=null;this.syncMode();this.draw();return;}
    if(event.key==='Enter'){
      event.preventDefault();this.mode='select';this.syncMode();
      if(!this.state.exploration?.area){const a=this.world([this.width*.35,this.height*.35]),b=this.world([this.width*.65,this.height*.65]);this.exploration({area:normalizeArea([...a,...b])});}return;
    }
    if(event.key==='+'||event.key==='='){event.preventDefault();this.zoom(1.5);return;}
    if(event.key==='-'){event.preventDefault();this.zoom(1/1.5);return;}
    const directions={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,1],ArrowDown:[0,-1]};
    if(!directions[event.key])return;
    event.preventDefault();const [dx,dy]=directions[event.key];
    const area=this.state.exploration?.area;
    if(this.mode==='select'&&area){
      const next=[...area],step=16/(this.fit*this.camera.zoom);
      if(event.shiftKey){next[2]+=dx*step;next[3]+=dy*step;if(next[2]<=next[0]||next[3]<=next[1])return;}
      else{next[0]+=dx*step;next[2]+=dx*step;next[1]+=dy*step;next[3]+=dy*step;}
      this.exploration({area:normalizeArea(next)});
    }else{this.autoProvince=false;this.camera.pan[0]-=dx*35;this.camera.pan[1]+=dy*35;this.draw();}
  }
  destroy() {
    cancelAnimationFrame(this.animation);this.abort.abort();this.resizeObserver.disconnect();this.intersectionObserver.disconnect();
    if(this.gl){this.gl.deleteBuffer(this.gpuBuffer);this.gl.deleteProgram(this.program);this.shaders.forEach(shader=>this.gl.deleteShader(shader));}
    this.host.replaceChildren();
  }
}
