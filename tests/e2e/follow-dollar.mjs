import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,...(process.env.TEST_BROWSER_PATH?{executablePath:process.env.TEST_BROWSER_PATH}:{})});
const base=process.env.TEST_URL||'http://127.0.0.1:4205/';
const artifacts=path.resolve(process.env.TEST_ARTIFACT_DIR||'.data-cache/follow-dollar');await mkdir(artifacts,{recursive:true});
const snapshot=await fetch(new URL('data/income-paths.json',base)).then(r=>{assert.equal(r.status,200);return r.json();});
const results=[],errors=[],inferenceRequests=[];
const location=state=>base+'#v1='+encodeURIComponent(JSON.stringify({view:'economy',economy:{section:'supply',region:'AB',incomeIndustry:'oil-gas',incomeYear:2022,demandMillion:100,...state}}));
const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce',acceptDownloads:true});const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
await page.route('**/api/analysis/status',r=>r.fulfill({json:{available:false}}));await page.route('**/api/analysis',r=>{inferenceRequests.push(r.request().url());return r.abort();});
const host=page.locator('#ec-income-paths'),nav=host.getByRole('navigation',{name:'Follow the dollar chapters'});
const jump=async i=>{await nav.locator('button').nth(i).click();await page.waitForTimeout(180);assert.equal(await nav.locator('[aria-current]').innerText(),`${i+1}\n${['Demand','Industry','Suppliers','Households','Across Canada'][i]}`);};
const edit=async fn=>{await host.getByRole('button',{name:'Change scenario',exact:true}).click();const d=host.getByRole('dialog',{name:'Change the demand scenario'});await d.waitFor();await fn(d);await d.getByRole('button',{name:'Done',exact:true}).click();};
const evidence=()=>host.getByRole('button',{name:'Evidence',exact:true});const dialog=()=>host.getByRole('dialog',{name:'Follow the dollar evidence',exact:true});
const outcome=name=>host.getByRole('button',{name,exact:true});
try{
 await page.goto(location());await nav.waitFor();
 assert.equal(await host.locator('table,details').count(),0);assert.equal(await host.locator('.ip-controls').count(),0);
 assert(Number(await host.locator('#ip-demand').evaluate(e=>parseFloat(getComputedStyle(e).fontSize)))>=36);
 const origin=await host.locator('.ip-scene-origin').innerText();assert.match(origin,/Alberta\n\$100M/);
 await jump(1);assert.equal(await host.locator('[data-stage-value="direct"]').innerText(),'$67M');
 await jump(2);assert.equal(await host.locator('[data-stage-value="indirect"]').innerText(),'$23.7M');assert.equal(await host.locator('.ip-scene .ip-actor-0 strong').innerText(),'$67M');
 await jump(3);assert.equal(await host.getByRole('checkbox',{name:'Include household spending'}).isChecked(),false);assert.equal(await host.locator('.ip-actor-2 strong').innerText(),'Optional');
 await host.getByRole('checkbox',{name:'Include household spending'}).check();assert.equal(await host.locator('[data-stage-value="induced"]').innerText(),'$10.2M');
 await host.getByRole('checkbox',{name:'Include household spending'}).uncheck();
 await jump(4);assert.equal(await host.locator('.ip-total').innerText(),'$90.6M');assert.deepEqual(await host.locator('.ip-allocation-row strong').allTextContents(),['$85.5M','$5.1M']);
 await outcome('Labour income').focus();await page.keyboard.press('Space');assert.equal(await host.locator('.ip-total').innerText(),'$21.9M');assert.equal(await host.locator('[data-stage-value="direct"]').innerText(),'$10.3M');
 await outcome('Jobs').click();assert.equal(await host.locator('.ip-total').innerText(),'185 jobs');assert.match(await host.locator('.ip-definition').innerText(),/not full-time equivalents or net hires/);
 results.push('All five chapters share a scenario; direct, supplier, optional induced and published totals match source-derived expected values; GDP, labour and jobs remain distinct');
 await edit(async d=>{await d.getByLabel('Additional final demand in million dollars',{exact:true}).fill('0');});
 await jump(4);assert.equal(await host.locator('.ip-total').innerText(),'0 jobs');assert.deepEqual(await host.locator('.ip-allocation-row strong').allTextContents(),['0 jobs','0 jobs']);
 await edit(async d=>{await d.getByLabel('Demand origin province',{exact:true}).selectOption('PE');await d.getByLabel('Demand industry',{exact:true}).selectOption('oil-sands');});
 await jump(4);assert.equal(await host.locator('.ip-total').innerText(),'Not published');assert.equal(await host.locator('.ip-allocation-row').count(),0);assert.match(await host.locator('.ip-unavailable').innerText(),/Unavailable values are not zero/);
 results.push('Zero demand stays zero; unpublished coefficients stay unavailable even at zero demand');
 await edit(async d=>{await d.getByLabel('Demand origin province',{exact:true}).selectOption('ON');await d.getByLabel('Demand industry',{exact:true}).selectOption('electricity');await d.getByLabel('Multiplier reference year',{exact:true}).selectOption('2021');await d.getByLabel('Additional final demand in million dollars',{exact:true}).fill('250');});
 await jump(3);await host.getByRole('checkbox',{name:'Include household spending'}).check();await jump(4);await outcome('GDP').click();assert.equal(await host.locator('.ip-total').innerText(),'$370.3M');
 await evidence().click();await dialog().waitFor();assert.equal(await dialog().getByRole('region',{name:'GDP by stage',exact:true}).locator('tbody tr').count(),3);
 assert.equal(await dialog().getByRole('link',{name:/Statistics Canada/}).getAttribute('href'),snapshot.sources[0].url);
 const downloadPromise=page.waitForEvent('download');await dialog().getByRole('button',{name:'Export calculation and source snapshot'}).click();const download=await downloadPromise,payload=JSON.parse(await readFile(await download.path(),'utf8'));
 assert.deepEqual(payload.selection,{region:'ON',industry:'electricity',demandMillion:250,year:2021,includeInduced:true,outcome:'gdp'});assert.deepEqual(payload.sourceSnapshot,snapshot);assert.equal(payload.result.metrics.find(m=>m.id==='gdp').canada,370.25);
 await page.keyboard.press('Escape');assert.equal(await evidence().evaluate(e=>e===document.activeElement),true);
 await jump(2);await page.reload();await nav.waitFor();await page.waitForTimeout(250);assert.match(await nav.locator('[aria-current]').innerText(),/Suppliers/);assert.match(await host.locator('.ip-scene-origin').innerText(),/Ontario\n\$250M/);
 results.push('Scenario changes, induced effects, precise evidence, source-snapshot export, modal focus restoration and deep-linked chapter reload pass');
 for(const [width,height] of [[1440,1000],[390,844],[320,740],[844,390],[667,375],[740,360]]){
  await page.setViewportSize({width,height});
  for(const i of [0,1,2,3,4,2,0]){await jump(i);assert((await page.evaluate(()=>document.documentElement.scrollWidth))<=width,`${width}: horizontal overflow`);const scene=await host.locator('.ip-visual').boundingBox();assert(scene.y>=0&&scene.y+scene.height<=height+2,`${width}x${height}: scene clipped ${JSON.stringify(scene)}`);}
  await jump(2);await page.screenshot({path:path.join(artifacts,`story-suppliers-${width}.png`)});await jump(4);await page.screenshot({path:path.join(artifacts,`story-map-${width}.png`)});
  assert.equal(await host.locator('.ip-geography').getAttribute('aria-hidden'),'false');
 }
 results.push('Desktop, 390px/320px mobile and short landscape: forward/reverse chapters, scene containment, final map and no horizontal overflow');
 await page.setViewportSize({width:1440,height:1000});await jump(0);await page.mouse.wheel(0,1100);await page.waitForTimeout(250);assert.notEqual(await nav.locator('[aria-current]').innerText(),'1\nDemand');await page.mouse.wheel(0,-4000);await page.waitForTimeout(250);assert.equal(await nav.locator('[aria-current]').innerText(),'1\nDemand');
 await context.close();
 const normal=await browser.newContext({viewport:{width:390,height:844}});const p=await normal.newPage();await p.route('**/api/analysis**',r=>r.fulfill({json:{available:false}}));await p.goto(location({incomeStep:2}));await p.locator('.ip-scene-2').waitFor();assert.notEqual(await p.locator('.ip-links path').first().evaluate(e=>getComputedStyle(e).transitionDuration),'0s');await normal.close();
 results.push('Native forward/reverse scrolling and ordinary-motion chapter loading pass; no inference calls');
 assert.deepEqual(errors,[]);assert.deepEqual(inferenceRequests,[]);const report={status:'passed',checks:results,errors,inferenceRequests};await writeFile(path.join(artifacts,'acceptance.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{await browser.close();}
