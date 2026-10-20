import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,...(process.env.TEST_BROWSER_PATH?{executablePath:process.env.TEST_BROWSER_PATH}:{})});
const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'}),page=await context.newPage(),errors=[];
page.on('pageerror',e=>errors.push(e.message));const base=process.env.TEST_URL||'http://127.0.0.1:4188/';
const url=state=>base+'#v1='+encodeURIComponent(JSON.stringify({view:'economy',economy:state}));
try{
 await page.goto(url({section:'supply',region:'AB',demandMillion:100}));await page.locator('.hw-income-hero').waitFor();
 assert.match(await page.locator('.hw-income-hero').innerText(),/\$90\.6M/);
 await page.getByLabel('Additional final demand in million dollars',{exact:true}).fill('200');
 assert.match(await page.locator('.hw-income-hero').innerText(),/\$181\.2M/);
 await page.getByLabel('Additional final demand in million dollars',{exact:true}).fill('0');await page.reload();await page.locator('.hw-income-hero').waitFor();
 assert.equal(await page.getByLabel('Additional final demand in million dollars',{exact:true}).inputValue(),'0');
 await page.getByLabel('Additional final demand in million dollars',{exact:true}).fill('100');
 await page.getByLabel('Multiplier reference year',{exact:true}).selectOption('2021');await page.reload();await page.locator('.hw-income-hero').waitFor();assert.equal(await page.getByLabel('Multiplier reference year',{exact:true}).inputValue(),'2021');
 await page.getByLabel('Multiplier reference year',{exact:true}).selectOption('2022');
 await page.locator('.hw-income-paths .hw-method-inline summary').click();await page.locator('.hw-induced input').check();assert.match(await page.locator('.hw-income-hero').innerText(),/\$100\.9M/);
 await page.screenshot({path:'/tmp/cim-income-desktop.png',fullPage:true});
 await page.getByLabel('Demand origin province',{exact:true}).selectOption('PE');assert.equal(await page.locator('#ec-region').inputValue(),'PE');await page.getByLabel('Demand industry',{exact:true}).selectOption('oil-sands');assert.match(await page.locator('.hw-income-paths').innerText(),/not published for/);
 await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 await page.goto(url({section:'oil',historyRegions:['AB','ON','QC'],historyOilChange:-40,historyHorizon:2}));await page.locator('.hw-history-chart').waitFor();
 assert.equal(await page.locator('.hw-episodes button').count(),5);
 await page.locator('.hw-episodes button').nth(1).click();const episode=await page.locator('.hw-episodes button[aria-pressed="true"]').innerText();await page.getByLabel('Historical GDP horizon',{exact:true}).selectOption('1');await page.reload();await page.locator('.hw-history-chart').waitFor();assert.equal(await page.getByLabel('Historical GDP horizon',{exact:true}).inputValue(),'1');assert.equal(await page.locator('.hw-episodes button[aria-pressed="true"]').innerText(),episode);
 await page.locator('.hw-oil-history .hw-method-inline summary').click();assert.match(await page.locator('.hw-oil-history').innerText(),/have not cleared the public forecast gate/);
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 await page.screenshot({path:'/tmp/cim-history-mobile.png',fullPage:true});
 assert.deepEqual(errors,[]);console.log(JSON.stringify({status:'passed',checks:['official multiplier GDP value','linear scaling','zero-demand reload','reference-year reload','induced toggle','missing industry','province selector sync','historical episode URL reload','horizon URL reload','forecast gate disclosure','mobile layout','no runtime errors']},null,2));
}finally{await browser.close();}
