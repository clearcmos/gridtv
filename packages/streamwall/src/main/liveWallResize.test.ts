import { describe, expect, it, vi } from 'vitest'
import * as Y from 'yjs'
import {
  applyLiveTileCount,
  resizeLiveWallAssignment,
  swapLiveWallAssignments,
} from './liveWallResize'

function makeViews(assignments: Array<string | undefined>) {
  const doc = new Y.Doc()
  const viewsState = doc.getMap<Y.Map<string | undefined>>('views')
  doc.transact(() => {
    assignments.forEach((streamId, idx) => {
      const cell = new Y.Map<string | undefined>()
      cell.set('streamId', streamId)
      viewsState.set(String(idx), cell)
    })
  })
  return { doc, viewsState }
}

describe('applyLiveTileCount', () => {
  it('keeps the first streams in visual order and drops overflow', () => {
    const { doc, viewsState } = makeViews(['a', 'b', 'c', 'd'])
    const setTileCount = vi.fn()

    const result = applyLiveTileCount(
      {
        viewsState,
        transact: (fn) => doc.transact(fn),
        setTileCount,
        knownStreamIds: new Set(['a', 'b', 'c', 'd']),
      },
      2,
    )

    expect(result).toEqual({ count: 2, keptStreamIds: ['a', 'b'] })
    expect(setTileCount).toHaveBeenCalledWith(2)
    expect(
      [...viewsState.values()].map((cell) => cell.get('streamId')),
    ).toEqual(['a', 'b'])
  })

  it('compacts around empty, duplicate, and stale assignments', () => {
    const { doc, viewsState } = makeViews([undefined, 'stale', 'a', 'a', 'b'])

    applyLiveTileCount(
      {
        viewsState,
        transact: (fn) => doc.transact(fn),
        setTileCount: vi.fn(),
        knownStreamIds: new Set(['a', 'b']),
      },
      4,
    )

    expect(
      [...viewsState.values()].map((cell) => cell.get('streamId')),
    ).toEqual(['a', 'b', undefined, undefined])
  })
})

describe('swapLiveWallAssignments', () => {
  it('swaps two streams in one shared-state transaction', () => {
    const { doc, viewsState } = makeViews(['a', 'b'])
    const transact = vi.fn((fn: () => void) => doc.transact(fn))

    expect(swapLiveWallAssignments({ viewsState, transact }, 0, 1)).toBe(true)
    expect(transact).toHaveBeenCalledTimes(1)
    expect(viewsState.get('0')?.get('streamId')).toBe('b')
    expect(viewsState.get('1')?.get('streamId')).toBe('a')
  })

  it('moves a stream into an empty cell and rejects missing cells', () => {
    const { doc, viewsState } = makeViews(['a', undefined])
    const context = {
      viewsState,
      transact: (fn: () => void) => doc.transact(fn),
    }

    expect(swapLiveWallAssignments(context, 0, 1)).toBe(true)
    expect(viewsState.get('0')?.get('streamId')).toBeUndefined()
    expect(viewsState.get('1')?.get('streamId')).toBe('a')
    expect(swapLiveWallAssignments(context, 1, 9)).toBe(false)
  })

  it('swaps whole stretched regions rather than splitting either stream', () => {
    const { doc, viewsState } = makeViews(['a', 'a', 'b', undefined])

    expect(
      swapLiveWallAssignments(
        { viewsState, transact: (fn) => doc.transact(fn) },
        0,
        2,
      ),
    ).toBe(true)
    expect(
      [...viewsState.values()].map((cell) => cell.get('streamId')),
    ).toEqual(['b', 'b', 'a', undefined])
  })
})

describe('resizeLiveWallAssignment', () => {
  it('stretches a stream and moves an encroached stream to the nearest free cell', () => {
    const { doc, viewsState } = makeViews(['a', 'b', 'c', undefined])

    const result = resizeLiveWallAssignment(
      { viewsState, transact: (fn) => doc.transact(fn) },
      4,
      0,
      1,
    )

    expect(result).toEqual({
      resized: true,
      spaces: [0, 1],
      movedStreamIds: ['b'],
      discardedStreamIds: [],
    })
    expect(
      [...viewsState.values()].map((cell) => cell.get('streamId')),
    ).toEqual(['a', 'a', 'c', 'b'])
  })

  it('discards an encroached stream when the resized wall has no free cell', () => {
    const { doc, viewsState } = makeViews(['a', 'b', 'c', 'd'])

    const result = resizeLiveWallAssignment(
      { viewsState, transact: (fn) => doc.transact(fn) },
      4,
      0,
      1,
    )

    expect(result.discardedStreamIds).toEqual(['b'])
    expect(
      [...viewsState.values()].map((cell) => cell.get('streamId')),
    ).toEqual(['a', 'a', 'c', 'd'])
  })

  it('can shrink a previously stretched stream back to its anchor cell', () => {
    const { doc, viewsState } = makeViews(['a', 'a', 'c', 'd'])

    resizeLiveWallAssignment(
      { viewsState, transact: (fn) => doc.transact(fn) },
      4,
      0,
      0,
    )

    expect(
      [...viewsState.values()].map((cell) => cell.get('streamId')),
    ).toEqual(['a', undefined, 'c', 'd'])
  })
})
