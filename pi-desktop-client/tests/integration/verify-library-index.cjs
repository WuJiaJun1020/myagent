// Electron's Node runtime: real SQLite and LanceDB; deterministic local model fixture.
const { Worker } = require('node:worker_threads');
const { DatabaseSync } = require('node:sqlite');
const { mkdir, writeFile, readFile } = require('node:fs/promises');
const { resolve, join } = require('node:path');
const { createHash } = require('node:crypto');
const http = require('node:http');
const assert = require('node:assert/strict');
const { createLibraryEpub } = require('../helpers/library-epub.cjs');
const root = resolve('.cache/library-stage1/integration-' + Date.now());
let worker, server, sequence = 0; const pending = new Map();
let calls = 0, failure = false, revision = 'fixture-v1';
function open() {
  worker = new Worker(resolve('dist/main/library-index.cjs'), { workerData: { root } });
  worker.on('message', m => { const p = pending.get(m.request); if (!p) return; pending.delete(m.request); m.error ? p.reject(Error(m.error)) : p.resolve(m.value); });
  worker.on('error', e => { for (const p of pending.values()) p.reject(e); pending.clear(); });
}
function request(book, action, settings, ordinal) { return new Promise((resolve,reject) => { const request=++sequence; pending.set(request,{resolve,reject}); worker.postMessage({request,book,action,settings,ordinal}); }); }
const delay = ms => new Promise(r => setTimeout(r,ms));
async function until(book, predicate) { for(let i=0;i<400;i++){ const s=await request(book,'status'); if(predicate(s))return s; await delay(30); } throw Error('Index wait timeout'); }
(async()=>{try{
  await mkdir(root,{recursive:true});
  server=http.createServer(async(req,res)=>{let raw='';for await(const c of req)raw+=c;const body=JSON.parse(raw);assert(body.input.length<=2,'GPU request batch must stay small');calls++;await delay(70);if(failure){res.writeHead(503);res.end();return;}res.setHeader('content-type','application/json');res.end(JSON.stringify({model:body.model,model_revision:revision,embeddings:body.input.map(t=>[1,t.length/800,.5])}));});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+server.address().port;
  const config={embeddingUrl:url+'/api/embed',embeddingModel:'fixture',rerankerUrl:url+'/rerank',rerankerModel:'fixture'};
  const bytes=Buffer.from('第一章 原文\n'+('林舟保管铜钥匙。🐱\n'.repeat(10000))+'\n第二章 后续\n钥匙交给苏禾。');
  const book=createHash('sha256').update(bytes).digest('hex');const dir=join(root,book);await mkdir(dir);await writeFile(join(dir,'original.txt'),bytes);
  const metadata=JSON.stringify({id:book,format:'txt',chapter:2,chapters:[{id:0,title:'旧分页'}]});await writeFile(join(dir,'book.json'),metadata);
  open();let s=await request(book,'prepare',config);assert.equal(s.chapters,2);assert(s.total>20);assert.equal(calls,0,'Prepare must not invoke model');
  assert.equal(await readFile(join(dir,'book.json'),'utf8'),metadata);assert.equal(await readFile(join(dir,'book.before-index.json'),'utf8'),metadata);
  const first=await request(book,'chunk',undefined,0);assert(first.text.includes('林舟'));assert.equal(first.start,0);
  await request(book,'start',config);while(calls<4)await delay(20);assert.equal((await request(book,'status')).completed,0,'Unwritten buffer must not advance checkpoint');await request(book,'pause');s=await until(book,s=>s.state==='paused');assert(s.completed>0&&s.completed<64,'Pause must save the partial buffer');
  const saved=s.completed;await worker.terminate();
  // Simulate a crash after Lance committed a batch but before SQLite saved its checkpoint.
  const tailConnection=await require('@lancedb/lancedb').connect(join(root,'vectors',s.version));const tailTable=await tailConnection.openTable('chunks');
  const sample=(await tailTable.query().limit(1).toArray())[0];await tailTable.add([{...sample,id:'uncheckpointed',ordinal:saved,vector:[1,.5,.5]}]);tailConnection.close();
  open();assert.equal((await request(book,'status')).completed,saved);
  await request(book,'start',config);await until(book,s=>s.completed>saved);await worker.terminate();open();s=await request(book,'status');assert.equal(s.state,'paused','Abrupt process stop must become resumable');
  failure=true;await request(book,'start',config);s=await until(book,s=>s.state==='failed');assert(s.error.includes('503'));assert(s.completed>0);
  const before=s.completed;failure=false;revision='different-weights';await request(book,'start',config);s=await until(book,s=>s.state==='failed');assert.equal(s.completed,before);assert(s.error.includes('版本发生变化'));
  revision='fixture-v1';const resumeCalls=calls;await request(book,'start',config);s=await until(book,s=>s.state==='ready');assert.equal(s.completed,s.total);assert.equal(calls-resumeCalls,Math.ceil((s.total-before)/2),'Completed batches must not be embedded again');
  const active=s.activeVersion;const db=new DatabaseSync(join(root,'indexes.sqlite'));
  assert(Number(db.prepare('SELECT count(*) n FROM chunk_terms WHERE chunk_terms MATCH ? AND version=?').get('林舟',active).n)>0);
  const connection=await require('@lancedb/lancedb').connect(join(root,'vectors',active));const table=await connection.openTable('chunks');assert.equal(await table.countRows(),s.total);
  const rows=await table.query().select(['id','ordinal']).toArray();assert.equal(new Set(rows.map(x=>x.id)).size,s.total);
  assert.equal((await table.listVersions()).length,1,'Completed index must have only one manifest');
  const stored=JSON.parse(db.prepare('SELECT data FROM jobs WHERE version=?').get(active).data);assert.equal(stored.storage.rows,s.total);assert.equal(stored.storageWarning,undefined,'Automatic storage maintenance must succeed');
  connection.close();db.close();
  s=await request(book,'rebuild',config);assert.notEqual(s.version,active);assert.equal(s.activeVersion,active);assert.equal(s.completed,0);
  await assert.rejects(request(book,'start',{...config,embeddingModel:'changed'}),/配置已变化/);
  failure=true;await request(book,'start',config);s=await until(book,s=>s.state==='failed');assert.equal(s.activeVersion,active,'Rebuild failure must preserve active index');
  const abandoned=s.version;s=await request(book,'rebuild',config);
  const inspect=new DatabaseSync(join(root,'indexes.sqlite'),{readOnly:true});
  assert.equal(inspect.prepare('SELECT count(*) n FROM jobs WHERE book=?').get(book).n,2,'Only active plus newest pending index may remain');
  assert.equal(inspect.prepare('SELECT count(*) n FROM chunks WHERE version=?').get(abandoned).n,0,'Abandoned pending chunks must be deleted');inspect.close();
  failure=false;await request(book,'start',config);s=await until(book,s=>s.state==='ready');
  while(await request(book,'busy'))await delay(20);
  const replacement=s.activeVersion;assert.notEqual(replacement,active);
  const finalDb=new DatabaseSync(join(root,'indexes.sqlite'),{readOnly:true});
  assert.equal(finalDb.prepare('SELECT count(*) n FROM jobs WHERE book=?').get(book).n,1);
  assert.equal(finalDb.prepare('SELECT count(*) n FROM chunks WHERE version=?').get(active).n,0);
  assert.equal(finalDb.prepare('SELECT count(*) n FROM chunk_terms WHERE version=?').get(active).n,0);
  assert.equal(finalDb.prepare('SELECT count(*) n FROM chapters WHERE book=?').get(book).n,2,'Shared canonical source must not duplicate on rebuild');
  assert.equal(finalDb.prepare('PRAGMA integrity_check').get().integrity_check,'ok');finalDb.close();
  await assert.rejects(require('node:fs/promises').stat(join(root,'vectors',active)),{code:'ENOENT'});
  await assert.rejects(require('node:fs/promises').stat(join(root,'vectors',abandoned)),{code:'ENOENT'});
  await assert.rejects(request('../bad','status'),/ID/);
  // EPUB source structure uses the same immutable import contract.
  const epub=await createLibraryEpub();const id=createHash('sha256').update(epub).digest('hex');await mkdir(join(root,id));await writeFile(join(root,id,'original.epub'),epub);await writeFile(join(root,id,'book.json'),JSON.stringify({id,format:'epub',chapter:1}));
  failure=false;s=await request(id,'prepare',config);assert.equal(s.chapters,4);await request(id,'start',config);s=await until(id,s=>s.state==='ready');assert.equal(s.completed,s.total);
  assert.equal((await request(book,'status')).activeVersion,replacement,'Different books remain isolated');
  await writeFile(join(root,'report.json'),JSON.stringify({checks:['TXT/EPUB canonical source','no model call during preparation','full text reconstruction','two-character FTS','pause/resume','abrupt restart','HTTP failure/retry','model revision mismatch','no repeated completed batches','atomic active version','no duplicate vectors','book isolation','legacy metadata unchanged'],root},null,2));
  console.log('PASS stage 1: source, SQLite/FTS/LanceDB, recovery, revisions, old index preservation. '+root);
}finally{await worker?.terminate();server?.closeAllConnections();server?.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
