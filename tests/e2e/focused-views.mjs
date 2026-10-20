import assert from 'node:assert/strict';
const {chromium} = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({headless:true,...(process.env.TEST_BROWSER_PATH ? {executablePath:process.env.TEST_BROWSER_PATH} : {})});
const page = await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
const base = process.env.TEST_URL || 'http://127.0.0.1:4188/';
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await page.route('**/api/analysis', route => route.abort());
const go = async section => {
  await page.goto(base + '#v1=' + encodeURIComponent(JSON.stringify({view:'economy',economy:{section}})));
  await page.locator('#energy-economy .ec-context').waitFor({timeout:60000});
};
try {
  await go('trade');
  const host = page.locator('#ec-trade-workspace');
  await host.locator('.hw-grid').waitFor();
  assert.equal(await host.locator('.hw-grid > section').count(),1);
  assert.equal(await page.locator('.ec-composer').evaluate(e=>e.open),false);
  const tabs = host.getByRole('navigation',{name:'Result views'});
  await tabs.getByRole('button',{name:'Price exposure',exact:true}).click();
  await page.reload();
  await host.locator('.hw-grid').waitFor();
  assert.equal(await tabs.getByRole('button',{name:'Price exposure',exact:true}).getAttribute('aria-pressed'),'true');
  await host.getByText('Save & export',{exact:true}).click();
  await host.getByRole('button',{name:'All views',exact:true}).click();
  assert.ok(await host.locator('.hw-grid > section').count()>1);
  assert.equal(await host.locator('.hw-action-menu').evaluate(e=>e.open),false);
  await tabs.getByRole('button',{name:'Trade value',exact:true}).click();
  assert.equal(await host.locator('.hw-grid > section').count(),1);

  await go('futures');
  await page.getByLabel('Energy indicator',{exact:true}).waitFor();
  assert.equal(await page.locator('.ec-focused-metric article').count(),1);
  assert.equal((await page.locator('.ec-line-key').innerText()).match(/Current Measures/g)?.length,1);
  const chartValue = (await page.locator('.ec-metric-value').innerText()).split(/\s/)[0];
  assert.ok((await page.locator('.ec-future-answer').innerText()).startsWith(chartValue));
  await page.getByLabel('Energy indicator',{exact:true}).selectOption('wti');
  await page.locator('#ec-scenario').selectOption('Higher');
  await page.locator('#ec-year').selectOption('2040');
  const before = await page.locator('.ec-focused-metric').innerText();
  await page.reload();
  await page.getByLabel('Energy indicator',{exact:true}).waitFor();
  assert.equal(await page.getByLabel('Energy indicator',{exact:true}).inputValue(),'wti');
  assert.equal(await page.locator('.ec-focused-metric').innerText(),before);

  let fail = true;
  await page.route('**/data/provincial-forecasts.json',route=>fail?route.fulfill({status:503,body:'Unavailable'}):route.continue());
  await go('outlook');
  await page.getByRole('button',{name:'Retry data',exact:true}).waitFor();
  fail = false;
  await page.getByRole('button',{name:'Retry data',exact:true}).click();
  await page.locator('.pf-range-chart').waitFor();
  await page.unroute('**/data/provincial-forecasts.json');

  await page.setViewportSize({width:390,height:844});
  for (const [section,ready] of [['trade','.hw-grid'],['futures','.ec-focused-metric'],['income','.ec-ranking'],['outlook','.pf-range-chart']]) {
    await go(section);
    await page.locator(ready).waitFor();
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${section} mobile overflow`);
    assert.equal(await page.locator('.ec-composer').evaluate(e=>e.open),false);
  }
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({status:'passed',checks:['one result at a time','named result persists on reload','All views is reversible','secondary menu closes','consistent Futures precision and legend','indicator, scenario and year survive reload','forecast failure recovers inline','four mobile data journeys start with collapsed composer and no overflow'],providerCalls:0},null,2));
} finally {
  await browser.close();
}
