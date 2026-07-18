import { afterEach, describe, expect, test, vi } from 'vitest'

const exposeInMainWorld = vi.fn()
const invoke = vi.fn()
const send = vi.fn()
const on = vi.fn()
const off = vi.fn()

vi.mock('electron', () => ({
  contextBridge: { exposeInMainWorld },
  ipcRenderer: { invoke, send, on, off },
}))
vi.mock('./sentryPreload', () => ({}))

type LayerApi = {
  control: (command: unknown) => void
}

function exposedLayerApi(): LayerApi {
  const call = exposeInMainWorld.mock.calls.find(
    ([name]) => name === 'streamwallLayer',
  )
  if (!call) {
    throw new Error('streamwallLayer was not exposed')
  }
  return call[1] as LayerApi
}

describe('layerPreload wall controls', () => {
  afterEach(() => {
    vi.resetModules()
    exposeInMainWorld.mockClear()
    invoke.mockClear()
    send.mockClear()
    on.mockClear()
    off.mockClear()
  })

  test('forwards a typed wall control command over its dedicated channel', async () => {
    await import('./layerPreload')
    const command = {
      type: 'set-wall-audio-mode',
      viewId: 17,
      mode: 'unmuted',
    }

    exposedLayerApi().control(command)

    expect(send).toHaveBeenCalledWith('wall-control', command)
  })
})
