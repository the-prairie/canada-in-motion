import test from 'node:test';
import assert from 'node:assert/strict';
import {gradeTrial} from '../scripts/ai-trial-grading.mjs';
test('uncoded failures never pass an unspecified expected-error condition',()=>{
  for(const error of [new Error('failure'),{},null,undefined,{code:''}]){
    const grade=gradeTrial({expected:{oilShock:0}},{error});
    assert.equal(grade.passed,false);assert.equal(grade.validated,false);
    assert.equal(grade.outcome,'unexpected_error');assert.equal(grade.errorCode,'unclassified_error');
  }
});
test('expected rejections pass guard tests without counting as model answers',()=>{
  const item={expectedError:'unsupported_scenario',expected:{oilShock:0}};
  const accepted=gradeTrial(item,{error:{code:'unsupported_scenario'}});
  assert.equal(accepted.passed,true);assert.equal(accepted.validated,false);assert.equal(accepted.stateMatched,null);
  assert.equal(accepted.outcome,'expected_rejection');
  assert.equal(gradeTrial(item,{error:{code:'provider_unavailable'}}).passed,false);
  const missing=gradeTrial(item,{result:{state:{oilShock:0}}});
  assert.equal(missing.passed,false);assert.equal(missing.outcome,'expected_rejection_missing');
});
test('successful answers still require the expected state',()=>{
  const item={expected:{region:'AB',oilShock:-10}};
  assert.equal(gradeTrial(item,{result:{state:{region:'AB',oilShock:-10}}}).passed,true);
  const mismatch=gradeTrial(item,{result:{state:{region:'AB',oilShock:-9}}});
  assert.equal(mismatch.passed,false);assert.equal(mismatch.outcome,'state_mismatch');
});
