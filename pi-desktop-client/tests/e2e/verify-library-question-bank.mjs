// Uses the real novel read-only; approvals/edits are confined to an isolated test directory.
import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
const root=resolve('.cache/library-question-bank/ui');await mkdir(root,{recursive:true});
await writeFile(join(root,'renderer.tsx'),`
import {createRoot} from 'react-dom/client';
import {LibraryWorkspace} from '../../../src/renderer/modules/smart-library/LibraryRendererModule';
import {TooltipProvider} from '../../../src/renderer/components/ui/tooltip';
import {workspaceThemeCss,applyWorkspaceAppearance} from '../../../src/renderer/lib/workspace-theme';
const style=document.createElement('style');style.textContent=workspaceThemeCss();document.head.append(style);
document.documentElement.dataset.workspace='smart-library';
window.qaTheme=mode=>applyWorkspaceAppearance(document.documentElement,'gray','theme',mode,false);window.qaTheme('light');
createRoot(document.getElementById('root')).render(<TooltipProvider><div style={{display:'flex',height:'100vh'}}><LibraryWorkspace/></div></TooltipProvider>);
`);
await build({entryPoints:[join(root,'renderer.tsx')],bundle:true,platform:'browser',format:'iife',jsx:'automatic',outfile:join(root,'renderer.js')});
await build({entryPoints:['src/main/smart-library/question-bank/bank-service.ts'],bundle:true,platform:'node',format:'cjs',outfile:join(root,'service.cjs')});
await build({entryPoints:['src/main/smart-library/question-bank/bank-worker.ts'],bundle:true,platform:'node',format:'cjs',outfile:join(root,'library-question-bank.cjs')});
const css=(await readFile('dist/renderer/index.html','utf8')).match(/href="(\.\/assets\/[^"<>]+\.css)"/)[1];
await writeFile(join(root,'index.html'),`<html><head><meta charset="utf-8"><link rel="stylesheet" href="${pathToFileURL(resolve('dist/renderer',css))}"><link rel="stylesheet" href="renderer.css"><style>html,body,#root{width:100%;min-width:0;margin:0;overflow:hidden}</style></head><body><div id="root"></div><script src="renderer.js"></script></body></html>`);
await writeFile(join(root,'preload.cjs'),`const {contextBridge,ipcRenderer}=require('electron');contextBridge.exposeInMainWorld('piDesktop',{library:Object.fromEntries(['list','chapter','remember','questionBank','questionBankEvidence'].map(k=>[k,(...a)=>ipcRenderer.invoke('fixture:'+k,...a)]))});`);
await writeFile(join(root,'batch.json'),await readFile('resources/smart-library/question-bank/candidates.json'));
await writeFile(join(root,'main.cjs'),`
const {app,BrowserWindow,ipcMain}=require('electron'),fs=require('node:fs/promises'),{join}=require('node:path'),assert=require('node:assert/strict');
const {LibraryQuestionBankService}=require('./service.cjs'),batch=require('./batch.json');let service;
app.setPath('userData',join(__dirname,'profile'));
app.whenReady().then(async()=>{try{
  const real=join(process.env.APPDATA,'pi-desktop-client','modules','smart-library'),id=batch.source_sha256;
  const book=JSON.parse(await fs.readFile(join(real,id,'book.json'),'utf8'));book.chapter=0;
  const data=join(__dirname,'fixture-'+process.pid+'-'+Date.now());await fs.mkdir(join(data,id),{recursive:true});
  await fs.copyFile(join(real,id,'original.txt'),join(data,id,'original.txt'));await fs.writeFile(join(data,id,'book.json'),JSON.stringify(book));
  service=new LibraryQuestionBankService(data);
  const resident=await service.list(id);assert.equal(resident.entries.length,200);
  assert.ok(resident.entries.every(e=>e.status==='approved'&&e.published));
  assert.equal((await service.published(id)).length,200);
  await fs.mkdir(join(data,'question-bank'),{recursive:true});
  const kept={...resident.entries[0],revision:7,status:'pending',published:false,reviewNote:'保留原有备注',question:{...resident.entries[0].question,answer:'保留人工修改答案'}};
  const retired={...resident.entries[0],question:{...resident.entries[0].question,sample_id:'S001'}};
  await fs.writeFile(join(data,'question-bank',id+'.json'),JSON.stringify({...resident,residentGeneration:undefined,entries:[kept,...resident.entries.slice(1),retired]}));
  const migrated=await service.list(id);assert.equal(migrated.entries.length,200);assert.deepEqual(migrated.entries[0],kept);
  assert.equal(JSON.parse(await fs.readFile(join(data,'question-bank',id+'.json'),'utf8')).entries.length,200);
  console.log('PASS resident defaults and retirement migration: old ID removed from disk, retained edit/revision/notes unchanged.');
  // Exercise manual review/bulk actions on isolated pending records only.
  await fs.writeFile(join(data,'question-bank',id+'.json'),JSON.stringify({...resident,entries:resident.entries.map(e=>({...e,status:'pending',published:false}))}));
  const bank=await service.list(id);
  assert.equal(bank.entries.length,batch.questions.length);assert.ok(bank.entries.every(e=>e.status==='pending'&&!e.published));
  for(const difficulty of ['简单','中等','困难'])assert.equal(bank.entries.filter(e=>e.question.difficulty===difficulty).length,batch.questions.filter(q=>q.difficulty===difficulty).length);
  assert.equal((await service.published(id)).length,0);
  await assert.rejects(service.review(id,{id:'S011',revision:0,action:'publish'}),/审核通过/);
  let count=0;for(const entry of bank.entries){for(const e of entry.question.evidence){const value=await service.evidence(id,entry.question.sample_id,e.evidence_id);assert.equal(value.text.slice(value.highlight.start,value.highlight.end),e.quote.replace(/\\r\\n?/g,'\\n').replace(/[ \\t]+\\n/g,'\\n').replace(/\\n{3,}/g,'\\n\\n'));assert.equal(typeof value.page,'number');count++;}}
  console.log('PASS real source',count,'candidate evidence citations and reading-page positions; all',batch.questions.length,'remain pending.');
  ipcMain.handle('fixture:list',()=>[book]);ipcMain.handle('fixture:chapter',(_,id,page)=>fs.readFile(join(real,id,page+'.txt'),'utf8'));ipcMain.handle('fixture:remember',()=>{});
  ipcMain.handle('fixture:questionBank',(_,id,action)=>action?service.review(id,action):service.list(id));ipcMain.handle('fixture:questionBankEvidence',(_,id,q,e)=>service.evidence(id,q,e));
  const win=new BrowserWindow({show:false,width:1260,height:850,webPreferences:{preload:join(__dirname,'preload.cjs'),contextIsolation:true,backgroundThrottling:false}}),errors=[];
  win.webContents.on('console-message',(_,level,message)=>{if(level===3)errors.push(message);});
  await win.loadFile(join(__dirname,'index.html'));win.showInactive();
  const js=async s=>{try{return await win.webContents.executeJavaScript(s);}catch(e){console.error('Failed renderer script:',s);throw e;}},wait=ms=>new Promise(r=>setTimeout(r,ms));
  const until=async s=>{for(let i=0;i<120;i++){if(await js(s))return;await wait(100);}throw Error('Timeout '+s);};
  const click=async label=>{await js('Array.from(document.querySelectorAll("button")).find(b=>b.textContent.trim()==='+JSON.stringify(label)+').click()');};
  await until('!!document.querySelector(".library-book")');await js('document.querySelector(".library-book").click()');
  await until('!!document.querySelector("button[aria-label=题库与审核]")');await js('document.querySelector("button[aria-label=题库与审核]").click()');
  await until('document.querySelectorAll(".library-bank-list>button").length==='+batch.questions.length);
  const expanded=batch.questions.filter(q=>q.generation==='fanren-expansion-v2');
  if(expanded.length){
    assert.equal(await js('document.querySelector("select[aria-label=题库批次]")===null'),true);
    await until('document.querySelectorAll(".library-bank-list>button").length==='+expanded.length);
    const hard=expanded.find(q=>q.difficulty==='困难');
    await js('Array.from(document.querySelectorAll(".library-bank-list>button")).find(b=>b.textContent.includes('+JSON.stringify(hard.sample_id)+')).click()');
    await until('document.querySelector(".library-bank-review").textContent.includes("跨章节证据为何必要")');
    assert.ok(await js('document.querySelector(".library-bank-review").textContent.includes('+JSON.stringify(hard.cross_chapter_reason)+')'));
    await until('document.querySelectorAll(".library-bank-list>button").length==='+batch.questions.length);
  }
  await js('document.querySelector(".library-bank-list>button").click()');
  await until('!!document.querySelector(".library-bank-review-heading")');
  assert.equal(await js('Array.from(document.querySelectorAll(".library-bank-actions button")).find(b=>b.textContent.includes("加入评测")).disabled'),true);
  for(const mode of ['light','dark']){await js('qaTheme('+JSON.stringify(mode)+')');await wait(400);assert.equal(await js('document.querySelector(".library-bank-dialog").scrollWidth>document.querySelector(".library-bank-dialog").clientWidth'),false);await fs.writeFile(join(__dirname,mode+'.png'),(await win.webContents.capturePage()).toPNG());}
  await js('Array.from(document.querySelectorAll("button")).find(b=>b.getAttribute("aria-label")==="查看题库证据 1").click()');await until('!!document.querySelector("dialog[aria-label=题库证据原文]")');
  assert.ok(await js('document.querySelector("dialog[aria-label=题库证据原文] mark").textContent.length>20'));await wait(400);await fs.writeFile(join(__dirname,'citation.png'),(await win.webContents.capturePage()).toPNG());await js('document.querySelector("button[aria-label=关闭引用]").click()');
  await click('通过审核');await until('document.querySelector(".library-bank-review-heading").innerText.includes("已通过")');assert.equal((await service.published(id)).length,0);
  await click('加入评测');await until('document.querySelector(".library-bank-review-heading").innerText.includes("已入评测")');assert.equal((await service.published(id)).length,1);
  const approved=(await service.list(id)).entries.find(e=>e.question.sample_id==='S011');await assert.rejects(service.review(id,{id:'S011',revision:0,action:'reject'}),/已更新/);
  await service.dispose();service=new LibraryQuestionBankService(data);assert.equal((await service.published(id)).length,1);
  await js('document.querySelector("button[aria-label=编辑题目与答案]").click()');await until('!!document.querySelector("textarea[aria-label=编辑参考答案]")');
  assert.equal(await js('document.querySelector("button[aria-label=关闭题库]").disabled'),true);
  assert.ok(await js('Array.from(document.querySelectorAll(".library-bank-bulk button")).every(b=>b.disabled)'));
  await click('保存并待审');await until('document.querySelector(".library-bank-review-heading").innerText.includes("待审核")');assert.equal((await service.published(id)).length,0);
  if(expanded.length){
    const records=join(data,'question-bank',id+'.json'),before=await fs.readFile(records,'utf8');
    const first=expanded[1].sample_id,second=expanded[2].sample_id;
    await assert.rejects(service.review(id,{action:'approve_many',publish:true,entries:[{id:first,revision:0},{id:second,revision:99}]}),/已更新/);
    assert.equal(await fs.readFile(records,'utf8'),before);
    const corrupt=JSON.parse(before);corrupt.entries.find(e=>e.question.sample_id===second).question.evidence[0].end_utf16++;
    const invalid=JSON.stringify(corrupt);await fs.writeFile(records,invalid);
    try{
      await assert.rejects(service.review(id,{action:'approve_many',publish:true,entries:[{id:first,revision:0},{id:second,revision:0}]}),/坐标/);
      assert.equal(await fs.readFile(records,'utf8'),invalid);
    }finally{await fs.writeFile(records,before);}
    await js('(()=>{const s=document.querySelector("select[aria-label=题库难度]");s.value="简单";s.dispatchEvent(new Event("change",{bubbles:true}));})()');
    const simple=expanded.filter(q=>q.difficulty==='简单');
    await until('document.querySelectorAll(".library-bank-list>button").length==='+simple.length);
    await click('批量通过 ('+simple.length+')');
    await until('document.querySelector("footer [role=status]").textContent.includes("已批量通过")');
    let updated=await service.list(id);assert.equal(updated.entries.filter(e=>e.status==='approved').length,simple.length);assert.equal((await service.published(id)).length,0);
    await click('通过并加入评测 ('+simple.length+')');
    await until('document.querySelector("footer [role=status]").textContent.includes("已通过并加入评测")');
    assert.equal((await service.published(id)).length,simple.length);
    await js('(()=>{const s=document.querySelector("select[aria-label=题库难度]");s.value="全部难度";s.dispatchEvent(new Event("change",{bubbles:true}));})()');
    await until('Array.from(document.querySelectorAll(".library-bank-bulk button")).some(b=>b.textContent.includes("通过并加入评测 ('+(expanded.length-simple.length)+')"))');
    await click('通过并加入评测 ('+(expanded.length-simple.length)+')');
    await until('document.querySelectorAll(".library-bank-list>button").length==='+expanded.length+'&&Array.from(document.querySelectorAll(".library-bank-bulk button")).every(b=>b.disabled)');
    assert.equal((await service.published(id)).length,expanded.length);
    await service.dispose();service=new LibraryQuestionBankService(data);updated=await service.list(id);
    assert.equal((await service.published(id)).length,expanded.length);
    assert.ok(updated.entries.filter(e=>e.question.generation!=='fanren-expansion-v2').every(e=>e.status==='pending'&&!e.published));
    await until('document.querySelectorAll(".library-bank-list>button").length==='+batch.questions.length);
    await js('document.querySelector(".library-bank-list>button").click()');
    console.log('PASS bulk actions: filtered approval, approval+publication, unchanged original batch, durable records and all-or-nothing stale/source validation failures.');
  }
  win.setSize(520,720);await wait(400);assert.equal(await js('document.querySelector(".library-bank-dialog").scrollWidth>document.querySelector(".library-bank-dialog").clientWidth'),false);
  assert.equal(await js('getComputedStyle(document.querySelector(".library-bank-list")).display'),'none');await fs.writeFile(join(__dirname,'narrow.png'),(await win.webContents.capturePage()).toPNG());
  await js('document.querySelector("button[aria-label=返回题目列表]").click()');assert.equal(await js('getComputedStyle(document.querySelector(".library-bank-review")).display'),'none');
  await js('document.querySelector(".library-bank-list>button").click()');await js('Array.from(document.querySelectorAll("button")).find(b=>b.getAttribute("aria-label")==="查看题库证据 1").click()');await until('!!document.querySelector("dialog[aria-label=题库证据原文]")');await click('阅读原文');await until('!document.querySelector("dialog")');assert.ok(await js('document.querySelector(".library-prose mark").textContent.length>20'));
  assert.deepEqual(errors,[]);console.log('PASS review UI: light/dark/narrow, citations, explicit approval/publication, durable records, stale actions, edit revocation and reader jump; writes isolated to test fixture.');
  await service.dispose();app.exit(0);
}catch(e){console.error(e);await service?.dispose();app.exit(1)}});
`);
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
const child=spawn(createRequire(import.meta.url)('electron'),[join(root,'main.cjs')],{env,stdio:'inherit',windowsHide:true});
await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',code=>code?reject(Error('Verification exited '+code)):resolve());});
