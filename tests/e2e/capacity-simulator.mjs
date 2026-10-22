import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {simulateCapacity} from '../../capacity-model.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,...(process.env.TEST_BROWSER_PATH?{executablePath:process.env.TEST_BROWSER_PATH}:{})});
const base=process.env.TEST_URL||'http://127.0.0.1:4208/';
const artifacts=path.resolve(process.env.TEST_ARTIFACT_DIR||'.data-cache/capacity-simulator');await mkdir(artifacts,{recursive:true});
const response=await fetch(new URL('capacity-data.json',base));assert.equal(response.status,200);const data=await response.json();
const route=capacity=>base+'#v1='+encodeURIComponent(JSON.stringify({view:'economy',economy:{section:'services',albertaMode:'capacity',capacity}}));
const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce',acceptDownloads:true}),page=await context.newPage();
const errors=[],inferenceRequests=[],checks=[];page.on('pageerror',error=>errors.push(error.message));
await page.route('**/api/analysis/status',request=>request.fulfill({json:{available:false}}));
await page.route('**/api/analysis',request=>{inferenceRequests.push(request.request().url());return request.abort();});
const host=page.locator('.capacity-simulator');
const topicNames={workforce:'Nursing supply',construction:'School openings',funding:'Funding rules'};
const changeTopic=async topic=>{await host.getByRole('button',{name:topicNames[topic],exact:true}).click();assert.equal(await host.getAttribute('data-topic'),topic);};
const setRange=async (name,value)=>{await host.locator(`#cs-${name}`).evaluate((input,value)=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,String(value));input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));},value);};
const exportPayload=async()=>{const pending=page.waitForEvent('download');await host.locator('[data-research-export]').click();return JSON.parse(await readFile(await(await pending).path(),'utf8'));};
try{
 await page.goto(route({topic:'workforce'}));await host.waitFor();
 assert.equal(await host.locator('details').count(),0);assert.equal(await host.locator('.hw-eyebrow').count(),0);assert.equal(await host.locator('input[type=range]').count(),4);
 assert.match(await host.locator('.cs-validation').innerText(),/no improvement over a simple trend/);assert.match(await host.locator('.cs-validation').innerText(),/2,686.*2,609/);
 assert.match(await host.locator('.cs-limit').innerText(),/eligible people/);assert.equal(await host.locator('.cs-line.cs-observed').evaluate(el=>getComputedStyle(el).strokeDasharray),'none');assert.notEqual(await host.locator('.cs-line.cs-scenario').evaluate(el=>getComputedStyle(el).strokeDasharray),'none');
 await setRange('extraEntrants',1000);await setRange('retentionPp',1);await setRange('delayYears',1);await setRange('years',5);
 let expected=simulateCapacity(data,{topic:'workforce',extraEntrants:1000,retentionPp:1,delayYears:1,years:5});
 assert.match(await host.locator('.cs-outcome').innerText(),new RegExp(Math.round(expected.workforce.additional).toLocaleString('en-CA')));
 assert.match(await host.locator('.cs-assumptions').innerText(),/First extra entrants: 2027/);
 const evidenceButton=host.getByRole('button',{name:'Evidence',exact:true});await evidenceButton.click();const dialog=host.getByRole('dialog',{name:'Capacity evidence'});await dialog.waitFor();
 assert.equal(await dialog.getByRole('region',{name:'Alberta RN registration observations',exact:true}).locator('tbody tr').count(),10);
 assert.equal(await dialog.getByRole('region',{name:'Nursing holdout predictions and observations',exact:true}).locator('tbody tr').count(),5);
 assert.equal(await dialog.getByRole('region',{name:'Five CBE projects: plans, observations and scenario',exact:true}).count(),0);
 assert.equal(await dialog.getByRole('region',{name:'Original forecast validation (unadjusted)',exact:true}).count(),0);
 for(const source of data.sources.filter(source=>/^(cihi|ahs)-/.test(source.id)))assert(await dialog.locator(`a[href="${source.url}"]`).count()>0);
 let exported=await exportPayload();assert.deepEqual(exported.sourceSnapshot,data);assert.deepEqual(exported.result,expected);assert.equal(exported.result.workforce.rows[1].extraEntries,0);assert.equal(exported.result.workforce.rows[2].extraEntries,1000);
 await page.keyboard.press('Escape');assert.equal(await evidenceButton.evaluate(el=>el===document.activeElement),true);
 await page.reload();await host.waitFor();assert.equal(await host.locator('#cs-extraEntrants').inputValue(),'1000');assert.equal(await host.locator('#cs-retentionPp').inputValue(),'1');
 checks.push('Source-backed RN observations and dashed conditional projections; selected parameters survive reload; independent model matches UI and exported scenario; complete waiting-year semantics');
 await changeTopic('construction');await setRange('openingShiftMonths',-12);assert.match(await host.locator('.cs-outcome').innerText(),/57,600/);assert.match(await host.locator('.cs-outcome').innerText(),/4,800/);assert.match(await host.locator('.cs-visual').innerText(),/not staffed capacity/);assert((await host.locator('.cs-line.cs-scenario').getAttribute('d')).includes('H'));
 await host.locator('#cs-openingShiftMonths').focus();await page.keyboard.press('End');assert.equal(await host.locator('#cs-openingShiftMonths').inputValue(),'24');assert.match(await host.locator('.cs-outcome').innerText(),/-115,200/);
 await host.getByRole('button',{name:'Reset assumptions'}).click();assert.equal(await host.locator('#cs-openingShiftMonths').inputValue(),'0');
 await evidenceButton.click();assert.equal(await dialog.getByRole('heading',{name:'School openings',exact:true}).count(),1);assert.equal(await dialog.getByRole('region',{name:'Five CBE projects: plans, observations and scenario',exact:true}).locator('tbody tr').count(),5);assert.equal(await dialog.getByRole('region',{name:'Alberta RN registration observations',exact:true}).count(),0);assert.equal(await dialog.getByRole('region',{name:'Original forecast validation (unadjusted)',exact:true}).count(),0);assert(await dialog.locator('a[href="'+data.sources.find(source=>source.id==='cbe-capital-2022').url+'"]').count()>0);await page.keyboard.press('Escape');
 checks.push('Five-project step chart, 4,800 total design places, earlier/later place-month arithmetic and keyboard slider controls');
 await changeTopic('funding');await host.locator('#cs-fundingYear').selectOption('2024');await host.locator('#cs-fundingRule').selectOption('previous');await setRange('projectionChangePct',5);
 expected=simulateCapacity(data,{topic:'funding',extraEntrants:1000,retentionPp:1,delayYears:1,years:5,openingShiftMonths:0,fundingYear:2024,fundingRule:'previous',projectionChangePct:5});
 await evidenceButton.click();assert.equal(await dialog.getByRole('heading',{name:'Funding rules',exact:true}).count(),1);assert.equal(await dialog.getByRole('region',{name:'Original forecast validation (unadjusted)',exact:true}).locator('tbody tr').count(),3);assert.equal(await dialog.getByRole('region',{name:'Alberta RN registration observations',exact:true}).count(),0);assert.equal(await dialog.getByRole('region',{name:'Five CBE projects: plans, observations and scenario',exact:true}).count(),0);assert(await dialog.locator('a[href="'+data.sources.find(source=>source.id==='ab-funding-model').url+'"]').count()>0);exported=await exportPayload();assert.deepEqual(exported.result,expected);assert.equal(exported.result.funding.validation.rows[1].predicted,136461);await page.keyboard.press('Escape');
 assert.match(await host.locator('.cs-limit').innerText(),/not final funded counts or grant dollars/);assert.match(await host.locator('.cs-validation').innerText(),/Three years do not validate a funding policy/);
 checks.push('All funding controls, original published forecast validation preserved after scenario edits, formulas and exports agree; every topic opens its own evidence and sources while export retains full snapshot');
 for(const [width,height] of [[1440,1000],[390,844],[320,740],[740,360]]){
  await page.setViewportSize({width,height});
  for(const topic of ['workforce','construction','funding']){
   await changeTopic(topic);await page.waitForTimeout(70);
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${width}x${height} ${topic}: horizontal overflow`);
   assert.equal(await host.locator('.cs-visual').evaluate(el=>getComputedStyle(el).position),'static',`${topic}: chart should not trap the viewport`);
   const svg=host.locator('.cs-chart svg');assert(await svg.locator('text').first().evaluate(el=>el.getBoundingClientRect().height>=10),`${width}: tiny chart text`);
   await host.screenshot({path:path.join(artifacts,`${topic}-${width}.png`)});
  }
  await evidenceButton.click();assert(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth+1),`${width}: modal overflow`);await page.keyboard.press('Escape');
 }
 checks.push('Desktop, 390px, 320px and 740×360 landscape: all topics, readable chart text, no horizontal overflow or sticky chart trap, contained evidence');
 await host.getByRole('button',{name:'Nursing supply'}).focus();await page.keyboard.press('Enter');assert.equal(await host.getAttribute('data-topic'),'workforce');
 await page.getByRole('navigation',{name:'Alberta services view'}).getByRole('button',{name:'Observed change',exact:true}).click();await page.locator('.hw-alberta-services').waitFor();
 checks.push('Keyboard topic selection and return to observed service story');
 assert.deepEqual(errors,[]);assert.deepEqual(inferenceRequests,[]);
 const report={status:'passed',checks,errors,inferenceRequests};await writeFile(path.join(artifacts,'acceptance.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}catch(error){await page.screenshot({path:path.join(artifacts,'failure.png'),fullPage:true});console.error(JSON.stringify({errors,body:(await page.locator('body').innerText()).slice(-5000)},null,2));throw error;}finally{await browser.close();}
