// Local credential entry only. No API calls, logging of inputs, or browser storage.
import http from 'node:http';
import {randomBytes} from 'node:crypto';
import {writeFile,access} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';

export function createJevSetup({destination,onSaved=()=>{}}) {
  const route='/connect/'+randomBytes(32).toString('hex');
  let saved=false,writing=false;
  const page=(title,body)=>`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>body{background:#f5f5ef;color:#172c30;font:18px/1.6 system-ui;margin:0}main{max-width:620px;margin:8vh auto;padding:32px}h1{font-size:32px;line-height:1.2}label{display:block;font-weight:600;margin:28px 0 8px}input{box-sizing:border-box;width:100%;padding:14px;font:inherit;border:1px solid #526a70;background:white}button{padding:12px 20px;margin:20px 0;background:#173e43;color:white;border:0;font:inherit;cursor:pointer}small{display:block;color:#455b5e}input:focus,button:focus{outline:3px solid #b06b24;outline-offset:3px}</style><main><p>Canada in Motion · Local setup</p><h1>${title}</h1>${body}</main></html>`;
  const server=http.createServer(async(req,res)=>{
    const host=`127.0.0.1:${server.address().port}`;
    const origin=`http://${host}`;
    res.setHeader('Cache-Control','no-store');
    // Form navigations can send Origin: null under no-referrer. Keep the
    // same-origin POST check without leaking the setup route cross-origin.
    res.setHeader('Referrer-Policy','same-origin');
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Content-Type','text/html; charset=utf-8');
    res.setHeader('Content-Security-Policy',"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'");
    const fail=(status,message)=>{res.writeHead(status);res.end(page('Setup could not finish',`<p>${message}</p>`));};
    if(req.headers.host!==host||req.url!==route)return fail(403,'Return to Codex for the setup link.');
    if(req.method==='GET'){
      if(saved)return res.end(page('Jev key saved','<p>Your key was saved in a private file on this computer. It has not been sent to chat, GitHub or the public app.</p><p>Return to Codex to continue the benchmark within your approved US$1 budget.</p>'));
      return res.end(page('Connect your Jev key',`<p>Paste your TypeSafe API key below. This form sends it only to a local process on this computer.</p><form method="post" action="${route}" autocomplete="off"><label for="key">TypeSafe API key</label><input id="key" name="key" type="password" autocomplete="off" spellcheck="false" minlength="16" maxlength="4096" required aria-describedby="storage"><small id="storage">Saved as .env.jev.local with owner-only file permissions. The file is excluded from Git and the public build.</small><button type="submit">Save key for benchmark</button></form><p>Saving the key makes no API calls. The benchmark has an approved maximum of US$1.</p>`));
    }
    if(req.method!=='POST'||req.headers.origin!==origin||req.headers['sec-fetch-site']==='cross-site'||req.headers['content-type']?.split(';')[0]!=='application/x-www-form-urlencoded')return fail(403,'Use the local setup form.');
    if(saved||writing)return fail(409,'A key has already been submitted.');
    writing=true;
    try{
      let body='';let bytes=0;
      for await(const chunk of req){bytes+=chunk.length;if(bytes>8192)throw Error('size');body+=chunk.toString('utf8');}
      const params=new URLSearchParams(body);
      const key=params.get('key')?.trim();
      if([...params.keys()].length!==1||!key||! /^[\x21-\x7e]{16,4096}$/.test(key))throw Error('format');
      await writeFile(destination,`TYPESAFE_API_KEY=${key}\n`,{mode:0o600,flag:'wx'});
      saved=true;
      res.writeHead(303,{Location:route});res.end();
      onSaved();
    }catch{fail(400,'The key could not be saved. Check the input or return to Codex. No key was logged.');}
    finally{writing=false;}
  });
  server.requestTimeout=15000;
  server.headersTimeout=10000;
  return {server,route};
}

if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url){
  const destination=new URL('../.env.jev.local',import.meta.url);
  try{await access(destination);console.log('A local Jev credential file already exists. No changes made.');}
  catch{
    const {server,route}=createJevSetup({destination,onSaved:()=>console.log(JSON.stringify({saved:true,keyDisplayed:false,apiCalls:0}))});
    server.listen(0,'127.0.0.1',()=>console.log(JSON.stringify({setupUrl:`http://127.0.0.1:${server.address().port}${route}`,expiresInMinutes:30})));
    const timer=setTimeout(()=>server.close(),30*60*1000);
    server.on('close',()=>clearTimeout(timer));
  }
}
