import {project,unproject,normalizeArea,JURISDICTIONS,STATUSES,statusIndex,summarize} from './atlas-model.mjs';

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
        <div class="ra-stage" tabindex="0" role="group" aria-label="Map of published well records. Arrow keys pan. Plus and minus zoom. Enter starts an area selection." aria-describedby="ra-map-help"><canvas class="ra-boundaries" aria-hidden="true"></canvas><canvas class="ra-points" aria-hidden="true"></canvas><div class="ra-map-tools" role="group" aria-label="Map controls"><button type="button" data-ra-command="pan" aria-pressed="true">Pan</button><button type="button" data-ra-command="select" aria-pressed="false">Select area</button><button type="button" data-ra-command="in" aria-label="Zoom in">+</button><button type="button" data-ra-command="out" aria-label="Zoom out">−</button><button type="button" data-ra-command="fit">Fit Canada</button></div><div class="ra-coordinate" aria-hidden="true"></div><div class="ra-chart" hidden></div><div class="ra-table-wrap" hidden></div><div class="ra-renderer-note" hidden>A simpler map is shown. All records and counts remain available.</div></div>
        <footer class="ra-stage-footer"><p class="ra-map-help" id="ra-map-help">Drag to pan. Select an area to inspect its records.</p><span class="ra-projection">Canada Albers · equal area<br><a href="https://www.naturalearthdata.com/about/terms-of-use/" target="_blank" rel="noopener">Boundaries · Natural Earth</a></span></footer>
        <p class="ra-comparison-note" hidden>Each row spans 100% of its matching records. Inventories have different scopes and dates. Alberta contains only the published abandoned-well layer; these rows do not measure provincial closure performance.</p>
      </div>
      <aside class="ra-inspector" aria-label="Matching well records">
        <div class="ra-selection-heading"><p class="ra-eyebrow">Published well records</p><h2 class="ra-place">Canada</h2><div class="ra-total" aria-live="polite" aria-atomic="true">0</div><p class="ra-match-label">matching records</p></div>
        <label class="ra-field">Province or territory<select class="ra-province"><option value="all">All provinces & territories</option>${JURISDICTIONS.map(([code,name])=>`<option value="${code}">${name}</option>`).join('')}</select></label>
        <div class="ra-filter-summary"></div><button class="ra-clear-filters" type="button" data-ra-command="clear-filters" hidden>Clear all filters</button><button class="ra-clear-area" type="button" data-ra-command="clear-area" hidden>Clear selected area</button>
        <div class="ra-status-heading"><h3>Recorded closure status</h3><button type="button" data-ra-command="all-status" hidden>Show all</button></div><div class="ra-statuses" role="group" aria-label="Filter by recorded closure status">${STATUSES.map(status=>`<button type="button" data-ra-status="${status.id}" aria-pressed="false" style="--ra-status:${status.colour}"><span class="ra-swatch"></span><span>${status.label}</span><strong>0</strong><span class="ra-status-track"><i></i></span></button>`).join('')}</div>
        <div class="ra-actions"><button type="button" data-ra-command="records">View matching records <span aria-hidden="true">↗</span></button><button type="button" data-ra-command="export">Download CSV <span aria-hidden="true">↓</span></button></div>
        <p class="ra-scope">Coverage is partial. Counts describe the loaded sources.</p>
        <details class="ra-sources"><summary>Sources & dates <span class="ra-source-count"></span></summary><div class="ra-source-list"></div></details>
        <div class="ra-preview"><h3>First matching records</h3><div class="ra-preview-list"></div></div>
      </aside>
    </section>`;
    this.stage=this.host.querySelector('.ra-stage');
    this.stage.after(this.host.querySelector('.ra-renderer-note'));
    this.base=this.host.querySelector('.ra-boundaries');
    this.canvas=this.host.querySelector('.ra-points');
    this.ctx=this.base.getContext('2d');
    this.listen(this.host,'click',event=>this.click(event));
    this.listen(this.host.querySelector('.ra-province'),'change',event=>this.change({province:event.target.value}));
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
  exploration(patch) { this.change({exploration:{arrangement:'geography',area:null,...this.state.exploration,...patch}}); }
  isMap() { return this.state?.exploration?.arrangement === 'geography'; }
  click(event) {
    const button=event.target.closest('button');
    if(!button || !this.state)return;
    if(button.dataset.raArrangement){this.exploration({arrangement:button.dataset.raArrangement});return;}
    if(button.dataset.raStatus){this.change(button.dataset.raSegmentProvince ? {province:button.dataset.raSegmentProvince,closure:button.dataset.raStatus} : {closure:this.state.closure===button.dataset.raStatus?'all':button.dataset.raStatus});return;}
    if(button.dataset.raProvince){this.change({province:this.state.province===button.dataset.raProvince?'all':button.dataset.raProvince});return;}
    if(button.dataset.raWell){this.options.onWell(button.dataset.raWell);return;}
    if(button.dataset.raSource){this.options.onSource(button.dataset.raSource);return;}
    switch(button.dataset.raCommand){
      case 'pan': case 'select': this.mode=button.dataset.raCommand;this.syncMode();break;
      case 'in':this.zoom(1.5);break;
      case 'out':this.zoom(1/1.5);break;
      case 'fit':this.camera={zoom:1,pan:[0,0]};this.draw();break;
      case 'clear-filters':this.change({province:'all',closure:'all',orphan:'all',query:'',eventYear:'all',eventType:'all',cohort:'all',exploration:{...this.state.exploration,area:null}});break;
      case 'clear-area':this.draft=null;this.exploration({area:null});break;
      case 'all-status':this.change({closure:'all'});break;
      case 'records':this.options.onRecords();break;
      case 'export':this.options.onExport();break;
    }
  }
  update(state, filtered) {
    const oldArrangement=this.state?.exploration?.arrangement;
    this.state=state;
    this.filtered=filtered;
    this.summary=summarize(filtered);
    this.matched=new Set(filtered.map(well=>well.id));
    for(let index=0;index<this.wells.length;index++)this.buffer[index*6+5]=this.matched.has(this.wells[index].id)?1:0;
    this.updateInspector();
    this.updateChart();
    this.resize();
    const arrangement=state.exploration?.arrangement || 'geography';
    this.host.dataset.arrangement=arrangement;
    this.host.querySelectorAll('[data-ra-arrangement]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.raArrangement===arrangement)));
    this.host.querySelector('.ra-chart').hidden=arrangement!=='compare';
    this.host.querySelector('.ra-table-wrap').hidden=arrangement!=='table';
    this.host.querySelector('.ra-map-tools').hidden=arrangement!=='geography';
    this.host.querySelector('.ra-comparison-note').hidden=arrangement==='geography';
    this.host.querySelector('.ra-record-key').textContent=arrangement==='table'?'Exact source-record counts':arrangement==='compare'&&!this.gl?'Matching source records':'One point · one source record';
    this.host.querySelector('.ra-projection').innerHTML=arrangement==='geography'?'Canada Albers · equal area<br><a href="https://www.naturalearthdata.com/about/terms-of-use/" target="_blank" rel="noopener">Boundaries · Natural Earth</a>':arrangement==='compare'?'100% = matching records in that row':'Counts from the matching source records';
    this.host.querySelector('.ra-comparison-note').textContent=(arrangement==='compare'?'Each row spans 100% of its matching records. ':'')+'Inventories have different scopes and dates. Alberta contains only the published abandoned-well layer; these counts do not measure provincial closure performance.';
    this.stage.setAttribute('aria-label',arrangement==='geography'?'Map of published well records. Arrow keys pan. Plus and minus zoom. Enter starts an area selection.':'Matching records by province and recorded closure status');
    this.syncMode();
    if(arrangement!==oldArrangement)this.animate(arrangement==='compare'?1:0);else this.draw();
  }
  updateInspector() {
    const {state,summary}=this;
    this.host.querySelector('.ra-place').textContent=names[state.province] || 'Canada';
    this.host.querySelector('.ra-total').textContent=format(summary.total);
    this.host.querySelector('.ra-match-label').textContent=summary.total===1?'matching record':'matching records';
    this.host.querySelector('.ra-province').value=state.province;
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
      button.querySelector('strong').textContent=format(summary.counts[index]);
      button.querySelector('i').style.width=`${summary.total?summary.counts[index]/summary.total*100:0}%`;
    });
    this.host.querySelector('[data-ra-command="export"]').disabled=!summary.total;
    const sourceIds=new Set(this.filtered.map(well=>well.sourceId));
    const sources=this.catalog.sources.filter(source=>sourceIds.has(source.id) || (!summary.total && (state.province==='all'||source.province===state.province)));
    const historical=sources.some(source=>source.observationsThrough);
    this.host.querySelector('.ra-scope').textContent=(state.province==='AB'?'Alberta shows the published abandoned-well layer only. ':state.province==='SK'?'Saskatchewan shows the published orphan-well inventory only. ':'Coverage is partial. ')+(historical?'Includes historical inventories; recorded statuses may have changed.':'Counts describe these sources, not every well in the jurisdiction.');
    this.host.querySelector('.ra-source-count').textContent=String(sources.length);
    this.host.querySelector('.ra-source-list').innerHTML=sources.map(source=>{
      let date=source.sourceObservationDate || source.sourceDateText;
      if(!date&&source.upstreamModifiedAt){const parsed=new Date(source.upstreamModifiedAt);if(Number.isFinite(parsed.getTime()))date=parsed.toISOString().slice(0,10);}
      return `<article><button type="button" data-ra-source="${escape(source.id)}">${escape(source.title)} <span aria-hidden="true">↗</span></button><p>${escape(source.observationsThrough ? 'Historical inventory · '+source.observationsThrough : date ? 'Source updated '+date : 'Source date not supplied')}</p><p>Downloaded ${escape(source.retrievedAt?.slice(0,10) || 'date unavailable')}</p></article>`;
    }).join('');
    this.host.querySelector('.ra-preview-list').innerHTML=this.filtered.length?this.filtered.slice(0,3).map(well=>`<button type="button" data-ra-well="${escape(well.id)}"><span>${escape(well.name || well.license || 'Well record')}</span><small>${escape(well.province)} · ${escape(well.identifierLabel || 'Licence')} ${escape(well.license)}${well.observationsThrough?' · Historical':''}</small></button>`).join(''):'<p>No records match these filters. Clear the area or change the province and status.</p>';
  }
  updateChart() {
    const rows=this.summary.rows;
    this.host.querySelector('.ra-chart').innerHTML=`<div class="ra-chart-axis"><span>0%</span><span>50%</span><span>100%</span></div>${rows.map(row=>`<div class="ra-chart-row"><button type="button" data-ra-province="${row.code}" aria-pressed="${this.state.province===row.code}" title="${row.name}"><span>${row.code}</span><small>${row.code==='AB'?'Abandoned layer':row.code==='SK'?'Orphan inventory':row.name}</small></button><div class="ra-row-bar" aria-label="${escape(row.name)}. ${format(row.total)} matching ${row.total===1?'record':'records'}. ${STATUSES.map((status,i)=>status.label+' '+format(row.counts[i])).join(', ')}">${STATUSES.map((status,i)=>`<button type="button" data-ra-status="${status.id}" data-ra-segment-province="${row.code}" aria-label="Filter ${status.label}. ${format(row.counts[i])} matching ${row.counts[i]===1?'record':'records'} in ${row.name}." style="width:${row.total?row.counts[i]/row.total*100:0}%;--ra-status:${status.colour}" ${row.counts[i]?'':'hidden'} tabindex="-1"></button>`).join('')}${row.total?'':'<span>No matches</span>'}</div><strong>${format(row.total)}</strong></div>`).join('')}`;
    this.host.querySelector('.ra-table-wrap').innerHTML=`<table><caption>Matching records by province and recorded closure status</caption><thead><tr><th scope="col">Province / territory</th><th scope="col">Records</th>${STATUSES.map(status=>`<th scope="col">${status.label}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr><th scope="row"><button type="button" data-ra-province="${row.code}">${row.name}</button></th><td>${format(row.total)}</td>${row.counts.map(count=>`<td>${format(count)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  }
  chartPositions() {
    if(!this.summary)return;
    const left=this.width<600?72:180, right=this.width<600?62:84;
    const span=Math.max(60,this.width-left-right);
    const top=64, step=(this.height-top-20)/13;
    const rows=new Map(this.summary.rows.map((row,index)=>[row.code,{...row,index,cursor:[0,0,0,0],offsets:row.counts.map((_,status)=>row.counts.slice(0,status).reduce((a,b)=>a+b,0))}]));
    this.wells.forEach((well,index)=>{
      const row=rows.get(well.province), status=statusIndex(well);
      if(!row)return;
      const rank=this.matched?.has(well.id)?row.offsets[status]+row.cursor[status]++:0;
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
    this.chartPositions();this.draw();
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
    if(this.isMap())this.drawArea();
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
    this.host.querySelector('.ra-map-help').textContent=!this.isMap()?'Select a jurisdiction or a recorded status to filter.':this.mode==='select'?'Drag a rectangle. Keyboard: Enter starts an area; arrows move it, Shift + arrows resize it. Escape returns to pan.':'Drag to pan. Use + / − to zoom. Faint points are outside your filters.';
  }
  zoom(factor, point=[this.width/2,this.height/2]) {
    if(!this.isMap())return;
    const before=this.world(point);
    this.camera.zoom=Math.max(.75,Math.min(24,this.camera.zoom*factor));
    const after=this.screen(before);this.camera.pan[0]+=point[0]-after[0];this.camera.pan[1]+=point[1]-after[1];this.draw();
  }
  pointer(event) { const box=this.stage.getBoundingClientRect();return [event.clientX-box.left,event.clientY-box.top]; }
  pointerDown(event) {
    if(!this.isMap()||event.target.closest('button')||event.button!==0)return;
    this.stage.focus({preventScroll:true});this.stage.setPointerCapture(event.pointerId);
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
      if(closest)this.options.onWell(closest.id);
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
    }else{this.camera.pan[0]-=dx*35;this.camera.pan[1]+=dy*35;this.draw();}
  }
  destroy() {
    cancelAnimationFrame(this.animation);this.abort.abort();this.resizeObserver.disconnect();this.intersectionObserver.disconnect();
    if(this.gl){this.gl.deleteBuffer(this.gpuBuffer);this.gl.deleteProgram(this.program);this.shaders.forEach(shader=>this.gl.deleteShader(shader));}
    this.host.replaceChildren();
  }
}
