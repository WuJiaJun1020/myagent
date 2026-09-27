const {app,BrowserWindow}=require('electron');const {resolve,join}=require('node:path');const {writeFileSync}=require('node:fs');const assert=require('node:assert/strict');
const out=resolve(process.argv[2]);app.setPath('userData',join(out,'profile-'+process.pid));let win;
const pause=ms=>new Promise(r=>setTimeout(r,ms));const js=s=>win.webContents.executeJavaScript(s,true);
async function shot(name){await pause(200);writeFileSync(join(out,name+'.png'),(await win.webContents.capturePage()).toPNG())}
app.whenReady().then(async()=>{win=new BrowserWindow({width:1150,height:900,show:false,webPreferences:{contextIsolation:true,nodeIntegration:false}});await win.loadFile(join(out,'index.html'));win.showInactive();await pause(500);
assert.equal(await js(`document.querySelector('.task-activity-toggle').getAttribute('aria-expanded')`),'false');
await js(`document.querySelector('.task-activity-toggle').click()`);await pause(100);assert.equal(await js(`document.querySelectorAll('.task-operation-toggle').length`),2);
assert.equal(await js(`document.querySelector('.task-inline-detail')`),null);await shot('process-light');
await js(`document.querySelector('.task-operation-toggle').click()`);await pause(100);await js(`document.querySelectorAll('.task-call-toggle')[1].click()`);await pause(100);
assert.equal(await js(`document.querySelector('.task-inline-output').scrollHeight>document.querySelector('.task-inline-output').clientHeight`),true);
assert.equal(await js(`document.querySelector('.task-inline-detail').getBoundingClientRect().right <= document.querySelector('.task-activity').getBoundingClientRect().right + 1`),true);await shot('command-light');await js(`document.querySelector('.task-inline-detail header button').click()`);assert.equal(await js(`qa.ui.getState().detailSelection.id`),'shell');
await js(`qa.update({tools:{...qa.tools,shell:{...qa.tools.shell,status:'running',output:[{type:'text',text:'流式输出更新'}]}},settled:false})`);await pause(100);assert.equal(await js(`document.querySelector('.task-inline-output').textContent.includes('流式输出更新')`),true);
await js(`qa.update({tools:qa.tools,settled:true})`);await pause(100);assert.equal(await js(`document.querySelector('.task-activity-toggle').getAttribute('aria-expanded')`),'true');
for(const palette of ['gray','sand','mist'])for(const theme of ['light','dark']){await js(`qa.settings.setState({palette:'${palette}',theme:'${theme}'})`);await shot(`${palette}-${theme}`);}
win.setSize(680,800);await shot('narrow');assert.equal(await js(`document.querySelector('.task-inline-detail').getBoundingClientRect().right <= innerWidth`),true);assert.equal(await js(`document.querySelector('.task-call-toggle span').getBoundingClientRect().right <= innerWidth`),true);assert.equal(await js(`document.documentElement.scrollWidth>innerWidth`),false);
await js(`document.querySelector('.task-thinking-row summary').click()`);await pause(100);assert.equal(await js(`document.querySelector('.task-thinking-row').open`),true);
await js(`document.querySelectorAll('.task-call-toggle')[0].click()`);await pause(100);assert.equal(await js(`!!document.querySelector('.task-inline-output img')`),true);
 await js(`document.querySelectorAll('.task-operation-toggle')[1].click()`);await pause(100);await js(`document.querySelectorAll('.task-call-toggle')[2].click()`);await pause(100);assert.equal(await js(`!!document.querySelector('.task-inline-output .diff-viewer')`),true);
 await js(`qa.update({tools:qa.tools,settled:true,items:[{type:'final-thinking',messageId:'c'},{type:'tool',toolId:'shell'},{type:'assistant',messageId:'b'},{type:'tool',toolId:'failed'}]})`);await pause(100);
 assert.equal(await js(`document.querySelectorAll('.task-operation-toggle').length`),0);
 assert.equal(await js(`document.querySelectorAll('.task-call-toggle').length`),2);
 await js(`document.querySelector('.task-call-toggle').click()`);await pause(100);
 assert.equal(await js(`!!document.querySelector('.task-inline-detail')`),true);
 assert.equal(await js(`document.documentElement.scrollWidth>innerWidth`),false);
 await shot('single-call-narrow');
 assert.deepEqual(await js('qa.errors'),[]);console.log('PASS: grouped and single calls, inline output, inspector, streaming updates, manual expansion, six themes and narrow width');app.exit(0);
}).catch(async e=>{console.error(e);console.error(await js(`JSON.stringify({errors:qa.errors,calls:[...document.querySelectorAll(".task-call-toggle")].map(x=>x.textContent),html:document.querySelectorAll(".task-inline-output")[2]?.innerHTML})`));app.exit(1)});
