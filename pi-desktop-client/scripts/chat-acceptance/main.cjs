const {app,BrowserWindow}=require('electron');const {join,resolve}=require('node:path');const {writeFileSync}=require('node:fs');const assert=require('node:assert/strict');
const out=resolve(process.argv[2]);app.setPath('userData',join(out,'profile-'+process.pid));let win;
const pause=ms=>new Promise(r=>setTimeout(r,ms));const js=code=>win.webContents.executeJavaScript(code,true);
app.whenReady().then(async()=>{
 win=new BrowserWindow({width:1100,height:850,show:false,webPreferences:{nodeIntegration:false,contextIsolation:true}});await win.loadFile(join(out,'index.html'));win.show();win.focus();await pause(500);
 assert.deepEqual(await js('qa.errors'),[]);
 await js(`document.querySelector('[aria-label="项目文件"]').click()`);await pause(50);assert.equal(await js('qa.ui.getState().moduleViews.agent'),'files');
 await js(`document.querySelector('[aria-label="项目文件"]').click()`);await pause(50);assert.equal(await js('qa.ui.getState().moduleViews.agent'),'activity');
 assert.equal(await js(`document.querySelectorAll('.chat-turn-navigation button').length`),20);
 await js(`document.querySelector('.chat-turn-navigation button').click()`);await pause(250);
 assert.equal(await js(`document.querySelector('.activity-stream').scrollTop < 100`),true);
 await js(`qa.ui.getState().setSessionComposerDraft('test',{text:'立即显示测试',attachments:[]})`);await pause(80);
 await js(`document.querySelector('textarea').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))`);await pause(120);
 assert.equal(await js(`qa.pending.getState().pending.length`),1);
 assert.equal(await js(`document.querySelector('.activity-stream').textContent.includes('立即显示测试')`),true);
 await js(`qa.ui.getState().setSessionComposerDraft('test',{text:'新草稿',attachments:[]});qa.resolve()`);await pause(80);
 assert.equal(await js(`qa.ui.getState().sessionComposerDrafts.test.text`),'新草稿');
 await js(`const m={id:'confirmed',role:'user',content:[{type:'text',contentIndex:0,text:'立即显示测试'}],timestamp:Date.now(),streaming:false};qa.agent.setState(s=>({messagesById:{...s.messagesById,confirmed:m},timelineOrder:[...s.timelineOrder,{type:'message',id:'confirmed'}],activityRevision:s.activityRevision+1}))`);await pause(80);
 assert.equal(await js('qa.pending.getState().pending.length'),0);
 await js(`qa.ui.getState().setSessionComposerDraft('test',{text:'失败测试',attachments:[]})`);await pause(60);
 await js(`document.querySelector('textarea').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))`);await pause(60);
 await js(`qa.reject(new Error('测试发送失败'))`);await pause(60);
 assert.equal(await js('qa.pending.getState().pending.length'),0);assert.equal(await js('qa.ui.getState().sessionComposerDrafts.test.text'),'失败测试');
 const point=await js(`(()=>{const r=document.querySelectorAll('.chat-turn-navigation button')[9].getBoundingClientRect();return{x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()`);
 win.webContents.sendInputEvent({type:'mouseMove',x:300,y:80});await pause(50);win.webContents.sendInputEvent({type:'mouseMove',...point});await pause(1000);
 assert.equal(await js(`!!document.querySelector('.chat-turn-preview')`),true);
 for(const index of [4,15,3,18,9]) {
  const next=await js(`(()=>{const r=document.querySelectorAll('.chat-turn-navigation button')[${index}].getBoundingClientRect();return{x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()`);
  win.webContents.sendInputEvent({type:'mouseMove',...next});await pause(100);
  assert.equal(await js(`document.querySelector('.chat-turn-preview strong')?.textContent`),`问题 ${index+1}`);
  assert.equal(await js(`document.querySelectorAll('.chat-turn-preview').length`),1);
 }
 assert.equal(await js(`(()=>{const el=document.querySelector('.chat-turn-preview').closest('.app-tooltip');return el.scrollWidth<=el.clientWidth})()`),true);
 writeFileSync(join(out,'navigation-light.png'),(await win.webContents.capturePage()).toPNG());
 await js(`document.documentElement.dataset.theme='dark'`);win.setSize(900,760);await pause(150);
 assert.equal(await js(`document.documentElement.scrollWidth>innerWidth`),false);
 writeFileSync(join(out,'navigation-dark-narrow.png'),(await win.webContents.capturePage()).toPNG());
 win.webContents.sendInputEvent({type:'mouseMove',x:400,y:100});await pause(100);
 assert.equal(await js(`document.querySelectorAll('.chat-turn-preview').length`),0);
 win.focus();await pause(100);
 await js(`document.querySelectorAll('.chat-turn-navigation button')[6].focus()`);await pause(100);
 assert.equal(await js(`document.querySelector('.chat-turn-preview strong')?.textContent`),'问题 7');
 await js(`document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`);await pause(50);
 assert.equal(await js(`document.querySelectorAll('.chat-turn-preview').length`),0);
 assert.deepEqual(await js('qa.errors'),[]);console.log('PASS: file toggle, 20-turn navigation jump, immediate message before RPC, acknowledgement, draft preservation and failure recovery');app.exit(0);
}).catch(async error=>{console.error(error);if(win)console.error(await js('JSON.stringify(qa.errors)'));app.exit(1)});

