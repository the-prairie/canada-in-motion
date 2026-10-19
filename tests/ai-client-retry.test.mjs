import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {EnergyEconomy} from '../energy-economy.js';
import {normalizeEconomyState} from '../economy-model.mjs';
import {requestChallengeToken} from '../ai-client.mjs';

const data=JSON.parse(await readFile(new URL('../data/economy.json',import.meta.url)));

test('verification failure is handled without removing the widget inside its callback',async t=>{
  const original=globalThis.turnstile;t.after(()=>{if(original===undefined)delete globalThis.turnstile;else globalThis.turnstile=original;});
  let inCallback=false,removed=0,attempt=0;
  globalThis.turnstile={render(_node,options){const id=++attempt;queueMicrotask(()=>{
    inCallback=true;
    if(id===1){assert.equal(options['error-callback']('300030'),true);assert.equal(removed,0);}
    else options.callback('fresh-token');
    inCallback=false;
  });return id;},remove(){assert.equal(inCallback,false);removed++;}};
  await assert.rejects(requestChallengeToken('public-key',{isConnected:true},new AbortController().signal),/security check could not complete/);
  assert.equal(removed,1);
  assert.equal(await requestChallengeToken('public-key',{isConnected:true},new AbortController().signal),'fresh-token');
  assert.equal(removed,2);
});

for(const interruption of ['cancel','change'])test(`a new question completes immediately after ${interruption} during verification`,async t=>{
  const originals={document:globalThis.document,turnstile:globalThis.turnstile,fetch:globalThis.fetch};
  t.after(()=>{for(const [key,value] of Object.entries(originals)){if(value===undefined)delete globalThis[key];else globalThis[key]=value;}});
  globalThis.document={activeElement:null};
  const widgets=[];let paidCalls=0,container,html='';
  globalThis.turnstile={render(node,options){assert.equal(node.isConnected,true);widgets.push(options);return widgets.length;},remove(){}};
  globalThis.fetch=async(url,options)=>{paidCalls++;assert.equal(options.headers['X-Turnstile-Token'],'verified-retry');return Response.json({state:normalizeEconomyState(),analysis:{headline:'Completed',blocks:[]}});};
  const root={
    contains:()=>false,
    querySelector:selector=>selector==='#ec-verification'?container:null,
    set innerHTML(value){if(container)container.isConnected=false;html=value;container=value.includes('id="ec-verification"')?{isConnected:true}:null;},
    get innerHTML(){return html;},
  };
  const app=Object.assign(Object.create(EnergyEconomy.prototype),{root,data,state:normalizeEconomyState(),status:{available:true,turnstileSiteKey:'test-public-key'},question:'What changes for Canada?',onChange(){},income:()=>'',debate:()=>''});
  const abandoned=app.ask();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(widgets.length,1);assert.equal(app.verifying,true);
  if(interruption==='cancel')app.click({target:{closest:()=>({dataset:{ecAction:'cancel'}})}});
  else app.change({region:'AB'});
  assert.equal(app.verifying,false);assert.equal(app.busy,false);
  const retry=app.ask();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(widgets.length,2);assert.equal(app.verifying,true);assert.equal(app.busy,true);
  widgets[1].callback('verified-retry');
  await Promise.all([abandoned,retry]);
  assert.equal(paidCalls,1);assert.equal(app.answer.analysis.headline,'Completed');assert.equal(app.aiError,null);assert.equal(app.busy,false);assert.equal(app.verifying,false);
});
