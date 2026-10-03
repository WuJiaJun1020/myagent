// Isolated real SQLite/FTS/LanceDB integration; deterministic model server, no user data.
const { Worker } = require('node:worker_threads');
const { mkdir, writeFile, readFile } = require('node:fs/promises');
const { resolve, join } = require('node:path');
const { createHash } = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const http = require('node:http');
const assert = require('node:assert/strict');
const root = resolve('.cache/library-stage2/integration-' + Date.now());
let worker, evaluationWorker, server, sequence = 0, slow = false, slowQuery = false, failEmbed = false, failRerank = false, profileDelay = false, revision = 'v1';
const pending = new Map(), requests = [];
const delay = ms => new Promise(r => setTimeout(r, ms));
function request(book, action, settings, payload) { return new Promise((resolve, reject) => { const request = ++sequence; pending.set(request, { resolve, reject }); worker.postMessage({ request, book, action, settings, payload }); }); }
async function until(book) { for (let i=0;i<300;i++){const s=await request(book,'status');if(s.state==='ready')return s;if(s.state==='failed')throw Error(s.error);await delay(25);}throw Error('Timeout'); }
async function importBook(chapters, pages) {
  const bytes = Buffer.from(chapters.map((text,i)=>`第${['一','二'][i]}章 测试\n${text}`).join('\n'));
  const id = createHash('sha256').update(bytes).digest('hex'); await mkdir(join(root,id));
  await writeFile(join(root,id,'original.txt'),bytes);
  await writeFile(join(root,id,'book.json'),JSON.stringify({id,format:'txt',chapter:0,chapters:pages.map((text,id)=>({id,title:'阅读页'+id,characters:text.length}))}));
  for(const [i,text] of pages.entries()) await writeFile(join(root,id,i+'.txt'),text);
  return id;
}
(async()=>{try{
  await mkdir(root,{recursive:true});
  server=http.createServer(async(req,res)=>{let raw='';for await(const c of req)raw+=c;const body=JSON.parse(raw);requests.push({url:req.url,...body});if(slow||(slowQuery&&body.input_type==='query'))await delay(2000);
    if(profileDelay)await delay(req.url==='/embed'?40:80);
    if((req.url==='/embed'&&failEmbed)||(req.url==='/rerank'&&failRerank)){res.writeHead(503);res.end();return;}
    res.setHeader('content-type','application/json');res.end(JSON.stringify(req.url==='/embed'?{model:body.model,model_revision:revision,embeddings:body.input.map(t=>t.includes('铜钥匙')?[1,.05]:[.05,1])}:{results:body.documents.map((text,index)=>({index,relevance_score:text.includes('苏禾')?.9:.1}))}));
  });await new Promise(r=>server.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+server.address().port;
  const config={embeddingUrl:url+'/embed',embeddingModel:'fixture',rerankerUrl:url+'/rerank',rerankerModel:'fixture'};
  worker=new Worker(resolve('dist/main/library-index.cjs'),{workerData:{root}});worker.on('message',m=>{const p=pending.get(m.request);pending.delete(m.request);m.error?p.reject(Error(m.error)):p.resolve(m.value);});worker.on('error',e=>{for(const p of pending.values())p.reject(e);});
  const past='林舟把铜钥匙交给苏禾。🐱'+ '山中风景安静。'.repeat(45);
  const future='后文秘密红龙已经醒来。'+ '夜空有星光。'.repeat(70);
  const chapter2='铜钥匙后来被放进宝箱。最终秘密是白虎。';
  const a=await importBook([past+future,chapter2],[past,future,chapter2]);
  const bText='另一本书的铜钥匙属于坏人，绝不能串书。';const b=await importBook([bText],[bText]);
  for(const book of [a,b]){await request(book,'prepare',config);await request(book,'start',config);await until(book);}
  const search=(book,options={},settings=config)=>request(book,'search',settings,{token:'t'+(++sequence),query:'铜钥匙',mode:'hybrid',rerank:true,...options});
  const whole=await search(a);assert(whole.hits.length>0);assert(whole.reranked);assert(whole.hits.every(h=>!h.text.includes('另一本书')));
  assert(requests.some(r=>r.input_type==='query'));assert(requests.some(r=>r.input_type==='document'));
  assert.equal(whole.timings,undefined,'Ordinary queries do not include evaluation diagnostics');
  await require('esbuild').build({entryPoints:['src/main/smart-library/retrieval/retrieval.ts'],bundle:true,platform:'node',format:'cjs',outfile:join(root,'retrieval.cjs'),external:['@lancedb/lancedb']});
  const {LibraryRetrieval}=require(join(root,'retrieval.cjs'));const profileDb=new DatabaseSync(join(root,'indexes.sqlite'),{readOnly:true});
  try {
    profileDelay=true;requests.length=0;
    const profiled=await new LibraryRetrieval(profileDb,root).search(a,{token:'profile',query:'铜钥匙',mode:'hybrid',rerank:true},config,true);
    assert(profiled.timings.embeddingMs>=30);assert(profiled.timings.rerankMs>=70);
    for(const key of ['setupMs','keywordMs','vectorMs','fusionMs'])assert(Number.isFinite(profiled.timings[key])&&profiled.timings[key]>=0);
    assert(Object.values(profiled.timings).reduce((sum,n)=>sum+n,0)<=profiled.elapsedMs+10);
    assert.deepEqual(profiled.hits.map(h=>h.id),whole.hits.map(h=>h.id),'Profiling must not change retrieval order');
    assert.equal(requests.length,2,'Profiling must not add embedding or reranker calls');
    await writeFile(join(root,'timings.json'),JSON.stringify(profiled.timings,null,2));
    const coldReader=new LibraryRetrieval(profileDb,root);let mappingCalls=0;
    const pageMap=coldReader.pages.bind(coldReader);coldReader.pages=(...args)=>{mappingCalls++;return pageMap(...args)};
    const reference={version:whole.version,id:whole.hits[0].id};
    const plain=await coldReader.evidence(a,reference,{locatePage:false});
    assert.equal(mappingCalls,0,'Evaluation context must not construct a reader-page map');
    assert.equal(plain.page,undefined);assert.equal(plain.locationError,undefined);
    const located=await coldReader.evidence(a,reference);
    assert.equal(mappingCalls,1);assert.equal(plain.text,located.text);assert.deepEqual(plain.highlight,located.highlight);
    assert.equal(typeof located.page,'number','Citation navigation must still locate the reader page');
  } finally {profileDelay=false;profileDb.close();}
  const original=await readFile(join(root,a,'original.txt'),'utf8'),quote='林舟把铜钥匙交给苏禾。',start=original.indexOf(quote);
  const question={sample_id:'S011',source_sha256:a,generation:'fanren-expansion-v2',difficulty:'简单',question:'铜钥匙给谁',answer:'苏禾',evidence:[{evidence_id:'e1',quote,required:true,supports:'接收人',start_utf16:start,end_utf16:start+quote.length}]};
  evaluationWorker=new Worker(resolve('dist/main/library-evaluation.cjs'),{workerData:{root,book:a,settings:config,questions:[question]}});
  const evaluated=await new Promise((resolve,reject)=>{
    const deadline=setTimeout(()=>reject(Error('Evaluation timing timeout')),10000);
    evaluationWorker.on('error',error=>{clearTimeout(deadline);reject(error)});
    evaluationWorker.on('message',state=>{if(state.state==='running')return;clearTimeout(deadline);state.state==='completed'?resolve(state.report):reject(Error(state.error??state.state))});
  });
  assert.equal(evaluated.rows.length,1);assert.equal(evaluated.rows[0].state,'completed');assert.equal(evaluated.rows[0].stages.expanded6.recall,1);
  assert(evaluated.preparationMs>=0);assert(evaluated.finishedAt>=evaluated.startedAt);
  for(const key of ['retrievalMs','contextMs','scoringMs','embeddingMs','vectorMs','rerankMs'])assert(Number.isFinite(evaluated.rows[0].timings[key])&&evaluated.rows[0].timings[key]>=0);
  await writeFile(join(root,'evaluation-timings.json'),JSON.stringify(evaluated,null,2));await evaluationWorker.terminate();
  requests.length=0;const scoped=await search(a,{readingPage:0});assert(scoped.hits.length>0);assert(scoped.hits.every(h=>!h.text.includes('红龙')&&!h.text.includes('白虎')));
  assert(requests.every(r=>!(r.documents??[]).some(t=>t.includes('红龙')||t.includes('白虎'))),'Future text must not reach reranker');
  const e=await request(a,'evidence',undefined,{version:scoped.version,id:scoped.hits[0].id,readingPage:0});assert.equal(e.page,0);assert(!e.text.includes('红龙'));assert.equal(e.text.slice(e.highlight.start,e.highlight.end),scoped.hits[0].text);assert.equal(past.slice(e.pageHighlight.start,e.pageHighlight.end),scoped.hits[0].text);
  requests.length=0;const middle=await search(a,{query:'红龙',readingStartPage:1,readingPage:1});assert(middle.hits.length);
  assert(middle.hits.every(h=>!h.text.includes('苏禾')&&!h.text.includes('白虎')));
  assert(requests.every(r=>!(r.documents??[]).some(t=>t.includes('苏禾')||t.includes('白虎'))));
  const bounded=await request(a,'evidence',undefined,{version:middle.version,id:middle.hits[0].id,readingStartPage:1,readingPage:1});assert(!bounded.text.includes('苏禾')&&!bounded.text.includes('白虎'));assert.equal(bounded.page,1);
  await assert.rejects(search(a,{readingStartPage:2,readingPage:1}),/范围/);
  const lastOnly=await search(a,{readingStartPage:2,readingPage:2,mode:'vector'});assert(lastOnly.hits.every(h=>h.chapter===1));
  const foreign=(await search(b)).hits[0];await assert.rejects(request(a,'evidence',undefined,{version:whole.version,id:foreign.id}),/范围/);
  const futureHit=(await search(a,{query:'白虎',mode:'keyword',rerank:false})).hits.find(h=>h.chapter===1);assert(futureHit);await assert.rejects(request(a,'evidence',undefined,{version:whole.version,id:futureHit.id,readingPage:0}),/范围/);
  const last=await request(a,'evidence',undefined,{version:whole.version,id:futureHit.id});assert.equal(last.page,2);assert(last.text.includes('白虎'));
  const before=whole.version;await request(a,'rebuild',config);assert.equal((await search(a)).version,before,'Search must use active, not incomplete latest');
  failEmbed=true;const fallback=await search(a);assert(fallback.warnings.some(w=>w.includes('降级')));assert(fallback.hits.length);await assert.rejects(search(a,{mode:'vector'}),/503/);failEmbed=false;
  revision='v2';assert((await search(a)).warnings.some(w=>w.includes('版本')));revision='v1';
  failRerank=true;assert((await search(a)).warnings.some(w=>w.includes('重排不可用')));failRerank=false;
  requests.length=0;const bge=await search(a,{}, {...config,rerankerModel:'BAAI/bge-reranker-base'});assert(bge.reranked);assert(requests.filter(r=>r.documents).every(r=>r.documents.every(t=>t.length<=64)));
  slow=true;const task=request(a,'search',config,{token:'cancel-me',query:'铜钥匙',mode:'vector',rerank:false});const rejection=assert.rejects(task,/停止/);await delay(100);assert.equal(await request(a,'busy'),true);await request(a,'cancel-search',undefined,'cancel-me');await rejection;slow=false;
  assert((await search(a)).hits.length,'Search recovers after cancellation');
  await assert.rejects(search(a,{readingPage:-1}),/范围/);await assert.rejects(search(a,{query:'x'.repeat(201)}),/200/);
  // Finish a query on the old active index while the replacement completes.
  // New readers are refused only during the final swap; QA history stays usable.
  slowQuery=true;const oldReader=search(a,{mode:'vector',rerank:false});await delay(50);
  await request(a,'start',config);let drained=false;
  for(let i=0;i<100;i++) {
    try {await search(a);}catch(e){if(e.message.includes('切换与清理')){drained=true;break;}}
    await delay(10);
  }
  assert(drained,'Switch must wait for old reader and refuse new readers');
  await request(a,'qa-sessions',undefined,{action:'list'});
  assert.equal((await oldReader).version,before,'In-flight query must complete on the old index');slowQuery=false;
  await until(a);await assert.rejects(request(a,'evidence',undefined,{version:before,id:whole.hits[0].id}),/失效/);
  // Mapping failure is fail-closed for restricted search, while unrestricted evidence remains usable.
  await writeFile(join(root,b,'0.txt'),'旧分页与原文不匹配');await assert.rejects(search(b,{readingPage:0}),/无法精确对应/);
  const fullB=await search(b);const badMap=await request(b,'evidence',undefined,{version:fullB.version,id:fullB.hits[0].id});assert(badMap.locationError);assert.equal(badMap.page,undefined);
  const db=new DatabaseSync(join(root,'indexes.sqlite'));assert.equal(Number(db.prepare('SELECT count(*) n FROM active').get().n),2);db.close();
  await writeFile(join(root,'report.json'),JSON.stringify({passed:true,checks:['active-version isolation','cross-book isolation','query embedding','pre-filtered reading boundary','boundary-crossing chunk clipping','no future rerank input','exact context and reader highlight','FTS/vector/fusion/rerank','fallback and revision mismatch','BGE full-coverage windows','cancel and recover','stale references','mapping failure closed'],root},null,2));
  console.log('PASS stage 2 integration '+root);
}finally{await evaluationWorker?.terminate();await worker?.terminate();server?.closeAllConnections();server?.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
