import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const root = resolve('.cache/library-stage0/ui');
await mkdir(root, { recursive: true });
await writeFile(join(root, '../山灯记.epub'), await require('../helpers/library-epub.cjs').createLibraryEpub());
await writeFile(join(root, 'renderer.tsx'), `
import {createRoot} from 'react-dom/client';
import {LibraryWorkspace} from '../../../src/renderer/modules/smart-library/LibraryRendererModule';
import {TooltipProvider} from '../../../src/renderer/components/ui/tooltip';
import {workspaceThemeCss,applyWorkspaceAppearance} from '../../../src/renderer/lib/workspace-theme';
const style=document.createElement('style');style.textContent=workspaceThemeCss();document.head.append(style);
document.documentElement.dataset.workspace='smart-library';
window.qaTheme=(mode)=>applyWorkspaceAppearance(document.documentElement,'gray','theme',mode,false);
window.qaTheme('light');
createRoot(document.getElementById('root')).render(<TooltipProvider><div style={{display:'flex',height:'100vh'}}><LibraryWorkspace/></div></TooltipProvider>);
`);
await build({ entryPoints: [join(root, 'renderer.tsx')], bundle: true, platform: 'browser', format: 'iife', jsx: 'automatic', outfile: join(root, 'renderer.js') });
await build({ entryPoints: ['src/main/smart-library/library-module.ts'], bundle: true, platform: 'node', format: 'cjs', outfile: join(root, 'service.cjs'), external: ['electron'] });
await build({ entryPoints: ['src/main/smart-library/import-worker.ts'], bundle: true, platform: 'node', format: 'cjs', outfile: join(root, 'library-import.cjs') });
await build({ entryPoints: ['src/main/smart-library/indexing/index-worker.ts'], bundle: true, platform: 'node', format: 'cjs', outfile: join(root, 'library-index.cjs'), external: ['@lancedb/lancedb'] });
const css = (await readFile('dist/renderer/index.html', 'utf8')).match(/href="(\.\/assets\/[^"<>]+\.css)"/)[1];
await writeFile(join(root, 'index.html'), `<html><head><meta charset="utf-8"><link rel="stylesheet" href="${pathToFileURL(resolve('dist/renderer', css))}"><link rel="stylesheet" href="renderer.css"></head><body><div id="root"></div><script src="renderer.js"></script></body></html>`);
await writeFile(join(root, 'preload.cjs'), `const {contextBridge,ipcRenderer}=require('electron');contextBridge.exposeInMainWorld('piDesktop',{library:{strategyProfiles:(...a)=>ipcRenderer.invoke("smart-library:strategy-profiles",...a),evaluationRuns:(...a)=>ipcRenderer.invoke("smart-library:evaluation-runs",...a),qaStrategies:()=>ipcRenderer.invoke("smart-library:qa-strategies"),qaSessions:(...a)=>ipcRenderer.invoke('smart-library:qa-sessions',...a),qaModels:()=>ipcRenderer.invoke('smart-library:qa-models'),qaHistory:(...a)=>ipcRenderer.invoke('smart-library:qa-history',...a),qaAsk:(...a)=>ipcRenderer.invoke('smart-library:qa-ask',...a),qaStop:(...a)=>ipcRenderer.invoke('smart-library:qa-stop',...a),qaEvidence:(...a)=>ipcRenderer.invoke('smart-library:qa-evidence',...a),onQaUpdate:fn=>{const h=(_,t)=>fn(t);ipcRenderer.on('smart-library:qa-update',h);return()=>ipcRenderer.removeListener('smart-library:qa-update',h)},search:(...a)=>ipcRenderer.invoke('smart-library:search',...a),cancelSearch:(...a)=>ipcRenderer.invoke('smart-library:cancel-search',...a),evidence:(...a)=>ipcRenderer.invoke('smart-library:evidence',...a),modelRuntime:a=>ipcRenderer.invoke('qa:model-runtime',a),indexAction:(...a)=>ipcRenderer.invoke('smart-library:index',...a),indexChunk:(...a)=>ipcRenderer.invoke('smart-library:index-chunk',...a),list:()=>ipcRenderer.invoke('smart-library:list'),importBooks:()=>ipcRenderer.invoke('smart-library:import'),chapter:(...a)=>ipcRenderer.invoke('smart-library:chapter',...a),remember:(...a)=>ipcRenderer.invoke('smart-library:remember',...a),getLocalModels:()=>ipcRenderer.invoke('smart-library:local-models'),saveLocalModels:s=>ipcRenderer.invoke('smart-library:save-local-models',s),testLocalModel:(...a)=>ipcRenderer.invoke('smart-library:test-local-model',...a)}});`);
await writeFile(join(root, 'main.cjs'), `
const {app,BrowserWindow,ipcMain}=require('electron');const {join}=require('node:path');const fs=require('node:fs');const http=require('node:http');const assert=require('node:assert/strict');const {LibraryModule}=require('./service.cjs');
app.setPath('userData',join(__dirname,'profile'));app.disableHardwareAcceleration();let service,server;let runtimeState='stopped';ipcMain.handle('qa:model-runtime',(_,a)=>{if(a==='start'||a==='ensure')runtimeState='ready';if(a==='stop')runtimeState='stopped';return {state:runtimeState,managedRequired:true,owned:runtimeState==='ready',busy:false,gpu:runtimeState==='ready'?'Fixture GPU':undefined}});
app.whenReady().then(async()=>{try{
server=http.createServer(async(req,res)=>{let raw='';for await(const c of req){raw+=c};const body=JSON.parse(raw);res.setHeader('content-type','application/json');res.end(JSON.stringify(req.url==='/embed'?{model:body.model,embeddings:body.input.map(()=>[1,0])}:{results:body.documents.map((_,index)=>({index,relevance_score:index===1?.9:.1-index*.01}))}));});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const qaModel={providerId:'fixture',modelId:'answer'};const gateway={async getAvailableModels(){return[{...qaModel,name:'Fixture answer',reasoningLevels:['low','medium']}]},async getConfiguredModel(){return qaModel},async generate(request,options){options?.onPreparedRequest?.({systemPrompt:request.messages[0].content,messages:request.messages.slice(1),model:qaModel,estimatedInputTokens:140});return{ok:true,value:{requestId:'r',model:qaModel,text:JSON.stringify({query:'铜钥匙给谁'}),finishReason:'stop',usage:{}}}},async *stream(request,options){options?.onPreparedRequest?.({systemPrompt:request.messages[0].content,messages:request.messages.slice(1),model:qaModel,estimatedInputTokens:140});const q=JSON.parse(request.messages[1].content).question;const answer='铜钥匙交给了**苏禾**。[1]';yield{type:'started',requestId:'a',model:qaModel,diagnostics:{estimatedInputTokens:140,modelContextWindowTokens:32768,temperatureApplied:false}};yield{type:'text_delta',delta:answer.slice(0,10)};if(q.includes('慢'))await new Promise(r=>{if(options.signal.aborted)r();else options.signal.addEventListener('abort',r,{once:true})});else await new Promise(r=>setTimeout(r,600));yield{type:'text_delta',delta:answer.slice(10)};yield{type:'completed',response:{requestId:'a',model:qaModel,text:answer,finishReason:'stop',usage:{inputTokens:100,cachedInputTokens:100,outputTokens:20}}}}};service=new LibraryModule(join(__dirname,'data-'+process.pid),ipcMain,async()=>[join(__dirname,'../山灯记.epub')],process.cwd(),gateway);service.start();
const win=new BrowserWindow({show:false,width:1000,height:820,webPreferences:{preload:join(__dirname,'preload.cjs'),offscreen:true,contextIsolation:true,backgroundThrottling:false}});await win.loadFile(join(__dirname,'index.html'));const js=async s=>{try{return await win.webContents.executeJavaScript(s)}catch(e){console.error("JS failed:",s);throw e}};const wait=()=>new Promise(r=>setTimeout(r,400));await wait();
assert.equal(await js('document.querySelectorAll(".library-model-entry button").length'),1);
const url='http://127.0.0.1:'+server.address().port;await js('(async()=>{const profiles=await window.piDesktop.library.strategyProfiles();await window.piDesktop.library.strategyProfiles({action:"save",profile:{...profiles[0],localModels:'+JSON.stringify({embeddingUrl:url+'/embed',embeddingModel:'fixture',rerankerUrl:url+'/rerank',rerankerModel:'fixture'})+'}});})()');
await js("document.querySelector('.library-model-entry button').focus();document.querySelector('.library-model-entry button').click()");await wait();assert.equal(await js("document.querySelector('dialog').open"),true);
const click=async text=>{for(let i=0;i<60;i++){if(await js("Array.from(document.querySelectorAll('dialog button')).some(b=>!b.disabled&&b.textContent==="+JSON.stringify(text)+")"))break;await wait();}await js("Array.from(document.querySelectorAll('dialog button')).find(b=>b.textContent==="+JSON.stringify(text)+").click()");await wait();};
await click('本地模型');await click('启动服务');assert.ok((await js('document.querySelector(".library-runtime-controls").innerText')).includes('服务已就绪'));await click('停止服务');assert.ok((await js('document.querySelector(".library-runtime-controls").innerText')).includes('未启动'));for(const mode of ['light','dark']){await js('qaTheme('+JSON.stringify(mode)+')');await wait();fs.writeFileSync(join(__dirname,'runtime-'+mode+'.png'),(await win.webContents.capturePage()).toPNG());}await click('测试向量化');assert.ok((await js('document.querySelector("dialog").innerText')).includes('2 维'));
await click('测试重排');assert.ok((await js('document.querySelector("dialog").innerText')).includes('相关原文排在预期位置'));
await click('千问 0.6B · BF16');await click('测试重排');
await click('BGE Base · FP32');await click('测试重排');
assert.ok((await js('document.querySelector(".library-comparisons").innerText')).includes('千问 0.6B'));
assert.ok((await js('document.querySelector(".library-comparisons").innerText')).includes('BGE Base'));
await js('document.querySelector(".library-case-picker").open=true');await click('否定与条件');await click('测试重排');
assert.equal(await js('document.querySelectorAll(".library-score-list p").length'),3);
await js('document.querySelector(".library-case-picker").open=true');await click('无答案 · 不应强行选答案');await click('测试重排');
assert.ok((await js('document.querySelector("dialog").innerText')).includes('不代表原文能够回答'));
await click('保存方案');assert.ok((await js('document.querySelector("dialog").innerText')).includes('方案已保存'));
await js("document.querySelector('.library-strategy-layout>main').scrollTop=10000");
for(const mode of ['light','dark']){await js('qaTheme('+JSON.stringify(mode)+')');await wait();fs.writeFileSync(join(__dirname,mode+'.png'),(await win.webContents.capturePage()).toPNG());assert.equal(await js('document.documentElement.scrollWidth>innerWidth'),false);}
win.setSize(520,650);await js("document.documentElement.style.setProperty('--ui-font-adjust','3px')");await wait();assert.equal(await js('document.querySelector("dialog").scrollWidth>document.querySelector("dialog").clientWidth'),false);assert.equal(await js('document.querySelector("dialog").getBoundingClientRect().top>=0 && document.querySelector("dialog").getBoundingClientRect().bottom<=innerHeight'),true);fs.writeFileSync(join(__dirname,'narrow.png'),(await win.webContents.capturePage()).toPNG());
await js("document.querySelector('button[aria-label=关闭策略管理]').click()");await wait();assert.equal(await js('document.activeElement.textContent'),'策略管理');await js('window.piDesktop.library.importBooks()');const books=await service.list();assert.equal(books.length,1);assert.equal(books[0].chapters.length,4);
await js("document.querySelector('.library-import').click()");await wait();await js("document.querySelector('.library-book').click()");await wait();
assert.equal(await js('document.querySelectorAll(".library-model-entry button[aria-label=策略管理]").length'),1);assert.equal(await js('document.querySelectorAll(".library-model-entry button[aria-label=图书索引], .library-model-entry button[aria-label=本地检索模型]").length'),0);
await js("document.querySelector('.library-model-entry button[aria-label=策略管理]').click()");await wait();await click('索引');
await click('准备索引');for(let i=0;i<40;i++){if((await js('document.querySelector("dialog").innerText')).includes('4 个原文章节'))break;await wait();}assert.ok((await js('document.querySelector("dialog").innerText')).includes('4 个原文章节'));
assert.ok((await js('document.querySelector(".library-index-preview").innerText')).includes('字符位置'));
await click('开始索引');for(let i=0;i<20;i++){await wait();if((await js('document.querySelector("dialog").innerText')).includes('索引可用'))break;}
assert.ok((await js('document.querySelector("dialog").innerText')).includes('索引可用'));
win.setSize(1000,820);await js("document.documentElement.style.setProperty('--ui-font-adjust','0px')");
for(const mode of ['light','dark']){await js('qaTheme('+JSON.stringify(mode)+')');await wait();fs.writeFileSync(join(__dirname,'index-'+mode+'.png'),(await win.webContents.capturePage()).toPNG());assert.equal(await js('document.querySelector("dialog").scrollWidth>document.querySelector("dialog").clientWidth'),false);}
win.setSize(520,650);await js("document.documentElement.style.setProperty('--ui-font-adjust','3px')");await wait();assert.equal(await js('document.querySelector("dialog").scrollWidth>document.querySelector("dialog").clientWidth'),false);fs.writeFileSync(join(__dirname,'index-narrow.png'),(await win.webContents.capturePage()).toPNG());
await click('重建索引');await click('取消');assert.ok((await js('document.querySelector("dialog").innerText')).includes('索引可用'));
await click('完成');await wait();assert.equal(await js('document.querySelectorAll("dialog").length'),0);

await js("Array.from(document.querySelectorAll('.library-model-entry button')).find(b=>b.textContent==='查找原文').click()");await wait();
const setInput=async(query,value)=>{await js("(()=>{const e=document.querySelector("+JSON.stringify(query)+");Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,"+JSON.stringify(value)+");e.dispatchEvent(new Event('input',{bubbles:true}))})()");await wait();};
const select=async(query,value)=>{await js("(()=>{const e=document.querySelector("+JSON.stringify(query)+");e.value="+JSON.stringify(value)+";e.dispatchEvent(new Event('change',{bubbles:true}))})()");await wait();};
await setInput('input[aria-label="原文检索问题"]','铜钥匙');await select('select[aria-label="检索范围"]','whole');await click('查找');
for(let i=0;i<30;i++){await wait();if(await js('!!document.querySelector(".library-retrieval-results")'))break;}
assert.ok(await js('document.querySelectorAll(".library-retrieval-results>li").length>0'));
await click('查看上下文');assert.ok(await js('!!document.querySelector(".library-hit-context mark")'));
win.setSize(1000,820);await js("document.documentElement.style.setProperty('--ui-font-adjust','0px')");
for(const mode of ['light','dark']){await js('qaTheme('+JSON.stringify(mode)+')');await wait();fs.writeFileSync(join(__dirname,'retrieval-'+mode+'.png'),(await win.webContents.capturePage()).toPNG());assert.equal(await js('document.querySelector("dialog").scrollWidth>document.querySelector("dialog").clientWidth'),false);}
win.setSize(520,650);await js("document.documentElement.style.setProperty('--ui-font-adjust','3px')");await wait();assert.equal(await js('document.querySelector("dialog").scrollWidth>document.querySelector("dialog").clientWidth'),false);fs.writeFileSync(join(__dirname,'retrieval-narrow.png'),(await win.webContents.capturePage()).toPNG());
win.setSize(1000,820);await js("document.documentElement.style.setProperty('--ui-font-adjust','0px')");await wait();await click('收起上下文');assert.equal(await js('document.querySelectorAll(".library-hit-context").length'),0);await click('阅读原文');await wait();assert.equal(await js('document.querySelectorAll("dialog").length'),0);assert.ok(await js('!!document.querySelector(".library-prose mark")'));fs.writeFileSync(join(__dirname,'retrieval-highlight.png'),(await win.webContents.capturePage()).toPNG());
await js("Array.from(document.querySelectorAll('.library-model-entry button')).find(b=>b.textContent==='查找原文').click()");await wait();await setInput('input[aria-label="原文检索问题"]','铜钥匙');await click('查找');await wait();await select('select[aria-label="检索方式"]','keyword');assert.equal(await js('document.querySelectorAll(".library-retrieval-results").length'),0,'Settings change must clear stale evidence');await click('完成');

win.setSize(1300,900);await js("document.documentElement.style.setProperty('--ui-font-adjust','0px')");
await js("Array.from(document.querySelectorAll('.library-model-entry button')).find(b=>b.textContent==='图书问答').click()");await wait();
await js("Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='新建会话').click()");await wait();
win.focus();win.webContents.focus();await wait();
const divider=await js('(()=>{const r=document.querySelector(".library-qa-resizer").getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+80)}})()');
const beforeWidth=await js('document.querySelector(".library-qa-panel").getBoundingClientRect().width');
win.webContents.sendInputEvent({type:'mouseMove',...divider});win.webContents.sendInputEvent({type:'mouseDown',button:'left',clickCount:1,...divider});await wait();win.webContents.sendInputEvent({type:'mouseMove',modifiers:['leftButtonDown'],x:divider.x-120,y:divider.y});await wait();win.webContents.sendInputEvent({type:'mouseUp',button:'left',clickCount:1,x:divider.x-120,y:divider.y});await wait();
console.log('Resize check',divider,beforeWidth,await js('({width:document.querySelector(".library-qa-panel").getBoundingClientRect().width,value:document.querySelector(".library-qa-resizer").getAttribute("aria-valuenow"),columns:getComputedStyle(document.querySelector(".library-reader-layout")).gridTemplateColumns})'));
assert.ok(await js('document.querySelector(".library-qa-panel").getBoundingClientRect().width')>beforeWidth+80,'Dragging grows QA panel');
assert.equal(await js('document.querySelector(".library-reader-toolbar").scrollWidth>document.querySelector(".library-reader-toolbar").clientWidth'),false);
assert.equal(await js('!!document.querySelector(".library-qa-range small, .library-qa-composer>p")'),false);
await js('document.querySelector("button[aria-label=选择图书回答策略]").click()');await wait();
assert.equal(await js('document.querySelectorAll(".library-qa-strategies button").length'),2);
assert.ok((await js('document.querySelector(".library-qa-strategies").innerText')).includes('普通 RAG'));
assert.ok((await js('document.querySelector(".library-qa-strategies").innerText')).includes('方案 2 · 多路证据覆盖'));
fs.writeFileSync(join(__dirname,'qa-strategies.png'),(await win.webContents.capturePage()).toPNG());
await js('document.querySelector(".library-qa-strategies button").click()');await wait();
assert.equal(await js('!!document.querySelector(".library-qa-strategies")'),false);
const originalSession=await js('document.querySelector("select[aria-label=图书问答会话]").value');
const setQuestion=async value=>{await js("(()=>{const e=document.querySelector('textarea[aria-label=向图书提问]');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,"+JSON.stringify(value)+");e.dispatchEvent(new Event('input',{bubbles:true}))})()");await wait();};
await setQuestion('铜钥匙交给谁？');await js("document.querySelector('button[aria-label=发送图书问题]').click()");await wait();assert.ok((await js('document.querySelector(".library-qa-messages").innerText')).includes('铜钥匙交给谁'));
for(let i=0;i<30;i++){if(!await js('!!document.querySelector("button[aria-label=停止图书回答]")'))break;await wait();}
assert.ok((await js('document.querySelector(".library-qa-answer").innerText')).includes('苏禾'));assert.ok((await js('document.querySelector(".library-qa-meta").innerText')).includes('普通 RAG'));assert.ok(await js('!!document.querySelector(".library-qa-answer strong")'));
await js('document.querySelector("button[aria-label=图书上下文与缓存用量]").click()');await wait();assert.ok((await js('document.querySelector(".library-qa-usage-details").innerText')).includes('50.0%'));await js('document.querySelector("button[aria-label=图书上下文与缓存用量]").click()');
await js('document.querySelector("button[aria-label=选择图书模型与思考深度]").click()');await wait();assert.ok(await js('!!document.querySelector(".composer-thinking-section")'));fs.writeFileSync(join(__dirname,'qa-model-popover.png'),(await win.webContents.capturePage()).toPNG());await js("Array.from(document.querySelectorAll('.composer-thinking-section button')).find(b=>b.textContent==='中').click()");await js('document.querySelector("button[aria-label=选择图书模型与思考深度]").click()');assert.ok((await js('document.querySelector("button[aria-label=选择图书模型与思考深度]").innerText')).includes('中'));

for(const mode of ['light','dark']){await js('qaTheme('+JSON.stringify(mode)+')');await wait();fs.writeFileSync(join(__dirname,'qa-'+mode+'.png'),(await win.webContents.capturePage()).toPNG());assert.equal(await js('document.querySelector(".library-qa-panel").scrollWidth>document.querySelector(".library-qa-panel").clientWidth'),false);}
await js('document.querySelector(".library-qa-cite").click()');await wait();assert.ok(await js('!!document.querySelector(".library-qa-evidence mark")'));await click('阅读原文');await wait();assert.ok(await js('!!document.querySelector(".library-prose mark")'));
await js('document.querySelector("button[aria-label=关闭图书问答]").click()');await wait();await js("Array.from(document.querySelectorAll('.library-model-entry button')).find(b=>b.textContent==='图书问答').click()");await wait();assert.ok((await js('document.querySelector(".library-qa-answer").innerText')).includes('苏禾'),'History survives close/reopen');
await setQuestion('慢一点回答');await js("document.querySelector('button[aria-label=发送图书问题]').click()");await wait();assert.equal(await js('document.querySelector("button[aria-label=选择图书回答策略]").disabled'),true);await js("document.querySelector('button[aria-label=停止图书回答]').click()");await wait();assert.ok((await js('document.querySelector(".library-qa-messages").innerText')).includes('已停止'));
await setQuestion('保留草稿');await js('document.querySelector("button[aria-label=关闭图书问答]").click()');await wait();await js("Array.from(document.querySelectorAll('.library-model-entry button')).find(b=>b.textContent==='图书问答').click()");await wait();assert.equal(await js('document.querySelector("textarea").value'),'保留草稿');
assert.equal(await js('document.querySelector("select[aria-label=问答阅读范围]").value'),'whole');
const countBefore=await js('document.querySelectorAll(".library-qa-turn").length');
await select('select[aria-label="问答阅读范围"]','custom');await setInput('input[aria-label="检索起始页"]','2');await setInput('input[aria-label="检索结束页"]','3');await js("Array.from(document.querySelectorAll('.library-qa-range button')).find(b=>b.textContent==='应用').click()");await wait();assert.equal(await js('document.querySelectorAll(".library-qa-turn").length'),countBefore,'Range change preserves conversation');
await js('document.querySelector("button[aria-label=关闭图书问答]").click()');await wait();await js("Array.from(document.querySelectorAll('.library-model-entry button')).find(b=>b.textContent==='图书问答').click()");await wait();assert.equal(await js('document.querySelector("input[aria-label=检索起始页]").value'),'2');assert.equal(await js('document.querySelector("input[aria-label=检索结束页]").value'),'3');
await js('document.querySelector(".library-qa-debug-button").click()');await wait();assert.ok((await js('document.querySelector(".library-qa-debug").innerText')).includes('网关最终系统提示词'));fs.writeFileSync(join(__dirname,'qa-debug.png'),(await win.webContents.capturePage()).toPNG());await js('document.querySelector("button[aria-label=关闭调试信息]").click()');

await js('document.querySelector("button[aria-label=新建图书会话]").click()');await wait();assert.equal(await js('document.querySelectorAll(".library-qa-turn").length'),0,'New session starts empty');assert.equal(await js('document.querySelector("textarea").value'),'');
await setQuestion('新的问题');await js("document.querySelector('button[aria-label=发送图书问题]').click()");
for(let i=0;i<30;i++){await wait();if(!await js('!!document.querySelector("button[aria-label=停止图书回答]")'))break;}
assert.ok(await js('!!document.querySelector(".library-qa-answer")'));
await js('document.querySelector("button[aria-label=删除图书会话]").click()');await wait();await click('取消');assert.ok(await js('!!document.querySelector(".library-qa-answer")'));
await js('document.querySelector("button[aria-label=删除图书会话]").click()');await wait();await click('删除会话');await wait();assert.equal(await js('document.querySelector("select[aria-label=图书问答会话]").options.length'),1);
await select('select[aria-label="图书问答会话"]',originalSession);await wait();assert.ok(await js('document.querySelectorAll(".library-qa-turn").length>0'),'Original session preserved');assert.equal(await js('document.querySelector("textarea").value'),'保留草稿');
await js('document.querySelector("button[aria-label=重命名图书会话]").click()');await wait();await setInput('input[aria-label="会话名称"]','人物关系讨论');await click('保存名称');assert.ok((await js('document.querySelector("select[aria-label=图书问答会话]").innerText')).includes('人物关系讨论'));
win.setSize(800,760);await js("document.documentElement.style.setProperty('--ui-font-adjust','3px')");await wait();assert.equal(await js('document.querySelector(".library-qa-panel").scrollWidth>document.querySelector(".library-qa-panel").clientWidth'),false);fs.writeFileSync(join(__dirname,'qa-narrow.png'),(await win.webContents.capturePage()).toPNG());
await js('document.querySelector("button[aria-label=关闭图书问答]").click()');
await js("Array.from(document.querySelectorAll('.library-model-entry button')).find(b=>b.textContent==='图书问答').click()");await wait();assert.ok((await js('document.querySelector("select[aria-label=图书问答会话]").innerText')).includes('人物关系讨论'));
await js('document.querySelector("button[aria-label=删除图书会话]").click()');await wait();await click('删除会话');await wait();assert.ok((await js('document.querySelector(".library-qa-panel").innerText')).includes('暂无会话'));
await js('document.querySelector("button[aria-label=关闭图书问答]").click()');await wait();await js("Array.from(document.querySelectorAll('.library-model-entry button')).find(b=>b.textContent==='图书问答').click()");await wait();assert.ok((await js('document.querySelector(".library-qa-panel").innerText')).includes('暂无会话'),'Deleted last session must not return');
console.log('PASS isolated UI: model probes, cases, EPUB import, index preparation/build/preview/rebuild cancel, light/dark/narrow. Uses mock vectors with real SQLite/LanceDB.');await service.dispose();server.close();app.exit(0);
}catch(e){console.error(e);await service?.dispose();server?.close();app.exit(1)}});
`);
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(require('electron'), [join(root, 'main.cjs')], { env, stdio: 'inherit', windowsHide: true });
const timer = setTimeout(() => child.kill(), 120_000);
child.once('exit', code => { clearTimeout(timer); process.exitCode = code ?? 1; });
