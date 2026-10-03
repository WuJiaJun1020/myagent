import {contextBridge,ipcRenderer} from "electron";
import type {PetPlayback,PetSettingsPatch} from "../shared/contracts/desktop-pet";
contextBridge.exposeInMainWorld("desktopPet",{
  playback:()=>ipcRenderer.invoke("pet:get-playback"),
  configure:(patch:PetSettingsPatch)=>ipcRenderer.invoke("pet:configure",patch),
  interactive:(value:boolean)=>ipcRenderer.invoke("pet:interactive",value),
  dragStart:()=>ipcRenderer.invoke("pet:drag-start"),
  dragMove:()=>ipcRenderer.invoke("pet:drag-move"),
  dragEnd:()=>ipcRenderer.invoke("pet:drag-end"),
  onDragEnd:(listener:()=>void)=>{const handler=()=>listener();ipcRenderer.on("pet:drag-ended",handler);return()=>ipcRenderer.removeListener("pet:drag-ended",handler);},
  onPlayback:(listener:(state:PetPlayback)=>void)=>{const handler=(_:Electron.IpcRendererEvent,state:PetPlayback)=>listener(state);ipcRenderer.on("pet:playback-changed",handler);return()=>ipcRenderer.removeListener("pet:playback-changed",handler);},
});
