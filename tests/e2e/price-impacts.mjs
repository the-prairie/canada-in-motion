import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,...(process.env.TEST_BROWSER_PATH?{executablePath:process.env.TEST_BROWSER_PATH}:{})});
const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
let providerCalls=0;
await context.route('**/api/analysis/status',r=>r.fulfill({json:{available:false}}));
await context.route('**/api/analysis',r=>{providerCalls++;return r.fulfill({status:503,json:{error:'Review has no live inference'}});});
const page=await context.newPage();page.setDefaultTimeout(20000);
const errors=[],checks=[],observations=[];
page.on('pageerror',e=>errors.push(e.message));
const base=process.env.TEST_URL||'http://127.0.0.1:4195/';
const out=new URL('../../.data-cache/price-impact-acceptance/',import.meta.url).pathname;
await mkdir(out,{recursive:true});
const gdp=await fetch(new URL('data/provincial-price-response.json',base)).then(r=>{assert.equal(r.status,200);return r.json();});
const hh=await fetch(new URL('data/household-energy-costs.json',base)).then(r=>{assert.equal(r.status,200);return r.json();});
const root=page.locator('#ec-energy-story');
const chapter=label=>root.locator('.es-chapters').getByRole('button',{name:new RegExp(label)}).click();
const province=code=>root.getByLabel('Investigation province',{exact:true}).selectOption(code);
const comparison=code=>root.getByLabel('Comparison province',{exact:true}).selectOption(code);
const commodity=name=>root.getByRole('button',{name,exact:true}).click();
const shock=async n=>{const input=root.locator('#es-price');await input.focus();await page.keyboard.press('Home');for(let i=-20;i<n;i++)await page.keyboard.press('ArrowRight');assert.equal(await input.inputValue(),String(n));};
const currency=n=>`${n<0?'−':n>0?'+':''}$${new Intl.NumberFormat('en-CA',{maximumFractionDigits:0}).format(Math.abs(n))}`;
const percentage=n=>`${n>0?'+':''}${new Intl.NumberFormat('en-CA',{maximumFractionDigits:2}).format(n)}%`;
const gdpEffect=(region,horizon,n)=>{const m=gdp.models.find(m=>m.region===region&&m.commodity==='oil'&&m.horizonYears===horizon);return 100*Math.expm1(m.coefficient*Math.log1p(n/100));};
const hhEffect=(region,n)=>{const b=hh.spendingBaselines.find(m=>m.region===region&&m.commodity==='oil');const m=hh.calibrations.find(m=>m.region===region&&m.commodity==='oil');return b.currentAnnualCad*m.responseElasticities.persistent.slice(0,12).reduce((s,e)=>s+Math.expm1(e*Math.log1p(n/100)),0)/12;};
const open=async loc=>{if(!await loc.evaluate(e=>e.open))await loc.locator(':scope > summary').click();};
try{
await page.goto(base);await root.locator('.es-sales').waitFor();
await province('AB');await comparison('QC');await chapter('Provincial GDP');
await root.locator('[data-price-region=AB] .pr-result-status').waitFor();
assert.match(await root.locator('[data-price-region=AB]').innerText(),/did not pass/);
assert.equal(await root.locator('[data-price-region=AB] .pr-estimate').isVisible(),false);
assert.match(await root.locator('[data-price-region=QC]').innerText(),/Passed the stated/);
for(const n of [-20,-10,0,10,20]){
 await shock(n);
 assert.equal(await root.locator('[data-price-region=AB] .pr-estimate').count(),0);
 assert.equal(await root.locator('[data-price-region=QC] .pr-estimate').innerText(),percentage(gdpEffect('QC',0,n)));
 await root.getByRole('button',{name:'Evidence',exact:true}).click();
 assert.equal(await root.locator('[data-price-evidence=AB] .pr-estimate').innerText(),percentage(gdpEffect('AB',0,n)));
 await page.keyboard.press('Escape');
}
checks.push('AB exploratory result requires disclosure; QC accepted result is visible; five signed and zero shocks match raw-data arithmetic');
await shock(10);await root.getByLabel('GDP price response period',{exact:true}).selectOption('1');
await root.getByRole('button',{name:'Evidence',exact:true}).click();
assert.equal(await root.locator('[data-price-evidence=AB] .pr-estimate').innerText(),percentage(gdpEffect('AB',1,10)));
await page.keyboard.press('Escape');
await root.getByLabel('GDP price response period',{exact:true}).selectOption('0');
await root.getByRole('button',{name:'Evidence',exact:true}).click();
assert.equal(await root.locator('[data-price-evidence=QC] .pr-validation tbody tr').count(),gdp.models.find(m=>m.region==='QC'&&m.commodity==='oil'&&m.horizonYears===0).heldout.length);
assert.match(await root.locator('[data-price-evidence=QC] .pr-validation').innerText(),/not a real-time forecasting test/);
await page.screenshot({path:out+'gdp-desktop.png',fullPage:true});
await page.keyboard.press('Escape');
checks.push('Response horizon changes the result; held-out historical errors and complete table are reachable');
await chapter('Household costs');
for(const n of [-20,-10,0,10,20]){
 await shock(n);
 for(const code of ['AB','QC'])assert.match(await root.locator(`[data-household-region=${code}] .pr-estimate`).innerText(),new RegExp(currency(hhEffect(code,n)).replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
}
await shock(10);
assert.match(await root.locator('[data-household-region=AB]').innerText(),/not a validated annual bill forecast/);
await root.getByRole('button',{name:'Evidence',exact:true}).click();
assert.equal(await root.locator('[data-household-evidence=AB] .pr-validation tbody tr').count(),72);
await page.screenshot({path:out+'household-desktop.png',fullPage:true});
await page.keyboard.press('Escape');
checks.push('Both provincial oil spending equivalents match raw CPI response paths for five shocks; annual accuracy caveat and 72 audit months are reachable');
await commodity('Natural gas');
assert.match(await root.locator('[data-household-region=AB]').innerText(),/did not reliably predict/);
assert.equal(await root.locator('[data-household-region=AB] .pr-estimate').count(),0);
await root.getByRole('button',{name:'Retail-price scenario',exact:true}).click();
for(const code of ['AB','QC']){
 const b=hh.spendingBaselines.find(b=>b.region===code&&b.commodity==='gas');
 assert.equal(await root.locator(`[data-household-region=${code}] .pr-estimate`).innerText(),currency(b.currentAnnualCad*.1)+' per year');
}
await commodity('Electricity');
await root.getByRole('button',{name:'Commodity-price response',exact:true}).click();
assert.equal(await root.locator('[data-household-region=AB] .pr-estimate').count(),0);
await root.locator('[data-household-region=AB]').getByRole('button',{name:/Use a retail-price scenario/}).click();
const eb=hh.spendingBaselines.find(b=>b.region==='AB'&&b.commodity==='electricity');
assert.equal(await root.locator('[data-household-region=AB] .pr-estimate').innerText(),currency(eb.currentAnnualCad*.1)+' per year');
checks.push('Gas failed calibration does not display a bill estimate; gas and electricity retail scenarios require explicit selection and use direct spending arithmetic');
await province('NU');assert.equal(await root.locator('[data-household-region=NU] .pr-estimate').count(),0);
assert.match(await root.locator('[data-household-region=NU]').innerText(),/not published/);
await chapter('Provincial GDP');assert.equal(await root.locator('[data-price-region=NU] .pr-estimate').count(),0);
assert.match(await root.locator('[data-price-region=NU]').innerText(),/no common wholesale electricity benchmark/i);
await commodity('Oil');assert.match(await root.locator('[data-price-region=NU]').innerText(),/did not pass|No supported/);
checks.push('Unavailable territory household data and electricity GDP response do not become zero');
await province('AB');await comparison('QC');await chapter('Household costs');await root.getByRole('button',{name:'Commodity-price response',exact:true}).click();
for(const width of [390,320]){
 await page.setViewportSize({width,height:844});
 for(const name of ['Provincial GDP','Household costs']){
  await chapter(name);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${name} overflow at ${width}`);
  const panel=name==='Provincial GDP'?'.pr-gdp':'.pr-households';
  observations.push({width,chapter:name,bodyHeight:await page.locator('body').evaluate(e=>e.scrollHeight),panelText:await root.locator(panel).innerText()});
  await page.screenshot({path:out+(name==='Provincial GDP'?'gdp':'household')+'-'+width+'.png',fullPage:true});
 }
}
checks.push('Both chapters have no page overflow at 390 and 320 pixels');
await root.getByRole('button',{name:'Retail-price scenario',exact:true}).click();await shock(-10);await page.reload();await root.locator('.pr-households').waitFor();
assert.equal(await root.getByRole('button',{name:'Retail-price scenario',exact:true}).getAttribute('aria-pressed'),'true');assert.equal(await root.locator('#es-price').inputValue(),'-10');
checks.push('Household price basis and shock survive a shared URL reload');
assert.equal(providerCalls,0);assert.deepEqual(errors,[]);
await writeFile(out+'report.json',JSON.stringify({status:'passed',checks,errors,providerCalls,observations},null,2));
console.log(JSON.stringify({status:'passed',checks,errors,providerCalls},null,2));
}finally{await browser.close();}
