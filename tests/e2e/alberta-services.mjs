import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,...(process.env.TEST_BROWSER_PATH?{executablePath:process.env.TEST_BROWSER_PATH}:{})});
const base=process.env.TEST_URL||'http://127.0.0.1:4207/';
const artifacts=path.resolve(process.env.TEST_ARTIFACT_DIR||'.data-cache/alberta-services');await mkdir(artifacts,{recursive:true});
const snapshot=await fetch(new URL('alberta-services-data.json',base)).then(response=>{assert.equal(response.status,200);return response.json();});
const location=stage=>base+'#v1='+encodeURIComponent(JSON.stringify({view:'economy',economy:{section:'services',albertaStage:stage||'population'}}));
const errors=[],inferenceRequests=[],checks=[];
const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce',acceptDownloads:true});
const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
await page.route('**/api/analysis/status',route=>route.fulfill({json:{available:false}}));
await page.route('**/api/analysis',route=>{inferenceRequests.push(route.request().url());return route.abort();});
const host=page.locator('#ec-alberta-services'),nav=host.getByRole('navigation',{name:'Alberta services chapters'});
const stages=['population','schools','health','housing'];
const jump=async stage=>{await nav.locator('button').nth(stages.indexOf(stage)).click();await page.waitForTimeout(300);assert.equal(await host.locator('.as-scene').getAttribute('data-stage'),stage);assert.equal(await nav.locator('[aria-current]').count(),1);};
try{
 await page.goto(location());await nav.waitFor();
 assert.equal(await host.locator('table,details,input[type=range]').count(),0);assert(Number(await host.locator('#as-population').evaluate(element=>parseFloat(getComputedStyle(element).fontSize)))>=36);
 assert.match(await host.locator('.as-framework-note').innerText(),/not a causal estimate/);
 for(const stage of stages){await jump(stage);const chapter=snapshot.chapters[stage];const expected=stage==='health'?chapter.metrics.find(metric=>metric.role==='capacity'):chapter.metrics[0];assert.equal(await host.locator('.as-comparison').getAttribute('data-metric'),expected.id);assert.equal(await host.locator('.as-observation').count(),expected.series.reduce((sum,series)=>sum+series.values.length,0));
  if(chapter.metrics.length>1){const buttons=host.getByRole('group',{name:stage[0].toUpperCase()+stage.slice(1)+' evidence measures'}).locator('button');for(let i=0;i<chapter.metrics.length;i++){await buttons.nth(i).click();assert.equal(await host.locator('.as-comparison').getAttribute('data-metric'),chapter.metrics[i].id);}}
 }
 checks.push('Four chapters expose source endpoint observations; all measure selectors work; conceptual framing is explicitly non-causal');
 await jump('population');await host.locator('[data-chapter=population]').getByRole('button',{name:'Next: Schools'}).focus();await page.keyboard.press('Enter');await page.waitForTimeout(300);assert.equal(await host.locator('.as-scene').getAttribute('data-stage'),'schools');assert.equal(await host.locator('#as-schools').evaluate(element=>element===document.activeElement),true);
 await host.locator('[data-chapter=schools]').getByRole('button',{name:'Previous',exact:true}).click();await page.waitForTimeout(300);assert.equal(await host.locator('.as-scene').getAttribute('data-stage'),'population');
 const evidenceButton=host.getByRole('button',{name:'Evidence',exact:true});await evidenceButton.click();const dialog=host.getByRole('dialog',{name:'Alberta services evidence'});await dialog.waitFor();
 assert.equal(await dialog.locator('table').count(),stages.reduce((sum,stage)=>sum+snapshot.chapters[stage].metrics.length,0));
 assert.match(await dialog.innerText(),/forecast/);assert.match(await dialog.innerText(),/Money is a flow/);assert.match(await dialog.innerText(),/Leverage Points/);
 for(const source of snapshot.sources)assert(await dialog.locator(`a[href="${source.url}"]`).count()>0);
 const pending=page.waitForEvent('download');await dialog.locator('[data-research-export]').click();const download=await pending,payload=JSON.parse(await readFile(await download.path(),'utf8'));assert.deepEqual(payload.sourceSnapshot,snapshot);assert.equal(payload.selection.stage,'population');assert.deepEqual(Object.keys(payload.result.chapters),Object.keys(snapshot.chapters));
 await page.keyboard.press('Escape');assert.equal(await evidenceButton.evaluate(element=>element===document.activeElement),true);
 checks.push('Keyboard next/previous and chapter focus, evidence tables, source links, full JSON snapshot and modal focus restoration pass');
 for(const [width,height] of [[1440,1000],[390,844],[320,740],[740,360]]){
  await page.setViewportSize({width,height});
  for(const stage of [...stages,'health','schools','population']){await jump(stage);if(snapshot.chapters[stage].metrics.length>1)await host.locator('.as-metric-picker button').nth(stage==='health'?1:0).click();assert((await page.evaluate(()=>document.documentElement.scrollWidth))<=width,`${width}: page overflow`);const scene=await host.locator('.as-visual').boundingBox();assert(scene.y>=0&&scene.y+scene.height<=height+2,`${width}x${height}: scene clipped ${JSON.stringify(scene)}`);const heading=await host.locator(`#as-${stage}`).boundingBox();assert(heading.y>=0&&heading.y<height,`${width}x${height}: chapter heading is off screen`);const content=await host.locator('.as-chart-note').boundingBox();assert(!content||content.y+content.height<=scene.y+scene.height+2,`${width}x${height}: chart content escapes scene`);}
  await jump('health');await page.screenshot({path:path.join(artifacts,`health-${width}.png`)});await jump('schools');await page.screenshot({path:path.join(artifacts,`schools-${width}.png`)});
 }
 checks.push('1440px desktop, 390px and 320px phones, 740px short landscape: forward/reverse navigation, contained evidence scene and no horizontal overflow');
 await page.setViewportSize({width:1440,height:1000});await jump('health');await page.reload();await nav.waitFor();await page.waitForTimeout(400);assert.equal(await host.locator('.as-scene').getAttribute('data-stage'),'health');
 await page.evaluate(url=>{location.hash=new URL(url).hash;},location('housing'));await page.waitForTimeout(400);assert.equal(await host.locator('.as-scene').getAttribute('data-stage'),'housing');
 await jump('population');await page.mouse.wheel(0,1200);await page.waitForTimeout(400);assert.notEqual(await host.locator('.as-scene').getAttribute('data-stage'),'population');await page.mouse.wheel(0,-6000);await page.waitForTimeout(400);assert.equal(await host.locator('.as-scene').getAttribute('data-stage'),'population');
 await jump('health');
 await page.locator('#location-button').evaluate(button=>button.click());await page.locator('[data-page=atlas]').click();await page.locator('.ra-workspace').waitFor();await page.mouse.wheel(0,900);await page.waitForTimeout(400);
 await page.locator('#location-button').evaluate(button=>button.click());await page.locator('[data-page=services]').click();await nav.waitFor();await page.waitForTimeout(400);assert.equal(await host.locator('.as-scene').getAttribute('data-stage'),'health');
 checks.push('Navigating away and scrolling a hidden story preserves its chapter on return');
 assert.equal(await host.locator('.as-bar-track i').first().evaluate(element=>getComputedStyle(element).transitionDuration),'0s');
 checks.push('Deep-linked reload, external chapter changes, native forward/reverse scrolling and reduced motion pass');
 assert.deepEqual(errors,[]);assert.deepEqual(inferenceRequests,[]);
 const report={status:'passed',checks,errors,inferenceRequests};await writeFile(path.join(artifacts,'acceptance.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{await browser.close();}
