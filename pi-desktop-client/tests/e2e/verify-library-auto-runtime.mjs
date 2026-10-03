// Isolated Electron UI fixture: no user books, GPU processes or cloud requests.
import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';

const root = resolve('.cache/library-auto-runtime-ui');
await mkdir(root, { recursive: true });
await writeFile(join(root, 'renderer.tsx'), `
import {createRoot} from 'react-dom/client';
import {LibraryWorkspace} from '../../src/renderer/modules/smart-library/LibraryRendererModule';
import {TooltipProvider} from '../../src/renderer/components/ui/tooltip';
import {defaultStrategyProfile} from '../../src/shared/contracts/library-strategy';
import {workspaceThemeCss,applyWorkspaceAppearance} from '../../src/renderer/lib/workspace-theme';
const style=document.createElement('style');style.textContent=workspaceThemeCss();document.head.append(style);
document.documentElement.dataset.workspace='smart-library';
window.qaTheme=mode=>applyWorkspaceAppearance(document.documentElement,'gray','theme',mode,false);window.qaTheme('light');
window.fixtureProfile=defaultStrategyProfile();
createRoot(document.getElementById('root')).render(<TooltipProvider><div style={{display:'flex',height:'100vh'}}><LibraryWorkspace/></div></TooltipProvider>);
`);
await build({ entryPoints: [join(root, 'renderer.tsx')], bundle: true, platform: 'browser', format: 'iife', jsx: 'automatic', outfile: join(root, 'renderer.js') });
const css = (await readFile('dist/renderer/index.html', 'utf8')).match(/href="(\.\/assets\/[^"<>]+\.css)"/)[1];
await writeFile(join(root, 'index.html'), `<html><head><meta charset="utf-8"><link rel="stylesheet" href="${pathToFileURL(resolve('dist/renderer', css))}"><link rel="stylesheet" href="renderer.css"><style>html,body,#root{height:100%;width:100%;margin:0;min-width:0;overflow:hidden}</style></head><body><div id="root"></div><script src="renderer.js"></script></body></html>`);
const methods = ['list','chapter','remember','modelRuntime','indexAction','indexChunk','evaluate','qaSessions','qaHistory','qaStrategies','qaModels','strategyProfiles'];
await writeFile(join(root, 'preload.cjs'), `const {contextBridge,ipcRenderer}=require('electron');contextBridge.exposeInMainWorld('piDesktop',{library:{...Object.fromEntries(${JSON.stringify(methods)}.map(k=>[k,(...a)=>ipcRenderer.invoke('fixture:'+k,...a)])),onQaUpdate:()=>()=>{}}});contextBridge.exposeInMainWorld('fixture',{mode:v=>ipcRenderer.invoke('fixture:mode',v)});`);
await writeFile(join(root, 'main.cjs'), `
const {app,BrowserWindow,ipcMain}=require('electron'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),{join}=require('node:path');
app.setPath('userData',join(__dirname,'profile'));app.disableHardwareAcceleration();
app.whenReady().then(async()=>{try{
  const book={id:'a'.repeat(64),title:'自动启动界面测试',author:'测试',format:'txt',addedAt:1,chapter:0,chapters:[{id:0,title:'第一章',characters:100}]};
  let mode='stopped',started=0,ensureCalls=0,statusCalls=0,failed=false;
  ipcMain.handle('fixture:mode',(_,value)=>{mode=value;failed=value==='failure';ensureCalls=0;statusCalls=0;return true;});
  const status=()=>{if(mode==='starting'&&Date.now()-started>900)mode='ready';return {state:mode==='failure'?'failed':mode,owned:true,busy:false,elapsedSeconds:1,...(mode==='failure'?{error:'GPU 环境测试失败',log:'fixture startup failure'}:{})};};
  ipcMain.handle('fixture:modelRuntime',(_,action)=>{
    if(action==='ensure'){ensureCalls++;if(failed)throw Error('未找到本地 GPU 模型环境（测试）');if(mode==='custom')return {state:'stopped',owned:false,busy:false,managedRequired:false,notice:'当前使用自定义本地接口，请自行启动对应服务。'};if(mode==='stopped'||mode==='failure'){mode='starting';started=Date.now()}return {...status(),managedRequired:true};}
    if(action==='status'){statusCalls++;return status()}
    throw Error('No manual runtime actions expected');
  });
  ipcMain.handle('fixture:list',()=>[book]);ipcMain.handle('fixture:chapter',()=>('第一章\\n'+('测试原文段落。\\n'.repeat(50))));ipcMain.handle('fixture:remember',()=>{});
  ipcMain.handle('fixture:indexAction',()=>({state:'prepared',version:'fixture',total:1,completed:0,chapters:1,model:'fixture'}));ipcMain.handle('fixture:indexChunk',()=>({id:'c1',ordinal:0,chapter:0,title:'第一章',paragraphId:'0',start:0,end:6,text:'测试原文段落',sourceVersion:'fixture',hash:'fixture',previous:null,next:null}));
  ipcMain.handle('fixture:evaluate',()=>({state:'idle',completed:0,total:200}));
  ipcMain.handle('fixture:strategyProfiles',async event=>[await event.sender.executeJavaScript('fixtureProfile')]);
  ipcMain.handle('fixture:qaSessions',()=>[{id:'default',title:'新会话',createdAt:1}]);ipcMain.handle('fixture:qaHistory',()=>({turns:[],hasMore:false}));ipcMain.handle('fixture:qaStrategies',()=>[{id:'standard-rag',name:'普通 RAG',version:'1',description:'测试策略'}]);ipcMain.handle('fixture:qaModels',()=>({models:[{providerId:'fixture',modelId:'fixture',name:'测试模型',reasoningLevels:['medium']}],configured:{providerId:'fixture',modelId:'fixture'}}));
  const win=new BrowserWindow({show:false,width:1280,height:880,webPreferences:{preload:join(__dirname,'preload.cjs'),offscreen:true,contextIsolation:true,backgroundThrottling:false}});
  const errors=[];win.webContents.on('console-message',(_,level,message)=>{if(level===3)errors.push(message)});await win.loadFile(join(__dirname,'index.html'));
  const js=s=>win.webContents.executeJavaScript(s),wait=ms=>new Promise(r=>setTimeout(r,ms));
  const until=async expression=>{for(let i=0;i<100;i++){if(await js(expression))return;await wait(100)}throw Error('Timeout '+expression)};
  const click=label=>js('document.querySelector("button[aria-label='+label+']").click()');
  const snapshot=async file=>{await wait(150);await fs.writeFile(join(__dirname,file+'.png'),(await win.webContents.capturePage()).toPNG());};
  await until('!!document.querySelector(".library-book")');assert.equal(ensureCalls,0);await js('document.querySelector(".library-book").click()');await until('!!document.querySelector(".library-reader-toolbar")');assert.equal(ensureCalls,0);
  await click('策略管理');await until('!!document.querySelector(".library-strategy-tabs")');assert.equal(ensureCalls,0,'configuration must not start models');await js('document.querySelector("#library-strategy-tab-index").click()');await until('document.querySelector(".library-auto-runtime")?.textContent.includes("自动启动")');assert.equal(ensureCalls,1);
  assert.equal(await js('Array.from(document.querySelectorAll("button")).find(b=>b.textContent==="开始索引").disabled'),true);await snapshot('index-starting-light');
  await until('document.querySelector(".library-auto-runtime")?.textContent.includes("已就绪")');assert.equal(await js('Array.from(document.querySelectorAll("button")).find(b=>b.textContent==="开始索引").disabled'),false);
  await click('关闭策略管理');await js('fixture.mode("stopped")');await click('图书问答');await until('document.querySelector(".library-qa-panel .library-auto-runtime")?.textContent.includes("自动启动")');assert.equal(ensureCalls,1);
  await js('(()=>{const t=document.querySelector("textarea");Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,"value").set.call(t,"测试问题");t.dispatchEvent(new Event("input",{bubbles:true}))})()');
  assert.equal(await js('document.querySelector("button[aria-label=发送图书问题]").disabled'),true);
  await click('召回评测');await until('!!document.querySelector(".library-evaluation-dialog[open]")');assert.equal(ensureCalls,1,'two open panels must share ensure');
  await until('document.querySelector(".library-evaluation-dialog .library-auto-runtime")?.textContent.includes("已就绪")');assert.equal(await js('Array.from(document.querySelectorAll(".library-evaluation-dialog button")).find(b=>b.textContent==="开始评测").disabled'),false);
  await js('qaTheme("dark")');await wait(200);await snapshot('evaluation-ready-dark');await click('关闭召回评测');await until('!document.querySelector("dialog[open]")');
  assert.equal(await js('document.querySelector("button[aria-label=发送图书问题]").disabled'),false);win.setSize(680,740);await wait(250);assert.equal(await js('document.querySelector(".library-qa-panel").scrollWidth>document.querySelector(".library-qa-panel").clientWidth'),false);assert.equal(await js('document.querySelector(".library-qa-composer").getBoundingClientRect().bottom<=innerHeight+1'),true);await snapshot('qa-ready-narrow-dark');
  await click('关闭图书问答');win.setSize(1280,880);await js('fixture.mode("failure")');await click('召回评测');await until('document.querySelector(".library-auto-runtime")?.textContent.includes("启动失败")');assert.equal(await js('Array.from(document.querySelectorAll("button")).find(b=>b.textContent==="开始评测").disabled'),true);
  await wait(2300);assert.equal(ensureCalls,1,'failure must not cause auto retry loop');await js('qaTheme("light")');await wait(200);await snapshot('evaluation-failed-light');
  failed=false;mode='stopped';await js('Array.from(document.querySelectorAll("button")).find(b=>b.textContent==="重试启动").click()');await until('document.querySelector(".library-auto-runtime")?.textContent.includes("已就绪")');assert.equal(ensureCalls,2);await click('关闭召回评测');
  const polls=statusCalls;await wait(2400);assert.equal(statusCalls,polls,'closed panels must stop polling');
  await js('fixture.mode("custom")');await click('图书问答');await until('document.querySelector(".library-auto-runtime")?.textContent.includes("自定义")');assert.equal(ensureCalls,1);await click('关闭图书问答');
  assert.deepEqual(errors,[]);console.log('PASS auto-runtime UI: lazy startup, three entries, concurrent reuse, readiness gating, failure/retry, custom config, light/dark/narrow, close stops polling');app.exit(0);
}catch(e){console.error(e);app.exit(1)}});
`);
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(createRequire(import.meta.url)('electron'), [join(root, 'main.cjs')], { env, stdio: 'inherit', windowsHide: true });
const timer = setTimeout(() => child.kill(), 60000);
const code = await new Promise((r,j) => { child.once('exit',r);child.once('error',j); }).finally(() => clearTimeout(timer));
assert.equal(code,0,'Auto runtime UI fixture failed');
