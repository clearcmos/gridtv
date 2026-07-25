import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'
import {
  StreamwallState,
  type TwitchChannelSuggestion,
  type WallControlCommand,
} from 'gridtv-shared'
import type { WallShortcut, WallShortcutInput } from '../wallShortcuts'
import './sentryPreload'

const api = {
  openDevTools: () => ipcRenderer.send('devtools-overlay'),
  load: () => ipcRenderer.invoke('layer:load'),
  control: (command: WallControlCommand) =>
    ipcRenderer.send('wall-control', command),
  sendShortcutInput: (input: WallShortcutInput) =>
    ipcRenderer.send('wall:shortcut-input', input),
  searchTwitch: (query: string) =>
    ipcRenderer.invoke('wall:search-twitch', query) as Promise<
      TwitchChannelSuggestion[]
    >,
  onShortcut: (handler: (shortcut: WallShortcut) => void) => {
    const internalHandler = (
      _event: IpcRendererEvent,
      shortcut: WallShortcut,
    ) => handler(shortcut)
    ipcRenderer.on('wall:shortcut', internalHandler)
    return () => ipcRenderer.off('wall:shortcut', internalHandler)
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
