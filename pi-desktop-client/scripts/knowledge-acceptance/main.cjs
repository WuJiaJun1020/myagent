const {app,BrowserWindow}=require('electron');
const {join,resolve}=require('node:path');const {writeFileSync}=require('node:fs');const assert=require('node:assert/strict');
const out=resolve(process.argv[2]);app.setPath('userData',join(out,'profile-'+process.pid));let win;const results=[];
const delay=ms=>new Promise(r=>setTimeout(r,ms));const js=code=>win.webContents.executeJavaScript(code,true);
async function wait(code){for(let i=0;i<100;i++){if(await js(code))return;await delay(100);}throw Error('Timeout: '+code);}
async function shot(name){await delay(150);writeFileSync(join(out,name+'.png'),(await win.webContents.capturePage()).toPNG());}
async function close(){await js(`document.querySelector('.knowledge-dialog > header button').click()`);await delay(100);}
app.whenReady().then(async()=>{
 win=new BrowserWindow({show:false,width:1440,height:960,webPreferences:{contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}});
 await win.loadFile(join(out,'index.html'));win.showInactive();await wait(`!!document.querySelector('.knowledge-source-card')`);
 for(const palette of ['gray','sand','mist'])for(const theme of ['light','dark']){
  await js(`qa.settings.setState({palette:'${palette}',theme:'${theme}'})`);
  for(const tab of ['sources','generate','review']){
   await js(`qa.knowledge.getState().setTab('${tab}')`);await delay(250);
   assert.equal(await js(`document.documentElement.scrollWidth>innerWidth`),false);
   assert.equal(await js(`document.querySelector('.knowledge-studio-content').getBoundingClientRect().height>500`),true);
   await shot(`${palette}-${theme}-${tab}`);results.push(`${palette}/${theme}/${tab}`);
  }
 }
 await js(`qa.settings.setState({theme:'light',palette:'gray'});qa.knowledge.getState().setTab('generate')`);await wait(`!!document.querySelector('.knowledge-config-entry')`);
 assert.equal(await js(`document.querySelector('.knowledge-ai-prompt-content')===null`),true);
 assert.equal(await js(`getComputedStyle(document.querySelector('.knowledge-sidebar-summary > button strong')).fontSize===getComputedStyle(document.querySelector('.knowledge-sidebar-summary > strong')).fontSize`),true);
 await js(`document.querySelector('.knowledge-config-entry').click()`);await wait(`!!document.querySelector('.knowledge-dialog[open]')`);
 await js(`document.querySelector('.knowledge-dialog textarea').focus()`);await win.webContents.insertText('优先考察可靠性');await shot('model-prompt-dialog');
 assert.equal(await js(`getComputedStyle(document.querySelector('.knowledge-ai-routing label')).fontSize===getComputedStyle(document.querySelector('.knowledge-ai-routing select')).fontSize`),true);
 await js(`qa.settings.setState({theme:'dark'})`);await shot('model-prompt-dialog-dark');await js(`qa.settings.setState({theme:'light'})`);
 assert.equal(await js(`document.querySelector('.knowledge-dialog').getBoundingClientRect().bottom<innerHeight`),true);await close();
 await js(`document.querySelector('.knowledge-config-entry').click()`);await wait(`!!document.querySelector('.knowledge-dialog[open]')`);
 assert.equal(await js(`document.querySelector('.knowledge-dialog textarea').value`),'优先考察可靠性');await close();
 await js(`document.querySelector('.knowledge-source-select-button').click()`);await wait(`!!document.querySelector('.knowledge-source-picker')`);
 await js(`document.querySelector('.knowledge-source-picker input').click();document.querySelector('.knowledge-dialog footer button:first-child').click()`);
 assert.equal(await js(`document.querySelector('.knowledge-form-source-count').textContent.startsWith('1')`),true);
 await js(`document.querySelector('.knowledge-source-select-button').click()`);await wait(`!!document.querySelector('.knowledge-source-picker')`);
 await js(`document.querySelector('.knowledge-source-picker input').click()`);await shot('source-picker');
 await js(`document.querySelector('.knowledge-dialog footer button.primary').click()`);await delay(150);assert.equal(await js(`document.querySelector('.knowledge-form-source-count').textContent.startsWith('0')`),true);
 await js(`document.querySelector('.knowledge-source-select-button').click()`);await wait(`!!document.querySelector('.knowledge-source-picker')`);await js(`document.querySelector('.knowledge-source-picker input').click()`);await delay(100);await js(`document.querySelector('.knowledge-dialog footer button.primary').click()`);await wait(`!!document.querySelector('.knowledge-detail-link')`);
 await js(`document.querySelector('.knowledge-detail-link').click()`);await shot('budget-dialog');await close();
 await js(`qa.knowledge.getState().setTab('sources')`);await wait(`!!document.querySelector('.knowledge-import-menu')`);
 await js(`document.querySelector('.knowledge-import-menu button:nth-child(2)').click()`);await wait(`!!document.querySelector('.knowledge-dialog[open]')`);await shot('import-dialog');
 win.webContents.sendInputEvent({type:'keyDown',keyCode:'Escape'});win.webContents.sendInputEvent({type:'keyUp',keyCode:'Escape'});await wait(`!document.querySelector('.knowledge-dialog')`);
 await js(`document.querySelector('.knowledge-detail-heading .danger-ghost').click()`);await wait(`!!document.querySelector('.knowledge-dialog[open]')`);await shot('delete-dialog');
 assert.equal(await js(`document.activeElement.textContent`),'取消');await close();assert.deepEqual(await js('qa.deleted'),[]);
 await js(`document.querySelector('.knowledge-detail-heading .danger-ghost').click()`);await wait(`!!document.querySelector('.knowledge-dialog[open]')`);await js(`document.querySelector('.knowledge-dialog button.danger').click()`);await delay(150);
 assert.equal(await js('qa.deleted.length'),1);
 await js(`qa.knowledge.getState().setTab('review')`);await wait(`!!document.querySelector('.knowledge-review-topbar .danger-ghost')`);
 await js(`document.querySelector('.knowledge-review-topbar .danger-ghost').click()`);await wait(`!!document.querySelector('.knowledge-dialog[open]')`);await js(`document.querySelector('.knowledge-dialog button.danger').click()`);await delay(150);assert.equal(await js('qa.deleted[1]'),'b1');
 await js(`document.querySelector('.knowledge-task-toggle').click()`);await delay(150);assert.equal(await js(`getComputedStyle(document.querySelector('.knowledge-batch-list')).display`),'none');await shot('tasks-collapsed');await js(`document.querySelector('.knowledge-task-toggle').click()`);
 win.setSize(1100,800);for(const tab of ['sources','generate','review']){await js(`qa.knowledge.getState().setTab('${tab}')`);await delay(250);await shot('narrow-'+tab);if(tab==='review')assert.equal(await js(`document.querySelector('.knowledge-review-title').getBoundingClientRect().width>200`),true);assert.equal(await js(`document.documentElement.scrollWidth>innerWidth`),false);}
 assert.deepEqual(await js('qa.errors'),[]);writeFileSync(join(out,'results.json'),JSON.stringify({passed:true,views:results,checks:['modal edit persistence','source cancel/apply','budget','import escape','delete cancel/confirm','narrow layout']},null,2));console.log('PASS: 18 themed views, 3 narrow views and modal interactions');app.exit(0);
}).catch(async e=>{console.error(e);if(win)console.error(await js('JSON.stringify(qa?.errors)'));app.exit(1)});
