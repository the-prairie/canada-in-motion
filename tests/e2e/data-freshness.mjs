import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,...(process.env.TEST_BROWSER_PATH?{executablePath:process.env.TEST_BROWSER_PATH}:{})});
const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
await context.route('**/api/analysis/status',r=>r.fulfill({json:{available:false}}));
const page=await context.newPage();page.setDefaultTimeout(20000);
const errors=[],checks=[];page.on('pageerror',e=>errors.push(e.message));
const base=process.env.TEST_URL||'http://127.0.0.1:4196/';
const out=new URL('../../.data-cache/freshness-acceptance/',import.meta.url).pathname;
await mkdir(out,{recursive:true});
const data=await fetch(new URL('data/economy.json',base)).then(r=>r.json());
const signed=n=>`${n>0?'+':''}${new Intl.NumberFormat('en-CA',{maximumFractionDigits:1}).format(n)}%`;
const go=async economy=>{await page.goto(base+'#v1='+encodeURIComponent(JSON.stringify({view:'economy',economy})));await page.locator('.ec-latest-activity').waitFor();};
try{
 await go({section:'income',region:'AB',display:'bars'});
 assert.match(await page.locator('.ec-answerline').innerText(),/2022/);
 assert.match(await page.locator('.ec-lead').innerText(),/163.6B/);
 assert.match(await page.locator('.ec-latest-activity').innerText(),/2025/);
 assert.equal(await page.locator('.ec-latest-activity dd').nth(0).innerText(),'+3.5%');
 assert.equal(await page.locator('.ec-latest-activity dd').nth(1).innerText(),'+2.7%');
 await page.getByText('Why two dates?',{exact:true}).click();
 assert.match(await page.locator('.ec-latest-activity details').innerText(),/81,627.5 million chained 2017/);
 await page.screenshot({path:out+'alberta-desktop.png',fullPage:true});
 checks.push('Alberta2022nominal dollars and2025real growth appear together; source basis is disclosed');
 for(const row of data.gdpActivity.regions){
   await page.locator('#ec-region').selectOption(row.code);
   const displayed=await page.locator('.ec-latest-activity dd').nth(0).innerText();
   assert.equal(displayed,signed(row.energyGrowthPct));
 }
 checks.push('All13province/territory selections match official source-derived growth');
 await page.locator('#ec-region').selectOption('CA');
 assert.equal(await page.locator('.ec-latest-activity dd').count(),0);
 assert.match(await page.locator('.ec-activity-national').innerText(),new RegExp(`${data.gdpActivity.regions.filter(r=>r.energyGrowthPct>0).length} of 13`));
 assert.equal(await page.locator('.ec-ranking li').count(),13);
 assert.equal(await page.locator('.ec-rank-growth').count(),13);
 await page.locator('#ec-display-table').click();
 assert.equal(await page.locator('.ec-income-chart tbody tr').count(),13);
 assert.match(await page.locator('.ec-income-chart thead').innerText(),/2025 energy growth/);
 checks.push('Canada uses jurisdiction comparison without summing chained levels; table includes all13growth rows');
 await page.locator('#ec-display-map').click();
 assert.match(await page.locator('.ec-map').getAttribute('aria-label'),/2022/);
 checks.push('Nominal GDP map retains its2022period');
 for(const width of [390,320]){
   await page.setViewportSize({width,height:844});
   for(const display of ['bars','table','map']){
     await page.locator('#ec-display-'+display).click();
     assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${width} ${display} page overflow`);
   }
   await page.locator('#ec-region').selectOption('PE');
   await page.locator('#ec-display-bars').click();
   await page.screenshot({path:out+`pei-${width}.png`,fullPage:true});
 }
 checks.push('Ranking,map,table and province controls fit390pxand320px screens');
 const shared=page.url();await page.reload();await page.locator('.ec-latest-activity').waitFor();
 assert.equal(await page.locator('#ec-region').inputValue(),'PE');assert.equal(page.url(),shared);
 checks.push('Shared province and display selections survive reload');
 assert.deepEqual(errors,[]);
 await writeFile(out+'result.json',JSON.stringify({base,checks,errors,nominalYear:data.gdp.year,activityYear:data.gdpActivity.year},null,2));
 console.log(JSON.stringify({checks:checks.length,errors,nominalYear:data.gdp.year,activityYear:data.gdpActivity.year},null,2));
}finally{await browser.close();}
