// Isolated latency UI fixtures; no real book, report, or GPU service is accessed.
import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const root = resolve('.cache/library-evaluation-timings', String(Date.now()));
await mkdir(root, { recursive: true });
const book = { id: 'a'.repeat(64), title: '耗时验收样书', format: 'txt', chapters: [], addedAt: 1, chapter: 0 };
const score = { required: 1, complete: 1, recall: 1, coverage: 1, all: true, evidence: [{ id: 'e1', complete: true, coverage: 1 }] };
const rows = [1000, 2000, 9000].map((elapsedMs, i) => ({ id: `Q${i + 1}`, question: `验收问题 ${i + 1}`, difficulty: ['简单', '中等', '困难'][i], state: 'completed', elapsedMs,
  timings: { setupMs: 1, keywordMs: 20, embeddingMs: 30, vectorMs: 50, fusionMs: 1, rerankMs: elapsedMs - 120, retrievalMs: elapsedMs - 10, contextMs: 7, scoringMs: 3 },
  warnings: [], gold: [{ id: 'e1', quote: '原文证据', supports: '支持答案', span: { chapter: 0, start: 0, end: 4 } }], hits: [{id:'h1',ordinal:0,title:'验收章节',chapter:0,start:0,end:1000*(i+1),text:'原文证据'.repeat(250*(i+1))}], stages: { raw8: score, expanded6: score } }));
