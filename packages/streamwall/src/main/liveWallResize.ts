import { clampLiveTileCount } from 'streamwall-shared'
import * as Y from 'yjs'

export interface LiveWallResizeContext {
  viewsState: Y.Map<Y.Map<string | undefined>>
  transact: (fn: () => void) => void
  setTileCount: (count: number) => void
  /** IDs that currently resolve to real streams; stale assignments are dropped. */
  knownStreamIds: ReadonlySet<string>
}

type LiveWallAssignmentContext = Pick<
  LiveWallResizeContext,
  'viewsState' | 'transact'
>

/**
 * Rebuilds the wall as `count` sequential slots, preserving the first active,
 * distinct streams in visual order. Anything beyond the new capacity is
 * omitted, which lets StreamWindow tear down those players immediately.
 */
export function applyLiveTileCount(
  ctx: LiveWallResizeContext,
  requestedCount: number,
): { count: number; keptStreamIds: string[] } {
  const count = clampLiveTileCount(requestedCount)
  const seen = new Set<string>()
  const keptStreamIds: string[] = []
  const entries = [...ctx.viewsState.entries()].sort(
    ([left], [right]) => Number(left) - Number(right),
  )

  for (const [, cell] of entries) {
    const streamId = cell.get('streamId')
    if (!streamId || seen.has(streamId) || !ctx.knownStreamIds.has(streamId)) {
      continue
    }
    seen.add(streamId)
    keptStreamIds.push(streamId)
    if (keptStreamIds.length === count) {
      break
    }
  }

  // The stateDoc observer lays views out synchronously at transaction end, so
  // publish the new count before rebuilding its cells.
  ctx.setTileCount(count)
  ctx.transact(() => {
    for (const key of [...ctx.viewsState.keys()]) {
      ctx.viewsState.delete(key)
    }
    for (let idx = 0; idx < count; idx++) {
      const cell = new Y.Map<string | undefined>()
      cell.set('streamId', keptStreamIds[idx])
      ctx.viewsState.set(String(idx), cell)
    }
  })

  return { count, keptStreamIds }
}

/** Atomically swaps two persisted cell assignments, including an empty cell. */
export function swapLiveWallAssignments(
  ctx: LiveWallAssignmentContext,
  fromViewIdx: number,
  toViewIdx: number,
): boolean {
  if (fromViewIdx === toViewIdx || fromViewIdx < 0 || toViewIdx < 0) {
    return false
  }
  const fromCell = ctx.viewsState.get(String(fromViewIdx))
  const toCell = ctx.viewsState.get(String(toViewIdx))
  if (!fromCell || !toCell) {
    return false
  }
  const fromStreamId = fromCell.get('streamId')
  const toStreamId = toCell.get('streamId')
  ctx.transact(() => {
    fromCell.set('streamId', toStreamId)
    toCell.set('streamId', fromStreamId)
  })
  return true
}
