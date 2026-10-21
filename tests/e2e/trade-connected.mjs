import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,...(process.env.TEST_BROWSER_PATH?{executablePath:process.env.TEST_BROWSER_PATH}:{})});
const base=process.env.TEST_URL||'http://127.0.0.1:4206/';
const errors=[],checks=[];
const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
page.on('pageerror',error=>errors.push(error.message));
await page.route('**/api/analysis/status',r=>r.fulfill({json:{available:false}}));
await page.route('**/api/analysis',r=>r.abort());
const url=patch=>base+'#v1='+encodeURIComponent(JSON.stringify({view:'economy',economy:{section:'trade',tradeCommodity:'oil',tradeYear:2024,...patch}}));
try{
 await page.goto(url({}));await page.locator('.tn-story-entry').waitFor();
 assert.equal(await page.getByRole('button',{name:'Map',exact:true}).getAttribute('aria-pressed'),'true');
 await page.locator('.tn-inspector .gs-entry').click();await page.locator('.gs-connected').waitFor();
 assert.equal(await page.locator('[data-guide-chapter]').count(),3);
 await page.locator('.gsm-map').evaluate(node=>node.dataset.retained='yes');
 const scrollTo=async stage=>{
   // Wait out explicit navigation's short observer lock, then simulate reading the next chapter.
   await page.waitForTimeout(700);
   await page.locator(`[data-guide-chapter="${stage}"]`).evaluate(node=>{
     const column=document.querySelector('.gs-map-column'),nav=document.querySelector('.gs-steps');
     const inset=innerWidth<=680&&getComputedStyle(column).position==='sticky'?column.getBoundingClientRect().height+nav.getBoundingClientRect().height+16:nav.getBoundingClientRect().height+28;
     scrollBy(0,node.getBoundingClientRect().top-inset);
   });
   await page.waitForFunction(stage=>document.querySelector('.gsm-map').dataset.scene===stage,stage);
   assert.equal(await page.locator('.gsm-map').getAttribute('data-retained'),'yes');
   assert.equal(JSON.parse(decodeURIComponent(new URL(page.url()).hash.slice(4))).economy.guideStep,stage);
 };
 for(const width of [1440,390,320]){
   await page.setViewportSize({width,height:width===1440?1000:844});
   await scrollTo('provinces');
   await scrollTo('households');
   assert.equal(await page.locator('.gsm-house').count(),2);
   assert.match(await page.locator('.gs-stage').innerText(),/Spending equivalent, not a validated bill forecast|No supported estimate/);
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
   await page.screenshot({path:`/tmp/cim-trade-story-${width}.png`});
   await scrollTo('exchange');
   assert.equal(await page.locator('.gsm-house').count(),0);
 }
 checks.push('map-first entry, scroll-driven chapters on desktop/390/320px, persistent map DOM, URL stage persistence, household symbols, no horizontal overflow');
 await page.setViewportSize({width:844,height:390});
 await page.getByRole('navigation',{name:'Scenario stages'}).getByRole('button',{name:'Household spending',exact:true}).click();
 assert.equal(await page.locator('.gs-map-column').evaluate(n=>getComputedStyle(n).position),'static');
 const retained=await page.locator('.gs-route h3').innerText();
 await page.reload();await page.locator('.gs-stage').waitFor();
 assert.equal(await page.locator('.gsm-map').getAttribute('data-scene'),'households');
 assert.equal(await page.locator('.gs-route h3').innerText(),retained);
 checks.push('short landscape scrolling and shared-link restoration');
 assert.deepEqual(errors,[]);console.log(JSON.stringify({status:'passed',checks,errors}));
}finally{await browser.close();}