const report = { schema: 1, runId:'r1', book: book.id, dataset: 'fixture', datasetHash: 'fixture', note: '独立测试样本', version: 'v1', source: 'source', indexModel: 'fixture', settings: {}, startedAt: 10000, finishedAt: 22200, preparationMs: 200, rows, summary: {} };
await writeFile(join(root, 'renderer.tsx'), `
import {createRoot} from 'react-dom/client';
import LibraryEvaluationDialog from '../../../src/renderer/modules/smart-library/LibraryEvaluationDialog';
import {TooltipProvider} from '../../../src/renderer/components/ui/tooltip';
import {workspaceThemeCss,applyWorkspaceAppearance} from '../../../src/renderer/lib/workspace-theme';
import '../../../src/renderer/modules/smart-library/library.css';
let report=${JSON.stringify(report)};
window.piDesktop={library:{strategyProfiles:async()=>[{id:'standard-rag',name:'普通 RAG',revision:1}],evaluationRuns:async()=>[{runId:'r1',profileId:'standard-rag',name:'普通 RAG',revision:1,startedAt:10000,state:'completed',datasetHash:'fixture',completed:3,total:3,recall:1,coverage:1,meanMs:4000,meanReturnedChars:2000}],evaluate:async()=>({state:'completed',completed:3,total:3,report}),modelRuntime:async()=>({state:'ready',managedRequired:true,owned:false,busy:false})}};
URL.createObjectURL=blob=>{window.qaExport=blob.text().then(JSON.parse);return 'blob:fixture'};HTMLAnchorElement.prototype.click=function(){window.qaDownload=this.download};
window.qaOldReport=()=>{report={...report,preparationMs:undefined,rows:report.rows.map(({timings,...row})=>row)}};
window.qaTheme=mode=>applyWorkspaceAppearance(document.documentElement,'gray','theme',mode,false);
const style=document.createElement('style');style.textContent=workspaceThemeCss();document.head.append(style);window.qaTheme('light');
createRoot(document.getElementById('root')).render(<TooltipProvider><LibraryEvaluationDialog book={${JSON.stringify(book)}} onClose={()=>{}}/></TooltipProvider>);
`);
await build({ entryPoints: [join(root, 'renderer.tsx')], bundle: true, platform: 'browser', format: 'iife', jsx: 'automatic', outfile: join(root, 'renderer.js') });
const css = (await readFile('dist/renderer/index.html', 'utf8')).match(/href="(\.\/assets\/[^"<>]+\.css)"/)[1];
await writeFile(join(root, 'index.html'), `<html><head><meta charset="utf-8"><link rel="stylesheet" href="${pathToFileURL(resolve('dist/renderer', css))}"><link rel="stylesheet" href="renderer.css"><style>html,body,#root{margin:0;width:100%;height:100%;overflow:hidden}</style></head><body><div id="root"></div><script src="renderer.js"></script></body></html>`);
await writeFile(join(root, 'main.cjs'), `
const {app,BrowserWindow}=require('electron');const {join}=require('node:path');const fs=require('node:fs/promises');const assert=require('node:assert/strict');
app.setPath('userData',join(__dirname,'profile'));
app.disableHardwareAcceleration();
app.whenReady().then(async()=>{try{
  const win=new BrowserWindow({width:1200,height:850,show:false,webPreferences:{offscreen:true,backgroundThrottling:false,nodeIntegration:false,contextIsolation:false}});
  const errors=[];win.webContents.on('console-message',(_,level,message)=>{if(level>=3)errors.push(message)});
  await win.loadFile(join(__dirname,'index.html'));const js=code=>win.webContents.executeJavaScript(code,true);
  const wait=ms=>new Promise(r=>setTimeout(r,ms));const until=async code=>{for(let i=0;i<100;i++){if(await js(code))return;await wait(50)}throw Error('Timeout: '+code)};
  const click=label=>js('document.querySelector('+JSON.stringify('button[aria-label="'+label+'"]')+').click()');
  await until('document.querySelector("[aria-label=评测耗时统计]")?.innerText.includes("4.00 秒")');
  assert.match(await js('document.querySelector("[aria-label=评测耗时统计]").innerText'),/P50\\s*2.00 秒/);
  assert.match(await js('document.querySelector("[aria-label=评测耗时统计]").innerText'),/P95\\s*9.00 秒/);
  assert.equal(await js('document.querySelectorAll(".library-evaluation-results th")[3].textContent'),'返回字符');
  assert.equal(await js('document.querySelectorAll(".library-evaluation-results th")[4].textContent'),'耗时');
  assert.match(await js('document.querySelector("[aria-label=平均返回片段字符数]").innerText'),/2,000 字符/);
  assert.equal(await js('document.querySelectorAll(".library-evaluation-results tbody tr:first-child td")[3].textContent'),'1,000 字符');
  await js('document.querySelector(".library-evaluation-compare").open=true');await until('document.querySelector(".library-evaluation-dialog").classList.contains("is-comparing") && document.querySelector(".library-evaluation-compare-table")?.getBoundingClientRect().height>50');
  assert.match(await js('document.querySelector(".library-evaluation-compare-table").innerText'),/2,000 字符/);win.webContents.invalidate();await wait(250);
  await fs.writeFile(join(__dirname,'comparison-chars.png'),(await win.webContents.capturePage()).toPNG());await js('document.querySelector(".library-evaluation-compare").open=false');
  await click('配置与评分说明');await until('!!document.querySelector("table[aria-label=分阶段耗时统计]")');
  assert.match(await js('document.querySelector("table[aria-label=分阶段耗时统计]").innerText'),/重排/);
  await click('关闭说明');await click('查看 Q1 详情');await until('!!document.querySelector("[aria-label=单题分阶段耗时]")');
  assert.match(await js('document.querySelector("[aria-label=单题分阶段耗时]").innerText'),/重排\\s*0.88 秒/);
  assert.match(await js('document.querySelector("dialog[aria-label=评测题目详情] header").innerText'),/返回 1,000 字符/);
  await click('关闭题目详情');
  await js('document.querySelectorAll(".library-evaluation-groups button")[3].click()');
  assert.match(await js('document.querySelector("[aria-label=评测耗时统计]").innerText'),/单题平均\\s*9.00 秒/);
  assert.match(await js('document.querySelector("[aria-label=平均返回片段字符数]").innerText'),/3,000 字符/);
  await js('document.querySelectorAll(".library-evaluation-groups button")[0].click()');
  await js('Array.from(document.querySelectorAll("button")).find(b=>b.textContent==="导出").click()');const exported=await js('qaExport');assert.equal(exported.report.rows[1].returnedCharacters,2000);assert.equal(exported.report.returnedCharacterStatistics.hard.meanChars,3000);assert.equal(exported.report.returnedCharacterStatistics.all.meanChars,2000);
  for(const mode of ['light','dark']) {
    await js('qaTheme('+JSON.stringify(mode)+')');win.webContents.invalidate();await wait(250);
    assert.equal(await js('document.querySelector("dialog").scrollWidth>document.querySelector("dialog").clientWidth'),false);
    await fs.writeFile(join(__dirname,mode+'.png'),(await win.webContents.capturePage()).toPNG());
  }
  win.setSize(560,760);await wait(250);win.webContents.invalidate();await wait(250);
  await fs.writeFile(join(__dirname,'narrow-layout.json'),JSON.stringify(await js('({viewport:[innerWidth,innerHeight],items:Array.from(document.querySelectorAll(".library-evaluation-dialog,.library-evaluation-dialog>header,.library-evaluation-results,.library-evaluation-dialog>footer,.library-evaluation-dialog>footer>span,.library-evaluation-dialog>footer>div")).map(e=>({tag:e.tagName,class:e.className,rect:e.getBoundingClientRect().toJSON(),flex:getComputedStyle(e).flex,minHeight:getComputedStyle(e).minHeight,height:getComputedStyle(e).height,display:getComputedStyle(e).display}))})'),null,2));
  assert.equal(await js('document.querySelector("dialog").scrollWidth>document.querySelector("dialog").clientWidth'),false);
  await fs.writeFile(join(__dirname,'narrow.png'),(await win.webContents.capturePage()).toPNG());
  assert.ok(await js('document.querySelector(".library-evaluation-results").clientHeight>100'));
  await js('qaOldReport()');await until('document.querySelectorAll(".library-evaluation-results tbody tr").length===3');await wait(1400);
  assert.match(await js('document.querySelector("[aria-label=平均返回片段字符数]").innerText'),/2,000 字符/,'legacy reports use saved passages');
  await click('配置与评分说明');await until('document.querySelector("dialog[aria-label=评测配置与评分说明]")?.innerText.includes("旧报告仅记录单题总耗时")');
  assert.equal(await js('document.querySelectorAll("table[aria-label=分阶段耗时统计] tbody tr").length'),1);
  assert.deepEqual(errors,[]);console.log('PASS evaluation UI: returned character counts, groups, comparisons/export/legacy reports, latency statistics, light/dark/narrow.');app.exit(0);
}catch(error){console.error(error);app.exit(1)}});
`);
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(createRequire(import.meta.url)('electron'), [join(root, 'main.cjs')], { env, stdio: 'inherit', windowsHide: true });
const timer = setTimeout(() => child.kill(), 30000);
child.once('exit', code => { clearTimeout(timer); process.exitCode = code ?? 1; });
