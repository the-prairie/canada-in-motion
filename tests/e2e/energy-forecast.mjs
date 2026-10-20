import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateProvincialForecast} from '../../provincial-forecast-model.mjs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.TEST_URL||'http://127.0.0.1:4201/';
const data=validateProvincialForecast(await (await fetch(new URL('data/provincial-forecasts.json',base))).json());
const browser=await chromium.launch({headless:true,...(process.env.TEST_BROWSER_PATH?{executablePath:process.env.TEST_BROWSER_PATH}:{})});
const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'}),errors=[];
page.on('pageerror',e=>errors.push(e.message));
await page.route('**/api/analysis/status',route=>route.fulfill({json:{available:false}}));
try{
  await page.goto(base+'#v1='+encodeURIComponent(JSON.stringify({view:'economy',economy:{section:'outlook',forecastRegions:[],region:'CA',forecastFocus:'AB'}})));
  const host=page.locator('#ec-provincial-forecast');await host.locator('.pf-range-chart').waitFor();
  const audit=host.locator('.pf-energy-audit');
  assert.equal(await audit.evaluate(n=>n.open),false,'evidence starts collapsed');
  for(const horizon of [0,1]){
    await host.getByRole('button',{name:String(data.forecastOriginYear+horizon),exact:true}).click();
    for(const region of data.regions.filter(r=>r.status==='available')){
      await host.getByLabel('Inspect provincial forecast',{exact:true}).selectOption(region.code);
      if(!await audit.evaluate(n=>n.open))await audit.locator(':scope > summary').click();
      const expected=data.energyEvaluation.horizons[horizon];
      assert.match(await audit.innerText(),new RegExp(`${expected.changedCount} of 30 predictions changed`));
      assert.match(await audit.innerText(),/existing forecast retained/);
      const cells=await audit.locator('table').first().locator('tbody tr').first().locator('td').allTextContents();
      assert.deepEqual(cells,[expected.baseline.mae,expected.experiment.mae].map(n=>new Intl.NumberFormat('en-CA',{maximumFractionDigits:3}).format(n)));
      const detail=audit.locator('details');if(!await detail.evaluate(n=>n.open))await detail.locator('summary').click();
      assert.equal(await audit.getByRole('region',{name:`${region.name} energy model test years`,exact:true}).locator('tbody tr').count(),3);
      assert.equal(await audit.getByRole('region',{name:`${region.name} energy model inputs`,exact:true}).locator('tbody tr').count(),3);
    }
  }
  await host.getByRole('button',{name:String(data.forecastOriginYear),exact:true}).click();
  await host.getByLabel('Inspect provincial forecast',{exact:true}).selectOption('NL');
  assert.match(await audit.innerText(),/unadopted energy model/);
  await audit.screenshot({path:'/tmp/cim-energy-forecast-evidence.png'});
  const downloadPromise=page.waitForEvent('download');await host.getByRole('button',{name:'Export forecast & evidence',exact:true}).click();
  const download=await downloadPromise, exported=JSON.parse(readFileSync(await download.path()));
  assert.deepEqual(exported.sourceSnapshot.energyEvaluation,data.energyEvaluation);
  assert.deepEqual(exported.sourceSnapshot.forecasts,data.forecasts);
  for(const width of [390,320]){
    await page.setViewportSize({width,height:844});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${width}px overflow`);
  }
  await audit.screenshot({path:'/tmp/cim-energy-forecast-evidence-mobile.png'});
  await page.reload();await host.locator('.pf-range-chart').waitFor();
  assert.equal(await host.getByLabel('Inspect provincial forecast',{exact:true}).inputValue(),'NL');
  await host.getByLabel('Inspect provincial forecast',{exact:true}).selectOption('NU');
  assert.equal(await audit.count(),0,'no untested territorial energy forecast claim');
  await page.route('**/data/provincial-forecasts.json',route=>{const old=structuredClone(data);delete old.energyEvaluation;return route.fulfill({json:old});});
  await page.reload();await host.locator('.pf-range-chart').waitFor();
  await host.getByLabel('Inspect provincial forecast',{exact:true}).selectOption('AB');
  assert.equal(await audit.count(),0);
  assert.match(await host.locator('.pf-detail').innerText(),/Alberta/);
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({status:'passed',checks:['all ten provinces and both horizons','frozen holdout scores','source-backed input tables','rejected challenger remains separate','unchanged points and ranges in export','evidence collapsed by default','320px and390px layouts','URL reload','territory missingness','legacy snapshot compatibility','no runtime errors']},null,2));
}finally{await browser.close();}
