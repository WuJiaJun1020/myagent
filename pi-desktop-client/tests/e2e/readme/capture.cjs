const {app,BrowserWindow}=require('electron');const {join,resolve}=require('node:path');const {mkdirSync,writeFileSync}=require('node:fs');
const out=resolve(process.argv[2]);const destination=resolve('docs/screenshots');mkdirSync(destination,{recursive:true});app.setPath('userData',join(out,'profile-'+process.pid));
app.on('window-all-closed',()=>{});
app.whenReady().then(async()=>{try{
 for(const name of ['agent','interview','knowledge']){
  const win=new BrowserWindow({show:false,width:1440,height:960,webPreferences:{contextIsolation:true,backgroundThrottling:false}});
  await win.loadFile(join(out,name+'.html'));
  win.showInactive();
  const js=s=>win.webContents.executeJavaScript(s);
  const selector={agent:'.composer',interview:'.interview-page',knowledge:'.knowledge-source-card'}[name];
  let ready=false;
  for(let i=0;i<150;i++){if(await js(`!!document.querySelector('${selector}') && !!window.qa`)){ready=true;break;}await new Promise(r=>setTimeout(r,100));}
  if(!ready)throw Error(name+' content did not render');
  if(name==='knowledge')await js(`qa.knowledge.getState().setTab('review')`);
  await new Promise(r=>setTimeout(r,1500));await js(`document.fonts.ready`);
  if(await js(`!!document.querySelector('.renderer-module-error')`))throw Error(name+' renderer failed');
  if(await js(`document.documentElement.scrollWidth>innerWidth`))throw Error(name+' horizontal overflow');
  writeFileSync(join(destination,name+'.png'),(await win.webContents.capturePage()).toPNG());
  console.log(name+': '+JSON.stringify(await js('qa.errors')));win.destroy();
 }
 app.exit(0);
}catch(error){console.error(error);app.exit(1);}});
