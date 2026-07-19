import { describe, expect, it } from 'vitest'
import {
  applyDefaultFitModesForLayout,
  LIVE_WALL_FIT_MODE_VERSION,
  normalizeLiveWallState,
  remapLiveWallTileSettings,
  resizeLiveWallState,
  swapLiveWallTileSettings,
  updateLiveWallTileSettings,
} from './liveWallState'

describe('live wall stored state', () => {
  it('creates defaults for an older database with no live-wall state', () => {
    expect(normalizeLiveWallState(undefined, 4)).toEqual({
      tileCount: 4,
      fitModeVersion: LIVE_WALL_FIT_MODE_VERSION,
      tiles: {
        '0': { audioMode: 'muted', volume: 1, paused: false, fitMode: 'fill' },
        '1': { audioMode: 'muted', volume: 1, paused: false, fitMode: 'fill' },
        '2': { audioMode: 'muted', volume: 1, paused: false, fitMode: 'fill' },
        '3': { audioMode: 'muted', volume: 1, paused: false, fitMode: 'fill' },
      },
    })
  })

  it('sanitizes malformed values and drops settings beyond the tile count', () => {
    expect(
      normalizeLiveWallState(
        {
          tileCount: 2,
          tiles: {
            '0': {
              audioMode: 'unmuted',
              volume: 2,
              paused: true,
              fitMode: 'fill',
            },
            '1': { audioMode: 'stage', volume: 'loud', paused: false },
            '2': { audioMode: 'unmuted', volume: 0.5, paused: true },
          },
        },
        9,
      ),
    ).toEqual({
      tileCount: 2,
      fitModeVersion: LIVE_WALL_FIT_MODE_VERSION,
      tiles: {
        '0': {
          audioMode: 'unmuted',
          volume: 1,
          paused: true,
          fitMode: 'fill',
        },
        '1': { audioMode: 'muted', volume: 1, paused: false, fitMode: 'fill' },
      },
    })
  })

  it('preserves explicit Fit and Fill choices after the defaults migration', () => {
    const state = normalizeLiveWallState(
      {
        tileCount: 2,
        fitModeVersion: LIVE_WALL_FIT_MODE_VERSION,
        tiles: {
          '0': { fitMode: 'fit' },
          '1': { fitMode: 'fill' },
        },
      },
      9,
    )

    expect(state.tiles['0'].fitMode).toBe('fit')
    expect(state.tiles['1'].fitMode).toBe('fill')
  })

  it('preserves surviving settings while resizing and defaults new slots', () => {
    const state = normalizeLiveWallState(undefined, 2)
    updateLiveWallTileSettings(state, 1, {
      audioMode: 'unmuted',
      volume: 0.4,
    })
    resizeLiveWallState(state, 4)
    expect(state.tiles['1']).toEqual({
      audioMode: 'unmuted',
      volume: 0.4,
      paused: false,
      fitMode: 'fill',
    })
    expect(state.tiles['3']).toEqual({
      audioMode: 'muted',
      volume: 1,
      paused: false,
      fitMode: 'fill',
    })

    resizeLiveWallState(state, 1)
    expect(state.tileCount).toBe(1)
    expect(Object.keys(state.tiles)).toEqual(['0'])
  })

  it('swaps audio and playback settings with moved streams', () => {
    const state = normalizeLiveWallState(undefined, 2)
    updateLiveWallTileSettings(state, 0, {
      audioMode: 'unmuted',
      volume: 0.35,
      paused: true,
      fitMode: 'fit',
    })

    swapLiveWallTileSettings(state, 0, 1)

    expect(state.tiles['0']).toEqual({
      audioMode: 'muted',
      volume: 1,
      paused: false,
      fitMode: 'fill',
    })
    expect(state.tiles['1']).toEqual({
      audioMode: 'unmuted',
      volume: 0.35,
      paused: true,
      fitMode: 'fit',
    })
  })

  it("copies one stream's settings across its stretched cells and follows displaced streams", () => {
    const state = normalizeLiveWallState(undefined, 4)
    updateLiveWallTileSettings(state, 0, {
      audioMode: 'unmuted',
      volume: 0.35,
      paused: true,
      fitMode: 'fill',
    })
    updateLiveWallTileSettings(state, 1, { volume: 0.6 })

    remapLiveWallTileSettings(
      state,
      ['a', 'b', 'c', undefined],
      ['a', 'a', 'c', 'b'],
    )

    expect(state.tiles['0']).toEqual(state.tiles['1'])
    expect(state.tiles['0']).toEqual({
      audioMode: 'unmuted',
      volume: 0.35,
      paused: true,
      fitMode: 'fill',
    })
    expect(state.tiles['3']).toEqual({
      audioMode: 'muted',
      volume: 0.6,
      paused: false,
      fitMode: 'fill',
    })
  })

  it('fills ordinary cells and fits a stream stretched over several cells', () => {
    const state = normalizeLiveWallState(undefined, 4)
    updateLiveWallTileSettings(state, 1, { fitMode: 'fit' })

    applyDefaultFitModesForLayout(state, ['a', 'a', 'b', undefined])

    expect(state.tiles['0'].fitMode).toBe('fit')
    expect(state.tiles['1'].fitMode).toBe('fit')
    expect(state.tiles['2'].fitMode).toBe('fill')
    expect(state.tiles['3'].fitMode).toBe('fill')

    applyDefaultFitModesForLayout(state, ['a', 'b', undefined, undefined], 'a')

    expect(state.tiles['0'].fitMode).toBe('fill')
    // Filtering to one structurally changed stream leaves the other alone.
    expect(state.tiles['1'].fitMode).toBe('fit')
  })
})
