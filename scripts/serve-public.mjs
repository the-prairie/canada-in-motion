import http from 'node:http';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createGzip } from 'node:zlib';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { ROOT, CSP, safeRead, sha256 } from './build-public.mjs';

const TYPES = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.geojson':'application/geo+json; charset=utf-8','.ttf':'font/ttf','.txt':'text/plain; charset=utf-8','.md':'text/plain; charset=utf-8'};
export async function createPublicServer(directory = path.join(ROOT,'dist')) {
  if((await fs.lstat(directory)).isSymbolicLink()) throw new Error('Serving root cannot be a symbolic link');
  const root = await fs.realpath(directory);
  const manifest = JSON.parse(await safeRead(root,'build-manifest.json'));
  if(manifest.schemaVersion !== 1 || !Array.isArray(manifest.files)) throw new Error('Invalid build manifest');
  const allowed = new Map(manifest.files.map(item=>[item.path,item]));
  allowed.delete('_headers');
  const server = http.createServer({ requestTimeout:30000, headersTimeout:15000, keepAliveTimeout:5000 }, async (request,response)=>{
    const headers = {'Content-Security-Policy':CSP,'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Frame-Options':'DENY','Permissions-Policy':'camera=(), microphone=(), geolocation=()','Cache-Control':'no-store'};
    const fail = (status,message)=>{response.writeHead(status,{...headers,'Content-Type':'text/plain; charset=utf-8'});response.end(request.method==='HEAD'?'':message);};
    if(!['GET','HEAD'].includes(request.method)) {response.setHeader('Allow','GET, HEAD');fail(405,'Method not allowed');return;}
    let relative;
    try {
      const raw = request.url.split('?')[0];
      const decoded = decodeURIComponent(raw);
      if(!decoded.startsWith('/') || decoded.includes('\\') || decoded.includes('\0') || decoded.includes('%') || decoded.split('/').some(segment=>segment==='.' || segment==='..')) throw new Error('Invalid path');
      relative = decoded==='/' ? 'index.html':decoded.slice(1);
      if(!allowed.has(relative)) {fail(404,'Not found');return;}
    } catch {fail(400,'Invalid request path');return;}
    try {
      const bytes = await safeRead(root,relative);
      const entry = allowed.get(relative);
      if(sha256(bytes)!==entry.sha256 || bytes.length!==entry.size) throw new Error('Build integrity mismatch');
      const acceptsGzip = (request.headers['accept-encoding'] || '').split(',').some(part => {
        const [encoding,...parameters] = part.trim().split(';');
        const q = parameters.find(value=>value.trim().startsWith('q='));
        const quality = q ? Number(q.trim().slice(2)) : 1;
        return encoding.toLowerCase()==='gzip' && quality>0 && quality<=1;
      });
      const gzip = bytes.length>1024 && acceptsGzip && !relative.endsWith('.ttf');
      const etag = `W/"${entry.sha256}"`;
      Object.assign(headers,{'Content-Type':TYPES[path.extname(relative)] || 'application/octet-stream','ETag':etag,'Vary':'Accept-Encoding','Cache-Control':/^data\/releases\/[a-f0-9]{20,64}\//.test(relative)?'public, max-age=31536000, immutable':'no-cache'});
      if(request.headers['if-none-match']===etag) {response.writeHead(304,headers);response.end();return;}
      if(gzip)headers['Content-Encoding']='gzip';else headers['Content-Length']=bytes.length;
      response.writeHead(200,headers);
      if(request.method==='HEAD')response.end();
      else if(gzip)await pipeline(Readable.from([bytes]),createGzip(),response);
      else response.end(bytes);
    } catch(error) {
      if(!response.headersSent)fail(error.code==='ENOENT'?404:500,'File unavailable');else response.destroy();
    }
  });
  server.maxRequestsPerSocket = 100;
  return server;
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 4174);
  const host = process.env.HOST || '127.0.0.1';
  createPublicServer(process.argv[2]?path.resolve(process.argv[2]):undefined).then(server=>server.listen(port,host,()=>console.log(`Candidate: http://${host}:${port}/`))).catch(error=>{console.error(error.message);process.exitCode=1;});
}
