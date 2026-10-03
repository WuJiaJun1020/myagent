const { Worker }=require('node:worker_threads');const { DatabaseSync }=require('node:sqlite');const { mkdir,readFile,writeFile,copyFile }=require('node:fs/promises');const { resolve,join,extname }=require('node:path');const { createHash }=require('node:crypto');const assert=require('node:assert/strict');
const root=resolve('.cache/library-stage1/gpu-'+Date.now());let worker;let n=0;const pending=new Map();
const settings={embeddingUrl:'http://127.0.0.1:18082/api/embed',embeddingModel:'Qwen/Qwen3-Embedding-0.6B',rerankerUrl:'http://127.0.0.1:18082/rerank',rerankerModel:'Qwen/Qwen3-Reranker-0.6B'};
function request(book,action){return new Promise((resolve,reject)=>{const request=++n;pending.set(request,{resolve,reject});worker.postMessage({request,book,action,settings});});}
async function importSource(path){const bytes=await readFile(path);const id=createHash('sha256').update(bytes).digest('hex');await mkdir(join(root,id));await copyFile(path,join(root,id,'original'+extname(path)));await writeFile(join(root,id,'book.json'),JSON.stringify({id,format:extname(path).slice(1),chapter:0}));return id;}
(async()=>{try{
await mkdir(root,{recursive:true});worker=new Worker(resolve('dist/main/library-index.cjs'),{workerData:{root}});worker.on('message',m=>{const p=pending.get(m.request);pending.delete(m.request);m.error?p.reject(Error(m.error)):p.resolve(m.value);});worker.on('error',e=>{for(const p of pending.values())p.reject(e);});
const book=await importSource(resolve('tests/fixtures/library/山灯记.txt'));const prepared=await request(book,'prepare');const start=Date.now();await request(book,'start');let status;
for(let i=0;i<300;i++){status=await request(book,'status');if(status.state!=='running')break;await new Promise(r=>setTimeout(r,300));}
assert.equal(status.state,'ready',status.error);assert.equal(status.dimensions,1024);const report={shortBook:{...status,elapsedMs:Date.now()-start},longBook:null};
if(process.argv[2]){
 const id=await importSource(process.argv[2]);const start=Date.now();const p=await request(id,'prepare');const db=new DatabaseSync(join(root,'indexes.sqlite'));
 for(const c of db.prepare('SELECT chapter,text FROM chapters WHERE book=?').iterate(id)){let end=0;for(const x of db.prepare('SELECT start,end,text FROM chunks WHERE version=? AND chapter=? ORDER BY ordinal').iterate(p.version,c.chapter)){assert(Number(x.start)<=end);assert.equal(String(c.text).slice(Number(x.start),Number(x.end)),x.text);end=Number(x.end);}assert.equal(end,String(c.text).length);}
 db.close();report.longBook={...p,elapsedMs:Date.now()-start,note:'Prepared and checked full canonical coverage only; no full-book embedding invoked'};
}
await writeFile(join(root,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({...report,root},null,2));
}finally{await worker?.terminate();}})().catch(e=>{console.error(e);process.exitCode=1;});
