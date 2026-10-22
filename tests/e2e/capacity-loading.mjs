import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,...(process.env.TEST_BROWSER_PATH?{executablePath:process.env.TEST_BROWSER_PATH}:{})});
const base=process.env.TEST_URL||'http://127.0.0.1:4208/';
const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.route('**/api/analysis/status',r=>r.fulfill({json:{available:false}}));
await page.route('**/api/analysis',r=>r.abort());
let fail=true,requests=0;
await page.route('**/capacity-data.json',r=>{requests++;return fail?r.fulfill({status:503,body:'Unavailable'}):r.continue();});
const route=mode=>base+'#v1='+encodeURIComponent(JSON.stringify({view:'economy',economy:{section:'services',albertaMode:mode}}));
try{
 await page.goto(route('observed'));await page.locator('.as-story').waitFor();assert.equal(requests,0);
 await page.getByRole('button',{name:'Test capacity',exact:true}).click();
 await page.getByText('Capacity data could not be loaded. Please try again.',{exact:true}).waitFor();
 fail=false;await page.locator('.as-capacity-loading').getByRole('button',{name:'Try again'}).click();await page.locator('.capacity-simulator').waitFor();assert.equal(requests,2);
 await page.locator('.as-view-switch').getByRole('button',{name:'Observed change'}).click();await page.locator('.as-story').waitFor();
 await page.getByRole('button',{name:'Test capacity',exact:true}).click();await page.locator('.capacity-simulator').waitFor();assert.equal(requests,2);
 assert.deepEqual(errors,[]);console.log(JSON.stringify({status:'passed',checks:['observed story does not fetch simulator data','failed snapshot recovers on retry','switching views reuses validated snapshot','no browser exceptions']}));
}finally{await browser.close();}
