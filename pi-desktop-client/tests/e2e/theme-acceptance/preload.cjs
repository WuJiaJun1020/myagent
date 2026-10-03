const { contextBridge, ipcRenderer } = require('electron');
const subscribe = channel => listener => { const handler = (_, event) => listener(event); ipcRenderer.on(channel, handler); return () => ipcRenderer.removeListener(channel, handler); };
contextBridge.exposeInMainWorld('qaHost', {
 cwd: process.argv.find(arg=>arg.startsWith('--qa-cwd=')).slice(9),
 create: request => ipcRenderer.invoke('qa:create',request), kill: id => ipcRenderer.invoke('qa:kill',id),
 resize: (id,cols,rows)=>ipcRenderer.send('qa:resize',{id,cols,rows}), write: (id,data)=>ipcRenderer.send('qa:write',{id,data}),
 onData: subscribe('qa:data'), onExit: subscribe('qa:exit'),
});
