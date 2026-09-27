import { build } from "esbuild";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
const out=resolve('.cache/interview-acceptance');
await mkdir(out,{recursive:true});
const assets=await readdir('dist/renderer/assets');
const runtime=assets.find(name=>/^monaco-runtime-.*\.js$/.test(name));
const editorCss=assets.find(name=>/^monaco-runtime-.*\.css$/.test(name));
if(!runtime || !editorCss)throw Error('Build the production Monaco assets first');
const assetUrl=name=>pathToFileURL(resolve('dist/renderer/assets',name)).href;
// Rollup may wrap and rename a dynamic module's exports when sharing it with Python.
await writeFile(resolve(out,'monaco-proxy.mjs'), `import * as runtime from ${JSON.stringify(assetUrl(runtime))}; export const monaco = runtime.monaco ?? Object.values(runtime).find(value => value && typeof value === 'object' && value.monaco)?.monaco;`);
// Exercise the actual production module and bundled worker under file://.
await build({plugins:[{name:'production-monaco',setup(build){
 build.onResolve({filter:/\/lib\/monaco-runtime$/},()=>({path:pathToFileURL(resolve(out,'monaco-proxy.mjs')).href,external:true}));
}}],entryPoints:['scripts/interview-acceptance/renderer.tsx'],outfile:resolve(out,'renderer.js'),bundle:true,platform:'browser',format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},logLevel:'silent'});
const builtHtml=await readFile('dist/renderer/index.html','utf8');
const css=builtHtml.match(/href="(\.\/assets\/[^"<>]+\.css)"/)[1];
const cssUrl=pathToFileURL(resolve('dist/renderer',css)).href;
await writeFile(resolve(out,'index.html'),`<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="renderer.css"><link rel="stylesheet" href="${cssUrl}"><link rel="stylesheet" href="${assetUrl(editorCss)}"></head><body><div id="root"></div><script src="renderer.js"></script></body></html>`);
const electron=createRequire(import.meta.url)('electron');
const env={...process.env}; delete env.ELECTRON_RUN_AS_NODE;
const child=spawn(electron,['scripts/interview-acceptance/main.cjs',out],{stdio:'inherit',windowsHide:true,env});
child.on('exit',code=>process.exitCode=code??1);
