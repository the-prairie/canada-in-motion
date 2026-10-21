/** Headless public-UI regression. Only provider endpoints are mocked; the
 * question parser, evidence calculations, source snapshots and OpenUI are real.
 * No inference is billed. Run against a completed public build. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {readFile} from 'node:fs/promises';
import {createEnergyAnalyzer} from '../../server/energy-analysis.mjs';
import {normalizeEconomyState,summarizeEconomy} from '../../economy-model.mjs';
import {inspectProvincialForecastQuestion} from '../../server/provincial-forecast-request.mjs';
import {validateWorkspace} from '../../workspace-contract.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const read=name=>JSON.parse(readFileSync(new URL(`../../data/${name}.json`,import.meta.url)));
const data=read('economy'),forecast=read('provincial-forecasts'),flows=read('energy-flows'),fiscal=read('provincial-impacts'),debate=read('energy-debate');
const year=forecast.forecastOriginYear;
const state={region:'CA',scenario:'Current Measures',year:2030,oilShock:10,duration:'persistent'};
const analyze=createEnergyAnalyzer({data,forecast,flows,fiscal,debate,normalizeState:normalizeEconomyState,summarize:summarizeEconomy,workspaceEnabled:true,
  provider:async({input})=>({state:input.state,investigation:{regions:['AB'],topics:['gdp'],metricIds:[],includeMap:false,requestedMeasure:'available'}}),
  decider:async()=>({answers:{presentation:{choice:'comparison'},coverage:{choice:'supported'}}})});
const january={...forecast,asOf:`${year+1}-01-15`};
assert.deepEqual(inspectProvincialForecastQuestion('Forecast Alberta GDP this year.',january).years,[year+1]);
assert.equal(inspectProvincialForecastQuestion('Forecast Alberta GDP next year.',january).supported,false);
const browser=await chromium.launch({headless:true,...(process.env.TEST_BROWSER_PATH?{executablePath:process.env.TEST_BROWSER_PATH}:{})});
const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce',acceptDownloads:true});
const page=await context.newPage(),errors=[],checks=[];
page.setDefaultTimeout(15000);
page.on('pageerror',error=>errors.push(error.message));
await page.route('**/api/analysis/status',route=>route.fulfill({json:{available:true,provider:'cloudflare',workspaceEnabled:true,jevEnabled:true}}));
let requests=0;
await page.route('**/api/analysis',async route=>{
  requests++;
  try{const answer=await analyze(route.request().postDataJSON());validateWorkspace(answer.workspace);await route.fulfill({json:answer});}
  catch(error){await route.fulfill({status:error.status||500,json:{error:{code:error.code||'fixture_failure',message:error.message}}});}
});
const base=process.env.TEST_URL||'http://127.0.0.1:4188/';
const url=section=>base+'#v1='+encodeURIComponent(JSON.stringify({view:'economy',economy:{...state,section}}));
let host=page.locator('#ec-dynamic-workspace');
const question=`Compare the GDP forecasts for Alberta, Ontario and Québec in ${year} and ${year+1}.`;
const ask=async value=>{
  const composer=page.locator('.ec-composer');
  if(!await composer.evaluate(e=>e.open))await page.locator('.ec-context-actions [data-ec-action="ask"]').click();
  await page.getByLabel('Your question',{exact:true}).fill(value);
  await page.getByRole('button',{name:'Analyse',exact:true}).click();
  await host.getByRole('heading',{name:value,exact:true}).waitFor();
  await host.locator('.hw-grid').waitFor();
};
const open=async locator=>{if(!await locator.evaluate(e=>e.open))await locator.locator(':scope > summary').click();};
const download=async()=>{
  await open(host.locator('.hw-action-menu'));
  const pending=page.waitForEvent('download');
  await host.getByRole('button',{name:'Export data',exact:true}).click();
  const result=await pending;
  assert.equal(await host.locator('.hw-action-menu').evaluate(e=>e.open),false,'export closes its action menu so result tabs stay reachable');
  return JSON.parse(await readFile(await result.path(),'utf8'));
};
try{
  await page.goto(url('outlook'));
  await page.locator('#ec-provincial-forecast .pf-history-chart').waitFor();
  assert.equal(await page.locator('.ec-composer').evaluate(e=>e.open),false,'question composer starts collapsed');
  await ask(question);
  assert.equal(await page.locator('.ec-composer').evaluate(e=>e.open),false,'question composer collapses after answer');
  assert.equal(await page.locator('details.ec-answer').evaluate(e=>e.open),false,'supporting prose starts collapsed beside the interactive answer');
  await page.getByText('Written analysis & citations',{exact:true}).click();
  assert.ok(await page.locator('.ec-answer-block').first().isVisible());
  await page.getByText('Written analysis & citations',{exact:true}).click();
  assert.equal(await host.locator('.hw-gdp-forecast').count(),1,'focused result must show one forecast panel');
  const views=host.getByRole('navigation',{name:'Result views'});
  assert.equal(await views.getByRole('button',{name:`GDP outlook ${year}`,exact:true}).getAttribute('aria-pressed'),'true');
  await host.locator('[aria-label="Forecast display"]').getByRole('button',{name:'Compare',exact:true}).click();
  assert.equal(await host.locator('.pf-range-chart li').count(),3);
  await views.getByRole('button',{name:`GDP outlook ${year+1}`,exact:true}).click();
  assert.equal(await host.locator('[aria-label="Forecast year"]').getByRole('button',{name:String(year+1),exact:true}).getAttribute('aria-pressed'),'true');
  await host.locator('[aria-label="Forecast year"]').getByRole('button',{name:String(year),exact:true}).click();
  let exported=await download();
  assert.deepEqual(exported.workspace.panels.filter(p=>p.type==='gdp-forecast').map(p=>p.year),[year,year]);
  await host.getByRole('button',{name:'Undo',exact:true}).click();
  assert.equal(await host.locator('[aria-label="Forecast year"]').getByRole('button',{name:String(year+1),exact:true}).getAttribute('aria-pressed'),'true');
  checks.push('two independent forecast-year panels, focused navigation and undo');
  await page.getByRole('button',{name:'Return to data',exact:true}).click();
  await page.locator('#ec-provincial-forecast .pf-history-chart').waitFor();
  assert.equal(await page.locator('#ec-dynamic-workspace').count(),0);
  await page.getByRole('button',{name:'Previous answer',exact:true}).click();
  await host.locator('.hw-gdp-forecast').waitFor();
  assert.equal(await host.locator('[aria-label="Forecast year"]').getByRole('button',{name:String(year+1),exact:true}).getAttribute('aria-pressed'),'true');
  checks.push('return to ordinary data and reopen the same edited answer');

  await open(host.locator('.hw-selection'));
  await host.locator('.hw-regions').getByRole('button',{name:'Ontario',exact:true}).click();
  await host.locator('[aria-label="Forecast display"]').getByRole('button',{name:'Compare',exact:true}).click();
  assert.equal(await host.locator('.pf-range-chart li').count(),2);
  await host.locator('[aria-label="Forecast display"]').getByRole('button',{name:'Outlook',exact:true}).click();
  assert.deepEqual(await host.locator('.pf-place-buttons button').allTextContents(),['QC','AB']);
  await host.getByRole('button',{name:'Undo',exact:true}).click();
  await host.locator('[aria-label="Forecast display"]').getByRole('button',{name:'Compare',exact:true}).click();
  assert.equal(await host.locator('.pf-range-chart li').count(),3);
  await host.locator('[aria-label="Forecast display"]').getByRole('button',{name:'Table',exact:true}).click();
  assert.match(await host.getByRole('region',{name:'Provincial GDP forecast table',exact:true}).innerText(),/Alberta/);
  await host.locator('[data-workspace-sources]').click();
  const sourceLinks=await host.locator('.context-dialog a').evaluateAll(links=>links.map(a=>a.href));
  assert.ok(sourceLinks.includes(forecast.sources[0].url));assert.ok(sourceLinks.includes(forecast.sources[1].url));
  await page.keyboard.press('Escape');
  await host.locator('[data-forecast-evidence]').click();
  assert.ok(await host.getByRole('region',{name:'Alberta forecast backtest',exact:true}).isVisible());
  await page.keyboard.press('Escape');
  checks.push('linked regional selection, forecast table, original source links and historical validation');

  await open(host.locator('.hw-action-menu'));
  await host.getByRole('button',{name:'Save investigation',exact:true}).click();
  await host.getByText('Saved on this device with its original data.',{exact:true}).waitFor();
  assert.equal(await host.locator('.hw-action-menu').evaluate(e=>e.open),false,'save closes its action menu');
  const saved=await page.evaluate(()=>new Promise((resolve,reject)=>{
    const request=indexedDB.open('canada-in-motion-investigations',1);
    request.onsuccess=()=>{const db=request.result,r=db.transaction('investigations').objectStore('investigations').getAll();r.onsuccess=()=>{db.close();resolve(r.result);};r.onerror=()=>reject(r.error);};
    request.onerror=()=>reject(request.error);
  }));
  assert.equal(saved.length,1);assert.equal(saved[0].workspace.forecastSnapshot.dataVersion,forecast.dataVersion);
  assert.deepEqual(saved[0].selection.forecastYearsByPanel,{[`gdp-forecast-${year}`]:year,[`gdp-forecast-${year+1}`]:year+1});
  await page.goto(url('trade'));
  await page.reload();
  host=page.locator('#ec-trade-workspace');
  await host.locator('.hw-shell').waitFor();
  await open(host.locator('.hw-action-menu'));await host.getByRole('button',{name:/^Open saved/}).click();
  await host.locator('.hw-saved-list li').getByRole('button',{name:new RegExp(`^${question.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}`)}).click();
  await host.getByText('Restored with the original source snapshot.',{exact:true}).waitFor();
  assert.equal(await host.locator('[aria-label="Forecast year"]').getByRole('button',{name:String(year+1),exact:true}).getAttribute('aria-pressed'),'true');
  exported=await download();
  validateWorkspace(exported.workspace);
  assert.deepEqual(exported.workspace.forecastSnapshot,forecast);
  assert.deepEqual(exported.selection.forecastYearsByPanel,saved[0].selection.forecastYearsByPanel);
  checks.push('save, full reload, cross-view restore, original forecast snapshot and exported selection');

  await page.setViewportSize({width:390,height:844});
  await open(host.locator('.hw-action-menu'));
  await page.keyboard.press('Escape');
  assert.equal(await host.locator('.hw-action-menu').evaluate(e=>e.open),false,'Escape dismisses the mobile action menu');
  await open(host.locator('.hw-action-menu'));
  await host.locator('.hw-heading h2').click();
  assert.equal(await host.locator('.hw-action-menu').evaluate(e=>e.open),false,'an outside click dismisses the mobile action menu');
  await host.getByRole('navigation',{name:'Result views'}).getByRole('button',{name:`GDP outlook ${year}`,exact:true}).click();
  await host.locator('[aria-label="Forecast display"]').getByRole('button',{name:'Outlook',exact:true}).click();
  await host.locator('.pf-place-buttons').getByRole('button',{name:'Quebec',exact:true}).click();
  assert.ok(await host.locator('.pf-detail').getByRole('heading',{name:'Quebec',exact:true}).isVisible());
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'mobile page must not overflow');
  await page.screenshot({path:'/tmp/cim-forecast-ai-mobile.png',fullPage:true});
  checks.push('mobile result navigation, province inspection and no horizontal page overflow');
  await page.setViewportSize({width:1440,height:1000});
  host=page.locator('#ec-dynamic-workspace');
  await ask(`Forecast Canada's GDP growth in ${year}.`);
  assert.match(await host.locator('.hw-coverage').first().innerText(),/does not supply a forecast for Canada as a whole/);
  assert.match(await host.locator('.hw-coverage').first().innerText(),/must not be summed/);
  await host.locator('[aria-label="Forecast display"]').getByRole('button',{name:'Compare',exact:true}).click();
  assert.equal(await host.locator('.pf-range-chart li').count(),13);
  assert.match(await host.locator('.hw-gdp-forecast > header').innerText(),/GDP/);
  await ask('Forecast Yukon GDP growth next year.');
  assert.match(await host.locator('.pf-detail').innerText(),/does not cover comparable monthly employment/);
  assert.equal(await host.locator('.pf-history-future').count(),0);
  assert.match(await host.locator('.pf-detail-heading').innerText(),/No forecast/);
  assert.equal(await host.locator('.pf-audit').count(),0);
  await ask('Forecast Alberta GDP next year if oil prices rise 10%.');
  assert.equal(await host.locator('.hw-gdp-forecast').count(),0);
  assert.match(await host.locator('.hw-coverage').first().innerText(),/cannot estimate how a change in oil, gas or electricity prices would cause provincial GDP to change/);
  checks.push('national aggregate, territory missingness and causal-price requests retain their data boundaries');

  await ask(question);
  await page.screenshot({path:'/tmp/cim-forecast-ai-desktop.png',fullPage:true});
  assert.deepEqual(errors,[]);
  assert.equal(requests,5,'only intercepted local fixture requests should be sent');
  const focusDiagnostics=await page.evaluate(()=>{const link=document.querySelector('.skip-link'),rect=link.getBoundingClientRect();return {activeElement:document.activeElement?.id||document.activeElement?.tagName,skipLinkTop:getComputedStyle(link).top,skipLinkViewportTop:rect.top,scrollY};});
  console.log(JSON.stringify({status:'passed',providerCalls:0,analysisRequests:requests,forecastDataVersion:forecast.dataVersion,checks,focusDiagnostics},null,2));
}catch(error){
  await page.screenshot({path:'/tmp/cim-forecast-ai-failure.png',fullPage:true}).catch(()=>{});
  console.error(JSON.stringify({status:'failed',errors,url:page.url(),message:error.message}));
  throw error;
}finally{await browser.close();}
