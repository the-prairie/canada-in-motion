import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {summarizeEconomy} from '../../economy-model.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,...(process.env.TEST_BROWSER_PATH?{executablePath:process.env.TEST_BROWSER_PATH}:{})});
const base=process.env.TEST_URL||'http://127.0.0.1:4202/';
const out=new URL('../../.data-cache/remaining-views/',import.meta.url).pathname;await mkdir(out,{recursive:true});
const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'}),errors=[],checks=[];
page.on('pageerror',error=>errors.push(error.message));
await page.route('**/api/analysis/status',r=>r.fulfill({json:{available:false}}));
await page.route('**/api/analysis',()=>{throw Error('No inference allowed');});
const data=await fetch(new URL('data/economy.json',base)).then(r=>r.json());
const go=async economy=>{await page.goto(base+'#v1='+encodeURIComponent(JSON.stringify({view:'economy',economy})));await page.locator('.ec-focused-view').waitFor();};
const state=()=>page.evaluate(()=>JSON.parse(decodeURIComponent(location.hash.slice(4))).economy);
const evidence=()=>page.locator('dialog.ec-evidence');
const openEvidence=async()=>{await page.locator('.ec-view-heading').getByRole('button',{name:'Evidence',exact:true}).click();await evidence().waitFor();};
const download=async button=>{const waiting=page.waitForEvent('download');await button.click();return JSON.parse(await readFile(await (await waiting).path(),'utf8'));};
const fits=async()=>assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
try{
 await go({section:'income',region:'AB',display:'bars'});await page.locator('.monthly-compact [data-monthly-metric]').first().waitFor();
 const summary=summarizeEconomy(data,{region:'AB'});
 assert.match(await page.locator('.ec-lead').innerText(),new RegExp(String(summary.gdp.year)));
 assert.match(await page.locator('.ec-latest-activity').innerText(),new RegExp(String(summary.activity.year)));
 assert.equal(await page.locator('.ec-focused-view details').count(),0);
 assert.ok(await page.locator('.ec-income-chart').evaluate(e=>e.getBoundingClientRect().top<document.querySelector('#ec-monthly-energy').getBoundingClientRect().top));
 await page.locator('#ec-rank-BC').click();assert.equal(await page.locator('#ec-region').inputValue(),'BC');
 await page.locator('#ec-display-map').click();await page.locator('#ec-map-AB').focus();await page.keyboard.press('Enter');assert.equal(await page.locator('#ec-region').inputValue(),'AB');
 await page.locator('#ec-display-table').click();assert.equal(await page.locator('.ec-income-chart tbody tr').count(),13);
 await openEvidence();assert.match(await evidence().innerText(),/chained 2017/);
 await page.locator('#ec-evidence-monthly').click();await evidence().locator('[data-monthly-ready]').waitFor();
 await evidence().locator('.monthly-trend details summary').first().click();assert.equal(await evidence().locator('.monthly-table').first().locator('tbody tr').count(),24);
 const monthly=await download(evidence().locator('[data-monthly-export]'));assert.equal(monthly.selection.region,'AB');assert.ok(monthly.sourceSnapshot);
 await page.keyboard.press('Escape');assert.equal(await page.locator('[data-ec-action=sources]').first().evaluate(e=>e===document.activeElement),true);
 await page.locator('#ec-display-bars').click();await page.screenshot({path:out+'income-desktop.png',fullPage:true});
 checks.push('Income keeps nominal value and recent real growth distinct, comparison precedes monthly activity, map/ranking/table link selection, monthly evidence exports');
 await go({section:'futures',region:'AB',year:2040,scenario:'Higher'});await page.locator('.monthly-compact [data-monthly-ready]').count();
 await page.getByLabel('Energy indicator',{exact:true}).selectOption('wti');
 assert.match(await page.locator('.ec-metric-change').innerText(),/Global benchmark/);
 const value=await page.locator('.ec-metric-value').innerText();await page.locator('#ec-region').selectOption('BC');assert.equal(await page.locator('.ec-metric-value').innerText(),value);
 await page.getByLabel('Energy indicator',{exact:true}).selectOption('electricity-generation');
 await page.locator('#ec-year').selectOption('2035');await page.locator('#ec-scenario').selectOption('Lower');
 const shared=page.url();await page.reload();await page.locator('.ec-trend').waitFor();assert.equal(page.url(),shared);
 assert.equal(await page.locator('#ec-year').inputValue(),'2035');assert.equal(await page.locator('#ec-scenario').inputValue(),'Lower');
 assert.equal(await page.locator('.ec-focused-view details').count(),0);
 await openEvidence();const future=await download(evidence().getByRole('button',{name:'Download selected data',exact:true}));assert.equal(future.state.year,2035);assert.equal(future.state.region,'BC');assert.ok(future.sourceSnapshot);
 assert.equal(await evidence().locator('tbody tr').count(),28);await page.keyboard.press('Escape');
 await page.getByLabel('Energy indicator',{exact:true}).selectOption('electricity-price');assert.equal(await page.locator('.ec-retail-list li').count(),13);assert.match(await page.locator('.ec-retail-intro').innerText(),/not bills/);
 await page.getByLabel('Energy indicator',{exact:true}).selectOption('oil-production');await page.locator('#ec-region').selectOption('PE');assert.match(await page.locator('.ec-metric-change').innerText(),/Not published/);
 checks.push('Futures has one series, explicitly global benchmarks, missing values, conditional retail indices, selected annual data export and shared-state restoration');
 await go({section:'oil',region:'AB',oilShock:-20,duration:'temporary'});
 assert.equal(await page.locator('#ec-region').count(),0);assert.equal(await page.locator('#ec-oil-history').count(),0);
 const expected=summarizeEconomy(data,{region:'CA',oilShock:-20,duration:'temporary'}).publishedOilSensitivity;
 const shown=await page.locator('.ec-oil-row strong').allTextContents();assert.deepEqual(shown,expected.years.flatMap(y=>[y.nominalGdpPct,y.realGdpPct]).map(v=>`${v>0?'+':''}${new Intl.NumberFormat('en-CA',{maximumFractionDigits:1}).format(v)}%`));
 await openEvidence();const oil=await download(evidence().getByRole('button',{name:'Download selected data',exact:true}));assert.equal(oil.state.oilShock,-20);assert.equal(oil.state.duration,'temporary');assert.equal(oil.summary.publishedOilSensitivity.scope,'CA');assert.deepEqual(oil.summary.publishedOilSensitivity.years,expected.years);await page.keyboard.press('Escape');
 await page.getByRole('button',{name:'Historical record',exact:true}).click();await page.locator('.hw-history-chart').waitFor();assert.equal(await page.locator('.ec-oil-chart').count(),0);assert.equal((await state()).oilView,'history');await page.reload();await page.locator('.hw-history-chart').waitFor();
 await page.getByRole('button',{name:'Price experiment',exact:true}).click();assert.equal(await page.locator('#ec-oil').inputValue(),'-20');assert.equal(await page.locator('#ec-duration').inputValue(),'temporary');
 checks.push('Oil national export matches visible calculation; experiment and history are exclusive, mode survives reload and prior inputs persist');
 for(const width of [390,320]){
  await page.setViewportSize({width,height:844});
  for(const section of ['income','futures','oil']){
   await go({section,region:'AB',futureIndicator:'electricity-generation',year:2040,scenario:'Higher'});await fits();
   if(section==='futures'){await page.locator('.ec-trend').waitFor();const sizes=await page.locator('.ec-trend text').evaluateAll(nodes=>nodes.map(n=>parseFloat(getComputedStyle(n).fontSize)*n.getScreenCTM().a));assert.ok(Math.min(...sizes)>=11,`${width}: ${sizes}`);}
   await page.screenshot({path:out+`${section}-${width}.png`,fullPage:true});
  }
 }
 await page.setViewportSize({width:844,height:390});await fits();
 assert.deepEqual(errors,[]);checks.push('390px,320px and short landscape fit; futures axis text remains at least11px; zero runtime errors');
 const result={status:'passed',checks,errors,providerCalls:0};await writeFile(out+'result.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
}finally{await browser.close();}
