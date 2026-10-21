/** Independent regression review. All browser work is headless; provider routes
 * are intercepted and use source-backed local fixtures. No inference is billed. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createEnergyAnalyzer} from '../../server/energy-analysis.mjs';
import {normalizeEconomyState,summarizeEconomy} from '../../economy-model.mjs';
import {createTradeWorkspace} from '../../trade-workspace-model.mjs';
import {validateWorkspace} from '../../workspace-contract.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const read=name=>JSON.parse(readFileSync(new URL(`../../data/${name}.json`,import.meta.url)));
const data=read('economy'),flows=read('energy-flows'),fiscal=read('provincial-impacts');
const state={region:'CA',scenario:'Current Measures',year:2030,oilShock:10,duration:'persistent'};
const analyze=createEnergyAnalyzer({data,flows,fiscal,normalizeState:normalizeEconomyState,summarize:summarizeEconomy,workspaceEnabled:true,
  provider:async()=>({state,investigation:{regions:['AB','BC'],topics:['energy-flows'],metricIds:[],includeMap:true,requestedMeasure:'available',energyTrade:{commodity:'electricity',year:2024,shockPct:10,linkScope:'between'}}})});
const tradeQuestion='Compare the value of electricity trade between Alberta and British Columbia in 2024.';
const tradeAnswer=await analyze({question:tradeQuestion,state});
assert.ok(!tradeAnswer.workspace.panels.some(p=>p.type==='provincial-impact'));
const physical=createTradeWorkspace({economy:data,flows,fiscal,regions:['AB'],selection:{tradeCommodity:'electricity',tradeYear:2024,transferSet:'electricity-monthly'}});
physical.authored=false;physical.panels=physical.panels.filter(p=>p.type==='energy-transfers');validateWorkspace(physical);
const physicalAnswer={state,workspace:physical,analysis:{headline:'July physical observations',blocks:[{text:'The physical series retains its July 2026 period and MWh unit.',sourceIds:[]}],sources:[],limitations:[]}};
const browser=await chromium.launch({headless:true,...(process.env.TEST_BROWSER_PATH?{executablePath:process.env.TEST_BROWSER_PATH}:{})});
const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
const page=await context.newPage(),errors=[],checks=[];
page.on('pageerror',error=>errors.push(error.message));
await page.route('**/api/analysis/status',route=>route.fulfill({json:{available:true,provider:'cloudflare',workspaceEnabled:true,jevEnabled:false}}));
let analysisRequests=0;
await page.route('**/api/analysis',route=>{analysisRequests++;const question=route.request().postDataJSON().question;return route.fulfill({json:question.includes('physical-only')?physicalAnswer:tradeAnswer});});
const base=process.env.TEST_URL||'http://127.0.0.1:4188/';
const url=base+'#v1='+encodeURIComponent(JSON.stringify({view:'economy',economy:{section:'trade',region:'CA',tradeCommodity:'electricity',tradeYear:2024}}));
const native=page.locator('#ec-trade-workspace');
const dynamic=page.locator('#ec-dynamic-workspace');
const actions=async host=>{const menu=host.locator('.hw-action-menu');if(!await menu.evaluate(e=>e.open))await menu.locator('summary').click();};
const allViews=async host=>{await actions(host);const button=host.getByRole('button',{name:'All views',exact:true});if(await button.getAttribute('aria-pressed')!=='true')await button.click();else await host.locator('.hw-action-menu summary').click();};
const openLibrary=async host=>{await actions(host);await host.getByRole('button',{name:/^Open saved/}).click();};
const ask=async question=>{if(!await page.locator('.ec-trade-question').evaluate(e=>e.open))await page.locator('#header-ask').click();await page.getByLabel('Your question',{exact:true}).fill(question);await page.getByRole('button',{name:'Analyse',exact:true}).click();await dynamic.locator('.hw-shell').waitFor();};
try {
  await page.goto(url);await native.locator('.hw-matrix').waitFor();
  // Cardinal navigation must follow columns, including diagonal holes.
  const nsToNl=native.getByRole('button',{name:'Nova Scotia to Newfoundland and Labrador:',exact:false});
  await nsToNl.focus();await nsToNl.press('ArrowUp');
  assert.match(await page.evaluate(()=>document.activeElement.getAttribute('aria-label')),/^Prince Edward Island to Newfoundland and Labrador:/);
  await page.keyboard.press('ArrowUp');
  assert.match(await page.evaluate(()=>document.activeElement.getAttribute('aria-label')),/^Prince Edward Island to Newfoundland and Labrador:/,'no vertical target must not move sideways');
  const allMatrixWidth=await native.locator('.hw-matrix-scroll').evaluate(e=>({client:e.clientWidth,scroll:e.scrollWidth}));
  assert.ok(allMatrixWidth.scroll<=allMatrixWidth.client+1,'the entire national matrix should fit the desktop panel');
  const small=native.getByRole('button',{name:'Nova Scotia to New Brunswick: 0.04 million CAD',exact:true});
  assert.notEqual((await small.innerText()).trim(),'0','positive source values must not look like published zero');
  await native.getByRole('button',{name:'Alberta to British Columbia:',exact:false}).focus();
  await native.locator('.hw-selection summary').click();await native.getByRole('button',{name:'Ontario',exact:true}).click();
  assert.equal(await native.locator('.hw-matrix button[tabindex="0"]').count(),1,'filtering must retain a keyboard entry point');
  checks.push('matrix cardinal navigation, filtering, exact small-value distinction and desktop fit');

  await allViews(native);await actions(native);await native.getByRole('button',{name:'Pin this comparison',exact:true}).click();
  await native.getByLabel('Energy price change',{exact:true}).fill('-10');
  await actions(native);await native.getByRole('button',{name:'Save investigation',exact:true}).click();
  await native.getByText('Saved on this device with its original data.',{exact:true}).waitFor();
  await native.getByLabel('Energy price change',{exact:true}).fill('10');
  await openLibrary(native);await native.locator('.hw-saved-list li button').first().click();
  assert.equal(await native.getByLabel('Energy price change',{exact:true}).inputValue(),'-10');
  assert.equal(JSON.parse(decodeURIComponent((await page.url()).split('#v1=')[1])).economy.priceShock,-10);
  assert.ok(await native.locator('.hw-branch-comparison').isVisible(),'saved baseline must be restored');
  checks.push('saved price controls, pinned baseline and shared URL restore together');

  // A damaged stored item must not hang the library or hide valid snapshots.
  await page.evaluate(()=>new Promise((resolve,reject)=>{const request=indexedDB.open('canada-in-motion-investigations',1);request.onsuccess=()=>{const db=request.result,tx=db.transaction('investigations','readwrite');tx.objectStore('investigations').put({id:'independent-review-invalid',kind:'invalid'});tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);};request.onerror=()=>reject(request.error);}));
  await page.reload();await native.getByText('1 saved investigations could not be verified and were omitted.',{exact:true}).waitFor();
  await openLibrary(native);assert.equal(await native.locator('.hw-saved-list li').count(),1);
  checks.push('corrupt saved record is isolated without a runtime error');

  await page.keyboard.press('Escape');await ask(tradeQuestion);
  const pairEntry=dynamic.locator('.hw-matrix button[tabindex="0"]');
  await pairEntry.focus();const beforePair=await page.evaluate(()=>document.activeElement.getAttribute('aria-label'));
  await page.keyboard.press('ArrowRight');
  assert.notEqual(await page.evaluate(()=>document.activeElement.getAttribute('aria-label')),beforePair,'the reverse flow must remain keyboard reachable when two filtered cells share neither row nor column');
  await actions(dynamic);await dynamic.getByRole('button',{name:'Pin this comparison',exact:true}).click();
  await dynamic.getByLabel('Trade year',{exact:true}).selectOption('2023');
  assert.ok(await dynamic.locator('.hw-branch-comparison').isVisible(),'trade-only answers must support branch comparison');
  assert.doesNotMatch(await dynamic.locator('.hw-current-question').innerText(),/price change/);
  assert.match(await dynamic.locator('.hw-branch-comparison').innerText(),/Net trade value/);
  await openLibrary(dynamic);await dynamic.locator('.hw-saved-list li button').first().click();
  await dynamic.getByText('Restored with the original source snapshot.',{exact:true}).waitFor();
  assert.equal(await page.locator('.ec-answer').count(),0,'restoring a different question must remove original written findings');
  assert.equal(await dynamic.getByLabel('Energy price change',{exact:true}).inputValue(),'-10');
  checks.push('trade-only baseline, native-to-AI restore and stale written-answer removal');

  await ask('Review physical-only July observations.');
  await dynamic.getByRole('heading',{name:'Review physical-only July observations.',exact:true}).waitFor();
  assert.match(await dynamic.locator('.hw-current-question').innerText(),/2026-07/);
  assert.doesNotMatch(await dynamic.locator('.hw-current-question').innerText(),/2024|price change/);
  assert.equal(await dynamic.getByLabel('Trade year',{exact:true}).count(),0);
  assert.equal(await dynamic.getByRole('button',{name:'Pin this comparison',exact:true}).count(),0);
  await actions(dynamic);await dynamic.getByRole('button',{name:'Save investigation',exact:true}).click();
  await dynamic.getByText('Saved on this device with its original data.',{exact:true}).waitFor();
  await page.reload();await native.locator('.hw-shell').waitFor();await openLibrary(native);
  await native.getByRole('button',{name:/^Review physical-only July observations\./}).click();
  assert.equal(await native.getByLabel('Physical transfer series',{exact:true}).inputValue(),'electricity-monthly');
  assert.match(await native.locator('.hw-current-question').innerText(),/2026-07/);
  assert.equal(await native.getByLabel('Trade year',{exact:true}).count(),0);
  checks.push('physical-only period and source series survive AI-to-native restore');

  await openLibrary(native);await native.getByRole('button',{name:/^Energy between provinces/}).click();
  if(!await native.locator('.hw-selection').evaluate(e=>e.open))await native.locator('.hw-selection summary').click();
  await native.getByRole('button',{name:'All',exact:true}).click();
  await page.setViewportSize({width:390,height:844});
  await native.getByLabel('Trade seller',{exact:true}).selectOption('NS');
  assert.ok(await native.locator('.hw-partner-list').isVisible());
  assert.equal(await native.locator('.hw-matrix-scroll').isVisible(),false);
  const nbPartner=native.locator('.hw-partner-list').getByRole('button',{name:/New Brunswick/});
  assert.doesNotMatch(await nbPartner.innerText(),/\$0(?:\.0)?M\b/,'a positive mobile trade value must not display as zero');
  await nbPartner.click();assert.match(await native.locator('.hw-link-detail h4').innerText(),/Nova Scotia.*New Brunswick/);
  await native.getByRole('button',{name:'Québec',exact:true}).click();
  await native.getByRole('button',{name:'Ontario',exact:true}).click();
  await native.getByLabel('Trade connections',{exact:true}).selectOption('between');
  assert.ok(['QC','ON'].includes(await native.getByLabel('Trade seller',{exact:true}).inputValue()),'mobile seller must follow a changed pair selection');
  assert.equal(await native.locator('.hw-partner-list li button').count(),1);
  assert.doesNotMatch(await native.locator('.hw-partner-list').innerText(),/No connections/);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  checks.push('mobile seller/partner view, exact positive values, linked detail and changed-pair fallback');
  assert.deepEqual(errors,[]);
  assert.equal(analysisRequests,2,'only intercepted fixture requests should be used');
  console.log(JSON.stringify({status:'passed',providerCalls:0,checks},null,2));
} finally {await browser.close();}
