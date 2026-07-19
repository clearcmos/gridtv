import {
  clampLiveTileCount,
  computeLiveTileLayout,
  computeLiveTileSpanSpaces,
} from 'gridtv-shared'
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

function readAssignments(
  viewsState: LiveWallAssignmentContext['viewsState'],
  count: number,
): Array<string | undefined> {
  return Array.from({ length: count }, (_, idx) =>
    viewsState.get(String(idx))?.get('streamId'),
  )
}

function writeAssignments(
  ctx: LiveWallAssignmentContext,
  assignments: readonly (string | undefined)[],
) {
  ctx.transact(() => {
    assignments.forEach((streamId, idx) => {
      ctx.viewsState.get(String(idx))?.set('streamId', streamId)
    })
  })
}

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

/**
 * Atomically swaps two visual tile assignments. Repeated IDs are one stretched
 * tile: swapping two occupied regions exchanges their streams without changing
 * either shape, while moving onto an empty cell collapses the moved stream to
 * that one destination cell.
 */
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
  if (fromStreamId === toStreamId) {
    return false
  }

  const assignments = readAssignments(ctx.viewsState, ctx.viewsState.size)
  if (fromStreamId && toStreamId) {
    for (let idx = 0; idx < assignments.length; idx++) {
      if (assignments[idx] === fromStreamId) {
        assignments[idx] = toStreamId
      } else if (assignments[idx] === toStreamId) {
        assignments[idx] = fromStreamId
      }
    }
  } else {
    const movedStreamId = fromStreamId ?? toStreamId
    if (!movedStreamId) {
      return false
    }
    for (let idx = 0; idx < assignments.length; idx++) {
      if (assignments[idx] === movedStreamId) {
        assignments[idx] = undefined
      }
    }
    assignments[fromStreamId ? toViewIdx : fromViewIdx] = movedStreamId
  }
  writeAssignments(ctx, assignments)
  return true
}

export interface ResizeLiveWallAssignmentResult {
  resized: boolean
  spaces: number[]
  movedStreamIds: string[]
  discardedStreamIds: string[]
}

/**
 * Stretches one assigned stream over the rectangle ending at `targetViewIdx`.
 * Any stream touched by that rectangle is moved to the nearest free cell. If
 * all remaining cells are occupied, excess streams are deliberately removed.
 */
export function resizeLiveWallAssignment(
  ctx: LiveWallAssignmentContext,
  tileCount: number,
  viewIdx: number,
  targetViewIdx: number,
): ResizeLiveWallAssignmentResult {
  const count = clampLiveTileCount(tileCount)
  const emptyResult: ResizeLiveWallAssignmentResult = {
    resized: false,
    spaces: [],
    movedStreamIds: [],
    discardedStreamIds: [],
  }
  if (
    viewIdx < 0 ||
    targetViewIdx < 0 ||
    viewIdx >= count ||
    targetViewIdx >= count
  ) {
    return emptyResult
  }

  const assignments = readAssignments(ctx.viewsState, count)
  const sourceStreamId = assignments[viewIdx]
  if (!sourceStreamId) {
    return emptyResult
  }
  const sourceSpaces = assignments.flatMap((streamId, idx) =>
    streamId === sourceStreamId ? [idx] : [],
  )
  const sourceAnchor = Math.min(...sourceSpaces)
  const spaces = computeLiveTileSpanSpaces(count, sourceAnchor, targetViewIdx)
  if (spaces.length === 0) {
    return emptyResult
  }

  const displacedStreamIds = [
    ...new Set(
      spaces
        .map((space) => assignments[space])
        .filter(
          (streamId): streamId is string =>
            streamId != null && streamId !== sourceStreamId,
        ),
    ),
  ].sort((left, right) => {
    return assignments.indexOf(left) - assignments.indexOf(right)
  })

  // Clear the old source shape and every touched stream's whole shape before
  // claiming the new rectangle. A partially-covered stretched stream cannot
  // remain visible because Electron views are rectangular.
  const streamsToClear = new Set([sourceStreamId, ...displacedStreamIds])
  const nextAssignments = assignments.map((streamId) =>
    streamId && streamsToClear.has(streamId) ? undefined : streamId,
  )
  for (const space of spaces) {
    nextAssignments[space] = sourceStreamId
  }

  const positions = computeLiveTileLayout(count, 2520, 2520)
  const center = (idx: number) => {
    const pos = positions[idx]
    return { x: pos.x + pos.width / 2, y: pos.y + pos.height / 2 }
  }
  const movedStreamIds: string[] = []
  const discardedStreamIds: string[] = []

  for (const streamId of displacedStreamIds) {
    const freeSpaces = nextAssignments.flatMap((assignment, idx) =>
      assignment == null ? [idx] : [],
    )
    if (freeSpaces.length === 0) {
      discardedStreamIds.push(streamId)
      continue
    }
    const oldAnchor = assignments.indexOf(streamId)
    const oldCenter = center(oldAnchor)
    freeSpaces.sort((left, right) => {
      const leftCenter = center(left)
      const rightCenter = center(right)
      const leftDistance =
        (leftCenter.x - oldCenter.x) ** 2 + (leftCenter.y - oldCenter.y) ** 2
      const rightDistance =
        (rightCenter.x - oldCenter.x) ** 2 + (rightCenter.y - oldCenter.y) ** 2
      return leftDistance - rightDistance || left - right
    })
    nextAssignments[freeSpaces[0]] = streamId
    movedStreamIds.push(streamId)
  }

  if (nextAssignments.every((streamId, idx) => streamId === assignments[idx])) {
    return { ...emptyResult, spaces }
  }

  writeAssignments(ctx, nextAssignments)
  return {
    resized: true,
    spaces,
    movedStreamIds,
    discardedStreamIds,
  }
}
