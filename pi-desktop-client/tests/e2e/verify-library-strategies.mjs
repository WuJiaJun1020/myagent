// Isolated UI: editable strategy profiles, scoped index calls and comparison controls.
import {build} from 'esbuild';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
const root=resolve('.cache/library-strategies-ui',String(Date.now()));await mkdir(root,{recursive:true});
await writeFile(join(root,'renderer.tsx'),`
import {createRoot} from 'react-dom/client';import {useState} from 'react';
import LibraryStrategyDialog from '../../../src/renderer/modules/smart-library/LibraryStrategyDialog';
import LibraryEvaluationDialog from '../../../src/renderer/modules/smart-library/LibraryEvaluationDialog';
import {defaultStrategyProfile,coverageStrategyProfile} from '../../../src/shared/contracts/library-strategy';
import {TooltipProvider} from '../../../src/renderer/components/ui/tooltip';
import {workspaceThemeCss,applyWorkspaceAppearance} from '../../../src/renderer/lib/workspace-theme';
import '../../../src/renderer/modules/smart-library/library.css';
let profiles=[defaultStrategyProfile(),coverageStrategyProfile()];const book={id:'a'.repeat(64),title:'策略验收样书',format:'txt',chapters:[{id:0,title:'章',characters:100}],addedAt:1,chapter:0};
const model={providerId:'fixture',modelId:'answer',name:'Fixture answer',reasoningLevels:['low','high']};
window.qaCalls=[];window.qaProfiles=()=>profiles;
let runtimeState='stopped';
const score={required:1,complete:1,recall:1,coverage:1,all:true,evidence:[{id:'e1',complete:true,coverage:1}]};
const makeReport=p=>({schema:1,runId:p.id==='standard-rag'?'r1':p.id,profile:p,stageLimits:{raw8:p.retrieval.returnedChunks,expanded6:p.context.chunks},dataset:'fixture',datasetHash:'same',book:book.id,version:'v1',source:'s',settings:p.localModels,startedAt:10000,finishedAt:12000,rows:[{id:'Q1',question:'铜钥匙给谁',difficulty:'简单',state:'completed',elapsedMs:1000,gold:[],hits:[],warnings:[],stages:{raw8:score,expanded6:score}}],summary:{expanded6:{complete:1,total:1,microRecall:1,macroRecall:1,macroCoverage:1,allQuestions:1}}});
const runs=()=>profiles.map(p=>({runId:p.id==='standard-rag'?'r1':p.id,profileId:p.id,name:p.name,revision:p.revision,startedAt:10000,state:'completed',datasetHash:'same',completed:1,total:1,recall:1,coverage:1,meanMs:1000}));
window.piDesktop={library:{
 strategyProfiles:async r=>{window.qaCalls.push(['profiles',r]);if(r?.action==='create'){const source=r.copyFrom?profiles.find(p=>p.id===r.copyFrom):defaultStrategyProfile();profiles=[...profiles,{...structuredClone(source),id:crypto.randomUUID(),name:source.name+' 副本',revision:1}]}if(r?.action==='save')profiles=profiles.map(p=>p.id===r.profile.id?{...structuredClone(r.profile),revision:p.revision+1}:p);return structuredClone(profiles)},
 qaModels:async()=>({models:[model],configured:model}),list:async()=>[book],
 modelRuntime:async action=>{window.qaCalls.push(['runtime',action]);if(action==='start'||action==='ensure')runtimeState='ready';if(action==='stop')runtimeState='stopped';return {state:runtimeState,managedRequired:true,owned:runtimeState==='ready',busy:false}},
 testLocalModel:async(...a)=>{window.qaCalls.push(['probe',...a]);await new Promise(r=>setTimeout(r,500));return {summary:'模型测试通过',elapsedMs:50,ranking:[1,0],scores:[{index:1,score:.9},{index:0,score:.1}],matched:true}},
 indexAction:async(...a)=>{window.qaCalls.push(['index',...a]);return {state:'ready',version:'v1',activeVersion:'v1',total:12,completed:12,chapters:1}},
 indexChunk:async()=>({ordinal:0,title:'章',text:'林舟把铜钥匙交给苏禾。',chapter:0,start:0,end:12}),
 evaluate:async(id,action,options)=>{window.qaCalls.push(['evaluate',id,action,options]);const p=profiles.find(p=>p.id===options?.profileId)??profiles[0];return {state:'completed',completed:1,total:1,report:makeReport(p)}},evaluationRuns:async()=>runs(),
}};
window.qaTheme=mode=>applyWorkspaceAppearance(document.documentElement,'gray','theme',mode,false);
const style=document.createElement('style');style.textContent=workspaceThemeCss();document.head.append(style);window.qaTheme('light');
function App(){const [open,setOpen]=useState('strategy');return <TooltipProvider><button onClick={()=>setOpen('strategy')}>打开策略</button><button onClick={()=>setOpen('evaluation')}>打开评测</button>{open==='strategy'&&<LibraryStrategyDialog book={book} onClose={()=>setOpen('')}/ >}{open==='evaluation'&&<LibraryEvaluationDialog book={book} onClose={()=>setOpen('')}/>}</TooltipProvider>}
createRoot(document.getElementById('root')).render(<App/>);
`);
await build({entryPoints:[join(root,'renderer.tsx')],bundle:true,platform:'browser',format:'iife',jsx:'automatic',outfile:join(root,'renderer.js')});
const css=(await readFile('dist/renderer/index.html','utf8')).match(/href="(\.\/assets\/[^"<>]+\.css)"/)[1];
await writeFile(join(root,'index.html'),`<html><head><meta charset="utf-8"><link rel="stylesheet" href="${pathToFileURL(resolve('dist/renderer',css))}"><link rel="stylesheet" href="renderer.css"><style>html,body,#root{margin:0;width:100%;height:100%;overflow:hidden}</style></head><body><div id="root"></div><script src="renderer.js"></script></body></html>`);
await writeFile(join(root,'main.cjs'),`
const {app,BrowserWindow}=require('electron');const {join}=require('node:path');const fs=require('node:fs/promises');const assert=require('node:assert/strict');app.setPath('userData',join(__dirname,'profile'));app.disableHardwareAcceleration();
app.whenReady().then(async()=>{try{
 const win=new BrowserWindow({width:1200,height:920,show:false,webPreferences:{offscreen:true,backgroundThrottling:false,contextIsolation:false}});
 const errors=[];win.webContents.on('console-message',(_,level,message)=>{if(level>=3)errors.push(message)});await win.loadFile(join(__dirname,'index.html'));
 const js=s=>win.webContents.executeJavaScript(s,true),wait=ms=>new Promise(r=>setTimeout(r,ms));
 const until=async s=>{for(let i=0;i<100;i++){if(await js(s))return;await wait(50)}throw Error('Timeout: '+s)};
 const click=async text=>{await js('Array.from(document.querySelectorAll("button")).find(b=>b.textContent==='+JSON.stringify(text)+').click()');await wait(100)};
 const input=async(label,value)=>{await js('(()=>{const e=document.querySelector('+JSON.stringify('[aria-label="'+label+'"]')+');const proto=e.tagName==="INPUT"?HTMLInputElement.prototype:HTMLTextAreaElement.prototype;Object.getOwnPropertyDescriptor(proto,"value").set.call(e,'+JSON.stringify(value)+');e.dispatchEvent(new Event("input",{bubbles:true}))})()');await wait(80)};
 const select=async(label,value)=>{await js('(()=>{const e=document.querySelector('+JSON.stringify('[aria-label="'+label+'"]')+');e.value='+JSON.stringify(value)+';e.dispatchEvent(new Event("change",{bubbles:true}))})()');await wait(80)};
 await until('!!document.querySelector("input[aria-label=方案名称]")');
 assert.equal(await js('document.querySelectorAll(".library-strategy-tabs button").length'),4);assert.equal(await js('qaCalls.filter(c=>c[0]==="runtime").length'),0,'configuration must not contact runtime');
 assert.equal(await js('!!document.querySelector("textarea[aria-label=方案说明]")'),false,'description belongs to a separate page');
 await click('说明');assert.equal(await js('document.querySelectorAll(".library-strategy-flow-branches>div").length'),2);assert.ok(await js('document.querySelector(".library-strategy-explanation").innerText.includes("仅有符合条件的历史时改写问题")'));
 await js('document.querySelectorAll("nav[aria-label=策略方案] button")[1].click()');await wait(100);assert.equal(await js('document.querySelector("#library-strategy-tab-description").getAttribute("aria-selected")'),'true','comparing explanations must keep the page');
 assert.ok(await js('document.querySelector(".library-strategy-flow").innerText.includes("最多 4 个子问题")'));
 await click('配置');await input('最多子问题',3);await click('说明');assert.ok(await js('document.querySelector(".library-strategy-flow").innerText.includes("最多 3 个子问题")'));assert.ok(await js('document.querySelector(".library-strategy-explanation-heading").innerText.includes("按当前草稿说明")'));
 await input('方案说明','跨章节证据覆盖的对照方案');await js('document.querySelectorAll("nav[aria-label=策略方案] button")[0].click()');await wait(100);assert.ok(await js('document.querySelector(".library-error").innerText.includes("未保存")'));assert.equal(await js('document.querySelector("textarea[aria-label=方案说明]").value'),'跨章节证据覆盖的对照方案');
 await click('完成');assert.ok(await js('document.querySelector("dialog footer").innerText.includes("尚未保存")'));await click('继续编辑');await click('保存方案');assert.equal(await js('qaProfiles()[1].description'),'跨章节证据覆盖的对照方案');assert.equal(await js('qaProfiles()[1].queryPlanning.maxSubqueries'),3);assert.equal(await js('qaProfiles()[1].revision'),2);assert.equal(await js('qaProfiles()[0].revision'),1);assert.equal(await js('document.querySelector("#library-strategy-tab-description").getAttribute("aria-selected")'),'true');
 await input('方案说明','待放弃的简介');await click('放弃修改');assert.equal(await js('document.querySelector("textarea[aria-label=方案说明]").value'),'跨章节证据覆盖的对照方案');
 for(const mode of ['light','dark']){await js('qaTheme('+JSON.stringify(mode)+')');await js('document.querySelector(".library-strategy-layout>main").scrollTop=0');win.webContents.invalidate();await wait(200);await fs.writeFile(join(__dirname,'explanation-'+mode+'.png'),(await win.webContents.capturePage()).toPNG());await js('document.querySelector(".library-strategy-explanation-detail").scrollIntoView({block:"start"})');await wait(100);await fs.writeFile(join(__dirname,'explanation-details-'+mode+'.png'),(await win.webContents.capturePage()).toPNG())}
 for(const width of [560,400]){win.setSize(width,760);await js('document.querySelector(".library-strategy-layout>main").scrollTop=0');await wait(200);assert.equal(await js('document.querySelector("dialog").scrollWidth>document.querySelector("dialog").clientWidth'),false);assert.equal(await js('document.querySelector(".library-strategy-layout>main").scrollWidth>document.querySelector(".library-strategy-layout>main").clientWidth'),false);await fs.writeFile(join(__dirname,'explanation-'+width+'.png'),(await win.webContents.capturePage()).toPNG())}win.setSize(1200,920);await wait(100);
 assert.equal(await js('qaCalls.filter(c=>["runtime","index","probe"].includes(c[0])).length'),0,'explanations must not load models or indexes');
 await click('配置');await select('方案检索方式','keyword');await js('document.querySelector(".library-strategy-check input").click()');await wait(100);await click('说明');assert.equal(await js('document.querySelectorAll(".library-strategy-flow-branches>div").length'),1);assert.ok(await js('document.querySelector(".library-strategy-explanation").innerText.includes("重排已关闭")'));assert.ok(await js('document.querySelector(".library-strategy-explanation").innerText.includes("整理当前召回排名")'));await click('放弃修改');await click('配置');
 await js('document.querySelectorAll("nav[aria-label=策略方案] button")[1].click()');await wait(100);
 assert.equal(await js('document.querySelector("select[aria-label=检索规划]").value'),'coverage');
 await input('最多子问题',3);await click('保存方案');assert.equal(await js('qaProfiles()[1].queryPlanning.maxSubqueries'),3);
 for(const mode of ['light','dark']){await js('qaTheme('+JSON.stringify(mode)+')');await js('document.querySelector("select[aria-label=检索规划]").scrollIntoView({block:"start"})');win.webContents.invalidate();await wait(200);assert.equal(await js('document.querySelector("dialog").scrollWidth>document.querySelector("dialog").clientWidth'),false);await fs.writeFile(join(__dirname,'coverage-'+mode+'.png'),(await win.webContents.capturePage()).toPNG())}
 win.setSize(560,760);await wait(200);assert.equal(await js('document.querySelector("dialog").scrollWidth>document.querySelector("dialog").clientWidth'),false);await fs.writeFile(join(__dirname,'coverage-narrow.png'),(await win.webContents.capturePage()).toPNG());win.setSize(1200,920);await wait(100);

 await select('检索规划','off');assert.ok(await js('!!document.querySelector("select[aria-label=问题改写]")'));
 await click('放弃修改');await js('document.querySelectorAll("nav[aria-label=策略方案] button")[0].click()');await wait(100);
 await click('复制');await input('方案名称','短片段＋每次改写');await input('片段长度',400);
 await select('问题改写','always');await select('问题处理模型',JSON.stringify(['fixture','answer']));await select('问题处理思考程度','high');await click('保存方案');
 assert.equal(await js('qaProfiles().at(-1).name'),'短片段＋每次改写');assert.equal(await js('qaProfiles().at(-1).chunking.size'),400);assert.deepEqual(await js('qaProfiles().at(-1).rewrite.model'),{providerId:'fixture',modelId:'answer'});assert.equal(await js('qaProfiles().at(-1).rewrite.reasoning'),'high');
 for(const mode of ['light','dark']){await js('qaTheme('+JSON.stringify(mode)+')');win.webContents.invalidate();await wait(200);assert.equal(await js('document.querySelector("dialog").scrollWidth>document.querySelector("dialog").clientWidth'),false);await fs.writeFile(join(__dirname,'config-'+mode+'.png'),(await win.webContents.capturePage()).toPNG())}
 await click('本地模型');await until('document.querySelector(".library-runtime-controls")?.innerText.includes("未启动")');await click('启动服务');await click('停止服务');
 await input('方案向量模型','fixture-embedding');await input('方案重排模型','fixture-reranker');
 await click('测试向量化');assert.equal(await js('document.querySelector("#library-strategy-tab-index").disabled'),true);assert.equal(await js('document.querySelector("button[aria-label=关闭策略管理]").disabled'),true);
 await until('document.querySelector(".library-model-panel")?.innerText.includes("模型测试通过")');assert.equal(await js('qaCalls.findLast(c=>c[0]==="probe")[2].embeddingModel'),'fixture-embedding');
 await js('document.querySelector(".library-case-picker").open=true');await click('否定与条件');await click('测试重排');await until('!!document.querySelector(".library-score-list")');assert.equal(await js('qaCalls.findLast(c=>c[0]==="probe")[3]'),'negative');
 await click('配置');const polls=await js('qaCalls.filter(c=>c[0]==="runtime").length');await wait(2100);assert.equal(await js('qaCalls.filter(c=>c[0]==="runtime").length'),polls,'hidden model page must stop polling');
 await click('本地模型');assert.equal(await js('document.querySelector("input[aria-label=方案向量模型]").value'),'fixture-embedding');assert.equal(await js('document.querySelectorAll(".library-score-list p").length'),2,'switching tabs preserves probe results');
 await click('索引');assert.equal(await js('document.querySelector(".library-error")?.innerText.includes("请先保存")'),true);assert.equal(await js('!!document.querySelector(".library-index-embedded")'),false);
 for(const mode of ['light','dark']){await js('qaTheme('+JSON.stringify(mode)+')');await js('document.querySelector(".library-strategy-layout>main").scrollTop=0');win.webContents.invalidate();await wait(200);await fs.writeFile(join(__dirname,'models-'+mode+'.png'),(await win.webContents.capturePage()).toPNG())}
 win.setSize(560,760);await wait(200);assert.equal(await js('document.querySelector("dialog").scrollWidth>document.querySelector("dialog").clientWidth'),false);await fs.writeFile(join(__dirname,'models-narrow.png'),(await win.webContents.capturePage()).toPNG());win.setSize(1200,920);await wait(100);
 await click('保存方案');assert.equal(await js('document.querySelector("#library-strategy-tab-models").getAttribute("aria-selected")'),'true');assert.equal(await js('qaProfiles().at(-1).localModels.embeddingModel'),'fixture-embedding');assert.notEqual(await js('qaProfiles()[0].localModels.embeddingModel'),'fixture-embedding','saving a model must not modify another profile');
 await input('方案向量模型','unsaved-model');await click('完成');assert.equal(await js('document.querySelector("dialog footer").innerText.includes("尚未保存")'),true);await click('继续编辑');await click('放弃修改');assert.equal(await js('document.querySelector("input[aria-label=方案向量模型]").value'),'fixture-embedding');
 await click('索引');await until('document.querySelector(".library-index-embedded")?.innerText.includes("索引可用")');assert.equal(await js('qaCalls.filter(c=>c[0]==="index").at(-1)[3]'),await js('qaProfiles().at(-1).id'));
 await fs.writeFile(join(__dirname,'index.png'),(await win.webContents.capturePage()).toPNG());await js('document.querySelector("#library-strategy-tab-config").focus()');await click('配置');assert.equal(await js('document.activeElement.id'),'library-strategy-tab-config','leaving embedded index must preserve tab focus');await input('方案名称','尚未保存的改名');await click('完成');assert.equal(await js('document.querySelector("dialog footer").innerText.includes("尚未保存")'),true);await click('继续编辑');await click('放弃修改');
 win.setSize(560,760);await wait(200);assert.equal(await js('document.querySelector("dialog").scrollWidth>document.querySelector("dialog").clientWidth'),false);assert.ok(await js('document.querySelector(".library-strategy-layout>main").clientHeight>200'));await fs.writeFile(join(__dirname,'config-narrow.png'),(await win.webContents.capturePage()).toPNG());
 await click('完成');await click('打开评测');await until('document.querySelectorAll(".library-evaluation-results tr").length>1');await js('document.querySelector(".library-evaluation-compare").open=true');await js('Array.from(document.querySelectorAll(".library-evaluation-profile-checks input")).at(-1).click()');await click('评测所选方案');
 assert.equal(await js('qaCalls.findLast(c=>c[0]==="evaluate"&&c[2]==="start")[3].profileIds.length'),2);await until('document.querySelectorAll(".library-evaluation-compare-table tbody tr").length===3');
 assert.equal(await js('document.querySelector("dialog").scrollWidth>document.querySelector("dialog").clientWidth'),false);await fs.writeFile(join(__dirname,'compare-narrow.png'),(await win.webContents.capturePage()).toPNG());
 win.setSize(1200,920);await wait(200);for(const mode of ['light','dark']){await js('qaTheme('+JSON.stringify(mode)+')');win.webContents.invalidate();await wait(200);await fs.writeFile(join(__dirname,'compare-'+mode+'.png'),(await win.webContents.capturePage()).toPNG())}
 await js('Array.from(document.querySelectorAll(".library-evaluation-compare-table button")).at(-1).click()');await until('document.querySelector("select[aria-label=评测方案]").value!=="standard-rag"');assert.equal(await js('document.querySelector("select[aria-label=评测报告]").value'),await js('qaProfiles().at(-1).id'));
 await fs.writeFile(join(__dirname,'calls.json'),JSON.stringify(await js('qaCalls'),null,2));assert.deepEqual(errors,[]);console.log('PASS strategy UI live explanations/diagrams, description saving, unified model/index tabs, per-profile save/probes, service controls, lazy polling, busy/unsaved guards, copy/rename, scoped indexes, comparison, light/dark/narrow.');app.exit(0);
}catch(e){console.error(e);app.exit(1)}});
`);
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
const child=spawn(createRequire(import.meta.url)('electron'),[join(root,'main.cjs')],{env,stdio:'inherit',windowsHide:true});
const timer=setTimeout(()=>child.kill(),45000);child.once('exit',code=>{clearTimeout(timer);process.exitCode=code??1});
