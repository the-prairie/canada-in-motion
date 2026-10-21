import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {summarizeMonthlyEnergy} from '../../monthly-energy-model.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,...(process.env.TEST_BROWSER_PATH?{executablePath:process.env.TEST_BROWSER_PATH}:{})});
const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
await context.route('**/api/analysis/status',r=>r.fulfill({json:{available:false}}));
const page=await context.newPage();page.setDefaultTimeout(25000);
const errors=[],checks=[];page.on('pageerror',e=>errors.push(e.message));
const base=process.env.TEST_URL||'http://127.0.0.1:4199/';
const data=await fetch(new URL('data/monthly-energy.json',base)).then(r=>r.json());
const out=new URL('../../.data-cache/monthly-acceptance/',import.meta.url).pathname;await mkdir(out,{recursive:true});
const openMonthlyEvidence=async()=>{await page.getByRole('button',{name:'Evidence',exact:true}).click();await page.getByRole('button',{name:'Monthly activity',exact:true}).click();await page.locator('[data-monthly-ready]').waitFor();};
const go=async economy=>{await page.goto(base+'#v1='+encodeURIComponent(JSON.stringify({view:'economy',economy})));if(economy.section==='outlook'){await page.locator('.pf-history-chart').waitFor();await openMonthlyEvidence();}else if(economy.section==='explore'){await page.locator('.es-chapters').waitFor();await openMonthlyEvidence();}else await page.locator('[data-monthly-ready]').waitFor();};
const number=(n,d=2)=>new Intl.NumberFormat('en-CA',{maximumFractionDigits:d}).format(n);
const format=(v,u)=>{const scale=v>=1e6?1e6:v>=1e3?1e3:1;return `${number(v/scale)} ${scale===1e6?'million ':scale===1e3?'thousand ':''}${u}`;};
try{
 await go({section:'income',region:'AB',display:'bars'});
 assert.match(await page.locator('.ec-answerline').innerText(),/2022/);assert.match(await page.locator('.ec-latest-activity').innerText(),/2025/);
 for(const region of data.regions){
   await page.locator('#ec-region').selectOption(region.code);await page.locator(`[data-monthly-ready][data-monthly-focus="${region.code}"]`).waitFor();
   for(const m of summarizeMonthlyEnergy(data,{region:region.code}).metrics){
     const card=page.locator(`[data-monthly-metric="${m.id}"]`);assert.equal(await card.count(),1);
     if(m.latest.value!==null)assert.equal(await card.locator('.monthly-value').innerText(),format(m.latest.value,m.unit));
     else assert.doesNotMatch(await card.locator('.monthly-value').innerText(),/^0/);
     assert.match(await card.locator('.monthly-date').innerText(),new RegExp(m.latestMonth.slice(0,4)));
   }
 }
 checks.push('All 14 jurisdictions and all three measures match source-derived monthly observations alongside annual GDP');
 await page.locator('#ec-region').selectOption('NS');await page.locator('[data-monthly-focus="NS"]').waitFor();
 assert.equal(await page.locator('[data-monthly-metric="gas"] .monthly-value').innerText(),'0 GJ');
 assert.equal(await page.locator('[data-monthly-metric="gas"] .monthly-growth').innerText(),'Annual change unavailable');
 await page.locator('#ec-region').selectOption('ON');await page.locator('[data-monthly-focus="ON"]').waitFor();
 assert.equal(await page.locator('[data-monthly-metric="oil"] .monthly-value').innerText(),'Confidential');
 checks.push('Explicit zero, undefined growth and confidential oil remain distinguishable');
 await page.locator('#ec-region').selectOption('AB');await page.locator('[data-monthly-focus="AB"]').waitFor();
 await page.locator('.ec-view-heading').getByRole('button',{name:'Evidence',exact:true}).click();await page.locator('#ec-evidence-monthly').click();await page.locator('dialog.ec-evidence [data-monthly-ready]').waitFor();await page.locator('.monthly-trend details>summary').first().click();
 assert.equal(await page.locator('.monthly-table').first().locator('tbody tr').count(),24);
 const downloadP=page.waitForEvent('download');await page.locator('[data-monthly-export]').click();const download=await downloadP;
 const exported=JSON.parse(await readFile(await download.path(),'utf8'));assert.equal(exported.sourceSnapshot.dataVersion,data.dataVersion);assert.equal(exported.selection.region,'AB');
 assert.equal(exported.summary.metrics[0].latest.value,summarizeMonthlyEnergy(data,{region:'AB'}).metrics[0].latest.value);
 checks.push('24-month trend tables and self-contained data export reproduce the displayed selection');
 await page.keyboard.press('Escape');await page.screenshot({path:out+'income-desktop.png',fullPage:true});
 await page.locator('#location-button').click();await page.locator('#ec-section-futures').click();await page.locator('[data-monthly-ready]').waitFor();
 await page.locator('#ec-year').selectOption('2040');await page.locator('[data-monthly-ready]').waitFor();
 assert.match(await page.locator('.ec-series-period').innerText(),/2040/);assert.match(await page.locator('.monthly-date').first().innerText(),/2026/);
 const before=await page.locator('.monthly-grid').innerText();await page.locator('#ec-scenario').selectOption('Higher');await page.locator('[data-monthly-ready]').waitFor();assert.equal(await page.locator('.monthly-grid').innerText(),before);
 checks.push('Changing the annual scenario and projection year leaves monthly actuals unchanged');
 await go({section:'outlook',region:'CA',forecastRegions:[],forecastYear:2026});
 await page.keyboard.press('Escape');
 await page.locator('.pf-place-buttons').getByRole('button',{name:'British Columbia',exact:true}).click();
 await openMonthlyEvidence();
 await page.locator('[data-monthly-focus="BC"]').waitFor();assert.match(await page.locator('.monthly-basis').innerText(),/original inputs/);
 await page.keyboard.press('Escape');
 await page.getByRole('button',{name:'2027',exact:true}).click();await openMonthlyEvidence();assert.equal(await page.locator('[data-monthly-ready]').getAttribute('data-monthly-focus'),'BC');
 checks.push('Forecast inspector synchronizes province without silently changing model inputs');
 await go({section:'explore',story:{commodity:'electricity',focus:'AB',compare:'BC',shockPct:-10,chapter:'overview'}});
 assert.equal(await page.locator('[data-monthly-metric]').count(),1);assert.equal(await page.locator('.monthly-reading').count(),2);
 assert.match(await page.locator('[data-monthly-metric]').getAttribute('data-monthly-metric'),/electricity/);
 const observed=await page.locator('.monthly-grid').innerText();await page.keyboard.press('Escape');await page.locator('#es-price').fill('20');await openMonthlyEvidence();assert.equal(await page.locator('.monthly-grid').innerText(),observed);
 await page.keyboard.press('Escape');await page.getByRole('button',{name:'Natural gas',exact:true}).click();await openMonthlyEvidence();assert.equal(await page.locator('[data-monthly-metric]').getAttribute('data-monthly-metric'),'gas');
 await page.keyboard.press('Escape');await page.getByLabel('Investigation province',{exact:true}).selectOption('PE');await openMonthlyEvidence();assert.equal(await page.locator('[data-monthly-ready]').getAttribute('data-monthly-focus'),'PE');
 const shared=page.url();await page.reload();await page.locator('.es-chapters').waitFor();await openMonthlyEvidence();assert.deepEqual(JSON.parse(decodeURIComponent(new URL(page.url()).hash.slice(4))).economy.story,JSON.parse(decodeURIComponent(new URL(shared).hash.slice(4))).economy.story);assert.equal(await page.locator('[data-monthly-metric]').getAttribute('data-monthly-metric'),'gas');
 checks.push('Question view follows commodity and comparison; price shocks do not rewrite observations; shared state reloads');
 for(const width of [390,320]){
   await page.setViewportSize({width,height:844});
   for(const section of ['income','futures','outlook','explore']){
     await go({section,region:'AB',story:{commodity:'electricity',focus:'AB'}});
     assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${width}px ${section} overflow`);
   }
   await page.screenshot({path:out+`story-${width}.png`,fullPage:true});
 }
 checks.push('All four views fit 390px and 320px screens');
 const retryContext=await browser.newContext();await retryContext.route('**/api/analysis/status',r=>r.fulfill({json:{available:false}}));let failed=false;
 await retryContext.route('**/data/monthly-energy.json',r=>{if(!failed){failed=true;return r.fulfill({status:503,body:'Unavailable'});}return r.continue();});
 const retryPage=await retryContext.newPage();await retryPage.goto(base+'#v1='+encodeURIComponent(JSON.stringify({view:'economy',economy:{section:'income',region:'AB'}})));
 await retryPage.getByRole('button',{name:'Retry monthly data',exact:true}).click();await retryPage.locator('[data-monthly-ready]').waitFor();await retryContext.close();
 checks.push('Monthly endpoint failure leaves annual view usable and retry recovers');
 assert.deepEqual(errors,[]);await writeFile(out+'result.json',JSON.stringify({base,checks,errors,dataVersion:data.dataVersion,periods:data.metrics.map(m=>({metric:m.id,month:m.latestMonth}))},null,2));console.log(JSON.stringify({checks,errors,dataVersion:data.dataVersion},null,2));
}finally{await browser.close();}
