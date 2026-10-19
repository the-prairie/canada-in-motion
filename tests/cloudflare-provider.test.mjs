import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createCloudflareProvider,createEnergyAnalyzer,buildEvidence,compactEvidence,FREE_MODEL} from '../server/energy-analysis.mjs';
import worker,{providerConfig} from '../server/cloudflare-worker.mjs';
import {normalizeEconomyState,summarizeEconomy} from '../economy-model.mjs';
const data=JSON.parse(await readFile(new URL('../data/economy.json',import.meta.url)));
const debate=JSON.parse(await readFile(new URL('../data/energy-debate.json',import.meta.url)));
const state={region:'AB',scenario:'Current Measures',year:2030,oilShock:-10,duration:'persistent'};

test('compact evidence preserves every number, context, fact and source identity',()=>{
  const full=buildEvidence(summarizeEconomy(data,state),debate);const packed=compactEvidence(full);
  assert.deepEqual(packed.numbers.map(({contextId,...record})=>({...record,context:packed.contexts[contextId]})),full.numbers);
  assert.deepEqual(packed.facts,full.facts);assert.deepEqual(packed.sources.map(s=>s.id),full.sources.map(s=>s.id));
  assert.ok(JSON.stringify(packed).length<JSON.stringify(full).length*0.75);
});
test('Workers AI accepts object and JSON string responses without changing state or citation checks',async()=>{
  for(const asString of [false,true]){
    const calls=[];
    const provider=createCloudflareProvider({ai:{run:async(model,body)=>{
      calls.push(body);assert.equal(model,FREE_MODEL);assert.equal(body.response_format.type,'json_schema');assert.equal(body.stream,false);
      const input=JSON.parse(body.messages[1].content);
      if(input.evidence){
        const fields=body.response_format.json_schema.properties.blocks.items.properties;
        assert.notEqual(fields.evidenceIds,fields.sourceIds);
        assert.deepEqual(fields.evidenceIds.items.enum,[...input.evidence.numbers,...input.evidence.facts].map(item=>item.id));
        assert.deepEqual(fields.sourceIds.items.enum,input.evidence.sources.map(item=>item.id));
        assert.equal(fields.evidenceIds.minItems,1);assert.equal(fields.evidenceIds.maxItems,24);
        assert.equal(fields.sourceIds.minItems,1);assert.equal(fields.sourceIds.maxItems,12);
        assert.ok(fields.evidenceIds.items.enum.every(id=>!fields.sourceIds.items.enum.includes(id)));
      }
      const result=!input.evidence?{state:input.state}:{headline:'Alberta contributes energy income',blocks:[{text:'Observed energy value added is [[n1]] million CAD.',sourceIds:input.evidence.numbers[1].sourceIds,evidenceIds:['n1']}]};
      return {response:asString?JSON.stringify(result):result};
    }}});
    const run=createEnergyAnalyzer({data,debate,model:FREE_MODEL,provider,normalizeState:normalizeEconomyState,summarize:summarizeEconomy});
    const result=await run({question:'How does Alberta contribute?',state});
    assert.equal(result.model,FREE_MODEL);assert.equal(calls.length,2);assert.equal(calls[0].max_tokens,256);assert.equal(calls[1].max_tokens,1200);
    assert.ok(!result.analysis.blocks[0].text.includes('[['));assert.ok(result.analysis.sources.length);
  }
});
test('missing or failed free binding cannot activate a paid fallback even with an OpenAI key',async()=>{
  assert.equal(providerConfig({OPENAI_API_KEY:'unused'}).ready,false);
  assert.equal(providerConfig({AI_PROVIDER:'cloudflare',OPENAI_API_KEY:'unused'}).ready,false);
  assert.equal(providerConfig({AI_PROVIDER:'cloudflare',AI:{run(){} }}).ready,true);
  const env={AI_PROVIDER:'cloudflare',AI_ENABLED:'1',OPENAI_API_KEY:'unused',TURNSTILE_SITE_KEY:'real-key',TURNSTILE_SECRET_KEY:'secret',VISITOR_HASH_KEY:'x'.repeat(32),AI_QUOTA:{}};
  const status=await worker.fetch(new Request('https://api.example/api/analysis/status'),env);
  assert.equal((await status.json()).available,false);
  let calls=0;
  const provider=createCloudflareProvider({ai:{run:async()=>{calls++;throw Error('private credential detail');}}});
  await assert.rejects(provider({input:{},schema:{}}),error=>error.code==='provider_unavailable'&&!error.message.includes('private'));
  assert.equal(calls,1);
});
test('free provider rejects oversized input, truncated JSON and invented output',async()=>{
  let calls=0;
  const tooLarge=createCloudflareProvider({ai:{run:async()=>{calls++;}}});
  await assert.rejects(tooLarge({input:{text:'a'.repeat(51000)}}),error=>error.code==='evidence_too_large');assert.equal(calls,0);
  for(const response of ['{"state":',[],null,'null','a'.repeat(25000)]){
    await assert.rejects(createCloudflareProvider({ai:{run:async()=>({response})}})({input:{}}),error=>error.code==='invalid_analysis');
  }
  const provider=createCloudflareProvider({ai:{run:async(_model,body)=>({response:JSON.parse(body.messages[1].content).evidence?{headline:'Invented income',blocks:[{text:'GDP grows 99%.',sourceIds:['statcan-36100711'],evidenceIds:['n1']}]}:{state}})}});
  const run=createEnergyAnalyzer({data,debate,provider,normalizeState:normalizeEconomyState,summarize:summarizeEconomy});
  await assert.rejects(run({question:'Invent a provincial forecast',state}),error=>error.code==='invalid_analysis');
});
test('timeout cannot launch a second free call after the first completes late',async()=>{
  let resolve,calls=0;
  const provider=createCloudflareProvider({ai:{run:async()=>{calls++;return new Promise(done=>{resolve=done;});}}});
  const run=createEnergyAnalyzer({data,debate,provider,normalizeState:normalizeEconomyState,summarize:summarizeEconomy,timeoutMs:5});
  await assert.rejects(run({question:'What changes?',state}),error=>error.code==='analysis_timeout');
  resolve({response:{state}});await new Promise(done=>setTimeout(done,5));assert.equal(calls,1);
});
