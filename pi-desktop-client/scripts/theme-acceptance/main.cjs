const { app, BrowserWindow, ipcMain, nativeTheme } = require('electron');
const { join, resolve } = require('node:path');
const { writeFileSync } = require('node:fs');
const assert = require('node:assert/strict');
const pty = require('node-pty');
const out=resolve(process.argv[2]);
app.setPath('userData',join(out,'profile-'+process.pid));
const results=[]; const processes=new Map(); let creates=0,kills=0,window;
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function js(code){return window.webContents.executeJavaScript(code,true);}
async function waitFor(code){for(let i=0;i<100;i++){if(await js(code))return;await delay(100);}throw new Error('Timeout: '+code);}
async function screenshot(name){await delay(400);await js('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');await window.webContents.capturePage();await delay(120);writeFileSync(join(out,name+'.png'),(await window.webContents.capturePage()).toPNG());}
async function check(name,fn){await fn();results.push({name,passed:true});console.log('PASS '+name);}
function stop(){for(const item of processes.values())item.kill();processes.clear();}
async function gracefulStop(){const children=[...processes.values()];for(const child of children)child.write('exit\r');for(let i=0;i<40&&processes.size;i++)await delay(50);if(processes.size)stop();}
ipcMain.handle('qa:create',(_,request)=>{
 const id=String(++creates);
 const child=pty.spawn(join(process.env.SystemRoot,'System32','WindowsPowerShell','v1.0','powershell.exe'),['-NoLogo','-NoProfile'],{cwd:out,cols:request.cols,rows:request.rows,env:process.env,useConpty:true});
 processes.set(id,child);
 child.onData(data=>{if(!window.isDestroyed())window.webContents.send('qa:data',{id,data});});
 child.onExit(event=>{processes.delete(id);if(!window.isDestroyed())window.webContents.send('qa:exit',{id,...event});});
 return {id,pid:child.pid,cwd:out,profile:{id:'qa',name:'Acceptance PTY'}};
});
ipcMain.handle('qa:kill',(_,id)=>{kills++;processes.get(id)?.kill();});
ipcMain.on('qa:resize',(_,r)=>processes.get(r.id)?.resize(r.cols,r.rows));
ipcMain.on('qa:write',(_,r)=>processes.get(r.id)?.write(r.data));
const timeout=setTimeout(()=>{console.error('Acceptance timed out');stop();app.exit(1);},120000);
app.whenReady().then(async()=>{
 window=new BrowserWindow({show:false,width:1280,height:820,webPreferences:{preload:join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,backgroundThrottling:false,additionalArguments:['--qa-cwd='+out]}});
 window.webContents.on('console-message',event=>{if(event.level==='error')console.error('RENDERER '+event.message);});
 await window.loadFile(join(out,'index.html'));
 window.showInactive();
 await waitFor('!!window.qa && !!document.querySelector(".composer textarea") && !!document.querySelector(".terminal-panel small")');
 const originalPid=[...processes.values()][0].pid;
 await js(`window.qa.composer=document.querySelector('.composer textarea'); window.qa.terminal=document.querySelector('.xterm');
 Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(qa.composer,'P4 验收草稿，不发送');qa.composer.dispatchEvent(new Event('input',{bubbles:true}));`);
 await waitFor(`qa.ui.getState().sessionComposerDrafts['qa-session']?.text==='P4 验收草稿，不发送'`);
 await check('主题切换保持对话滚动位置',async()=>{
  await js(`qa.ui.setState({terminalPanelOpen:false})`);
  await waitFor(`document.querySelector('.activity-stream').scrollHeight>1000`);
  await delay(250);
  await js(`qa.stream=document.querySelector('.activity-stream');qa.stream.scrollTop=300;`);await delay(180);
  const before=await js('qa.stream.scrollTop');assert.ok(before>0);
  await js(`qa.ui.getState().setSettingsOpen(true);qa.settings.setState({theme:'dark',palette:'sand'})`);await delay(150);
  await js(`qa.ui.getState().setSettingsOpen(false)`);await delay(150);
  assert.equal(await js(`qa.stream===document.querySelector('.activity-stream')`),true);
  assert.ok(Math.abs(await js('qa.stream.scrollTop')-before)<3);
 });
 await check('真实编辑器未保存内容跨主题保留',async()=>{
  await js(`qa.ui.getState().setAgentView('files')`);
  await waitFor(`!!document.querySelector('.code-editor textarea')`);
  await js(`qa.editor=document.querySelector('.code-editor textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(qa.editor,'Edited acceptance file');qa.editor.dispatchEvent(new Event('input',{bubbles:true}));`);
  await waitFor(`qa.workspace.getState().draftsByPath['acceptance.txt']?.content==='Edited acceptance file'`);
  await js(`qa.ui.getState().setSettingsOpen(true);qa.settings.getState().setPalette('sand');qa.settings.getState().setTheme('dark');`);
  await delay(150);
  assert.equal(await js(`qa.editor.isConnected && qa.editor.value==='Edited acceptance file'`),true);
  await js(`qa.ui.getState().setSettingsOpen(false)`);
  await waitFor(`!document.querySelector('.settings-page') && getComputedStyle(document.querySelector('.workspace-shell')).visibility==='visible'`);
  await screenshot('editor-dark-unsaved');

 });
 await check('草稿跨设置页与主题保留，终端 DOM 不重建',async()=>{
  await js(`qa.ui.getState().setAgentView('activity');qa.settings.getState().setPalette('mist');qa.settings.getState().setTheme('light')`);
  await waitFor(`!!document.querySelector('.composer textarea')`);
  assert.equal(await js(`document.querySelector('.composer textarea').value`),'P4 验收草稿，不发送');
  assert.equal(await js(`qa.terminal === document.querySelector('.xterm')`),true);
  assert.equal(creates,1);assert.equal(kills,0);assert.equal([...processes.values()][0].pid,originalPid);
 });
 await check('跟随系统实时响应，固定明暗不随系统改变',async()=>{
  await js(`qa.settings.getState().setTheme('system')`);
  nativeTheme.themeSource='dark';await waitFor(`document.documentElement.dataset.theme==='dark'`);
  nativeTheme.themeSource='light';await waitFor(`document.documentElement.dataset.theme==='light'`);
  await js(`qa.settings.getState().setTheme('dark')`);await waitFor(`document.documentElement.dataset.theme==='dark'`);
  nativeTheme.themeSource='dark';nativeTheme.themeSource='light';await delay(100);
  assert.equal(await js(`document.documentElement.dataset.theme`),'dark');
 });
 for(const palette of ['gray','sand','mist'])for(const theme of ['light','dark']){
  await check(`${palette}/${theme} 窄窗口及最大字号`,async()=>{
   window.setContentSize(900,620);
   await js(`qa.settings.setState({palette:'${palette}',theme:'${theme}',uiFontSize:17,contentFontSize:20,codeFontSize:18});qa.ui.setState({settingsOpen:false,terminalPanelOpen:false})`);await delay(180);
   const geometry=await js(`(()=>{const a=document.querySelector('.composer-toolbar').getBoundingClientRect(),b=document.querySelector('.composer-tools').getBoundingClientRect(),c=document.querySelector('.composer-submit').getBoundingClientRect();return {overflow:document.documentElement.scrollWidth>innerWidth,overlap:b.right>c.left+1,toolsBottom:b.bottom,submitTop:c.top,toolbar:a.height};})()`);
   assert.equal(geometry.overflow,false,JSON.stringify(geometry));assert.equal(geometry.overlap,false,JSON.stringify(geometry));assert.ok(geometry.toolsBottom>geometry.submitTop,JSON.stringify(geometry));
   await screenshot(`${palette}-${theme}-narrow-chat`);
   const footer=await js(`(()=>{const s=document.querySelector('.sidebar');s.scrollTop=s.scrollHeight;const r=s.querySelector('.sidebar-footer').getBoundingClientRect();const result=r.bottom<=innerHeight+1;s.scrollTop=0;return result;})()`);
   assert.equal(footer,true,'sidebar footer must remain reachable at maximum font size');
   await js(`qa.ui.getState().setSettingsOpen(true)`);await delay(100);
   assert.equal(await js(`document.documentElement.scrollWidth>innerWidth`),false);
   await screenshot(`${palette}-${theme}-large-settings`);
  });
 }
 await check('窄窗口代码审查保持左右结构',async()=>{
  await js(`qa.ui.getState().setSettingsOpen(false);qa.ui.getState().toggleAgentReview()`);
  await waitFor(`!!document.querySelector('.git-review-body')`);
  const rects=await js(`(()=>{const d=document.querySelector('.git-review-diff').getBoundingClientRect(),t=document.querySelector('.git-review-tree').getBoundingClientRect();return {dx:d.x,dy:d.y,tx:t.x,ty:t.y,dw:d.width,tw:t.width};})()`);
  assert.ok(rects.tx>rects.dx && Math.abs(rects.dy-rects.ty)<3,JSON.stringify(rects));
  await waitFor(`!document.querySelector('.settings-page')`);
  await screenshot('narrow-review');
 });
 await check('PTY 跨主题、设置与面板隐藏持续存活并能响应',async()=>{
  assert.equal(creates,1);assert.equal(kills,0);assert.equal([...processes.values()][0].pid,originalPid);
  const child=[...processes.values()][0];let reply='';const subscription=child.onData(data=>reply+=data);
  child.write("Write-Output ('P4_' + 'STILL_ALIVE')\r");
  for(let i=0;i<80&&!reply.includes('P4_STILL_ALIVE');i++)await delay(100);
  subscription.dispose();assert.ok(reply.includes('P4_STILL_ALIVE'));
  await js(`qa.ui.getState().setAgentView('activity');qa.ui.setState({terminalPanelOpen:true,agentDetailPanelOpen:false})`);await delay(100);
  assert.equal(await js(`qa.terminal===document.querySelector('.xterm')`),true);
  await screenshot('terminal-retained');
 });
 const liveMetrics={creates,kills};
 assert.deepEqual(await js('qa.errors'),[]);
 await check('重载恢复外观偏好（仅持久化设置，不要求未发送草稿跨重启）',async()=>{
  await js(`qa.settings.setState({palette:'sand',accent:'green',theme:'system'})`);
  const persisted=await js(`JSON.parse(localStorage.getItem('pi-desktop-settings')).state`);
  assert.equal(persisted.palette,'sand');assert.equal(persisted.accent,'green');assert.equal(persisted.theme,'system');
  await gracefulStop();
  await new Promise(resolve=>{window.webContents.once('did-finish-load',resolve);window.webContents.reload();});
  await waitFor(`!!window.qa && document.documentElement.dataset.palette==='sand'`);
  assert.equal(await js(`qa.settings.getState().accent`),'green');
  assert.equal(await js(`qa.settings.getState().theme`),'system');
  assert.equal(await js(`document.documentElement.dataset.theme`),'light');
 });
 assert.deepEqual(await js('qa.errors'),[]);
 writeFileSync(join(out,'results.json'),JSON.stringify({success:true,electron:process.versions.electron,ptyPid:originalPid,...liveMetrics,results},null,2));
 console.log(`Acceptance passed: ${results.length} checks. Artifacts: ${out}`);
 await gracefulStop();clearTimeout(timeout);app.exit(0);
}).catch(error=>{console.error(error);writeFileSync(join(out,'results.json'),JSON.stringify({success:false,error:String(error),results},null,2));stop();clearTimeout(timeout);app.exit(1);});
