let scriptPromise;

export async function loadAnalysisStatus(fetchImpl=fetch) {
  let origin='';
  const configResponse=await fetchImpl('ai-config.json',{cache:'no-store'});
  if(configResponse.ok){
    const config=await configResponse.json();
    if(config.apiOrigin){
      const url=new URL(config.apiOrigin);
      if(url.protocol!=='https:'||url.origin!==config.apiOrigin)throw new Error('Invalid analysis service address.');
      origin=url.origin;
    }
  }
  const endpoint=origin?origin+'/api/analysis':'api/analysis';
  const response=await fetchImpl(endpoint+'/status',{signal:AbortSignal.timeout(10000),credentials:'omit'});
  if(!response.ok)throw new Error('Analysis is unavailable.');
  return {...await response.json(),endpoint};
}

function loadTurnstile() {
  if(globalThis.turnstile)return Promise.resolve(globalThis.turnstile);
  if(scriptPromise)return scriptPromise;
  scriptPromise=new Promise((resolve,reject)=>{
    const script=document.createElement('script');
    const timer=setTimeout(()=>{script.remove();reject(new Error('The security check could not load. Check your connection and try again.'));},12000);
    script.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';script.async=true;
    script.onload=()=>{clearTimeout(timer);globalThis.turnstile?resolve(globalThis.turnstile):reject(new Error('The security check could not load.'));};
    script.onerror=()=>{clearTimeout(timer);script.remove();reject(new Error('The security check was blocked. Allow challenges.cloudflare.com and try again.'));};
    document.head.append(script);
  }).catch(error=>{scriptPromise=null;throw error;});
  return scriptPromise;
}

export async function requestChallengeToken(siteKey,container,signal) {
  const turnstile=await loadTurnstile();
  signal.throwIfAborted();
  if(!container?.isConnected)throw new DOMException('Cancelled','AbortError');
  return new Promise((resolve,reject)=>{
    let widget,timer,settled=false;
    const finish=(error,value)=>{
      if(settled)return;settled=true;clearTimeout(timer);signal.removeEventListener('abort',cancel);
      // Let Turnstile finish its callback before removing its own container.
      queueMicrotask(()=>{if(widget!==undefined){try{turnstile.remove(widget);}catch{/* A completed or cancelled widget may already be detached. */}}});
      error?reject(error):resolve(value);
    };
    const cancel=()=>finish(new DOMException('Cancelled','AbortError'));
    signal.addEventListener('abort',cancel,{once:true});
    timer=setTimeout(()=>finish(new Error('The security check timed out. Try again.')),90000);
    try {
      widget=turnstile.render(container,{sitekey:siteKey,action:'energy_analysis',theme:'light',size:'flexible',retry:'never',callback:token=>finish(null,token),'error-callback':()=>{finish(new Error('The security check could not complete. Try again.'));return true;},'expired-callback':()=>finish(new Error('The security check expired. Try again.'))});
    } catch {finish(new Error('The security check could not start. Try again.'));}
  });
}

const COOLDOWN_KEY='canada-in-motion-analysis-cooldown';
const quotaCodes=new Set(['visitor_limit','daily_limit','monthly_limit','rate_limit','busy']);
export function analysisFailure(response,payload,now=Date.now()) {
  const error=new Error(payload?.error?.message||'Analysis is unavailable.');
  error.code=payload?.error?.code||'unavailable';
  if(response.status===429&&quotaCodes.has(error.code)){
    const seconds=Number(payload?.error?.retryAfter||response.headers.get('Retry-After'));
    const timestamp=Date.parse(payload?.error?.resetAt);
    const delay=Number.isFinite(seconds)&&seconds>0?seconds*1000:timestamp-now;
    if(Number.isFinite(delay)&&delay>0&&delay<=32*86400000)error.resetAt=now+delay;
  }
  return error;
}
export function readAnalysisCooldown(storage,now=Date.now()) {
  try{
    const value=JSON.parse(storage.getItem(COOLDOWN_KEY));
    if(quotaCodes.has(value?.code)&&Number.isFinite(value.resetAt)&&value.resetAt>now&&value.resetAt<=now+32*86400000)return value;
    storage.removeItem(COOLDOWN_KEY);
  }catch{}
  return null;
}
export function saveAnalysisCooldown(error,storage) {
  if(!quotaCodes.has(error?.code)||!Number.isFinite(error.resetAt))return;
  try{storage.setItem(COOLDOWN_KEY,JSON.stringify({code:error.code,resetAt:error.resetAt}));}catch{}
}
export function analysisLimitMessage(limit) {
  const when=new Intl.DateTimeFormat(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'}).format(limit.resetAt);
  const reason={visitor_limit:'The daily AI allowance for this network is used up.',daily_limit:'Today’s shared AI allowance is used up.',monthly_limit:'This month’s shared AI allowance is used up.',rate_limit:'The AI service is receiving too many questions.',busy:'The AI service is answering other questions.'}[limit.code];
  return `${reason} Available again ${when}. You can open the comparisons above now; they do not use AI allowance.`;
}
