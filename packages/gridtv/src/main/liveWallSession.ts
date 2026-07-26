import {
  fullscreenViewContentMap,
  twitchChannelUrl,
  twitchLoginFromInput,
  type LayoutPreset,
  type LiveWallSlotState,
  type StreamDataContent,
  type StreamList,
  type StreamWindowConfig,
  type TwitchLiveStatus,
  type ViewContentMap,
  type WallControlCommand,
} from 'gridtv-shared'
import * as Y from 'yjs'
import {
  migrateLegacyCustomAssignments,
  stableCustomStreamId,
} from './customStreamIdentity'
import { applyLayoutPreset, buildLayoutPreset } from './layoutPresets'
import {
  canLoadLiveWallStream,
  twitchStatusForStream,
} from './liveWallAvailability'
import {
  applyLiveTileCount,
  resizeLiveWallAssignment,
  swapLiveWallAssignments,
} from './liveWallResize'
import {
  applyDefaultFitModesForLayout,
  remapLiveWallTileSettings,
  updateLiveWallTileSettings,
  type LiveWallStoredState,
  type LiveWallTileSettings,
} from './liveWallState'
import log from './logger'
import { initializeViewsState } from './viewsStateInit'

export interface LiveWallStateProjection {
  config: StreamWindowConfig
  wallSlots: LiveWallSlotState[]
  fullscreenViewIdx: number | null
  fullscreenChatVisible: boolean
}

/**
 * The Electron-facing operations needed by live-wall state transitions.
 *
 * Keeping this interface free of BrowserWindow and WebContents types gives the
 * wall session a direct unit-test seam while StreamWindow remains responsible
 * for rendering and media actors.
 */
export interface LiveWallWindowPort {
  config: StreamWindowConfig
  setTileCount(count: number): void
  setGridSize(cols: number, rows: number): void
  setViews(
    viewContentMap: ViewContentMap,
    streams: StreamList,
    options?: { parkUnused?: boolean; fillWall?: boolean },
  ): void
  applyWallTileSettings(viewIdx: number, settings: LiveWallTileSettings): void
  setFullscreenChat(channel: string | undefined, visible: boolean): void
  setTileNativeFullscreen(enabled: boolean): void
}

export interface LiveWallSessionOptions {
  storedState: LiveWallStoredState
  encodedStateDoc?: string
  needsFitModeDefaultsMigration?: boolean
  window: LiveWallWindowPort
  twitchStatuses: Map<string, TwitchLiveStatus>
  getStreams: () => StreamList
  getKnownStreamIds: () => ReadonlySet<string>
  addLocalStream: (url: string, data: Partial<StreamDataContent>) => void
  onTwitchAssignment: (login: string) => void
  persistStateDoc: (encodedStateDoc: string) => void
  persistStoredState: (state: LiveWallStoredState) => void
  publish: (state: LiveWallStateProjection) => void
}

/**
 * Owns the live wall's persisted assignments and settings plus its transient
 * fullscreen state. All structural changes finish at one commit point that
 * relays out the Electron views and publishes one coherent projection.
 */
export class LiveWallSession {
  private readonly stateDoc = new Y.Doc()
  private readonly viewsState =
    this.stateDoc.getMap<Y.Map<string | undefined>>('views')
  private readonly assignmentObservers = new Set<
    (update: Uint8Array, origin: unknown) => void
  >()
  private transitionDepth = 0
  private started = false
  private fullscreenViewIdx: number | null = null
  private fullscreenChatVisible = false

  constructor(private readonly options: LiveWallSessionOptions) {
    if (options.encodedStateDoc) {
      try {
        Y.applyUpdate(
          this.stateDoc,
          Buffer.from(options.encodedStateDoc, 'base64'),
        )
      } catch (error) {
        log.warn('Failed to restore stateDoc', error)
      }
    }

    this.stateDoc.on('update', (update, origin) => {
      options.persistStateDoc(
        Buffer.from(Y.encodeStateAsUpdate(this.stateDoc)).toString('base64'),
      )
      for (const observer of this.assignmentObservers) {
        observer(update, origin)
      }
    })
  }

  start(): void {
    if (this.started) {
      return
    }
    this.started = true

    this.transitionDepth++
    try {
      initializeViewsState(
        {
          viewsState: this.viewsState,
          transact: (fn) => this.stateDoc.transact(fn),
        },
        this.options.storedState.tileCount,
        1,
      )
      if (this.options.needsFitModeDefaultsMigration) {
        applyDefaultFitModesForLayout(
          this.options.storedState,
          this.readAssignments(),
        )
        this.persistStoredState()
      }
    } finally {
      this.transitionDepth--
    }

    this.viewsState.observeDeep(this.handleAssignmentsChanged)
    this.relayout()
    this.publish()
  }

