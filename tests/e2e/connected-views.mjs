import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,...(process.env.TEST_BROWSER_PATH?{executablePath:process.env.TEST_BROWSER_PATH}:{})});
const base=process.env.TEST_URL||'http://127.0.0.1:4201/';
const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'}),errors=[],checks=[];
page.on('pageerror',error=>errors.push(error.message));
await page.route('**/api/analysis/status',route=>route.fulfill({json:{available:false}}));
await page.route('**/api/analysis',()=>{throw Error('This test must not invoke inference');});
const go=async state=>{await page.goto(base+'#v1='+encodeURIComponent(JSON.stringify(state)));await page.waitForFunction(()=>document.body.dataset.ready==='true');};
const noOverflow=async()=>assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'No document overflow');
const routeVisible=async()=>{
 await page.waitForFunction(()=>{const map=document.querySelector('#map').getBoundingClientRect(),labels=[...document.querySelectorAll('.endpoint-label')];return map.height>100&&labels.length===2&&labels.every(label=>{const b=label.getBoundingClientRect();return b.left>=map.left-2&&b.right<=map.right+2&&b.top>=map.top-2&&b.bottom<=map.bottom+2;});});
 assert.ok(!/200 m/.test(await page.locator('.leaflet-control-scale').innerText()),'Route fits at regional scale');
};
try{
 await go({view:'economy',economy:{section:'trade',tradeConnection:'AB-BC',guideStep:'exchange'}});await page.locator('.gsm-map').waitFor();
 assert.equal(await page.locator('.hw-saved,.hw-method,.hw-sources,.ec-methods,.gs-sources').count(),0,'Repeated evidence/footer sections removed');
 await page.locator('[data-workspace-sources]').click();await page.getByRole('dialog',{name:'Sources and methods'}).waitFor();assert.ok(await page.getByRole('dialog').locator('a[href^="https:"]').count()>0);await page.keyboard.press('Escape');assert.equal(await page.locator('[data-workspace-sources]').evaluate(e=>e===document.activeElement),true);
 await page.locator('#header-ask').click();await page.locator('.ec-composer[open]').waitFor();await page.keyboard.press('Escape');assert.equal(await page.locator('.ec-composer').evaluate(e=>e.open),false);
 checks.push('one evidence destination with citations','explicit Ask task','Escape and source focus restore');
 await go({view:'atlas',province:'AB'});await page.locator('.ra-operating-total').waitFor();
 assert.match(await page.locator('.ra-provincial-summary').innerText(),/Active [\d,]+ \+ marginal/);
 await page.locator('.ra-statuses [data-ra-status=abandoned]').first().click();
 const original=await page.locator('.ra-total').innerText();
 await page.locator('.ra-preview-list button').first().click();await page.locator('.atlas-record-facts').waitFor();assert.equal(await page.locator('body').getAttribute('data-view'),'atlas');await page.keyboard.press('Escape');assert.equal(await page.locator('.ra-total').innerText(),original);
 await page.locator('[data-ra-command=evidence]').click();await page.getByRole('dialog',{name:'Sources and coverage'}).waitFor();assert.ok(await page.getByRole('dialog').getByText('Alberta well licences',{exact:false}).count());await page.keyboard.press('Escape');
 await page.setViewportSize({width:390,height:844});await noOverflow();
 assert.ok(await page.locator('.ra-place-context').evaluate(e=>e.getBoundingClientRect().bottom<document.querySelector('.ra-stage').getBoundingClientRect().top));
 await page.waitForFunction(()=>{const c=document.querySelector('.ra-boundaries'),p=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let n=0;for(let i=3;i<p.length;i+=4)if(p[i]>0)n++;return n>c.width*c.height*.1;});
 checks.push('Alberta totals separate from mapped records','record inspection retains map and filters','atlas context before map','map remains drawn after mobile resize');
 await page.locator('#location-button').click();await page.locator('[data-page=journey]').click();await page.locator('.transport-stage').waitFor();await routeVisible();
 await page.locator('[data-step="0"]').first().click();await page.getByLabel('Shipment volume',{exact:true}).fill('2000');await page.getByLabel('Shipment volume',{exact:true}).press('Tab');
 await page.getByRole('button',{name:'See carrier charge →',exact:true}).click();await page.locator('[data-testid=receipt-total]').waitFor();const receipt=await page.locator('[data-testid=receipt-total]').innerText();assert.match(receipt,/\$/);await routeVisible();
 await page.getByRole('button',{name:'Compare destinations →',exact:true}).click();await page.locator('.route-option').first().waitFor();await page.locator('.route-option').nth(1).click();await page.locator('[data-testid=receipt-total]').waitFor();await routeVisible();
 await page.reload();await page.locator('[data-testid=receipt-total]').waitFor();await routeVisible();
 assert.equal(await page.locator('.mobile-surface').isVisible(),false);await noOverflow();
 for(const viewport of [{width:1440,height:1000},{width:320,height:740},{width:844,height:390}]){await page.setViewportSize(viewport);await page.locator('[data-step="0"]').first().click();await routeVisible();await noOverflow();}
 await page.locator('[data-action=receipt-evidence]').click();await page.getByRole('button',{name:'Download receipt',exact:true}).waitFor();const download=page.waitForEvent('download');await page.getByRole('button',{name:'Download receipt',exact:true}).click();assert.match((await download).suggestedFilename(),/receipt/);await page.keyboard.press('Escape');
 checks.push('receipt export remains reachable','transport map visible through all stages','atlas-to-transport map sizing','shipment reprices','destination selection and reload','320px and landscape');
 await go({view:'journey',step:1,layers:{oil:false,gas:false,wells:true,historical:true,bcPermits:true}});await page.locator('[data-testid=receipt-total]').waitFor();await routeVisible();checks.push('old layer preferences cannot hide selected route');
 assert.deepEqual(errors,[]);console.log(JSON.stringify({status:'passed',checks,providerCalls:0},null,2));
}finally{await browser.close();}
