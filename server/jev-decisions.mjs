// Experimental, server-only decision adapter. Not imported by the public Worker.
export const JEV_MODEL='jev-1.14.0';
export const JEV_INPUT_USD_PER_MILLION=0.042;
// Reserve the full documented default context for each attempt, even a timeout.
export const JEV_MAX_INPUT_TOKENS=64000;
export const JEV_ATTEMPT_RESERVE_USD=JEV_MAX_INPUT_TOKENS*JEV_INPUT_USD_PER_MILLION/1e6;
export class JevError extends Error {
  constructor(code){super(code);this.name='JevError';this.code=code;}
}
const probability=x=>typeof x==='number'&&Number.isFinite(x)&&x>=0&&x<=1;
export function validateJevAnswers(payload,questions) {
  if(payload?.model!==JEV_MODEL||!payload.answers||Array.isArray(payload.answers)||Object.keys(payload.answers).length!==Object.keys(questions).length)throw new JevError('invalid_decision');
  const answers={};
  for(const [id,question] of Object.entries(questions)){
    const answer=payload.answers[id];
    if(answer?.type!==question.type)throw new JevError('invalid_decision');
    if(question.type==='noul'){
      if(!probability(answer.noul))throw new JevError('invalid_decision');
      answers[id]={type:'noul',noul:answer.noul};
    }else{
      const options=Object.keys(question.criteria);
      if(!Object.hasOwn(question.criteria,answer.choice)||!probability(answer.confidence)||!answer.probabilities||Array.isArray(answer.probabilities)||Object.keys(answer.probabilities).length!==options.length||options.some(key=>!Object.hasOwn(answer.probabilities,key)||!probability(answer.probabilities[key])))throw new JevError('invalid_decision');
      const values=Object.values(answer.probabilities);
      if(Math.abs(values.reduce((a,b)=>a+b,0)-1)>0.02||answer.probabilities[answer.choice]<Math.max(...values)-0.00001)throw new JevError('invalid_decision');
      answers[id]={type:'choice',choice:answer.choice,confidence:answer.confidence,probabilities:Object.fromEntries(options.map(key=>[key,answer.probabilities[key]]))};
    }
  }
  const inputTokens=payload.usage?.input_tokens;
  if(!Number.isSafeInteger(inputTokens)||inputTokens<0||inputTokens>JEV_MAX_INPUT_TOKENS)throw new JevError('invalid_usage');
  return {model:JEV_MODEL,answers,inputTokens,estimatedUsd:inputTokens*JEV_INPUT_USD_PER_MILLION/1e6};
}
export function createJevDecider({apiKey,fetchImpl=fetch,reserveAttempt}) {
  if(typeof apiKey!=='string'||!apiKey||typeof reserveAttempt!=='function')throw new JevError('configuration_required');
  return async({state,questions,signal})=>{
    const entries=Object.entries(questions||{});
    if(!entries.length||entries.length>64||entries.some(([id,q])=>! /^[a-zA-Z][a-zA-Z0-9_]*$/.test(id)||!q||!['choice','noul'].includes(q.type)||typeof q.instructions!=='string'||!q.instructions.trim()||(q.type==='choice'&&(!q.criteria||Array.isArray(q.criteria)||Object.keys(q.criteria).length<2||Object.keys(q.criteria).length>255))))throw new JevError('invalid_questions');
    const body=JSON.stringify({model:JEV_MODEL,state,questions});
    if(new TextEncoder().encode(body).byteLength>24000)throw new JevError('request_too_large');
    signal?.throwIfAborted();
    // Must persist the reservation before any network request. No automatic retry.
    await reserveAttempt(JEV_ATTEMPT_RESERVE_USD);
    try{
      const response=await fetchImpl('https://api.typesafe.ai/v1/systemone',{method:'POST',redirect:'error',headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},body,signal:signal?AbortSignal.any([signal,AbortSignal.timeout(15000)]):AbortSignal.timeout(15000)});
      if(!response.ok)throw new JevError([401,403].includes(response.status)?'authentication_failed':response.status===429?'rate_limited':'provider_unavailable');
      return validateJevAnswers(await response.json(),questions);
    }catch(error){if(error instanceof JevError)throw error;throw new JevError('provider_unavailable');}
  };
}
