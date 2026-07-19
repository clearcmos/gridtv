import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'
import {
  StreamwallState,
  type TwitchChannelSuggestion,
  type WallControlCommand,
} from 'gridtv-shared'
import './sentryPreload'

const api = {
  openDevTools: () => ipcRenderer.send('devtools-overlay'),
  load: () => ipcRenderer.invoke('layer:load'),
  control: (command: WallControlCommand) =>
    ipcRenderer.send('wall-control', command),
  searchTwitch: (query: string) =>
    ipcRenderer.invoke('wall:search-twitch', query) as Promise<
      TwitchChannelSuggestion[]
    >,
  onGridMenuShortcut: (handler: () => void) => {
    const internalHandler = () => handler()
    ipcRenderer.on('wall:grid-menu-shortcut', internalHandler)
    return () => ipcRenderer.off('wall:grid-menu-shortcut', internalHandler)
  },
  onFitModeShortcut: (handler: () => void) => {
    const internalHandler = () => handler()
    ipcRenderer.on('wall:fit-mode-shortcut', internalHandler)
    return () => ipcRenderer.off('wall:fit-mode-shortcut', internalHandler)
  },
  onFullscreenExitShortcut: (handler: () => void) => {
    const internalHandler = () => handler()
    ipcRenderer.on('wall:fullscreen-exit-shortcut', internalHandler)
    return () =>
      ipcRenderer.off('wall:fullscreen-exit-shortcut', internalHandler)
  },
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
