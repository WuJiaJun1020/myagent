// Real local CUDA retrieval baseline; isolated indexes, development questions only.
const { Worker } = require('node:worker_threads');
const { mkdir, readFile, writeFile } = require('node:fs/promises');
const { join, resolve } = require('node:path');
const { createHash } = require('node:crypto');
const assert = require('node:assert/strict');
const root = resolve('.cache/library-stage2/gpu-' + Date.now());
let worker, sequence=0;const pending=new Map();
const base='http://127.0.0.1:'+(process.env.LIBRARY_TEST_PORT||'18081');
const settings={embeddingUrl:base+'/api/embed',embeddingModel:'Qwen/Qwen3-Embedding-0.6B',rerankerUrl:base+'/rerank',rerankerModel:'Qwen/Qwen3-Reranker-0.6B'};
function request(book,action,payload){return new Promise((resolve,reject)=>{const request=++sequence;pending.set(request,{resolve,reject});worker.postMessage({request,book,action,settings,payload});});}
(async()=>{try{
 await mkdir(root,{recursive:true});require('esbuild').buildSync({entryPoints:['src/main/smart-library/book-parser.ts'],bundle:true,platform:'node',format:'cjs',outfile:join(root,'parser.cjs')});const {parseBook}=require(join(root,'parser.cjs'));
 const health=await(await fetch(base+'/health')).json();assert(health.ready&&health.device==='cuda:0'&&!health.busy,'Need idle local CUDA service');
 worker=new Worker(resolve('dist/main/library-index.cjs'),{workerData:{root}});worker.on('message',m=>{const p=pending.get(m.request);pending.delete(m.request);m.error?p.reject(Error(m.error)):p.resolve(m.value);});worker.on('error',e=>{for(const p of pending.values())p.reject(e);});
 const corpora=[{name:'fixture',bytes:await readFile('tests/fixtures/library/山灯记.txt')}];
 if(process.argv[2]){const original=await parseBook(await readFile(process.argv[2]),process.argv[2],false);const chapters=original.chapters.filter(c=>/^第[一二三四五六]章(?:\s|$)/.test(c.title));assert.equal(chapters.length,6);corpora.push({name:'fanren',bytes:Buffer.from(chapters.map(c=>c.title+'\n'+c.text).join('\n\n'))});}
 const questions=JSON.parse(await readFile('tests/fixtures/library/questions.json','utf8')).questions.filter(q=>q.split==='development');const rows=[],indexes=[];
 for(const corpus of corpora){
  const book=createHash('sha256').update(corpus.bytes).digest('hex');await mkdir(join(root,book));await writeFile(join(root,book,'original.txt'),corpus.bytes);const parsed=await parseBook(corpus.bytes,'baseline.txt',true);
  await writeFile(join(root,book,'book.json'),JSON.stringify({id:book,format:'txt',chapter:0,chapters:parsed.chapters.map((c,id)=>({id,title:c.title,characters:c.text.length}))}));for(const [i,c] of parsed.chapters.entries())await writeFile(join(root,book,i+'.txt'),c.text);
  await request(book,'prepare');await request(book,'start');let status;for(let i=0;i<600;i++){status=await request(book,'status');if(status.state!=='running')break;await new Promise(r=>setTimeout(r,200));}assert.equal(status.state,'ready',status.error);indexes.push({corpus:corpus.name,total:status.total,dimensions:status.dimensions});
  for(const q of questions.filter(q=>q.book===corpus.name)){
   const cutoff={F01:0,F02:0,F03:0,F04:0,F05:1,F06:2,F07:2,F08:4}[q.id];
   for(const mode of ['keyword','vector','hybrid']){
    const result=await request(book,'search',{token:'test'+(++sequence),query:q.question,mode,rerank:mode==='hybrid',readingPage:cutoff});assert.deepEqual(result.warnings,[]);
    const coverage=k=>q.evidence.filter(e=>result.hits.slice(0,k).some(h=>h.text.includes(e.anchor))).length;
    const row={book:corpus.name,id:q.id,mode,anchors:q.evidence.length,foundAt3:coverage(3),foundAt8:coverage(8),elapsedMs:result.elapsedMs,hitOrdinals:result.hits.map(h=>h.ordinal),missing:q.evidence.filter(e=>!result.hits.some(h=>h.text.includes(e.anchor))).map(e=>e.chapter)};rows.push(row);console.log(q.id,mode,row.foundAt3+'/'+row.anchors,'@3',row.foundAt8+'/'+row.anchors,'@8',row.elapsedMs+'ms');
    if(result.hits.length){const e=await request(book,'evidence',{version:result.version,id:result.hits[0].id,readingPage:cutoff});assert.equal(e.text.slice(e.highlight.start,e.highlight.end),result.hits[0].text);assert.notEqual(e.page,undefined);}
   }
  }
 }
 await writeFile(join(root,'report.json'),JSON.stringify({date:new Date().toISOString(),health,indexes,rows,note:'Development baseline only; exact anchor coverage is not answer correctness. Fanren uses an isolated first-six-chapter subset, not the user full-book index. Keyword/vector without rerank; hybrid with Qwen rerank.'},null,2));console.log('REPORT '+join(root,'report.json'));
}finally{await worker?.terminate();}})().catch(e=>{console.error(e);process.exitCode=1;});
