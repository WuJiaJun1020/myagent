// Cold dev scan and module imports, without mounting business UI or reading user data.
import { createServer } from 'vite';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
const root = resolve('.cache/module-load-check');
await mkdir(root, { recursive: true });
await writeFile(join(root, 'index.html'), '<html><body>Module load benchmark</body></html>');
// A fresh cache prevents warm-cache results; node_modules avoids transforming optimized output again.
const server = await createServer({ cacheDir: resolve(`node_modules/.vite-module-check-${Date.now()}`), server: { host: '127.0.0.1', port: 0 } });
let child;
try {
  await server.listen();
  const url = server.resolvedUrls.local[0];
  await writeFile(join(root, 'main.cjs'), `
const {app,BrowserWindow}=require('electron');
app.setPath('userData',${JSON.stringify(join(root, 'profile'))});
app.whenReady().then(async()=>{try{
  const win=new BrowserWindow({show:false,webPreferences:{backgroundThrottling:false}});
  await win.loadURL(${JSON.stringify(url + '.cache/module-load-check/index.html')});
  for(const name of ['interview/InterviewRendererModule','knowledge-studio/KnowledgeStudioRendererModule','smart-library/LibraryRendererModule']){
    const path='/src/renderer/modules/'+name+'.tsx';
    const result=await win.webContents.executeJavaScript('(async()=>{const t=performance.now();await import('+JSON.stringify(path)+');return {ms:performance.now()-t,resources:performance.getEntriesByType("resource").length}})()');
    console.log(name,JSON.stringify(result));
  }
  app.exit(0);
}catch(e){console.error(e);app.exit(1)}});`);
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  child = spawn(createRequire(import.meta.url)('electron'), [join(root, 'main.cjs')], { env, stdio: 'inherit', windowsHide: true });
  const timer = setTimeout(() => child.kill(), 90000);
  const code = await new Promise((resolve, reject) => { child.once('exit', resolve); child.once('error', reject); }).finally(() => clearTimeout(timer));
  assert.equal(code, 0, 'Module import failed or timed out');
  const watched = server.watcher.getWatched();
  const runtimeDirs = Object.keys(watched).filter(path => /\/(?:\.cache|models|resources\/python|release)(?:\/|$)/.test(path.replaceAll('\\', '/')));
  assert.equal(runtimeDirs.length, 0, 'Runtime directories are being watched');
  console.log('Watched dirs', Object.keys(watched).length, 'files', Object.values(watched).reduce((a,x)=>a+x.length,0));
} finally { child?.kill(); await server.close(); }
