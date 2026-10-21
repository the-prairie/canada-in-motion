/** Background service responses must not replace a user's active research view.
 * All status/data responses below are local fixtures; no provider is called. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,...(process.env.TEST_BROWSER_PATH?{executablePath:process.env.TEST_BROWSER_PATH}:{})});
const base=process.env.TEST_URL||'http://127.0.0.1:4188/';
const debate=JSON.parse(readFileSync(new URL('../../data/energy-debate.json',import.meta.url)));
const results=[];
async function check(kind){
  const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
  const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
  let releaseStatus,releaseDebate,statusRequested=false,debateRequested=false;
  const statusGate=new Promise(resolve=>releaseStatus=resolve),debateGate=new Promise(resolve=>releaseDebate=resolve);
  await page.route('**/api/analysis/status',async route=>{statusRequested=true;await statusGate;await route.fulfill({json:{available:true,provider:'cloudflare',workspaceEnabled:true,jevEnabled:false}});});
  await page.route('**/data/energy-debate.json',async route=>{debateRequested=true;await debateGate;await route.fulfill({json:debate});});
  await page.route('**/api/analysis',route=>route.abort('blockedbyclient'));
  const state=kind==='income'?{section:'supply',region:'AB',demandMillion:100}:{section:'oil',oilView:'history',historyRegions:['AB','ON'],historyOilChange:-40,historyHorizon:2};
  const hostId=kind==='income'?'#ec-income-paths':'#ec-oil-history';
  try{
    await page.goto(base+'#v1='+encodeURIComponent(JSON.stringify({view:'economy',economy:state})));
    const host=page.locator(hostId);await host.locator('.hw-shell').waitFor();
    const hostHandle=await host.elementHandle();
    const evidenceTitle=kind==='income'?'Follow the dollar evidence':'Historical oil and GDP evidence';
    const detail=host.getByRole('dialog',{name:evidenceTitle});
    let controlHandle,focusHandle,selectedEpisode;
    if(kind==='income'){
      const input=host.getByLabel('Additional final demand in million dollars',{exact:true});
      await input.fill('250');controlHandle=await input.elementHandle();
      await host.getByLabel('Multiplier reference year',{exact:true}).selectOption('2021');
      await host.getByRole('checkbox',{name:/Include household spending/}).check();
      await host.getByRole('button',{name:'Labour income',exact:true}).click();
    }else{
      const horizon=host.getByLabel('Historical GDP horizon',{exact:true});
      await horizon.selectOption('1');controlHandle=await horizon.elementHandle();
      await host.getByLabel('Historical oil price change',{exact:true}).selectOption('-20');
      await host.locator('.hw-episodes button').nth(2).click();
      selectedEpisode=await host.locator('.hw-episodes button[aria-pressed="true"]').innerText();
    }
    await host.getByRole('button',{name:'Evidence',exact:true}).click();
    focusHandle=await detail.getByRole('button',{name:`Close ${evidenceTitle}`,exact:true}).elementHandle();
    await focusHandle.focus();
    const originalContent=await host.innerText();
    const verify=async phase=>{
      assert.equal(await hostHandle.evaluate(node=>node.isConnected),true,`${kind}: host replaced after ${phase}`);
      assert.equal(await controlHandle.evaluate(node=>node.isConnected),true,`${kind}: control replaced after ${phase}`);
      assert.equal(await focusHandle.evaluate(node=>node===document.activeElement),true,`${kind}: control lost focus after ${phase}`);
      assert.equal(await detail.evaluate(node=>node.open),true,`${kind}: disclosure closed after ${phase}`);
      assert.equal(await host.innerText(),originalContent,`${kind}: local result changed after ${phase}`);
      if(kind==='income'){
        assert.equal(await host.getByLabel('Additional final demand in million dollars',{exact:true}).inputValue(),'250');
        assert.equal(await host.getByLabel('Multiplier reference year',{exact:true}).inputValue(),'2021');
        assert.equal(await host.getByRole('checkbox',{name:/Include household spending/}).isChecked(),true);
        assert.equal(await host.getByRole('button',{name:'Labour income',exact:true}).getAttribute('aria-pressed'),'true');
      }else{
        assert.equal(await host.getByLabel('Historical GDP horizon',{exact:true}).inputValue(),'1');
        assert.equal(await host.getByLabel('Historical oil price change',{exact:true}).inputValue(),'-20');
        assert.equal(await host.locator('.hw-episodes button[aria-pressed="true"]').innerText(),selectedEpisode);
      }
    };
    assert.equal(statusRequested,true);assert.equal(debateRequested,true);
    releaseStatus();
    await page.waitForFunction(()=>document.querySelector('#header-ask')?.textContent==='Ask a question');
    await verify('late AI status');
    const debateResponse=page.waitForResponse(response=>response.url().endsWith('/data/energy-debate.json'));
    releaseDebate();
    await (await debateResponse).finished();
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    await verify('late debate data');
    assert.deepEqual(errors,[]);
    results.push({view:kind,checks:['DOM identity','focused control','open disclosure','edited inputs','calculation/episode identity','late AI status','late context data']});
  }finally{releaseStatus();releaseDebate();await context.close();}
}
try{await check('income');await check('history');console.log(JSON.stringify({status:'passed',providerCalls:0,results},null,2));}finally{await browser.close();}
