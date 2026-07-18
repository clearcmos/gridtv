import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'
import { StreamwallState, type WallControlCommand } from 'streamwall-shared'
import './sentryPreload'

const api = {
  openDevTools: () => ipcRenderer.send('devtools-overlay'),
  load: () => ipcRenderer.invoke('layer:load'),
  control: (command: WallControlCommand) =>
    ipcRenderer.send('wall-control', command),
  onState: (handleState: (state: StreamwallState) => void) => {
    const internalHandler = (_ev: IpcRendererEvent, state: StreamwallState) =>
      handleState(state)
    ipcRenderer.on('state', internalHandler)
    return () => {
      ipcRenderer.off('state', internalHandler)
    }
  },
}

export type StreamwallLayerGlobal = typeof api

contextBridge.exposeInMainWorld('streamwallLayer', api)
