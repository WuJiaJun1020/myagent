import { build } from 'esbuild';
import { resolve } from 'node:path';
import { createServer } from 'node:http';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
await build({ entryPoints: ['src/main/smart-library/model-runtime.ts'], bundle: true, platform: 'node', format: 'cjs', outfile: '.cache/library-stage1/model-runtime.cjs' });
const { LibraryModelRuntime } = await import('../../.cache/library-stage1/model-runtime.cjs');
let canStop = true;
const runtime = new LibraryModelRuntime(resolve('.'), async () => canStop, 18083);
let server;
try {
  server = createServer((req,res) => { res.setHeader('Content-Type','application/json'); res.end(JSON.stringify({ready:true,models:['Qwen/Qwen3-Embedding-0.6B']})); });
  await new Promise((r,j) => {server.once('error',j);server.listen(18083,'127.0.0.1',r);});
  let s = await runtime.action('start'); assert.equal(s.state,'ready'); assert.equal(s.owned,false);
  await assert.rejects(runtime.action('stop'),/不是由本客户端启动/);
  await new Promise(r => server.close(r));
  // A non-model process on the port must not be killed or mistaken for our service.
  server = createServer((req,res) => {res.writeHead(404);res.end();});
  await new Promise(r=>server.listen(18083,'127.0.0.1',r));
  await assert.rejects(runtime.action('start'),/端口.*已被占用/);await new Promise(r=>server.close(r));
  s=await runtime.action('start');assert.equal(s.owned,true);console.log('Started hidden Python process');
  const deadline=Date.now()+120000;
  while(s.state!=='ready'&&Date.now()<deadline){assert.notEqual(s.state,'failed',s.error+' '+s.log);await new Promise(r=>setTimeout(r,1000));s=await runtime.status();}
  assert.equal(s.state,'ready',JSON.stringify(s)+' '+runtime.output);assert(s.gpu.includes('4060'));console.log('Ready on GPU:',s.gpu);
  canStop=false;await assert.rejects(runtime.action('stop'),/先暂停/);assert.equal((await runtime.status()).state,'ready');
  canStop=true;s=await runtime.action('stop');assert.equal(s.state,'stopped');assert.equal(s.owned,false);console.log('Stop released managed service');
  await runtime.action('start');await runtime.action('stop');assert.equal((await runtime.status()).state,'stopped');console.log('Cancel during startup passed');
  await runtime.action('start');await runtime.dispose();assert.equal((await runtime.status()).state,'stopped');console.log('Dispose/exit closes child through stdin watchdog');
  // Simulate an abrupt app exit without running runtime.dispose().
  const code = `const {LibraryModelRuntime}=require(${JSON.stringify(resolve('.cache/library-stage1/model-runtime.cjs'))});
    (async()=>{const r=new LibraryModelRuntime(${JSON.stringify(resolve('.'))},async()=>true,18083);await r.action('start');
    for(let i=0;i<120;i++){const s=await r.status();if(s.state==='ready'){process.exit(0)};if(s.state==='failed'){console.error(s);process.exit(1)};await new Promise(r=>setTimeout(r,1000))};process.exit(2)})().catch(e=>{console.error(e);process.exit(1)});`;
  const parent=spawn(process.execPath,['-e',code],{windowsHide:true,stdio:['ignore','inherit','inherit']});
  assert.equal(await new Promise(r=>parent.once('exit',r)),0);
  for(let i=0;i<30&&(await runtime.status()).state==='ready';i++)await new Promise(r=>setTimeout(r,100));
  assert.equal((await runtime.status()).state,'stopped');console.log('Abrupt parent exit released GPU service');
  console.log('PASS runtime: external ownership, occupied port, GPU startup, active-task guard, cancel and shutdown');
} finally { await runtime.dispose();server?.closeAllConnections();server?.close(); }
