import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createEnergyAnalyzer} from '../../server/energy-analysis.mjs';
import {normalizeEconomyState,summarizeEconomy} from '../../economy-model.mjs';
const read=async name=>JSON.parse(await readFile(new URL(`../../data/${name}.json`,import.meta.url),'utf8'));
const data=await read('economy'),debate=await read('energy-debate');
const analyze=createEnergyAnalyzer({data,debate,normalizeState:normalizeEconomyState,summarize:summarizeEconomy,workspaceEnabled:true,
 provider:async({input})=>({state:input.state,investigation:{regions:['AB','QC'],topics:['gdp'],metricIds:[],includeMap:false,requestedMeasure:'available'}}),
 decider:async()=>({answers:{presentation:{choice:'comparison'},coverage:{choice:'supported'}}})});
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,...(process.env.TEST_BROWSER_PATH?{executablePath:process.env.TEST_BROWSER_PATH}:{})});
const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce',acceptDownloads:true});
const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(20000);
await page.route('**/api/analysis/status',r=>r.fulfill({json:{available:true,provider:'cloudflare',workspaceEnabled:true,jevEnabled:true}}));
await page.route('**/api/analysis',async r=>r.fulfill({json:await analyze(r.request().postDataJSON())}));
const base=process.env.TEST_URL||'http://127.0.0.1:4197/';
const host=page.locator('#ec-dynamic-workspace');
try{
 await page.goto(base+'#v1='+encodeURIComponent(JSON.stringify({view:'economy',economy:{section:'income',region:'AB'}})));
 await page.locator('.ec-latest-activity').waitFor();
 await page.locator('[data-ec-action="ask"]').click();
 const question='How much did Alberta and Quebec real energy GDP grow from 2024 to 2025?';
 await page.getByLabel('Your question',{exact:true}).fill(question);
 await page.getByRole('button',{name:'Analyse',exact:true}).click();
 await host.getByRole('heading',{name:question,exact:true}).waitFor();
 await host.locator('.hw-province-comparison').waitFor();
 assert.equal(await host.locator('.hw-coverage-note').count(),0);
 assert.match(await host.getByRole('region',{name:'Real activity growth · 2024 to 2025',exact:true}).innerText(),/3.5%/);
 await host.getByText('Real GDP levels and basis',{exact:true}).click();
 assert.match(await host.getByRole('region',{name:'Observed GDP in 2025 · million chained 2017 CAD at basic prices',exact:true}).innerText(),/81,627.5/);
 await host.getByRole('button',{name:'Table',exact:true}).click();
 assert.match(await host.locator('.hw-province-comparison table').first().innerText(),/2022/);
 assert.match(await host.locator('.hw-province-comparison table').first().innerText(),/2025/);
 await host.locator('.hw-action-menu > summary').click();
 const download=page.waitForEvent('download');await host.getByRole('button',{name:'Export data',exact:true}).click();
 const file=await download;const exported=JSON.parse(await readFile(await file.path(),'utf8'));
 assert.equal(exported.workspace.economySnapshot.gdp.year,2022);
 assert.equal(exported.workspace.economySnapshot.gdpActivity.year,2025);
 assert.equal(exported.workspace.panels[0].rows.find(r=>r.code==='AB').activity.energy,81627.5);
 for(const width of [390,320]){await page.setViewportSize({width,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));}
 assert.deepEqual(errors,[]);
 console.log(JSON.stringify({status:'passed',checks:['real question interval','nominal+realcomparison','reallevels','source snapshot export','mobile overflow'],errors,paidInferenceCalls:0}));
}finally{await browser.close();}