  get projection(): LiveWallStateProjection {
    return {
      config: { ...this.options.window.config },
      wallSlots: this.buildWallSlots(),
      fullscreenViewIdx: this.fullscreenViewIdx,
      fullscreenChatVisible: this.fullscreenChatVisible,
    }
  }

  get tileCount(): number {
    return this.options.storedState.tileCount
  }

  dispatch(command: WallControlCommand): void {
    switch (command.type) {
      case 'set-wall-playback':
        this.updateRegionSettings(command.viewIdx, {
          paused: command.paused,
        })
        break
      case 'set-wall-volume':
        this.updateRegionSettings(command.viewIdx, {
          volume: command.volume,
        })
        break
      case 'set-wall-audio-mode':
        this.updateRegionSettings(command.viewIdx, {
          audioMode: command.mode,
        })
        break
      case 'set-wall-fit-mode':
        this.updateRegionSettings(command.viewIdx, {
          fitMode: command.mode,
        })
        break
      case 'set-wall-fit-mode-all':
        for (let idx = 0; idx < this.tileCount; idx++) {
          updateLiveWallTileSettings(this.options.storedState, idx, {
            fitMode: command.mode,
          })
        }
        this.persistStoredState()
        break
      case 'set-wall-tile-count':
        this.setTileCount(command.count)
        break
      case 'set-wall-stream':
        this.setStream(command.viewIdx, command.username)
        break
      case 'set-wall-fullscreen':
        this.setFullscreen(command.viewIdx, command.fullscreen)
        break
      case 'set-wall-chat-visible':
        this.setChatVisible(command.visible)
        break
      case 'swap-wall-streams':
        this.swapStreams(command.fromViewIdx, command.toViewIdx)
        break
      case 'resize-wall-tile':
        this.resizeTile(command.viewIdx, command.targetViewIdx)
        break
    }
  }

  setTileCount(count: number): void {
    this.runStructuralChange(() => {
      this.clearFullscreen()
      const previousAssignments = this.readAssignments()
      const result = applyLiveTileCount(
        {
          viewsState: this.viewsState,
          transact: (fn) => this.stateDoc.transact(fn),
          setTileCount: (nextCount) => {
            this.options.storedState.tileCount = nextCount
            this.options.window.setTileCount(nextCount)
          },
          knownStreamIds: this.options.getKnownStreamIds(),
        },
        count,
      )
      remapLiveWallTileSettings(
        this.options.storedState,
        previousAssignments,
        this.readAssignments(result.count),
      )
      return true
    })
  }

  setStream(viewIdx: number, input: string): void {
    if (viewIdx < 0 || viewIdx >= this.tileCount) {
      return
    }
    const cell = this.viewsState.get(String(viewIdx))
    if (!cell) {
      return
    }

    const previousAssignments = this.readAssignments()
    const replacedStreamId = cell.get('streamId')
    const replacedSpaces = replacedStreamId
      ? previousAssignments.flatMap((streamId, idx) =>
          streamId === replacedStreamId ? [idx] : [],
        )
      : [viewIdx]

    if (!input.trim()) {
      this.runStructuralChange(() => {
        this.stateDoc.transact(() => {
          for (const idx of replacedSpaces) {
            this.viewsState.get(String(idx))?.set('streamId', undefined)
          }
        })
        remapLiveWallTileSettings(
          this.options.storedState,
          previousAssignments,
          this.readAssignments(),
        )
        return true
      })
      return
    }

    const login = twitchLoginFromInput(input)
    if (!login) {
      log.warn('Ignoring invalid Twitch channel input:', input)
      return
    }
    const url = twitchChannelUrl(login)
    const streams = this.options.getStreams()
    const existing =
      streams.byURL?.get(url) ?? streams.find((stream) => stream.link === url)
    const streamId = existing?._id ?? stableCustomStreamId(url)
    if (!existing) {
      this.options.addLocalStream(url, {
        link: url,
        kind: 'video',
        label: login,
        _id: streamId,
      })
    }

    this.runStructuralChange(() => {
      this.stateDoc.transact(() => {
        for (let idx = 0; idx < this.tileCount; idx++) {
          if (this.viewsState.get(String(idx))?.get('streamId') === streamId) {
            this.viewsState.get(String(idx))?.set('streamId', undefined)
          }
        }
        for (const idx of replacedSpaces) {
          this.viewsState.get(String(idx))?.set('streamId', streamId)
        }
      })
      remapLiveWallTileSettings(
        this.options.storedState,
        previousAssignments,
        this.readAssignments(),
      )
      return true
    })
    this.options.onTwitchAssignment(login)
  }

