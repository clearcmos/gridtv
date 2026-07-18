import { clampLiveTileCount, type WallAudioMode } from 'streamwall-shared'

export interface LiveWallTileSettings {
  audioMode: WallAudioMode
  volume: number
  paused: boolean
}

export interface LiveWallStoredState {
  tileCount: number
  tiles: Record<string, LiveWallTileSettings>
}

export const DEFAULT_LIVE_WALL_TILE_SETTINGS: LiveWallTileSettings = {
  audioMode: 'muted',
  volume: 1,
  paused: false,
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
  const tiles: Record<string, LiveWallTileSettings> = {}

  for (let idx = 0; idx < tileCount; idx++) {
    const value = rawTiles[String(idx)] as
      Partial<LiveWallTileSettings> | undefined
    tiles[String(idx)] = {
      audioMode: value?.audioMode === 'unmuted' ? 'unmuted' : 'muted',
      volume: normalizeVolume(value?.volume),
      paused: value?.paused === true,
    }
  }

  return { tileCount, tiles }
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
