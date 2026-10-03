// Uses the configured answer model and existing local CUDA retrieval service.
// Only sends the project's original short fixture, never the user's novel.
const {readFile,writeFile,mkdir}=require('node:fs/promises');
const {join,resolve}=require('node:path');
const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const root=resolve('.cache/library-stage3/real-'+Date.now());
require('node:fs').mkdirSync(root,{recursive:true});
const build=require('esbuild').buildSync;
build({stdin:{contents:[['LibraryQaService','src/main/smart-library/qa/qa-service.ts'],['LibraryIndexService','src/main/smart-library/indexing/index-service.ts'],['createPiModelGateway','src/platform/main/ai/pi-model-gateway.ts'],['parseBook','src/main/smart-library/book-parser.ts']].map(([name,path])=>`export {${name}} from ${JSON.stringify(resolve(path))};`).join('\n'),resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'cjs',external:['electron','@lancedb/lancedb','node-pty'],outfile:join(root,'service.cjs')});
build({entryPoints:['src/main/smart-library/indexing/index-worker.ts'],bundle:true,platform:'node',format:'cjs',external:['@lancedb/lancedb'],outfile:join(root,'library-index.cjs')});
const {LibraryIndexService,LibraryQaService,createPiModelGateway,parseBook}=require(join(root,'service.cjs'));
let indexes,service,ownedModel;
const port=Number(process.env.LIBRARY_TEST_PORT||18082);const base='http://127.0.0.1:'+port;
const delay=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{try{
 await mkdir(root,{recursive:true});const gateway=await createPiModelGateway({cwd:process.cwd(),appRoot:process.cwd(),projectTrusted:false});
 const model=await gateway.getConfiguredModel();assert(model,'No configured answer model');console.log('Answer model',JSON.stringify(model));
 const choices=await gateway.getAvailableModels();const selected=choices.find(m=>m.providerId===model.providerId&&m.modelId===model.modelId);assert(selected);
 let ready=false;try{ready=(await(await fetch(base+'/health',{signal:AbortSignal.timeout(2000)})).json()).ready;}catch{}
 if(!ready){ownedModel=require('node:child_process').spawn(resolve('.cache/library-model-runtime/Scripts/python.exe'),['-u',resolve('scripts/library-models/server.py'),'--port',String(port),'--exit-on-stdin-close'],{stdio:['pipe','pipe','pipe'],windowsHide:true});let failed;ownedModel.on('error',e=>{failed=e;});ownedModel.stderr.on('data',()=>{});ownedModel.stdout.on('data',()=>{});
  for(let i=0;i<120;i++){if(failed)throw failed;if(ownedModel.exitCode!==null)throw Error('Test model server exited');try{ready=(await(await fetch(base+'/health',{signal:AbortSignal.timeout(1000)})).json()).ready;}catch{}if(ready)break;await delay(1000);}assert(ready,'Local CUDA startup timed out');console.log('Isolated CUDA service ready');}
 const bytes=await readFile('tests/fixtures/library/山灯记.txt');const book=createHash('sha256').update(bytes).digest('hex');await mkdir(join(root,book));await writeFile(join(root,book,'original.txt'),bytes);
 const parsed=await parseBook(bytes,'山灯记.txt',true);const metadata={id:book,format:'txt',title:'山灯记',chapter:0,chapters:parsed.chapters.map((c,id)=>({id,title:c.title,characters:c.text.length}))};await writeFile(join(root,book,'book.json'),JSON.stringify(metadata));for(const [i,c]of parsed.chapters.entries())await writeFile(join(root,book,i+'.txt'),c.text);
 indexes=new LibraryIndexService(root);const settings={embeddingUrl:base+'/api/embed',embeddingModel:'Qwen/Qwen3-Embedding-0.6B',rerankerUrl:base+'/rerank',rerankerModel:'Qwen/Qwen3-Reranker-0.6B'};
 await indexes.request(book,'prepare',settings);await indexes.request(book,'start',settings);for(let i=0;i<300;i++){const s=await indexes.request(book,'status');if(s.state==='ready')break;if(s.state==='failed')throw Error(s.error);await delay(200);}
 service=new LibraryQaService(indexes,gateway,async()=>metadata,async()=>settings);const report=[];
 const questions=[{question:'林舟最初把铜钥匙交给谁？',readingPage:0},{question:'她还有什么称呼？',readingPage:0},{question:'铜钥匙最后归还给谁？'},{question:'林舟出生于哪一年？'}];
 for(const [i,q] of questions.entries()){
   const id='real-'+i;const start=Date.now();let updates=0;
   await service.start(book,{id,...q,model,...(selected.reasoningLevels.includes('minimal')?{reasoning:'minimal'}:{})},()=>updates++);
   while(service.isBusy())await delay(300);
   const turn=(await service.history(book)).turns.find(t=>t.id===id);console.log(JSON.stringify({id,state:turn.state,answer:turn.answer,error:turn.error,warnings:turn.warnings,updates,elapsedMs:Date.now()-start}));
   report.push(turn);assert.equal(turn.state,'completed',turn.error);assert(turn.citations.length);assert(updates>=3);
   if(i===0)assert(turn.answer.includes('苏禾'));if(i===1)assert(turn.answer.includes('阿禾'));if(i===2){assert(turn.answer.includes('林舟'));assert.notEqual(turn.answer.trim(),'香蕉');}
   if(i===3)assert(/没有|未|不足|不确定|无法|不能/.test(turn.answer),'Must admit lack of birth-year evidence');
   for(const c of turn.citations)assert.notEqual((await service.evidence(book,id,c.number)).page,undefined);
 }
 await writeFile(join(root,'report.json'),JSON.stringify({model,turns:report,note:'Original short fixture, manual semantic review required; not full-book QA accuracy.'},null,2));console.log('REPORT '+join(root,'report.json'));
}finally{await service?.dispose();await indexes?.dispose();if(ownedModel){ownedModel.stdin.end();await Promise.race([new Promise(r=>ownedModel.once('exit',r)),delay(5000)]);if(ownedModel.exitCode===null)ownedModel.kill();}}})().catch(e=>{console.error(e);process.exitCode=1;});
