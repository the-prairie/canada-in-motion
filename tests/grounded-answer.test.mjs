import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {buildEvidence,validateExplanation,createEnergyAnalyzer} from '../server/energy-analysis.mjs';
import {buildClaimCatalog,renderClaimSelection} from '../server/grounded-answer.mjs';
import {summarizeEconomy,normalizeEconomyState} from '../economy-model.mjs';
const data=JSON.parse(await readFile(new URL('../data/economy.json',import.meta.url)));
const debate=JSON.parse(await readFile(new URL('../data/energy-debate.json',import.meta.url)));
function fixture(region,scenario='Current Measures',oilShock=-10,duration='persistent'){
  const state=normalizeEconomyState({region,scenario,oilShock,duration});
  const summary=summarizeEconomy(data,state);
  const national=summarizeEconomy(data,{...state,region:'CA'}).publishedOilSensitivity;
  const evidence=buildEvidence(summary,debate,national);
  const regionName=data.regions.find(row=>row.code===region).name;
  return {state,summary,evidence,regionName,claims:buildClaimCatalog({state,summary,evidence,regionName})};
}
test('every eligible finding passes unchanged evidence validation across all regions and scenarios',()=>{
  for(const region of data.regions)for(const scenario of data.scenarios){
    const f=fixture(region.code,scenario);
    for(const claim of f.claims){
      const raw=renderClaimSelection({answerability:'supported',claimIds:[claim.id]},f.claims,f.regionName);
      const result=validateExplanation(raw,f.evidence);
      assert.ok(result.sources.length);assert.doesNotMatch(result.blocks[0].text,/\[\[|2,022/);
    }
  }
});
test('provincial answers can show separately scoped national sensitivity without inventing provincial outputs',()=>{
  for(const duration of ['persistent','temporary']){
    const f=fixture('AB','Current Measures',-10,duration);
    assert.equal(f.summary.publishedOilSensitivity.available,false);
    const raw=renderClaimSelection({answerability:'supported',claimIds:['oil-gdp','observed-contribution']},f.claims,f.regionName);
    const answer=validateExplanation(raw,f.evidence);
    assert.match(answer.blocks[0].text,/national/);assert.match(answer.blocks[0].text,/2026 baseline/);
    assert.match(answer.blocks[0].text,/-0\.[35]%/);assert.match(answer.blocks[0].text,/cannot be allocated to provinces/);
    assert.match(answer.blocks[1].text,/2022/);
  }
  assert.ok(!fixture('AB','Current Measures',0).claims.some(item=>item.id==='oil-gdp'));
});
test('model cannot add prose, sources, duplicate claims, or unavailable regional metrics',()=>{
  const f=fixture('CA');
  for(const selection of [{answerability:'supported',claimIds:['invented']},{answerability:'supported',claimIds:['observed-contribution','observed-contribution']},{answerability:'supported',claimIds:[]},{answerability:'supported',claimIds:['scenario-electricity-price']},{answerability:'supported',claimIds:['observed-contribution'],text:'GDP increases 99%'}])assert.throws(()=>renderClaimSelection(selection,f.claims,f.regionName));
  const answer=validateExplanation(renderClaimSelection({answerability:'unsupported',claimIds:['unsupported-price-response']},f.claims,f.regionName),f.evidence);
  assert.equal(answer.blocks.length,1);assert.match(answer.blocks[0].text,/do not provide provincial GDP/);
  const narrowed=renderClaimSelection({answerability:'unsupported',claimIds:['observed-contribution','outside-data','f_oil-shock']},f.claims,f.regionName);
  assert.equal(narrowed.blocks.length,1);assert.match(narrowed.blocks[0].text,/goes beyond/);
});
test('free claim-selection stage returns source-backed text and rejects invented output',async()=>{
  for(const invalid of [false,true]){
    let calls=0;
    const provider=async({name,input})=>{calls++;if(name==='energy_scenario')return {state:input.state};assert.equal(name,'energy_claims');return {answerability:'supported',claimIds:[invalid?'invented':'observed-contribution']};};
    const run=createEnergyAnalyzer({data,debate,provider,normalizeState:normalizeEconomyState,summarize:summarizeEconomy,answerMode:'claims'});
    if(invalid)await assert.rejects(run({question:'How does Alberta contribute?',state:{region:'AB'}}),error=>error.code==='invalid_analysis');
    else {const result=await run({question:'How does Alberta contribute?',state:{region:'AB'}});assert.equal(result.answerMode,'source-backed-findings');assert.match(result.analysis.blocks[0].text,/163,605\.9/);}
    assert.equal(calls,2);
  }
});
test('supported findings do not contradict their scope and missing price effects lead partial answers',()=>{
  const f=fixture('CA');
  const supported=renderClaimSelection({answerability:'supported',claimIds:['oil-gdp','outside-data']},f.claims,f.regionName);
  assert.equal(supported.blocks.length,1);assert.match(supported.blocks[0].text,/oil-price change/);
  const partial=renderClaimSelection({answerability:'partial',claimIds:['observed-contribution','unsupported-price-response','outside-data']},f.claims,f.regionName);
  assert.equal(partial.blocks.length,2);assert.match(partial.blocks[0].text,/do not provide provincial GDP/);
});
