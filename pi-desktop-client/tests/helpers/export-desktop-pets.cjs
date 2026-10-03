// Run with Electron. Reads saved editor projects; never edits their files.
const {app,BrowserWindow,nativeImage}=require('electron');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const editor=process.env.PI_PET_EDITOR_DIR;if(!editor)throw Error('Set PI_PET_EDITOR_DIR');
const {readProject}=require(path.join(editor,'core/project.cjs'));
const source=process.env.PI_PET_EXPORT_SOURCE,output=process.env.PI_PET_EXPORT_OUTPUT;
if(!source||!output)throw Error('Set PI_PET_EXPORT_SOURCE and PI_PET_EXPORT_OUTPUT');
app.setPath('userData',path.join(source,'..','export-electron-data'));
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
async function main(){
 await app.whenReady();const win=new BrowserWindow({show:false,webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:true}});await win.loadURL('data:text/html,<html><body></body></html>');
 const core=fs.readFileSync(path.join(editor,'src/animation.cjs'),'utf8');await win.webContents.executeJavaScript(core);
 const manifest={version:1,name:'韩立 · 青竹小轩',actions:[]};
 for(const [id,title]of [['reading','阅读'],['chess','下棋'],['bamboo','种金雷竹']]){
  const directory=path.join(source,id),p=await readProject(directory),assets={};const used=new Set();for(const f of p.frames){if(f.imageAssetId)used.add(f.imageAssetId);for(const l of f.layers){if(l.assetId)used.add(l.assetId);for(const part of l.compositeParts||[])if(part.assetId)used.add(part.assetId);}}
  for(const assetId of used){const a=p.assets[assetId];assets[assetId]=`data:image/png;base64,${fs.readFileSync(path.join(directory,a.file)).toString('base64')}`;}
  await win.webContents.executeJavaScript(`(async()=>{window.petExportProject=${JSON.stringify(p)};window.petExportImages=new Map();for(const[id,url]of Object.entries(${JSON.stringify(assets)})){const img=new Image();img.src=url;await img.decode();window.petExportImages.set(id,img);}})()`);
  const frames=[];let x0=p.canvas.width,y0=p.canvas.height,x1=-1,y1=-1;fs.mkdirSync(path.join(output,id),{recursive:true});
  for(let i=0;i<p.frames.length;i++){
   const png=await win.webContents.executeJavaScript(`(()=>{const p=window.petExportProject,f=p.frames[${i}],images=window.petExportImages,c=document.createElement('canvas');c.width=p.canvas.width;c.height=p.canvas.height;const ctx=c.getContext('2d');ctx.imageSmoothingEnabled=false;const{renderLayers,layerPivot}=window.AnimationCore;if(f.imageAssetId)ctx.drawImage(images.get(f.imageAssetId),0,0,c.width,c.height);else for(const{layer:l,owner,parent}of renderLayers(f)){const img=images.get(l.assetId);if(!img||!l.visible||!owner.visible)continue;const pivot=layerPivot(l,img.width,img.height);ctx.save();ctx.globalAlpha=l.opacity*(parent?parent.opacity:1);if(parent){const source=images.get(parent.assetId),q=layerPivot(parent,source.width,source.height);ctx.translate(parent.x+q.x*parent.scale,parent.y+q.y*parent.scale);ctx.rotate(parent.rotation*Math.PI/180);ctx.scale(parent.scale,parent.scale);ctx.translate(-q.x,-q.y);}ctx.translate(l.x+pivot.x*l.scale,l.y+pivot.y*l.scale);ctx.rotate(l.rotation*Math.PI/180);ctx.scale(l.scale,l.scale);ctx.drawImage(img,-pivot.x,-pivot.y);ctx.restore();}return c.toDataURL('image/png');})()`);
   const bytes=Buffer.from(png.split(',')[1],'base64'),file=`${id}/${String(i+1).padStart(2,'0')}.png`;fs.writeFileSync(path.join(output,file),bytes);frames.push({file,durationMs:p.frames[i].durationMs,sha256:hash(bytes)});
   const pixels=nativeImage.createFromBuffer(bytes).toBitmap();for(let y=0;y<p.canvas.height;y++)for(let x=0;x<p.canvas.width;x++)if(pixels[(y*p.canvas.width+x)*4+3]){x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);}
  }
  const width=id==='chess'?256:Math.round(256*p.canvas.width/p.canvas.height),height=id==='chess'?128:256;
  const poster=`${id}/poster.png`;fs.writeFileSync(path.join(output,poster),nativeImage.createFromPath(path.join(output,frames[0].file)).resize({width:160}).toPNG());
  const contentBounds=x1<0?{x:0,y:0,width:p.canvas.width,height:p.canvas.height}:{x:x0,y:y0,width:x1-x0+1,height:y1-y0+1};
  manifest.actions.push({id,title,sourceTitle:p.title,sourceProjectSha256:hash(fs.readFileSync(path.join(directory,'project.json'))),width:p.canvas.width,height:p.canvas.height,contentBounds,displayWidth:width,displayHeight:height,loop:p.timeline.loop,poster,frames});console.log('EXPORTED',id,frames.length,p.canvas,frames.map(f=>f.durationMs));
 }
 fs.writeFileSync(path.join(output,'manifest.json'),JSON.stringify(manifest,null,2));win.destroy();console.log('PET_EXPORT_OK');app.exit(0);
}
main().catch(e=>{console.error(e);app.exit(1)});
