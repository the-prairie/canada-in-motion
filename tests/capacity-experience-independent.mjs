const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const browser=await chromium.launch({headless:true,...(process.env.TEST_BROWSER_PATH?{executablePath:process.env.TEST_BROWSER_PATH}:{})});
const artifacts=process.env.TEST_ARTIFACT_DIR||'.data-cache/capacity-experience';await fs.mkdir(artifacts,{recursive:true});
const results=[];const base=process.env.TEST_URL||'http://127.0.0.1:4208/';
try{for(const [name,width,height] of [['desktop',1440,1000],['mobile',375,812],['landscape',812,375]]){
 const page=await browser.newPage({viewport:{width,height},reducedMotion:'reduce'});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/analysis**',r=>r.fulfill({status:200,contentType:'application/json',body:'{"available":false}'}));
 await page.goto(base+'#v1='+encodeURIComponent(JSON.stringify({view:'economy',economy:{section:'services',albertaMode:'capacity'}})));
 await page.locator('.capacity-simulator').waitFor();
 for(const topic of ['Nursing supply','School openings','Funding rules']){
 await page.getByRole('button',{name:topic,exact:true}).click();
 await page.locator('.capacity-simulator').scrollIntoViewIfNeeded();
 const bodyOverflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);
 assert.equal(bodyOverflow,false,`${name}/${topic} page overflow`);
 const content=await page.locator('.capacity-simulator').innerText();assert.ok(content.includes('Historical'));
 if(topic==='Nursing supply'){
  const input=page.getByLabel('Extra registrants each year');await input.focus();await page.keyboard.press('ArrowRight');assert.equal(await input.inputValue(),'100');
  assert.match(await page.locator('.cs-outcome').innerText(),/registered people versus baseline/);
  await page.getByRole('button',{name:'Reset assumptions',exact:true}).click();assert.equal(await input.inputValue(),'0');
 }else if(topic==='School openings'){
  const input=page.getByLabel('Shift actual opening dates');await input.focus();await page.keyboard.press('ArrowLeft');assert.equal(await input.inputValue(),'-1');
  assert.match(await page.locator('.cs-outcome').innerText(),/4,800/);
 }else{
  await page.locator('#cs-fundingYear').selectOption('2023');await page.locator('#cs-fundingRule').selectOption('previous');
  assert.match(await page.locator('.cs-vintage').innerText(),/2023/);
 }
 await page.screenshot({path:`${artifacts}/${name}-${topic.split(' ')[0].toLowerCase()}.png`,fullPage:true});
 await page.locator('.capacity-simulator').getByRole('button',{name:'Evidence',exact:true}).click();
 const dialog=page.getByRole('dialog');await dialog.waitFor();assert.equal(await dialog.locator('h3').first().innerText(),topic);const evidenceText=await dialog.innerText();assert.match(evidenceText,topic==='Nursing supply'?/not forecast accuracy/:topic==='School openings'?/five CBE projects|Five CBE projects/:/Original CBE budget vintages/);
 const dialogOverflow=await dialog.evaluate(e=>e.scrollWidth>e.clientWidth+1);assert.equal(dialogOverflow,false,`${name}/${topic} dialog overflow`);
 await page.keyboard.press('Escape');assert.equal(await dialog.count(),0);
 assert.match(await page.evaluate(()=>document.activeElement?.textContent||''),/Evidence/);
 results.push({viewport:name,topic,bodyOverflow,dialogOverflow});
 }
 assert.deepEqual(errors,[],`${name} browser errors`);await page.close();
}await fs.writeFile(`${artifacts}/results.json`,JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));}finally{await browser.close();}
