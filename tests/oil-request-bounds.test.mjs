import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {hasUnsupportedOilChange} from '../server/oil-request-bounds.mjs';
import {createEnergyAnalyzer} from '../server/energy-analysis.mjs';
import {normalizeEconomyState,summarizeEconomy} from '../economy-model.mjs';
test('explicit unsupported oil changes cannot be silently scaled into range',()=>{
  for(const question of ['Cut oil prices by ninety percent','Oil falls 90%','Oil price change: -90%','Oil prices rise twenty-one percent','WTI increases by one hundred percent','Oil prices fall by 0.9 as a fraction','Oil prices double','Halve the oil price','Oil prices fall to ten percent','A ninety percent drop in oil prices','Oil prices fall by half'])assert.equal(hasUnsupportedOilChange(question),true,question);
  for(const question of ['Oil prices fall ten percent','Oil prices fall 20%','Oil prices rise 0.9%','Oil falls twenty point zero percent','Oil prices fall to ninety percent','Oil prices fall to 0.9 of the current price','Natural gas prices double','Oil prices fall ten percent and natural gas doubles','Alberta accounts for ninety percent of oil production','Oil production rises ninety percent','How does Quebec benefit?'])assert.equal(hasUnsupportedOilChange(question),false,question);
  for(const question of ['If oil prices fall ten percent for half a year, what happens?','Oil prices fall ten percent and gas prices rise fifty percent','Explain oil prices and Alberta energy share of 35 percent of GDP','Oil prices fall 10% while half of households have higher bills'])assert.equal(hasUnsupportedOilChange(question),false,question);
  for(const question of ['Double oil production','Halve oil demand','Oil prices fall by half a percent','Oil prices fall by half of one percent'])assert.equal(hasUnsupportedOilChange(question),false,question);
});
test('out-of-range rejection preserves a nonzero scenario and makes no model calls',async()=>{
  const data=JSON.parse(await readFile(new URL('../data/economy.json',import.meta.url)));
  const state={region:'AB',oilShock:10};let calls=0;
  const analyze=createEnergyAnalyzer({data,normalizeState:normalizeEconomyState,summarize:summarizeEconomy,provider:async()=>{calls++;return {state:{...state,oilShock:-9}};},answerMode:'claims'});
  await assert.rejects(analyze({question:'Cut oil prices by ninety percent',state}),e=>e.code==='unsupported_scenario'&&e.status===422);
  assert.deepEqual(state,{region:'AB',oilShock:10});assert.equal(calls,0);
});
