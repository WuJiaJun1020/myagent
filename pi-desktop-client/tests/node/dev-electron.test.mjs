import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { DevElectron } from '../../scripts/dev-electron.mjs';
const script = `process.send({type:'ready'});process.on('message',m=>{if(m.type==='pi-desktop-dev:quit'){process.send({type:'quitting'});setTimeout(()=>process.exit(0),30)}});`;
function runner(onExit) { return new DevElectron({ executable: process.execPath, args: ['-e', script], env: process.env, onExit, timeoutMs: 3000 }); }
test('restart waits for graceful shutdown and stop closes the replacement', async () => {
 const app=runner();try{await app.restart();const first=app.child;await once(first,'message');const quitting=once(first,'message');await app.restart();assert.equal((await quitting)[0].type,'quitting');assert.equal(first.exitCode,0);assert.notEqual(app.child.pid,first.pid);const second=app.child;await once(second,'message');await app.stop();assert.equal(second.exitCode,0);await app.restart();assert.equal(app.child,undefined);}finally{await app.stop();}
});
test('concurrent restart requests are serialized and stop wins', async () => {
 const app=runner();try{await app.restart();await once(app.child,'message');const restarting=app.restart();const pending=app.restart();await app.stop();await Promise.all([restarting,pending]);assert.equal(app.child,undefined);assert.equal(app.stopped,true);}finally{await app.stop();}
});
test('a normal window exit notifies the supervisor', async () => {
 let notify;const exit=new Promise(r=>notify=r);const app=runner(notify);try{await app.restart();await once(app.child,'message');app.child.send({type:'pi-desktop-dev:quit'});assert.equal(await exit,0);}finally{await app.stop();}
});
