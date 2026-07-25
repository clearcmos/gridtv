import path from 'node:path'

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { devServerOrigin, loadHTML } from './loadHTML'

function makeWebContents() {
  return {
    loadFile: vi.fn(),
    loadURL: vi.fn(),
  }
}

describe('devServerOrigin', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns no origin when the development server is disabled', () => {
    vi.stubGlobal('MAIN_WINDOW_VITE_DEV_SERVER_URL', '')

    expect(devServerOrigin()).toBeUndefined()
  })

  it('returns the normalized origin for a valid development URL', () => {
    vi.stubGlobal(
      'MAIN_WINDOW_VITE_DEV_SERVER_URL',
      'http://127.0.0.1:5173/base',
    )

    expect(devServerOrigin()).toBe('http://127.0.0.1:5173')
  })

  it('returns no origin for an invalid development URL', () => {
    vi.stubGlobal('MAIN_WINDOW_VITE_DEV_SERVER_URL', 'not a URL')

    expect(devServerOrigin()).toBeUndefined()
  })
})

describe('loadHTML', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
    vi.stubGlobal('MAIN_WINDOW_VITE_NAME', 'main_window')
  })

  it('loads a development renderer URL without a query', () => {
    vi.stubGlobal('MAIN_WINDOW_VITE_DEV_SERVER_URL', 'http://127.0.0.1:5173')
    const webContents = makeWebContents()

    loadHTML(webContents as never, 'overlay')

    expect(webContents.loadURL).toHaveBeenCalledWith(
      'http://127.0.0.1:5173/src/renderer/overlay.html',
    )
    expect(webContents.loadFile).not.toHaveBeenCalled()
  })

  it('encodes query parameters into a development renderer URL', () => {
    vi.stubGlobal('MAIN_WINDOW_VITE_DEV_SERVER_URL', 'http://127.0.0.1:5173')
    const webContents = makeWebContents()

    loadHTML(webContents as never, 'playHLS', {
      query: { src: 'https://example.com/live stream.m3u8' },
    })

    expect(webContents.loadURL).toHaveBeenCalledWith(
      'http://127.0.0.1:5173/src/renderer/playHLS.html' +
        '?src=https%3A%2F%2Fexample.com%2Flive%20stream.m3u8',
    )
  })

  it('loads the packaged renderer file with its options', () => {
    vi.stubGlobal('MAIN_WINDOW_VITE_DEV_SERVER_URL', '')
    const webContents = makeWebContents()
    const options = { query: { src: 'https://example.com/live.m3u8' } }

    loadHTML(webContents as never, 'background', options)

    expect(webContents.loadFile).toHaveBeenCalledWith(
      expect.stringContaining(
        path.join(
          'renderer',
          'main_window',
          'src',
          'renderer',
          'background.html',
        ),
      ),
      options,
    )
    expect(webContents.loadURL).not.toHaveBeenCalled()
  })
})
