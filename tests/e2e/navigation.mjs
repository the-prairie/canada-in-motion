import assert from 'node:assert/strict';
import {DESTINATIONS} from '../../navigation-model.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,...(process.env.TEST_BROWSER_PATH?{executablePath:process.env.TEST_BROWSER_PATH}:{})});
const base=process.env.TEST_URL||'http://127.0.0.1:4204/';
const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'}),errors=[],checks=[];
page.on('pageerror',error=>errors.push(error.message));
await page.route('**/api/analysis/status',route=>route.fulfill({json:{available:false}}));
await page.route('**/api/analysis',()=>{throw Error('Navigation must not invoke inference');});
const ready={explore:'#ec-energy-story .es-sales',income:'.ec-ranking',outlook:'.pf-history-chart',trade:'.hw-grid',supply:'.ip-total',futures:'.ec-focused-metric',oil:'.ec-oil-chart',atlas:'.ra-workspace',wells:'#well-search',cleanup:'#cost-low',journey:'.transport-stage',transport:'#toll-change'};
const navigate=async id=>{
 await page.locator('#location-button').click();
 await page.locator('#navigation-dialog[open]').waitFor();
 assert.equal(await page.locator('#destination-list button').count(),12);
 await page.locator(`[data-page="${id}"]`).click();
 assert.equal(await page.locator('#navigation-dialog').evaluate(e=>e.open),false);
 await page.locator(ready[id]).first().waitFor();
 assert.equal(await page.locator('#location-label').innerText(),DESTINATIONS.find(d=>d.id===id).label);
};
const overflow=async()=>assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'No document overflow');
try{
 await page.goto(base+'#v1='+encodeURIComponent(JSON.stringify({view:'economy',economy:{section:'income',region:'BC'}})));
 await page.locator('.ec-ranking').waitFor();
 for(const viewport of [{width:1440,height:1000},{width:390,height:844},{width:320,height:844},{width:844,height:390}]){
  await page.setViewportSize(viewport);
  for(const item of DESTINATIONS){await navigate(item.id);await overflow();assert.equal(await page.locator('[data-page][aria-current=page]').count(),1);}
  checks.push(`${viewport.width}px: all12 destinations, current location, no overflow`);
 }
 await navigate('income');
 await page.locator('#location-button').click();await page.keyboard.press('Escape');
 assert.equal(await page.locator('#location-button').evaluate(e=>e===document.activeElement),true);
 await page.locator('#location-button').click();
 for(let i=0;i<18;i++){await page.keyboard.press('Tab');assert.ok(await page.locator('#navigation-dialog').evaluate(e=>e.contains(document.activeElement)));}
 await page.keyboard.press('Escape');
 await page.locator('#header-ask').click();await page.locator('.ec-composer[open]').waitFor();await page.keyboard.press('Escape');
 assert.ok(await page.locator('#header-ask').evaluate(e=>e===document.activeElement));
 checks.push('keyboard modal focus containment, Escape restores location and Ask');
 await navigate('supply');await page.getByRole('button',{name:'Change scenario',exact:true}).click();assert.equal(await page.getByLabel('Demand origin province',{exact:true}).inputValue(),'BC');await page.getByRole('dialog',{name:'Change the demand scenario'}).getByRole('button',{name:'Done',exact:true}).click();
 await navigate('explore');assert.equal(decodeURIComponent(await page.evaluate(()=>location.hash)).includes('"focus":"BC"'),true);
 await navigate('income');await navigate('futures');await page.goBack();await page.locator('.ec-ranking').waitFor();assert.equal(await page.locator('#location-label').innerText(),'Income');
 await page.goForward();await page.locator('.ec-focused-metric').waitFor();assert.equal(await page.locator('#location-label').innerText(),'Energy futures');
 await page.reload();await page.locator('.ec-focused-metric').waitFor();assert.equal(await page.locator('#location-label').innerText(),'Energy futures');
 checks.push('province context, browser Back/Forward, shared URL reload');
 await navigate('cleanup');
 for(const id of ['cost-low','cost-high'])assert.equal(await page.locator('#'+id).evaluate(e=>e.validity.valid),true);
 await page.locator('#cost-low').fill('75321');await page.locator('#cost-low').press('Tab');assert.equal(await page.locator('#cost-low').evaluate(e=>e.validity.valid),true);
 assert.equal(await page.locator('#header-ask').isVisible(),false);
 checks.push('closure default and arbitrary positive costs valid, Ask scoped to supported views');
 await page.locator('.brand').click();await page.locator(ready.explore).waitFor();assert.equal(await page.locator('#location-label').innerText(),'Explore a question');
 assert.deepEqual(errors,[]);console.log(JSON.stringify({status:'passed',checks,providerCalls:0},null,2));
}finally{await browser.close();}
