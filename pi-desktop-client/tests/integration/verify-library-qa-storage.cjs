const {Worker}=require('node:worker_threads');
const {mkdir}=require('node:fs/promises');
const {resolve}=require('node:path');
const assert=require('node:assert/strict');
const root=resolve('.cache/library-stage3/storage-'+Date.now());let worker,sequence=0;const pending=new Map();
function open(){worker=new Worker(resolve('dist/main/library-index.cjs'),{workerData:{root}});worker.on('message',m=>{const p=pending.get(m.request);pending.delete(m.request);m.error?p.reject(Error(m.error)):p.resolve(m.value)});worker.on('error',e=>{for(const p of pending.values())p.reject(e);pending.clear()});}
function request(book,action,payload){return new Promise((resolve,reject)=>{const request=++sequence;pending.set(request,{resolve,reject});worker.postMessage({request,book,action,payload})});}
(async()=>{try{
 await mkdir(root,{recursive:true});open();const a='a'.repeat(64),b='b'.repeat(64);
 for(let i=0;i<55;i++)await request(a,'qa-save',{book:a,id:'a-'+i,revision:1,state:i===54?'answering':'completed',answer:'已保存的正文'+i,createdAt:i,updatedAt:i,citations:[],warnings:[]});
 await request(b,'qa-save',{book:b,id:'b-1',revision:1,state:'completed',answer:'另一本书',createdAt:1,updatedAt:1,citations:[],warnings:[]});
 const page=await request(a,'qa-list');assert.equal(page.turns.length,50);assert(page.hasMore);assert.equal(page.turns[0].id,'a-5');assert.equal(page.turns.at(-1).id,'a-54');
 const earlier=await request(a,'qa-list',page.turns[0].seq);assert.equal(earlier.turns.length,5);assert.equal(earlier.hasMore,false);
 assert.equal(await request(b,'qa-get','a-0'),null);await assert.rejects(request(b,'qa-save',{book:b,id:'a-0'}),/冲突/);
 await worker.terminate();open();const recovered=await request(a,'qa-get','a-54');assert.equal(recovered.state,'stopped');assert.equal(recovered.answer,'已保存的正文54');assert(recovered.error.includes('中断'));
 const sessions=await request(a,'qa-sessions',{action:'create'});const session=sessions[0].id;
 await request(a,'qa-save',{book:a,id:'new-1',sessionId:session,question:'新会话问题',state:'completed',answer:'新记录',citations:[],warnings:[]});
 assert.equal((await request(a,'qa-list',{sessionId:session})).turns.length,1);
 assert.equal((await request(a,'qa-list')).turns.length,50);
 await assert.rejects(request(b,'qa-save',{book:b,id:'bad-session',sessionId:session}),/会话不存在/);
 assert.equal(sessions[0].strategyId,'standard-rag');
 await request(a,'qa-sessions',{action:'strategy',sessionId:session,strategyId:'standard-rag'});
 await assert.rejects(request(a,'qa-sessions',{action:'strategy',sessionId:session,strategyId:'graph-rag'}),/策略不可用/);
 assert.equal((await request(a,'qa-list',{sessionId:session})).turns.length,1,'Strategy selection preserves history');
 await worker.terminate();open();assert.equal((await request(a,'qa-sessions')).find(s=>s.id===session).strategyId,'standard-rag');
 await request(a,'qa-sessions',{action:'clear',sessionId:session});
 assert.equal((await request(a,'qa-list',{sessionId:session})).turns.length,0);
 assert.equal((await request(a,'qa-list')).turns.length,50);
 await worker.terminate();open();assert.equal((await request(a,'qa-sessions')).length,2);
 await request(a,'qa-sessions',{action:'range',sessionId:session,range:{start:1,end:2}});await worker.terminate();open();assert.deepEqual((await request(a,'qa-sessions'))[0].range,{start:1,end:2});
 await request(a,'qa-sessions',{action:'rename',sessionId:session,title:'人物关系'});assert.equal((await request(a,'qa-sessions'))[0].title,'人物关系');
 await request(a,'qa-sessions',{action:'rename',sessionId:session,title:'新会话'});
 await request(a,'qa-save',{book:a,id:'renamed-turn',sessionId:session,question:'不能覆盖手动名称',state:'completed'});
 assert.equal((await request(a,'qa-sessions'))[0].title,'新会话');
 await assert.rejects(request(a,'qa-sessions',{action:'rename',sessionId:session,title:' '}),/名称/);
 await assert.rejects(request(b,'qa-sessions',{action:'delete',sessionId:session}),/不存在/);
 await request(a,'qa-sessions',{action:'delete',sessionId:session});
 await request(a,'qa-sessions',{action:'delete',sessionId:'default'});
 await worker.terminate();open();assert.equal((await request(a,'qa-sessions')).length,0);assert.equal((await request(a,'qa-list')).turns.length,0);

 assert.equal((await request(b,'qa-list')).turns[0].state,'completed');console.log('PASS QA SQLite pagination, cross-book isolation, partial answer recovery after worker restart. '+root);
}finally{await worker?.terminate()}})().catch(e=>{console.error(e);process.exitCode=1});
