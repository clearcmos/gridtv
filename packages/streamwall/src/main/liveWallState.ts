import {
  clampLiveTileCount,
  type WallAudioMode,
  type WallFitMode,
} from 'streamwall-shared'

export interface LiveWallTileSettings {
  audioMode: WallAudioMode
  volume: number
  paused: boolean
  fitMode: WallFitMode
}

export interface LiveWallStoredState {
  tileCount: number
  /** Versioned so older persisted `fit` defaults can migrate to edge-to-edge. */
  fitModeVersion: number
  tiles: Record<string, LiveWallTileSettings>
}

export const LIVE_WALL_FIT_MODE_VERSION = 1

export const DEFAULT_LIVE_WALL_TILE_SETTINGS: LiveWallTileSettings = {
  audioMode: 'muted',
  volume: 1,
  paused: false,
  fitMode: 'fill',
}

function normalizeVolume(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.min(1, value))
    : DEFAULT_LIVE_WALL_TILE_SETTINGS.volume
}

/** Repairs older/malformed stored wall settings without preventing startup. */
export function normalizeLiveWallState(
  raw: unknown,
  fallbackTileCount: number,
): LiveWallStoredState {
  const candidate =
    typeof raw === 'object' && raw !== null
      ? (raw as Partial<LiveWallStoredState>)
      : {}
  const tileCount = clampLiveTileCount(
    typeof candidate.tileCount === 'number'
      ? candidate.tileCount
      : fallbackTileCount,
  )
  const rawTiles =
    typeof candidate.tiles === 'object' && candidate.tiles !== null
      ? candidate.tiles
      : {}
  const hasCurrentFitModeDefaults =
    candidate.fitModeVersion === LIVE_WALL_FIT_MODE_VERSION
  const tiles: Record<string, LiveWallTileSettings> = {}

  for (let idx = 0; idx < tileCount; idx++) {
    const value = rawTiles[String(idx)] as
      Partial<LiveWallTileSettings> | undefined
    tiles[String(idx)] = {
      audioMode: value?.audioMode === 'unmuted' ? 'unmuted' : 'muted',
      volume: normalizeVolume(value?.volume),
      paused: value?.paused === true,
      // Before fitModeVersion existed every slot was persisted as `fit`, even
      // when the user had never chosen it. Migrate that old default once so a
      // regular wall fills each cell; current-version explicit choices remain
      // durable across restarts.
      fitMode: hasCurrentFitModeDefaults
        ? value?.fitMode === 'fit'
          ? 'fit'
          : 'fill'
        : 'fill',
    }
  }

  return {
    tileCount,
    fitModeVersion: LIVE_WALL_FIT_MODE_VERSION,
    tiles,
  }
}

/**
 * Applies the geometrically sensible default after a structural layout change:
 * one-cell streams fill their cell, while stretched streams fit their complete
 * frame. A later user Fit/Fill command remains authoritative and persisted.
 */
export function applyDefaultFitModesForLayout(
  state: LiveWallStoredState,
  assignments: readonly (string | undefined)[],
  onlyStreamId?: string,
): void {
  const spaceCountByStreamId = new Map<string, number>()
  for (const streamId of assignments.slice(0, state.tileCount)) {
    if (streamId) {
      spaceCountByStreamId.set(
        streamId,
        (spaceCountByStreamId.get(streamId) ?? 0) + 1,
      )
    }
  }

  for (let idx = 0; idx < state.tileCount; idx++) {
    const streamId = assignments[idx]
    if (onlyStreamId !== undefined && streamId !== onlyStreamId) {
      continue
    }
    updateLiveWallTileSettings(state, idx, {
      fitMode:
        streamId && (spaceCountByStreamId.get(streamId) ?? 0) > 1
          ? 'fit'
          : 'fill',
    })
  }
}

export function resizeLiveWallState(
  state: LiveWallStoredState,
  requestedCount: number,
): void {
  const count = clampLiveTileCount(requestedCount)
  const nextTiles: Record<string, LiveWallTileSettings> = {}
  for (let idx = 0; idx < count; idx++) {
    nextTiles[String(idx)] = {
      ...(state.tiles[String(idx)] ?? DEFAULT_LIVE_WALL_TILE_SETTINGS),
    }
  }
  state.tileCount = count
  state.tiles = nextTiles
}

export function updateLiveWallTileSettings(
  state: LiveWallStoredState,
  viewIdx: number,
  patch: Partial<LiveWallTileSettings>,
): void {
  if (viewIdx < 0 || viewIdx >= state.tileCount) {
    return
  }
  const current =
    state.tiles[String(viewIdx)] ?? DEFAULT_LIVE_WALL_TILE_SETTINGS
  state.tiles[String(viewIdx)] = {
    audioMode:
      patch.audioMode === 'muted' || patch.audioMode === 'unmuted'
        ? patch.audioMode
        : current.audioMode,
    volume:
      patch.volume === undefined
        ? current.volume
        : normalizeVolume(patch.volume),
    paused: patch.paused ?? current.paused,
    fitMode:
      patch.fitMode === 'fit' || patch.fitMode === 'fill'
        ? patch.fitMode
        : current.fitMode,
  }
}

/** Keeps a stream's audio/playback choices attached while its tile is moved. */
export function swapLiveWallTileSettings(
  state: LiveWallStoredState,
  fromViewIdx: number,
  toViewIdx: number,
): void {
  if (
    fromViewIdx === toViewIdx ||
    fromViewIdx < 0 ||
    toViewIdx < 0 ||
    fromViewIdx >= state.tileCount ||
    toViewIdx >= state.tileCount
  ) {
    return
  }
  const fromKey = String(fromViewIdx)
  const toKey = String(toViewIdx)
  const from = state.tiles[fromKey] ?? DEFAULT_LIVE_WALL_TILE_SETTINGS
  const to = state.tiles[toKey] ?? DEFAULT_LIVE_WALL_TILE_SETTINGS
  state.tiles[fromKey] = { ...to }
  state.tiles[toKey] = { ...from }
}

/**
 * Keeps media choices attached to stream IDs after a multi-cell resize/move.
 * Empty cells return to defaults and every cell owned by one stretched stream
 * receives the same settings, so applying settings by space is deterministic.
 */
export function remapLiveWallTileSettings(
  state: LiveWallStoredState,
  previousAssignments: readonly (string | undefined)[],
  nextAssignments: readonly (string | undefined)[],
): void {
  const settingsByStreamId = new Map<string, LiveWallTileSettings>()
  for (let idx = 0; idx < previousAssignments.length; idx++) {
    const streamId = previousAssignments[idx]
    if (streamId && !settingsByStreamId.has(streamId)) {
      settingsByStreamId.set(streamId, {
        ...(state.tiles[String(idx)] ?? DEFAULT_LIVE_WALL_TILE_SETTINGS),
      })
    }
  }

  const nextTiles: Record<string, LiveWallTileSettings> = {}
  for (let idx = 0; idx < state.tileCount; idx++) {
    const streamId = nextAssignments[idx]
    nextTiles[String(idx)] = {
      ...(streamId
        ? (settingsByStreamId.get(streamId) ?? DEFAULT_LIVE_WALL_TILE_SETTINGS)
        : DEFAULT_LIVE_WALL_TILE_SETTINGS),
    }
  }
  state.tiles = nextTiles
}
