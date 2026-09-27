const {app,BrowserWindow}=require('electron');
const {join,resolve}=require('node:path');const {writeFileSync}=require('node:fs');const assert=require('node:assert/strict');
const out=resolve(process.argv[2]);app.setPath('userData',join(out,'profile-'+process.pid));let win;const results=[];
const delay=ms=>new Promise(r=>setTimeout(r,ms));const js=code=>win.webContents.executeJavaScript(code,true);
async function wait(code){for(let i=0;i<100;i++){if(await js(code))return;await delay(100);}throw Error('Timeout: '+code);}
async function shot(name){await delay(300);writeFileSync(join(out,name+'.png'),(await win.webContents.capturePage()).toPNG());}
app.whenReady().then(async()=>{win=new BrowserWindow({show:false,width:1440,height:960,webPreferences:{contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}});await win.loadFile(join(out,'index.html'));win.showInactive();await wait('!!window.qa && !!document.querySelector(".interview-page")');
await js(`qa.deleted=[];qa.interviews.setState({deleteInterview:async id=>{qa.deleted.push(id)}});document.querySelector('.interview-sidebar-delete').click()`);
await wait(`!!document.querySelector('.interview-delete-dialog[open]')`);await shot('delete-confirm-light');
assert.equal(await js(`document.activeElement.textContent`),'取消');
await js(`document.querySelector('.interview-delete-dialog footer button').click()`);await delay(150);assert.deepEqual(await js('qa.deleted'),[]);
await js(`document.querySelector('.interview-sidebar-delete').click()`);await wait(`!!document.querySelector('.interview-delete-dialog[open]')`);
await js(`document.querySelector('.interview-delete-dialog').dispatchEvent(new Event('cancel',{cancelable:true}))`);await delay(150);assert.deepEqual(await js('qa.deleted'),[]);
await js(`document.querySelector('.interview-sidebar-delete').click()`);await wait(`!!document.querySelector('.interview-delete-dialog[open]')`);
await js(`document.querySelector('.interview-delete-dialog button.danger').click()`);await delay(150);assert.deepEqual(await js('qa.deleted'),['qa-interview']);
// Creation editors keep the page compact and retain edited form values.
await js(`qa.ui.getState().setInterviewView('dashboard');qa.jobs.setState({jobs:[{id:'qa-job',title:'后端开发',company:'测试公司',city:'上海',category:'工程'}]})`);
await wait(`!!document.querySelector('[role="combobox"]')`);
await js(`document.querySelector('[role="combobox"]').focus()`);
await win.webContents.insertText('后端');await wait(`!!document.querySelector('[role="option"]')`);await shot('create-job-picker');
win.webContents.sendInputEvent({type:'keyDown',keyCode:'Return'});win.webContents.sendInputEvent({type:'keyUp',keyCode:'Return'});
await wait(`document.querySelector('[role="combobox"]').value.includes('测试公司')`);
assert.equal(await js(`document.querySelectorAll('.interview-create-card details').length`),0);
await js(`document.querySelector('.interview-create-resume button').click()`);await wait(`!!document.querySelector('.interview-create-dialog[open]')`);
await js(`document.querySelector('.interview-create-dialog textarea').focus();document.querySelector('.interview-create-dialog textarea').select()`);
await win.webContents.insertText('验收编辑的简历');await shot('create-resume-dialog');
await js(`document.querySelector('.interview-create-dialog footer button').click()`);
await js(`document.querySelector('.interview-create-resume button').click()`);await wait(`!!document.querySelector('.interview-create-dialog[open]')`);
assert.equal(await js(`document.querySelector('.interview-create-dialog textarea').value`),'验收编辑的简历');
win.webContents.sendInputEvent({type:'keyDown',keyCode:'Escape'});win.webContents.sendInputEvent({type:'keyUp',keyCode:'Escape'});
await wait(`!document.querySelector('.interview-create-dialog')`);
for(const selector of ['.interview-create-config > button', ...[1,2,3,4].map(i=>'.interview-create-prompt-links button:nth-of-type('+i+')')]){
 await js(`document.querySelector('${selector}').click()`);await wait(`!!document.querySelector('.interview-create-dialog[open]')`);
 assert.equal(await js(`document.querySelector('.interview-create-dialog').getBoundingClientRect().bottom <= innerHeight`),true);
 await shot('create-editor-'+selector.replace(/[^a-z0-9]/gi,''));
 await js(`document.querySelector('.interview-create-dialog header button').click()`);
}
await shot('create-compact');
await js(`qa.jobs.setState({jobs:[]})`);
// Real mouse/keyboard input against Monaco; persistence stays in the fake store.
await js(`qa.saved=[];qa.algorithms.setState({saveDraft:async r=>{qa.saved.push(r);qa.algorithms.setState(s=>({draftStatus:{...s.draftStatus,[r.mode]:'saved'}}))}});qa.ui.getState().setInterviewView('algorithms')`);
await wait(`!!document.querySelector('.python-code-editor .view-lines')`);
const blank=await js(`(()=>{const r=document.querySelector('.python-code-editor .monaco-editor').getBoundingClientRect();return {x:Math.round(r.left+130),y:Math.round(r.bottom-55)}})()`);
assert.equal(await js(`getComputedStyle(document.elementFromPoint(${blank.x},${blank.y})).cursor`),'text');
win.webContents.sendInputEvent({type:'mouseDown',...blank,button:'left',clickCount:1});win.webContents.sendInputEvent({type:'mouseUp',...blank,button:'left',clickCount:1});
await win.webContents.insertText('\nrange');
await wait(`qa.algorithms.getState().problem.drafts.leetcode.includes('range')`);
win.webContents.sendInputEvent({type:'keyDown',keyCode:'Space',modifiers:['control']});win.webContents.sendInputEvent({type:'keyUp',keyCode:'Space',modifiers:['control']});
await wait(`!!document.querySelector('.suggest-widget.visible')`);await shot('monaco-completion-light');
await wait('qa.saved.length>0');
const edited=await js('qa.algorithms.getState().problem.drafts.leetcode');
await js(`qa.settings.setState({theme:'dark'})`);await delay(200);assert.equal(await js('qa.algorithms.getState().problem.drafts.leetcode'),edited);await shot('monaco-completion-dark');
win.webContents.sendInputEvent({type:'keyDown',keyCode:'Escape'});
await js(`document.querySelector('.algorithm-editor-toolbar nav button:nth-child(2)').click()`);await delay(250);
await js(`document.querySelector('.algorithm-editor-toolbar nav button:first-child').click()`);await delay(250);assert.equal(await js('qa.algorithms.getState().problem.drafts.leetcode'),edited);
await js(`qa.algorithms.setState(s=>({problem:{...s.problem,answers:[{mode:'leetcode',name:'参考答案',file:'answer.py',code:'print(42)'}]}}));qa.algorithms.getState().setView('answers')`);
await wait(`!!document.querySelector('.python-code-editor[data-readonly="true"] .monaco-editor')`);
const readonlyPoint=await js(`(()=>{const r=document.querySelector('.python-code-editor .view-lines').getBoundingClientRect();return{x:Math.round(r.left+30),y:Math.round(r.top+12)}})()`);
win.webContents.sendInputEvent({type:'mouseDown',...readonlyPoint,button:'left',clickCount:1});win.webContents.sendInputEvent({type:'mouseUp',...readonlyPoint,button:'left',clickCount:1});await win.webContents.insertText('SHOULD_NOT_EDIT');await delay(200);
assert.equal(await js(`document.querySelector('.python-code-editor .view-lines').textContent.includes('SHOULD_NOT_EDIT')`),false);
await js(`qa.algorithms.getState().setView('leetcode')`);
for(const palette of ['gray','sand','mist'])for(const theme of ['light','dark']){
 await js(`qa.settings.setState({palette:'${palette}',theme:'${theme}'})`);
 for(const view of ['dashboard','records','jobs','session','question-bank','algorithms']){
 await js(`qa.ui.getState().setInterviewView('${view}')`);await delay(400);
 assert.equal(await js(`document.documentElement.scrollWidth>innerWidth`),false,view+' overflow');
 assert.equal(await js(`document.querySelector('.renderer-module-error')?.textContent ?? ''`),'',view+' render failed');
 await shot(`${palette}-${theme}-${view}`);results.push(`${palette}/${theme}/${view}`);
 }
}
await js(`qa.ui.getState().setInterviewView('session')`);await wait(`!!document.querySelector('.interview-conversation-composer textarea')`);
await delay(600);await js(`document.querySelector('.interview-call-header-button').click()`);await wait(`!!document.querySelector('.interview-call-drawer')`);await shot('trace-dark');
await js(`document.querySelector('.interview-call-drawer-header > button').click()`);
await js(`qa.interviews.setState({session:{...qa.session,interview:{...qa.session.interview,status:'completed'},scoreReports:[{id:'score',version:1,status:'succeeded',total:77,coveredWeight:100,model:{providerId:'qa',modelId:'qa'},reasoning:'medium',prompt:'评分规则',dimensions:[{key:'technical',score:30,reason:'技术解释合理',evidence:[{turnId:'a1',quote:'我将检索和写操作分开'}]},{key:'practice',score:35,reason:'有实践过程',evidence:[]},{key:'communication',score:12,reason:'表述清楚',evidence:[]}]}]}})`);await wait(`!!document.querySelector('.interview-score-card')`);await shot('score-dark');
await js(`qa.interviews.setState({session:qa.session})`);

win.setContentSize(900,620);await js(`qa.ui.setState({detailPanelOpen:false})`);await js(`qa.settings.setState({theme:'light',uiFontSize:17,contentFontSize:20,codeFontSize:18})`);await shot('narrow-conversation');assert.equal(await js(`document.querySelector('.interview-conversation-shell').getBoundingClientRect().right > innerWidth`),false);await js(`qa.ui.getState().toggleDetailPanel()`);await shot('narrow-details');await js(`qa.ui.getState().toggleDetailPanel()`);
await js(`qa.ui.getState().setInterviewView('dashboard')`);await shot('narrow-create');
assert.deepEqual(await js('qa.errors'),[]);
writeFileSync(join(out,'results.json'),JSON.stringify({passed:true,views:results,errors:[]},null,2));console.log('PASS '+results.length+' theme/view combinations');app.exit(0);
}).catch(async e=>{console.error(e);console.error(await js('JSON.stringify(qa.errors)'));await shot('failure');writeFileSync(join(out,'results.json'),JSON.stringify({passed:false,error:String(e),views:results}));app.exit(1);});
