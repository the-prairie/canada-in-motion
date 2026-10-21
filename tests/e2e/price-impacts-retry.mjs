import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,...(process.env.TEST_BROWSER_PATH?{executablePath:process.env.TEST_BROWSER_PATH}:{})});
const context=await browser.newContext({viewport:{width:1200,height:900},reducedMotion:'reduce'});
let providerCalls=0;
await context.route('**/api/analysis/status',r=>r.fulfill({json:{available:false}}));
await context.route('**/api/analysis',r=>{providerCalls++;return r.abort();});
const checks=[],errors=[];
const base=process.env.TEST_URL||'http://127.0.0.1:4195/';
const out=new URL('../../.data-cache/price-impact-acceptance/',import.meta.url).pathname;
await mkdir(out,{recursive:true});
try{
for(const [dataset,chapter,selector] of [['household-energy-costs','households','.pr-households'],['provincial-price-response','outlook','.pr-gdp']]){
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 let fail=true,attempts=0;
 await page.route(`**/data/${dataset}.json`,r=>{attempts++;return fail?r.fulfill({status:503,body:'Temporarily unavailable'}):r.continue();});
 const story={chapter,focus:'QC',compare:'AB',commodity:'oil',shockPct:10,responseHorizon:1,householdBasis:'retail'};
 await page.goto(base+'#v1='+encodeURIComponent(JSON.stringify({view:'economy',economy:{section:'explore',story}})));
 const root=page.locator('#ec-energy-story'),panel=root.locator(selector);
 await panel.waitFor();
 assert.match(await panel.innerText(),/snapshot.*unavailable|data could not be loaded/i);
 assert.doesNotMatch(await panel.innerText(),/reference is not published/);
 assert.equal(await panel.locator('.pr-estimate').count(),0);
 fail=false;await panel.getByRole('button',{name:'Reload published sources',exact:true}).click();
 if(chapter==='households')await panel.locator('[data-household-region=QC] .pr-estimate').waitFor();
 else await panel.locator('[data-price-region=QC]').filter({hasText:/Passed the stated|did not pass/}).waitFor();
 assert.equal(await root.getByLabel('Investigation province',{exact:true}).inputValue(),'QC');
 assert.equal(await root.getByLabel('Comparison province',{exact:true}).inputValue(),'AB');
 assert.equal(await root.locator('#es-price').inputValue(),'10');
 if(chapter==='households')assert.equal(await panel.getByRole('button',{name:'Retail-price scenario',exact:true}).getAttribute('aria-pressed'),'true');
 else assert.equal(await panel.getByLabel('GDP price response period',{exact:true}).inputValue(),'1');
 assert.ok(attempts>=2);
 checks.push(`${dataset} correctly identifies HTTP 503 and reload restores data with all selected scenario controls preserved`);
 await page.screenshot({path:`${out}retry-${chapter}.png`,fullPage:true});
 await page.close();
}
assert.equal(providerCalls,0);assert.deepEqual(errors,[]);
await writeFile(out+'retry-report.json',JSON.stringify({status:'passed',base,checks,errors,providerCalls},null,2));
console.log(JSON.stringify({status:'passed',checks,errors,providerCalls},null,2));
}finally{await browser.close();}
