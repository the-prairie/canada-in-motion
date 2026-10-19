import {AnalysisError,compactEvidence} from './energy-analysis.mjs';
export const OPENROUTER_FREE_MODELS=Object.freeze({
  'nvidia/nemotron-3.5-super-vl:free':{structured:true},
  'nvidia/nemotron-3-ultra-550b-a55b:free':{structured:false},
  'nvidia/nemotron-3-super-120b-a12b:free':{structured:true}
});
export const OPENROUTER_MODEL='nvidia/nemotron-3.5-super-vl:free';
const unavailable=()=>new AnalysisError('provider_unavailable','The free AI service is unavailable or its allowance has been used. The data and scenario calculations still work.',503);
const invalid=()=>new AnalysisError('invalid_analysis','The analysis could not be checked against the source data. Try a narrower question.');
export function createOpenRouterProvider({apiKey,model=OPENROUTER_MODEL,fetchImpl=fetch,reasoningEnabled=true}){
  const capability=Object.hasOwn(OPENROUTER_FREE_MODELS,model)?OPENROUTER_FREE_MODELS[model]:null;
  if(!capability||typeof apiKey!=='string'||!apiKey)throw unavailable();
  return async({schema,name,instructions,input,signal})=>{
    signal?.throwIfAborted();
    const compact=input?.evidence?{...input,evidence:compactEvidence(input.evidence)}:input;
    const selectionContract=name==='energy_claims'?' Validation contract: if answerability is partial or unsupported, claimIds MUST contain at least one of unsupported-price-response, distribution-limits, outside-data. These are actual claim IDs in the supplied catalog. For a question requesting provincial price effects, include unsupported-price-response. For oil-price effects, oil-gdp comes first if available. Never omit the limitation to fit extra findings.':'';
    const system=instructions+' Return one JSON object only, without Markdown. Each number\'s contextId refers to its units, period and limitations in evidence.contexts.'+selectionContract+(capability.structured?'':' Required JSON schema: '+JSON.stringify(schema));
    const body={model,messages:[{role:'system',content:system},{role:'user',content:JSON.stringify(compact)}],stream:false,temperature:0,max_tokens:1536,reasoning:{max_tokens:512,exclude:true},provider:{allow_fallbacks:false,require_parameters:true,max_price:{prompt:0,completion:0,request:0,image:0}}};
    if(!reasoningEnabled)body.reasoning={enabled:false,exclude:true};
    if(capability.structured)body.response_format={type:'json_schema',json_schema:{name,strict:true,schema}};
    const serialized=JSON.stringify(body);
    if(new TextEncoder().encode(serialized).byteLength>50000)throw new AnalysisError('evidence_too_large','The evidence set is too large for this analysis. Try a narrower question.',422);
    let response,payload;
    try{
      response=await fetchImpl('https://openrouter.ai/api/v1/chat/completions',{method:'POST',signal,headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json','HTTP-Referer':'https://the-prairie.github.io/canada-in-motion/','X-OpenRouter-Title':'Canada in Motion'},body:serialized});
      if(!response.ok)throw unavailable();
      payload=await response.json();
    }catch(error){if(signal?.aborted)signal.throwIfAborted();throw unavailable();}
    if(payload.error)throw unavailable();
    const message=payload.choices?.[0];
    if(message?.finish_reason!=='stop'||message.message?.refusal)throw invalid();
    const content=message.message?.content;
    if(typeof content!=='string'||content.length>24000)throw invalid();
    try{
      const value=JSON.parse(content);
      if(!value||typeof value!=='object'||Array.isArray(value))throw invalid();
      return value;
    }catch{throw invalid();}
  };
}
