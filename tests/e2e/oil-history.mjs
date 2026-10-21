import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const browser=await chromium.launch({headless:true,...(process.env.TEST_BROWSER_PATH?{executablePath:process.env.TEST_BROWSER_PATH}:{})});
const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
const errors=[];
page.on('pageerror',error=>errors.push(error.message));
await page.route('**/api/analysis',route=>route.abort());
const base=process.env.TEST_URL||'http://127.0.0.1:4202/';
const url=state=>base+'#v1='+encodeURIComponent(JSON.stringify({view:'economy',economy:{section:'oil',oilView:'history',...state}}));
const history=page.locator('.hw-oil-history');
const display=history.getByRole('group',{name:'Historical GDP display'});
const provinces=history.getByRole('group',{name:'Provinces, territories and Canada'});
const chartIsReadable=async()=>{
 await page.waitForFunction(()=>{const svg=document.querySelector('.hw-history-chart');return svg&&Math.abs(svg.getBoundingClientRect().width-svg.viewBox.baseVal.width)<1;});
 const chart=await history.locator('.hw-history-chart').evaluate(svg=>{
  const bounds=svg.getBoundingClientRect(),scale=bounds.width/svg.viewBox.baseVal.width;
  const labels=[...svg.querySelectorAll('text')].map(text=>{const box=text.getBoundingClientRect();return {left:box.left,right:box.right,top:box.top,bottom:box.bottom,fontSize:parseFloat(getComputedStyle(text).fontSize)*scale};});
  return {left:bounds.left,right:bounds.right,labels};
 });
 for(const label of chart.labels){assert.ok(label.fontSize>=11.9,'Chart text remains readable at its rendered scale');assert.ok(label.left>=chart.left-1&&label.right<=chart.right+1,'Chart labels stay within the chart');}
 for(let i=0;i<chart.labels.length;i++)for(let j=i+1;j<chart.labels.length;j++){const a=chart.labels[i],b=chart.labels[j];assert.ok(a.right<=b.left||b.right<=a.left||a.bottom<=b.top||b.bottom<=a.top,'Chart labels do not overlap');}
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Page fits its viewport');
};
try{
 await page.goto(url({historyRegions:['AB','ON'],historyOilChange:-40,historyHorizon:2,historyYear:2015}));
 await history.locator('.hw-history-chart').waitFor();
 assert.equal(await history.locator('table').count(),0,'Chart is the only primary representation');
 assert.match(await history.innerText(),/do not isolate the effect of oil/);
 assert.equal(await history.locator('.hw-episodes button').count(),5);
 await chartIsReadable();
 await page.screenshot({path:'/tmp/cim-oil-history-desktop.png',fullPage:true});
 await display.getByRole('button',{name:'Table',exact:true}).click();
 assert.equal(await history.locator('.hw-history-chart').count(),0);
 assert.deepEqual(await history.locator('.oh-values tbody tr').allTextContents(),['Alberta0%-3.7%-7%-2.8%','Ontario0%+2.5%+4.6%+7.6%']);
 await display.getByRole('button',{name:'Chart',exact:true}).click();
 await history.locator('.hw-episodes button').nth(1).click();
 const episode=await history.locator('.hw-episodes button[aria-pressed="true"]').innerText();
 await history.getByLabel('Historical GDP horizon',{exact:true}).selectOption('1');
 await page.reload();
 await history.locator('.hw-history-chart').waitFor();
 assert.equal(await history.getByLabel('Historical GDP horizon',{exact:true}).inputValue(),'1');
 assert.equal(await history.locator('.hw-episodes button[aria-pressed="true"]').innerText(),episode);
 await provinces.getByRole('button',{name:'Ontario',exact:true}).click();
 assert.equal(await provinces.getByRole('button',{name:'Alberta',exact:true}).isDisabled(),true);
 assert.equal(await provinces.locator('[aria-pressed="true"]').count(),1);
 await provinces.getByRole('button',{name:'Nunavut',exact:true}).click();
 await history.getByRole('button',{name:'Evidence',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Historical oil and GDP evidence'});
 await dialog.waitFor();
 assert.match(await dialog.innerText(),/have not cleared the public forecast gate/);
 const [download]=await Promise.all([page.waitForEvent('download'),dialog.locator('[data-research-export]').click()]);
 const exported=JSON.parse(await readFile(await download.path(),'utf8'));
 assert.deepEqual(exported.selection.regions,['AB','NU']);
 assert.equal(exported.result.forecastGate.enabled,false);
 assert.equal(exported.sourceSnapshot.dataVersion,exported.result.dataVersion);
 assert.ok(exported.sourceSnapshot.sources.every(source=>source.sha256.length===64));
 await page.keyboard.press('Escape');
 assert.equal(await dialog.count(),0);
 assert.equal(await history.getByRole('button',{name:'Evidence',exact:true}).evaluate(element=>element===document.activeElement),true);
 for(const width of [390,320]){
  await page.setViewportSize({width,height:844});
  await chartIsReadable();
  await display.getByRole('button',{name:'Table',exact:true}).click();
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Table does not widen the page');
  await display.getByRole('button',{name:'Chart',exact:true}).click();
 }
 await page.setViewportSize({width:390,height:844});
 await page.goto(url({historyRegions:['AB','ON','QC'],historyOilChange:10,historyHorizon:2}));
 await history.locator('.hw-history-chart').waitFor();
 await chartIsReadable();
 await page.screenshot({path:'/tmp/cim-oil-history-mobile.png',fullPage:true});
 await history.getByRole('button',{name:'Evidence',exact:true}).click();
 assert.ok(await dialog.evaluate(element=>element.getBoundingClientRect().width<=innerWidth),'Evidence dialog fits the mobile viewport');
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Evidence tables do not widen the page');
 await dialog.screenshot({path:'/tmp/cim-oil-history-evidence-mobile.png'});
 await page.keyboard.press('Escape');
 assert.deepEqual(errors,[]);
 console.log(JSON.stringify({status:'passed',checks:['one primary chart or table','published 2015 GDP values','five selectable episodes','episode and horizon survive reload','full province names accessible','last region cannot be removed','Evidence dialog restores focus on Escape','source-pinned export','desktop, 390px and 320px chart labels fit and do not overlap','mobile table containment','no runtime errors'],providerCalls:0},null,2));
}finally{await browser.close();}
