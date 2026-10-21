import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {summarizeEnergyStory} from '../../energy-story-model.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,...(process.env.TEST_BROWSER_PATH?{executablePath:process.env.TEST_BROWSER_PATH}:{})});
const base=process.env.TEST_URL||'http://127.0.0.1:4206/';
const artifacts=path.resolve(process.env.TEST_ARTIFACT_DIR||'.data-cache/explore-connected');await mkdir(artifacts,{recursive:true});
const checks=[],errors=[],calls=[];
const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce',acceptDownloads:true});
const page=await context.newPage();page.setDefaultTimeout(20000);page.on('pageerror',e=>errors.push(e.message));
await page.route('**/api/analysis/status',r=>r.fulfill({json:{available:false}}));await page.route('**/api/analysis',r=>{calls.push(r.request().url());return r.abort();});
const url=story=>base+'#v1='+encodeURIComponent(JSON.stringify({view:'economy',economy:{section:'explore',story:{commodity:'oil',focus:'AB',compare:'ON',shockPct:-10,...story}}}));
const host=page.locator('#ec-energy-story');
const state=()=>page.evaluate(()=>JSON.parse(decodeURIComponent(location.hash.slice(4))).economy.story);
const chapter=async label=>{await host.getByRole('navigation',{name:'Investigation chapters'}).getByRole('button',{name:label,exact:true}).click();};
const edit=async fn=>{await host.locator('.es-edit-scenario').click();const dialog=host.getByRole('dialog',{name:'Change the price scenario'});await fn(dialog);await dialog.getByRole('button',{name:'Done',exact:true}).click();};
const exportScenario=async()=>{await host.getByRole('button',{name:'Save scenario',exact:true}).click();const pending=page.waitForEvent('download');await host.getByRole('button',{name:'Export investigation',exact:true}).click();const d=await pending;const payload=JSON.parse(await readFile(await d.path(),'utf8'));await page.keyboard.press('Escape');return payload;};
try{
 await page.goto(url());await host.locator('.es-connected-scene').waitFor();
 assert.equal(await host.locator('.es-assumptions').count(),0,'scenario controls do not fill the opening screen');
 assert.match(await host.locator('.es-scene-heading').innerText(),/Alberta \/ Ontario/);
 assert.equal(await host.locator('.es-scene-map [role=button]').count(),13);
 assert.equal(await host.locator('.es-connected-scene.is-playing').count(),0,'reduced motion honoured');
 const map=await host.locator('.es-scene-map').elementHandle();
 const payload=await exportScenario(),result=summarizeEnergyStory(payload.snapshots,payload.selection);
 assert.equal(result.channels.domestic.focus.receiptsChange,result.channels.domestic.focus.exports*-.1,'receipts repricing is fixed-quantity arithmetic');
 assert(Math.abs(result.channels.domestic.focus.netChange+result.channels.domestic.restOfCanada.netChange)<1e-8,'domestic net changes offset within floating-point precision');
 for(const [label,id] of [['Sales','overview'],['Trading partners','trade'],['Public revenue','public-finances'],['National GDP','national'],['Provincial GDP','outlook'],['Household costs','households']]){
  await chapter(label);assert.equal(await host.locator('.es-connected-scene').getAttribute('data-scene'),id);assert.equal(await map.evaluate(e=>e.isConnected),true,'one map persists across accounts');assert.equal((await state()).chapter,id);assert.match(await host.locator('.es-account-boundary').innerText(),/Do not add/);
  if(!['overview','trade'].includes(id))assert.equal(await host.locator('.es-scene-link').count(),0,'no trade animation implies a causal GDP or bill flow');
 }
 checks.push('Persistent map across six accounts, fixed-quantity repricing and domestic accounting identity, no implied additive model flow');
 await chapter('Sales');await host.locator('#es-price').focus();await page.keyboard.press('End');assert.equal((await state()).shockPct,20);assert.match(await host.locator('h1').innerText(),/rose 20/);await host.getByRole('button',{name:'Undo',exact:true}).click();assert.equal((await state()).shockPct,-10);
 await edit(async d=>{await d.getByRole('button',{name:'Electricity',exact:true}).click();await d.getByLabel('Investigation province',{exact:true}).selectOption('PE');await d.getByLabel('Comparison province',{exact:true}).selectOption('NB');});
 assert.match(await host.locator('.es-scene-heading').innerText(),/Prince Edward Island \/ New Brunswick/);
 await chapter('National GDP');assert.match(await host.locator('.es-scene-readings').innerText(),/No estimate/);assert.match(await host.locator('.es-gap').innerText(),/not calibrated/);
 await chapter('Household costs');await host.getByRole('button',{name:'Retail-price scenario',exact:true}).click();assert.equal((await state()).householdBasis,'retail');
 assert.match(await host.locator('.es-scene-readings').innerText(),/per year/);
 const householdPayload=await exportScenario(),households=summarizeEnergyStory(householdPayload.snapshots,householdPayload.selection).channels.households;
 for(const row of households.rows.filter(r=>r.status==='retail-scenario'))assert(Math.abs(row.annualChangeCad-row.baselineAnnualCad*-.1)<1e-8);
 await host.getByRole('button',{name:'Evidence',exact:true}).click();assert.match(await host.getByRole('dialog').innerText(),/Average|average|household/i);await page.keyboard.press('Escape');
 await host.getByRole('button',{name:'Save scenario',exact:true}).click();await host.getByRole('button',{name:'Pin this scenario',exact:true}).click();
 await edit(async d=>d.getByRole('button',{name:'Oil',exact:true}).click());await host.getByRole('button',{name:'Return to pinned scenario',exact:true}).click();assert.equal((await state()).commodity,'electricity');
 await host.locator('.es-scene-map').getByRole('button',{name:'Investigate Alberta',exact:true}).focus();await page.keyboard.press('Enter');assert.equal((await state()).focus,'AB');
 await page.reload();await host.locator('.es-connected-scene').waitFor();assert.match(await host.locator('.es-scene-heading').innerText(),/Alberta \/ New Brunswick/);assert.equal((await state()).chapter,'households');
 checks.push('Keyboard map and price selection, undo, scenario edit, commodity gaps, retail arithmetic, Evidence, pin and shared-link reload');
 await host.getByRole('button',{name:'Save scenario',exact:true}).click();await host.getByLabel('Open exported investigation',{exact:true}).setInputFiles({name:'scenario.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(householdPayload))});
 await host.locator('.es-snapshot').waitFor();assert.equal((await state()).focus,'PE');assert.match(await host.locator('.es-scene-heading').innerText(),/Prince Edward Island/);
 checks.push('Saved source snapshot restores the connected scene and scenario');
 for(const [width,height] of [[1440,1000],[390,844],[320,740],[844,390],[740,360]]){
  await page.setViewportSize({width,height});
  for(const [label,id] of [['Sales','overview'],['Trading partners','trade'],['Public revenue','public-finances'],['National GDP','national'],['Provincial GDP','outlook'],['Household costs','households']]){
   await chapter(label);await host.locator('.es-connected-scene').scrollIntoViewIfNeeded();assert((await page.evaluate(()=>document.documentElement.scrollWidth))<=width,`${width} ${id}: overflow`);
   assert.equal(await host.locator('.es-connected-scene').getAttribute('data-scene'),id);
   await page.screenshot({path:path.join(artifacts,`${id}-${width}.png`)});
  }
  // Start at the bottom as an actual reader would, without a test-side scroll fix.
  await chapter('Sales');
  const opening=async expected=>{
   const nav=host.getByRole('navigation',{name:'Investigation chapters'});
   assert.equal((await state()).chapter,expected);
   assert.equal(await nav.locator('[aria-current="step"]').evaluate(e=>document.activeElement===e),true,`${width}: keyboard focus reaches chapter opening`);
   const box=await nav.boundingBox(),scene=await host.locator('.es-connected-scene').boundingBox();
   assert(box.y>=-1&&box.y+box.height<=height,`${width}: chapter navigation is visible after progression`);
   assert(scene.y>=0&&scene.y<height,`${width}: map opening is visible after progression`);
  };
  for(const id of ['trade','public-finances','national','outlook','households']){await host.getByRole('navigation',{name:'Continue the investigation'}).getByRole('button',{name:'Next account',exact:false}).click();await opening(id);}
  await host.getByRole('navigation',{name:'Continue the investigation'}).getByRole('button',{name:'Previous',exact:false}).focus();await page.keyboard.press('Enter');await opening('outlook');
  await host.getByRole('navigation',{name:'Continue the investigation'}).getByRole('button',{name:'Next account',exact:false}).click();await opening('households');
  await host.getByRole('navigation',{name:'Continue the investigation'}).getByRole('button',{name:'Start again',exact:false}).click();await opening('overview');
  await edit(async d=>{assert((await d.boundingBox()).width<=width);});
 }
 checks.push('All six chapters and scenario editor at desktop, 390px/320px mobile and short landscape without horizontal overflow; Next, Previous and Start again reveal the map opening and focus the current chapter');
 const normal=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'no-preference'});const p=await normal.newPage();await p.route('**/api/analysis**',r=>r.fulfill({json:{available:false}}));await p.goto(url({chapter:'trade'}));await p.locator('.es-connected-scene').scrollIntoViewIfNeeded();await p.locator('.es-connected-scene.is-playing').waitFor();await p.getByRole('button',{name:'Pause trade flow',exact:true}).click();assert.equal(await p.locator('.es-connected-scene.is-playing').count(),0);await normal.close();
 checks.push('Ordinary motion plays only visible trade direction and pauses on request');
 assert.deepEqual(errors,[]);assert.deepEqual(calls,[]);const report={status:'passed',checks,errors,inferenceRequests:calls};await writeFile(path.join(artifacts,'acceptance.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{await browser.close();}
