// One-use, loopback-only PKCE setup. Never prints a key or authorization code.
import http from 'node:http';
import {randomBytes,createHash,timingSafeEqual} from 'node:crypto';
import {writeFile,access} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const destination=new URL('../.env.openrouter.local',import.meta.url);
try {await access(destination); console.error('An OpenRouter credential file already exists. No key was created.');process.exit(1);}catch{}
const verifier=randomBytes(48).toString('base64url');
const state=randomBytes(32).toString('base64url');
const route='/callback/'+randomBytes(24).toString('hex');
const challenge=createHash('sha256').update(verifier).digest('base64url');
let attempted=false,complete=false;
const equal=(a,b)=>typeof a==='string'&&Buffer.byteLength(a)===Buffer.byteLength(b)&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
const server=http.createServer(async(req,res)=>{
  const host=`localhost:${server.address().port}`;
  res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('Content-Security-Policy',"default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'");
  res.setHeader('Content-Type','text/html; charset=utf-8');
  if(req.headers.host!==host||req.method!=='GET'){res.writeHead(403);res.end('Request refused.');return;}
  const url=new URL(req.url,`http://${host}`);
  if(url.pathname==='/complete'&&complete){
    res.end('<!doctype html><title>OpenRouter connected</title><main style="max-width:620px;margin:12vh auto;font:20px/1.6 system-ui;padding:24px"><h1>OpenRouter connected</h1><p>The key was saved privately on this computer for Canada in Motion. It was not displayed or sent to chat.</p><p>Return to Codex to continue the free-model benchmark.</p></main>');
    setTimeout(()=>server.close(),1000);return;
  }
  const code=url.searchParams.get('code');
  if(url.pathname!==route||!equal(url.searchParams.get('state'),state)||!code||code.length>2048||attempted){res.writeHead(400);res.end('This setup link is invalid or already used. Return to Codex.');return;}
  attempted=true;
  try{
    const response=await fetch('https://openrouter.ai/api/v1/auth/keys',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code,code_verifier:verifier,code_challenge_method:'S256'}),signal:AbortSignal.timeout(30000)});
    if(!response.ok)throw Error('exchange');
    const payload=await response.json();
    if(typeof payload.key!=='string'||!/^sk-or-[A-Za-z0-9_-]+$/.test(payload.key))throw Error('key');
    await writeFile(destination,`OPENROUTER_API_KEY=${payload.key}\n`,{mode:0o600,flag:'wx'});
    complete=true;
    console.log(JSON.stringify({connected:true,credentialFile:fileURLToPath(destination),keyDisplayed:false}));
    res.writeHead(303,{Location:'/complete'});res.end();
  }catch{res.writeHead(502);res.end('Setup could not finish. Return to Codex; no credentials were displayed.');console.error('OpenRouter setup failed. No credential details were logged.');}
});
server.listen(0,'127.0.0.1',()=>{
  const url=new URL('https://openrouter.ai/auth');
  url.search=new URLSearchParams({callback_url:`http://localhost:${server.address().port}${route}`,code_challenge:challenge,code_challenge_method:'S256',state,key_label:'Canada in Motion — free model evaluation'}).toString();
  console.log(JSON.stringify({authorizationUrl:url.href,expiresInMinutes:30}));
});
const timer=setTimeout(()=>{console.log('Setup listener expired. Start a new setup if needed.');server.close();},30*60*1000);
server.on('close',()=>clearTimeout(timer));
