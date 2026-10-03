const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('piDesktop',{
 browserGetState:()=>ipcRenderer.invoke('browser:get-state'),
 browserNavigate:input=>ipcRenderer.invoke('browser:navigate',input),
 browserSetBounds:bounds=>ipcRenderer.invoke('browser:bounds',bounds),
 browserAction:action=>ipcRenderer.invoke('browser:action',action),
 openExternal:async()=>{},
 onBrowserState:listener=>{const handler=(_event,state)=>listener(state);ipcRenderer.on('browser:state',handler);return()=>ipcRenderer.removeListener('browser:state',handler);}
});
