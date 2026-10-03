// Uses the client's existing index read-only. Reports are saved inside the workspace.
const {Worker}=require('node:worker_threads');
const {mkdir,readFile,writeFile}=require('node:fs/promises');
const {join,resolve}=require('node:path');
const root=process.argv[2]||join(process.env.APPDATA,'pi-desktop-client','modules','smart-library');
const book=process.argv[3]||'b9be6472b111017619d2956f2d3be14646c048ca11506c26cd6a145829c42450';
const output=resolve('.cache/library-evaluation',Date.now().toString());
async function selectedQuestions(){
  const worker=new Worker(resolve('dist/main/library-question-bank.cjs'),{workerData:{root}});
  try{return await new Promise((resolve,reject)=>{
    worker.once('message',({value,error})=>error?reject(Error(error)):resolve(value));
    worker.once('error',reject);worker.once('exit',()=>reject(Error('Question bank worker exited')));
    worker.postMessage({request:1,book,action:'published'});
  });}finally{await worker.terminate();}
}
(async()=>{
  let settings={embeddingUrl:'http://127.0.0.1:18081/api/embed',embeddingModel:'Qwen/Qwen3-Embedding-0.6B',rerankerUrl:'http://127.0.0.1:18081/rerank',rerankerModel:'Qwen/Qwen3-Reranker-0.6B'};
  try{settings=JSON.parse(await readFile(join(root,'local-models.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
  await mkdir(output,{recursive:true});
  const health=await(await fetch('http://127.0.0.1:18081/health')).json();console.log('GPU',health.gpu,health.dtype,'models',health.models);
  let final;
  const questions=await selectedQuestions();
  const worker=new Worker(resolve('dist/main/library-evaluation.cjs'),{workerData:{root,book,settings,questions}});
  worker.on('message',state=>{final=state;if(state.current)console.log(state.current,state.completed+'/'+state.total);if(state.report?.rows.length){const r=state.report.rows.at(-1);console.log(r.id,r.state,'raw8',r.stages.raw8?.complete+'/'+r.stages.raw8?.required,'expanded6',r.stages.expanded6?.complete+'/'+r.stages.expanded6?.required,r.error||'');}});
  await new Promise((resolve,reject)=>{worker.once('error',reject);worker.once('exit',code=>code?reject(Error('Worker exit '+code)):resolve());});
  await writeFile(join(output,'report.json'),JSON.stringify({...final,health},null,2));console.log('REPORT',join(output,'report.json'));console.log('SUMMARY',JSON.stringify(final?.report?.summary));
  if(final?.state!=='completed'||final.report.rows.some(r=>r.state!=='completed'))throw Error(final?.error||'Incomplete evaluation');
})().catch(e=>{console.error(e);process.exitCode=1;});
