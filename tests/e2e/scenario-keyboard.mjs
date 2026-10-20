import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,...(process.env.TEST_BROWSER_PATH?{executablePath:process.env.TEST_BROWSER_PATH}:{})});
const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'}),errors=[];
page.on('pageerror',error=>errors.push(error.message));
if(process.env.APP_SOURCE_OVERRIDE==='1')await page.route(/\/app\.js(?:\?.*)?$/, async route=>route.fulfill({status:200,contentType:'text/javascript',body:await readFile(new URL('../../app.js',import.meta.url),'utf8')}));
const base=process.env.TEST_URL||'http://127.0.0.1:4188/';
try{
 await page.goto(base+'#v1='+encodeURIComponent(JSON.stringify({view:'lab',labTab:'cleanup'})));
 await page.locator('#budget').waitFor({timeout:120000});
 await page.locator('#budget').fill('10000000');await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement.id),'cost-low');
 await page.keyboard.press('ControlOrMeta+A');await page.keyboard.type('100000');await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement.id),'cost-high');
 await page.keyboard.press('ControlOrMeta+A');await page.keyboard.type('200000');await page.keyboard.press('Tab');
 assert.equal(await page.locator('#budget').inputValue(),'10000000');assert.equal(await page.locator('#cost-low').inputValue(),'100000');assert.equal(await page.locator('#cost-high').inputValue(),'200000');
 assert.equal(await page.locator('[data-testid="cleanup-result"]').innerText(),'50–100');
 assert.equal(await page.evaluate(()=>document.activeElement.dataset.action),'view-cleanup-cohort');
 await page.reload();await page.locator('#budget').waitFor({timeout:120000});assert.equal(await page.locator('[data-testid="cleanup-result"]').innerText(),'50–100');
 await page.locator('#cost-low').fill('250000');await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement.id),'cost-high');assert.match(await page.locator('#cleanup-results [role="alert"]').innerText(),/high cost must equal or exceed/);
 await page.keyboard.press('ControlOrMeta+A');await page.keyboard.type('300000');await page.keyboard.press('Tab');assert.equal(await page.locator('[data-testid="cleanup-result"]').innerText(),'33–40');
 assert.deepEqual(errors,[]);console.log(JSON.stringify({status:'passed',checks:['real Tab after budget retains next control','real Tab after low cost retains high cost','sequential edits produce50–100','next button receives focus','URL reload persists assumptions','invalid interval preserves focus and recovers'],sourceOverride:process.env.APP_SOURCE_OVERRIDE==='1'},null,2));
}finally{await browser.close();}
