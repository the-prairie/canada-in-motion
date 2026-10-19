// Grade observed outcomes without counting an absent error code as success.
// A correctly rejected request passes its guard test, not a model-answer test.
export function gradeTrial(testCase, outcome){
  const expectsError=typeof testCase.expectedError==='string'&&testCase.expectedError.length>0;
  if(Object.hasOwn(outcome,'error')){
    const errorCode=typeof outcome.error?.code==='string'&&outcome.error.code.length?outcome.error.code:'unclassified_error';
    const passed=expectsError&&errorCode===testCase.expectedError;
    return {passed,outcome:passed?'expected_rejection':'unexpected_error',validated:false,stateMatched:null,requestRejected:true,errorCode};
  }
  const stateMatched=Object.entries(testCase.expected||{}).every(([key,value])=>outcome.result?.state?.[key]===value);
  const passed=!expectsError&&stateMatched;
  return {passed,outcome:expectsError?'expected_rejection_missing':stateMatched?'validated_answer':'state_mismatch',validated:true,stateMatched,requestRejected:false};
}
