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
      if(widget!==undefined)turnstile.remove(widget);
      error?reject(error):resolve(value);
    };
    const cancel=()=>finish(new DOMException('Cancelled','AbortError'));
    signal.addEventListener('abort',cancel,{once:true});
    timer=setTimeout(()=>finish(new Error('The security check timed out. Try again.')),90000);
    try {
      widget=turnstile.render(container,{sitekey:siteKey,action:'energy_analysis',theme:'light',size:'flexible',retry:'never',callback:token=>finish(null,token),'error-callback':()=>finish(new Error('The security check could not complete. Try again.')),'expired-callback':()=>finish(new Error('The security check expired. Try again.'))});
    } catch {finish(new Error('The security check could not start. Try again.'));}
  });
}
