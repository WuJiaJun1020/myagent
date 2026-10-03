// Manual Windows GUI regression: initial launch AND restart must display a window.
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createRequire } from 'node:module';
import { once } from 'node:events';
import assert from 'node:assert/strict';
import { DevElectron } from '../../scripts/dev-electron.mjs';
const root=resolve('.cache/dev-window-check');await mkdir(root,{recursive:true});
const entry=join(root,'window.cjs');
await writeFile(entry,`const {app,BrowserWindow}=require('electron');app.setPath('userData',require('path').join(__dirname,'profile'));app.whenReady().then(async()=>{const win=new BrowserWindow({show:false,width:400,height:240});await win.loadURL('data:text/html,<h2>Pi Desktop development window check</h2>');win.show();setTimeout(()=>process.send({visible:win.isVisible()}),250)});process.on('message',m=>{if(m.type==='pi-desktop-dev:quit')app.quit()});process.on('disconnect',()=>app.quit());`);
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
const supervisor=new DevElectron({executable:createRequire(import.meta.url)('electron'),args:[entry],env});
try{for(let i=0;i<2;i++){await supervisor.restart();const [state]=await once(supervisor.child,'message',{signal:AbortSignal.timeout(15000)});assert.equal(state.visible,true, i?'Restarted window is hidden':'Initial window is hidden');}console.log('PASS: initial and restarted Electron windows are visible');}finally{await supervisor.stop();}
