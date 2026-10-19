import {build} from 'esbuild';
import {writeFile,readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const root=new URL('../',import.meta.url);
await build({entryPoints:[fileURLToPath(new URL('ui/energy-workspace.jsx',root))],outfile:fileURLToPath(new URL('vendor/energy-workspace.js',root)),bundle:true,format:'esm',platform:'browser',target:['es2022'],minify:true,legalComments:'eof',define:{'process.env.NODE_ENV':'"production"'},sourcemap:false,logLevel:'info'});
const packages=['@openuidev/react-lang','@openuidev/lang-core','@openuidev/observability','react','react-dom','scheduler','zod'];
const notices=[];
for(const name of packages){
  let license;for(const file of ['LICENSE','LICENSE.md','LICENSE.txt']){try{license=await readFile(new URL(`node_modules/${name}/${file}`,root),'utf8');break;}catch(error){if(error.code!=='ENOENT')throw error;}}
  if(!license)throw new Error(`Missing license: ${name}`);
  notices.push(`${name}\n${license}`);
}
await writeFile(new URL('vendor/LICENSE-OpenUI.txt',root),notices.join('\n\n'));
