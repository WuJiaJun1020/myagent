// Render actual components with isolated, public demo data. Run after npm run build.
import {build} from 'esbuild';
import {mkdir,readFile,readdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
const out=resolve('.cache/readme');await mkdir(out,{recursive:true});
const assets=await readdir('dist/renderer/assets');
const runtime=assets.find(n=>/^monaco-runtime-.*\.js$/.test(n));
const editorCss=assets.find(n=>/^monaco-runtime-.*\.css$/.test(n));
if(!runtime||!editorCss)throw Error('Build production assets first');
const url=n=>pathToFileURL(resolve('dist/renderer/assets',n)).href;
await writeFile(resolve(out,'monaco-proxy.mjs'),`import * as r from ${JSON.stringify(url(runtime))};export const monaco=r.monaco??Object.values(r).find(v=>v&&typeof v==='object'&&v.monaco)?.monaco;`);
const html=await readFile('dist/renderer/index.html','utf8');const css=html.match(/href="(\.\/assets\/[^"<>]+\.css)"/)[1];
for(const [name,entry] of [['agent','tests/e2e/readme/agent.tsx'],['interview','tests/e2e/interview-acceptance/renderer.tsx'],['knowledge','tests/e2e/knowledge-acceptance/renderer.tsx']]){
 await build({entryPoints:[entry],outfile:resolve(out,`${name}.js`),bundle:true,platform:'browser',format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'production-monaco',setup(b){b.onResolve({filter:/\/lib\/monaco-runtime$/},()=>({path:pathToFileURL(resolve(out,'monaco-proxy.mjs')).href,external:true}));}}]});
 await writeFile(resolve(out,`${name}.html`),`<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="${name}.css"><link rel="stylesheet" href="${pathToFileURL(resolve('dist/renderer',css))}"><link rel="stylesheet" href="${url(editorCss)}"></head><body><div id="root"></div><script src="${name}.js"></script></body></html>`);
}
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
const child=spawn(createRequire(import.meta.url)('electron'),['tests/e2e/readme/capture.cjs',out],{stdio:'inherit',windowsHide:true,env});child.on('exit',code=>process.exitCode=code??1);
