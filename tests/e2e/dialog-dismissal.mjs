import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,...(process.env.TEST_BROWSER_PATH?{executablePath:process.env.TEST_BROWSER_PATH}:{})});
const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});
let release,mocked=0;const gate=new Promise(resolve=>release=resolve),errors=[];page.on('pageerror',error=>errors.push(error.message));
await page.route('**/api/analysis/status',route=>route.fulfill({json:{available:true,provider:'cloudflare',workspaceEnabled:true,endpoint:'/api/analysis'}}));
await page.route('**/api/analysis',route=>{mocked++;return route.fulfill({status:503,json:{error:{code:'provider_unavailable',message:'Service temporarily unavailable'}}});});
await page.route('**/data/energy-debate.json',async route=>{await gate;return route.fulfill({json:JSON.parse(await readFile(new URL('../../data/energy-debate.json',import.meta.url)))});});
try{
 await page.goto((process.env.TEST_URL||'http://127.0.0.1:4201/')+'#v1='+encodeURIComponent(JSON.stringify({view:'economy',economy:{section:'outlook'}})));
 await page.locator('.pf-history-chart').waitFor();await page.getByRole('button',{name:'Ask a question',exact:true}).click();
 await page.getByLabel('Your question',{exact:true}).fill('Compare Alberta and Ontario GDP');await page.getByRole('button',{name:'Analyse',exact:true}).click();await page.locator('.ec-analysis-error').waitFor();await page.keyboard.press('Escape');
 assert.equal(await page.locator('.ec-composer').evaluate(e=>e.open),false);release();await page.locator('.ec-debate').waitFor({state:'attached'});
 assert.equal(await page.locator('.ec-composer').evaluate(e=>e.open),false,'Late data must not reopen a dismissed dialog');
 await page.getByRole('button',{name:'Ask a question',exact:true}).click();assert.match(await page.locator('.ec-analysis-error').innerText(),/temporarily unavailable/);assert.equal(await page.getByLabel('Your question',{exact:true}).inputValue(),'Compare Alberta and Ontario GDP');
 assert.deepEqual(errors,[]);console.log(JSON.stringify({status:'passed',checks:['dismissal survives late context data','error and draft preserved for intentional reopening'],mockedRequests:mocked,providerCalls:0}));
}finally{release();await browser.close();}
