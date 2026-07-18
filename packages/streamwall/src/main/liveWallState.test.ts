import { describe, expect, it } from 'vitest'
import {
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
      tiles: {
        '0': { audioMode: 'muted', volume: 1, paused: false },
        '1': { audioMode: 'muted', volume: 1, paused: false },
        '2': { audioMode: 'muted', volume: 1, paused: false },
        '3': { audioMode: 'muted', volume: 1, paused: false },
      },
    })
  })

  it('sanitizes malformed values and drops settings beyond the tile count', () => {
    expect(
      normalizeLiveWallState(
        {
          tileCount: 2,
          tiles: {
            '0': { audioMode: 'unmuted', volume: 2, paused: true },
            '1': { audioMode: 'stage', volume: 'loud', paused: false },
            '2': { audioMode: 'unmuted', volume: 0.5, paused: true },
          },
        },
        9,
      ),
    ).toEqual({
      tileCount: 2,
      tiles: {
        '0': { audioMode: 'unmuted', volume: 1, paused: true },
        '1': { audioMode: 'muted', volume: 1, paused: false },
      },
    })
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
    })
    expect(state.tiles['3']).toEqual({
      audioMode: 'muted',
      volume: 1,
      paused: false,
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
    })

    swapLiveWallTileSettings(state, 0, 1)

    expect(state.tiles['0']).toEqual({
      audioMode: 'muted',
      volume: 1,
      paused: false,
    })
    expect(state.tiles['1']).toEqual({
      audioMode: 'unmuted',
      volume: 0.35,
      paused: true,
    })
  })

  it("copies one stream's settings across its stretched cells and follows displaced streams", () => {
    const state = normalizeLiveWallState(undefined, 4)
    updateLiveWallTileSettings(state, 0, {
      audioMode: 'unmuted',
      volume: 0.35,
      paused: true,
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
    })
    expect(state.tiles['3']).toEqual({
      audioMode: 'muted',
      volume: 0.6,
      paused: false,
    })
  })
})