  setFullscreen(viewIdx: number, fullscreen: boolean): void {
    log.debug('Fullscreen diagnostic: wall fullscreen command', {
      viewIdx,
      fullscreen,
      currentFullscreenViewIdx: this.fullscreenViewIdx,
    })
    if (viewIdx < 0 || viewIdx >= this.tileCount) {
      return
    }
    if (fullscreen && !this.viewsState.get(String(viewIdx))?.get('streamId')) {
      return
    }

    if (fullscreen) {
      this.options.window.setFullscreenChat(undefined, false)
      this.options.window.setTileNativeFullscreen(true)
      this.fullscreenViewIdx = viewIdx
      this.fullscreenChatVisible = false
    } else {
      this.clearFullscreen()
    }
    this.relayout()
    this.publish()
  }

  setChatVisible(visible: boolean): void {
    const stream = this.streamAt(this.fullscreenViewIdx)
    const channel = twitchLoginFromInput(stream?.link ?? '')
    const nextVisible =
      visible && this.fullscreenViewIdx != null && channel != null

    this.fullscreenChatVisible = nextVisible
    this.options.window.setFullscreenChat(channel ?? undefined, nextVisible)
    this.relayout()
    this.publish()
  }

  swapStreams(fromViewIdx: number, toViewIdx: number): void {
    if (
      fromViewIdx === toViewIdx ||
      fromViewIdx < 0 ||
      toViewIdx < 0 ||
      fromViewIdx >= this.tileCount ||
      toViewIdx >= this.tileCount ||
      !this.viewsState.has(String(fromViewIdx)) ||
      !this.viewsState.has(String(toViewIdx))
    ) {
      return
    }

    this.runStructuralChange(() => {
      const previousAssignments = this.readAssignments()
      if (
        !swapLiveWallAssignments(
          {
            viewsState: this.viewsState,
            transact: (fn) => this.stateDoc.transact(fn),
          },
          fromViewIdx,
          toViewIdx,
        )
      ) {
        return false
      }
      this.clearFullscreen()
      remapLiveWallTileSettings(
        this.options.storedState,
        previousAssignments,
        this.readAssignments(),
      )
      return true
    })
  }

  resizeTile(viewIdx: number, targetViewIdx: number): void {
    this.runStructuralChange(() => {
      const previousAssignments = this.readAssignments()
      const result = resizeLiveWallAssignment(
        {
          viewsState: this.viewsState,
          transact: (fn) => this.stateDoc.transact(fn),
        },
        this.tileCount,
        viewIdx,
        targetViewIdx,
      )
      if (!result.resized) {
        return false
      }
      this.clearFullscreen()
      const nextAssignments = this.readAssignments()
      remapLiveWallTileSettings(
        this.options.storedState,
        previousAssignments,
        nextAssignments,
      )
      const resizedStreamId = previousAssignments[viewIdx]
      if (resizedStreamId) {
        applyDefaultFitModesForLayout(
          this.options.storedState,
          nextAssignments,
          resizedStreamId,
        )
      }
      if (result.discardedStreamIds.length > 0) {
        log.info(
          'Discarded streams that no longer fit after tile resize:',
          result.discardedStreamIds,
        )
      }
      return true
    })
  }

  relayoutAndPublish(): void {
    this.relayout()
    this.publish()
  }

  getAssignedTwitchLogins(): string[] {
    const logins: string[] = []
    for (const cell of this.viewsState.values()) {
      const stream = this.streamById(cell.get('streamId'))
      const login = stream ? twitchLoginFromInput(stream.link) : null
      if (login) {
        logins.push(login)
      }
    }
    return logins
  }

  setPlaylistStream(viewIdx: number, streamId: string | undefined): void {
    this.stateDoc.transact(() => {
      this.viewsState.get(String(viewIdx))?.set('streamId', streamId)
    })
  }

  migrateLegacyAssignments(
    customEntries: StreamDataContent[],
    knownStreamIds: ReadonlySet<string>,
  ): void {
    this.runStructuralChange(() => {
      migrateLegacyCustomAssignments({
        viewsState: this.viewsState,
        transact: (fn) => this.stateDoc.transact(fn),
        customEntries,
        knownStreamIds,
      })
      return true
    }, false)
  }

  buildLayoutPreset(id: string, name: string): LayoutPreset {
    return buildLayoutPreset(
      {
        viewsState: this.viewsState,
        cols: this.options.window.config.cols,
        rows: this.options.window.config.rows,
      },
      id,
      name,
    )
  }

  applyLayoutPreset(preset: LayoutPreset): void {
    this.runStructuralChange(() => {
      applyLayoutPreset(
        {
          viewsState: this.viewsState,
          transact: (fn) => this.stateDoc.transact(fn),
          setGridSize: (cols, rows) =>
            this.options.window.setGridSize(cols, rows),
        },
        preset,
      )
      return true
    }, false)
  }

  encodeAssignments(): Uint8Array {
    return Y.encodeStateAsUpdate(this.stateDoc)
  }

  applyAssignmentUpdate(update: Uint8Array, origin?: unknown): void {
    Y.applyUpdate(this.stateDoc, update, origin)
  }

  onAssignmentUpdate(
    observer: (update: Uint8Array, origin: unknown) => void,
  ): () => void {
    this.assignmentObservers.add(observer)
    return () => this.assignmentObservers.delete(observer)
  }

  private readonly handleAssignmentsChanged = () => {
    if (this.transitionDepth > 0) {
      return
    }
    this.relayout()
    this.publish()
  }

  private runStructuralChange(
    operation: () => boolean,
    persistStoredState = true,
  ): void {
    this.transitionDepth++
    let changed: boolean
    try {
      changed = operation()
    } finally {
      this.transitionDepth--
    }
    if (!changed) {
      return
    }
    if (persistStoredState) {
      this.persistStoredState()
    }
    this.relayout()
    this.publish()
  }

  private clearFullscreen(): void {
    this.options.window.setFullscreenChat(undefined, false)
    this.options.window.setTileNativeFullscreen(false)
    this.fullscreenViewIdx = null
    this.fullscreenChatVisible = false
  }

  private relayout(): void {
    try {
      const streams = this.options.getStreams()
      if (this.fullscreenViewIdx != null) {
        const stream = this.streamAt(this.fullscreenViewIdx)
        if (
          stream &&
          canLoadLiveWallStream(stream, this.options.twitchStatuses)
        ) {
          this.options.window.setViews(
            fullscreenViewContentMap(this.tileCount, 1, {
              url: stream.link,
              kind: stream.kind || 'video',
            }),
            streams,
            { parkUnused: true, fillWall: true },
          )
          return
        }
        this.clearFullscreen()
      }

      const viewContentMap: ViewContentMap = new Map()
      for (const [key, viewData] of this.viewsState) {
        const stream = this.streamById(viewData.get('streamId'))
        if (
          !stream ||
          !canLoadLiveWallStream(stream, this.options.twitchStatuses)
        ) {
          continue
        }
        viewContentMap.set(key, {
          url: stream.link,
          kind: stream.kind || 'video',
        })
      }
      this.options.window.setViews(viewContentMap, streams)
      for (let idx = 0; idx < this.tileCount; idx++) {
        const settings = this.options.storedState.tiles[String(idx)]
        if (settings) {
          this.options.window.applyWallTileSettings(idx, settings)
        }
      }
    } catch (error) {
      log.error('Error updating views', error)
    }
  }

  private publish(): void {
    this.options.publish(this.projection)
  }

  private persistStoredState(): void {
    this.options.persistStoredState(this.options.storedState)
  }

  private updateRegionSettings(
    viewIdx: number,
    patch: Partial<LiveWallTileSettings>,
  ): void {
    const streamId = this.viewsState.get(String(viewIdx))?.get('streamId')
    for (let idx = 0; idx < this.tileCount; idx++) {
      if (
        idx === viewIdx ||
        (streamId != null &&
          this.viewsState.get(String(idx))?.get('streamId') === streamId)
      ) {
        updateLiveWallTileSettings(this.options.storedState, idx, patch)
      }
    }
    this.persistStoredState()
  }

  private readAssignments(count = this.tileCount): Array<string | undefined> {
    return Array.from({ length: count }, (_, idx) =>
      this.viewsState.get(String(idx))?.get('streamId'),
    )
  }

  private buildWallSlots(): LiveWallSlotState[] {
    return Array.from({ length: this.tileCount }, (_, viewIdx) => {
      const streamId = this.viewsState.get(String(viewIdx))?.get('streamId')
      const stream = this.streamById(streamId)
      return {
        viewIdx,
        streamId,
        twitchStatus: stream
          ? twitchStatusForStream(stream, this.options.twitchStatuses)
          : undefined,
      }
    })
  }

  private streamAt(viewIdx: number | null) {
    if (viewIdx == null) {
      return undefined
    }
    return this.streamById(
      this.viewsState.get(String(viewIdx))?.get('streamId'),
    )
  }

  private streamById(streamId: string | undefined) {
    return streamId
      ? this.options
          .getStreams()
          .find((candidate) => candidate._id === streamId)
      : undefined
  }
}
