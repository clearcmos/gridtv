import {
  type StreamData,
  type StreamList,
  type StreamWindowConfig,
  type ViewContentMap,
} from 'gridtv-shared'
import { describe, expect, it, vi } from 'vitest'
import {
  LiveWallSession,
  type LiveWallSessionOptions,
  type LiveWallStateProjection,
  type LiveWallWindowPort,
} from './liveWallSession'
import {
  DEFAULT_LIVE_WALL_TILE_SETTINGS,
  LIVE_WALL_FIT_MODE_VERSION,
  type LiveWallStoredState,
} from './liveWallState'

function makeStoredState(tileCount = 2): LiveWallStoredState {
  return {
    tileCount,
    fitModeVersion: LIVE_WALL_FIT_MODE_VERSION,
    tiles: Object.fromEntries(
      Array.from({ length: tileCount }, (_, idx) => [
        String(idx),
        { ...DEFAULT_LIVE_WALL_TILE_SETTINGS },
      ]),
    ),
  }
}

function makeStream(id: string, login: string): StreamData {
  return {
    _id: id,
    _dataSource: 'test',
    kind: 'video',
    link: `https://www.twitch.tv/${login}`,
    label: login,
  }
}

function makeStreams(...streams: StreamData[]): StreamList {
  const result = streams as StreamList
  result.byURL = new Map(streams.map((stream) => [stream.link, stream]))
  return result
}

function makeWindow(tileCount = 2) {
  const config: StreamWindowConfig = {
    cols: tileCount,
    rows: 1,
    tileCount,
    width: 1920,
    height: 1080,
    frameless: false,
    fullscreen: false,
    activeColor: '#fff',
    backgroundColor: '#000',
  }
  let lastViewContentMap: ViewContentMap = new Map()
  const window: LiveWallWindowPort = {
    config,
    setTileCount: vi.fn((count: number) => {
      config.tileCount = count
      config.cols = count
      config.rows = 1
    }),
    setGridSize: vi.fn((cols: number, rows: number) => {
      config.cols = cols
      config.rows = rows
    }),
    setViews: vi.fn((viewContentMap: ViewContentMap) => {
      lastViewContentMap = viewContentMap
    }),
    applyWallTileSettings: vi.fn(),
    setFullscreenChat: vi.fn(),
    setTileNativeFullscreen: vi.fn(),
  }
  return {
    window,
    get lastViewContentMap() {
      return lastViewContentMap
    },
  }
}

function makeSession({
  tileCount = 2,
  streams = makeStreams(),
  encodedStateDoc,
  needsFitModeDefaultsMigration,
  getStreams,
}: {
  tileCount?: number
  streams?: StreamList
  encodedStateDoc?: string
  needsFitModeDefaultsMigration?: boolean
  getStreams?: () => StreamList
} = {}) {
  const storedState = makeStoredState(tileCount)
  const wall = makeWindow(tileCount)
  const published: LiveWallStateProjection[] = []
  const persistedWall: LiveWallStoredState[] = []
  const persistedDocs: string[] = []
  const localStreams: Array<{
    url: string
    data: Parameters<LiveWallSessionOptions['addLocalStream']>[1]
  }> = []
  const twitchAssignments: string[] = []
  const statuses = new Map()
  const options: LiveWallSessionOptions = {
    storedState,
    encodedStateDoc,
    needsFitModeDefaultsMigration,
    window: wall.window,
    twitchStatuses: statuses,
    getStreams: getStreams ?? (() => streams),
    getKnownStreamIds: () => new Set(streams.map((stream) => stream._id)),
    addLocalStream: (url, data) => localStreams.push({ url, data }),
    onTwitchAssignment: (login) => twitchAssignments.push(login),
    persistStateDoc: (doc) => persistedDocs.push(doc),
    persistStoredState: (state) => persistedWall.push(state),
    publish: (state) => published.push(state),
  }
  const session = new LiveWallSession(options)
  session.start()
  return {
    session,
    wall,
    storedState,
    published,
    persistedWall,
    persistedDocs,
    localStreams,
    twitchAssignments,
    statuses,
  }
}

describe('LiveWallSession', () => {
  it('publishes a copied window config instead of a shared mutable reference', () => {
    const { session, wall } = makeSession()

    const projection = session.projection
    wall.window.config.width = 1280

    expect(projection.config.width).toBe(1920)
    expect(session.projection.config.width).toBe(1280)
  })

  it('commits a tile-count change as one coherent relayout and publication', () => {
    const streamA = makeStream('stream-a', 'alpha')
    const streamB = makeStream('stream-b', 'beta')
    const { session, wall, published, persistedWall } = makeSession({
      streams: makeStreams(streamA, streamB),
    })
    session.setStream(0, 'alpha')
    session.setStream(1, 'beta')
    vi.mocked(wall.window.setViews).mockClear()
    const publicationsBefore = published.length

    session.setTileCount(1)

    expect(wall.window.setTileCount).toHaveBeenCalledWith(1)
    expect(wall.window.setViews).toHaveBeenCalledTimes(1)
    expect(session.projection.config.tileCount).toBe(1)
    expect(session.projection.wallSlots).toHaveLength(1)
    expect(published).toHaveLength(publicationsBefore + 1)
    expect(persistedWall.at(-1)?.tileCount).toBe(1)
  })

  it('owns fullscreen and chat transitions through the window port', () => {
    const stream = makeStream('stream-a', 'alpha')
    const { session, wall, statuses } = makeSession({
      tileCount: 1,
      streams: makeStreams(stream),
    })
    statuses.set('alpha', 'online')
    session.setStream(0, 'alpha')

    session.setFullscreen(0, true)
    session.setChatVisible(true)

    expect(wall.window.setTileNativeFullscreen).toHaveBeenCalledWith(true)
    expect(wall.window.setFullscreenChat).toHaveBeenLastCalledWith(
      'alpha',
      true,
    )
    expect(session.projection).toMatchObject({
      fullscreenViewIdx: 0,
      fullscreenChatVisible: true,
    })

    session.setFullscreen(0, false)

    expect(wall.window.setTileNativeFullscreen).toHaveBeenLastCalledWith(false)
    expect(session.projection).toMatchObject({
      fullscreenViewIdx: null,
      fullscreenChatVisible: false,
    })
  })

  it('keeps stretched-tile settings attached to the assigned stream', () => {
    const stream = makeStream('stream-a', 'alpha')
    const { session, storedState } = makeSession({
      streams: makeStreams(stream),
    })
    session.setStream(0, 'alpha')
    session.dispatch({
      type: 'set-wall-volume',
      viewId: 1,
      viewIdx: 0,
      volume: 0.4,
    })

    session.resizeTile(0, 1)

    expect(storedState.tiles['0']!.volume).toBe(0.4)
    expect(storedState.tiles['1']!.volume).toBe(0.4)
  })

  it('adds a canonical Twitch source before assigning a new channel', () => {
    const { session, localStreams, twitchAssignments } = makeSession({
      tileCount: 1,
    })

    session.setStream(0, 'Alpha')

    expect(localStreams).toEqual([
      {
        url: 'https://www.twitch.tv/alpha',
        data: expect.objectContaining({
          _id: 'twitch-alpha',
          label: 'alpha',
        }),
      },
    ])
    expect(twitchAssignments).toEqual(['alpha'])
    expect(session.projection.wallSlots[0]!.streamId).toBe('twitch-alpha')
  })

  it('restores persisted Yjs assignments behind the session seam', () => {
    const stream = makeStream('stream-a', 'alpha')
    const streams = makeStreams(stream)
    const source = makeSession({ tileCount: 1, streams })
    source.session.setStream(0, 'alpha')

    const restored = makeSession({
      tileCount: 1,
      streams,
      encodedStateDoc: Buffer.from(source.session.encodeAssignments()).toString(
        'base64',
      ),
    })

    expect(restored.session.projection.wallSlots).toEqual([
      expect.objectContaining({ viewIdx: 0, streamId: 'stream-a' }),
    ])
  })

  it('applies and reports uplink assignment updates with their origin', () => {
    const stream = makeStream('stream-a', 'alpha')
    const streams = makeStreams(stream)
    const base = makeSession({ tileCount: 1, streams })
    const baseState = Buffer.from(base.session.encodeAssignments()).toString(
      'base64',
    )
    const source = makeSession({
      tileCount: 1,
      streams,
      encodedStateDoc: baseState,
    })
    const target = makeSession({
      tileCount: 1,
      streams,
      encodedStateDoc: baseState,
    })
    source.session.setStream(0, 'alpha')
    const observer = vi.fn()
    target.session.onAssignmentUpdate(observer)

    target.session.applyAssignmentUpdate(
      source.session.encodeAssignments(),
      'uplink',
    )

    expect(observer).toHaveBeenCalledWith(expect.any(Uint8Array), 'uplink')
    expect(target.session.projection.wallSlots[0]!.streamId).toBe('stream-a')
  })

  it('routes every wall control command through the session API', () => {
    const { session, storedState } = makeSession()
    const setTileCount = vi
      .spyOn(session, 'setTileCount')
      .mockImplementation(() => undefined)
    const setStream = vi
      .spyOn(session, 'setStream')
      .mockImplementation(() => undefined)
    const setFullscreen = vi
      .spyOn(session, 'setFullscreen')
      .mockImplementation(() => undefined)
    const setChatVisible = vi
      .spyOn(session, 'setChatVisible')
      .mockImplementation(() => undefined)
    const swapStreams = vi
      .spyOn(session, 'swapStreams')
      .mockImplementation(() => undefined)
    const resizeTile = vi
      .spyOn(session, 'resizeTile')
      .mockImplementation(() => undefined)

    session.dispatch({
      type: 'set-wall-playback',
      viewId: 1,
      viewIdx: 0,
      paused: true,
    })
    session.dispatch({
      type: 'set-wall-volume',
      viewId: 1,
      viewIdx: 0,
      volume: 0.25,
    })
    session.dispatch({
      type: 'set-wall-audio-mode',
      viewId: 1,
      viewIdx: 0,
      mode: 'unmuted',
    })
    session.dispatch({
      type: 'set-wall-fit-mode',
      viewId: 1,
      viewIdx: 0,
      mode: 'fit',
    })
    session.dispatch({ type: 'set-wall-fit-mode-all', mode: 'fit' })
    session.dispatch({ type: 'set-wall-tile-count', count: 1 })
    session.dispatch({
      type: 'set-wall-stream',
      viewIdx: 0,
      username: 'alpha',
    })
    session.dispatch({
      type: 'set-wall-fullscreen',
      viewIdx: 0,
      fullscreen: true,
    })
    session.dispatch({ type: 'set-wall-chat-visible', visible: true })
    session.dispatch({
      type: 'swap-wall-streams',
      fromViewIdx: 0,
      toViewIdx: 1,
    })
    session.dispatch({
      type: 'resize-wall-tile',
      viewIdx: 0,
      targetViewIdx: 1,
    })

    expect(storedState.tiles['0']).toMatchObject({
      paused: true,
      volume: 0.25,
      audioMode: 'unmuted',
      fitMode: 'fit',
    })
    expect(storedState.tiles['1']!.fitMode).toBe('fit')
    expect(setTileCount).toHaveBeenCalledWith(1)
    expect(setStream).toHaveBeenCalledWith(0, 'alpha')
    expect(setFullscreen).toHaveBeenCalledWith(0, true)
    expect(setChatVisible).toHaveBeenCalledWith(true)
    expect(swapStreams).toHaveBeenCalledWith(0, 1)
    expect(resizeTile).toHaveBeenCalledWith(0, 1)
  })

  it('ignores invalid stream, fullscreen, swap, and resize requests', () => {
    const stream = makeStream('stream-a', 'alpha')
    const { session, wall, localStreams, published, persistedWall } =
      makeSession({
        streams: makeStreams(stream),
      })
    const publicationsBefore = published.length
    const persistedBefore = persistedWall.length
    vi.mocked(wall.window.setViews).mockClear()

    session.setStream(-1, 'alpha')
    session.setStream(2, 'alpha')
    session.setStream(0, 'not a channel URL')
    session.setFullscreen(-1, true)
    session.setFullscreen(2, true)
    session.setFullscreen(0, true)
    session.swapStreams(0, 0)
    session.swapStreams(-1, 1)
    session.swapStreams(0, 2)
    session.resizeTile(0, 0)

    expect(localStreams).toEqual([])
    expect(session.projection.fullscreenViewIdx).toBeNull()
    expect(session.projection.wallSlots.every((slot) => !slot.streamId)).toBe(
      true,
    )
    expect(published).toHaveLength(publicationsBefore)
    expect(persistedWall).toHaveLength(persistedBefore)
    expect(wall.window.setViews).not.toHaveBeenCalled()
  })

  it('clears every cell in a stretched assignment from blank input', () => {
    const stream = makeStream('stream-a', 'alpha')
    const { session, storedState } = makeSession({
      tileCount: 3,
      streams: makeStreams(stream),
    })
    session.setStream(0, 'alpha')
    session.resizeTile(0, 1)

    session.setStream(1, '   ')

    expect(session.projection.wallSlots.map((slot) => slot.streamId)).toEqual([
      undefined,
      undefined,
      undefined,
    ])
    expect(storedState.tiles).toEqual({
      '0': DEFAULT_LIVE_WALL_TILE_SETTINGS,
      '1': DEFAULT_LIVE_WALL_TILE_SETTINGS,
      '2': DEFAULT_LIVE_WALL_TILE_SETTINGS,
    })
  })

  it('reports assigned Twitch logins and supports playlist assignments', () => {
    const twitch = makeStream('stream-a', 'alpha')
    const hls: StreamData = {
      _id: 'stream-b',
      _dataSource: 'test',
      kind: 'video',
      link: 'https://example.com/live.m3u8',
      label: 'HLS',
    }
    const { session } = makeSession({
      streams: makeStreams(twitch, hls),
    })

    session.setPlaylistStream(0, twitch._id)
    session.setPlaylistStream(1, hls._id)

    expect(session.getAssignedTwitchLogins()).toEqual(['alpha'])
    expect(session.projection.wallSlots.map((slot) => slot.streamId)).toEqual([
      'stream-a',
      'stream-b',
    ])
  })

  it('can unsubscribe from assignment updates', () => {
    const stream = makeStream('stream-a', 'alpha')
    const streams = makeStreams(stream)
    const base = makeSession({ tileCount: 1, streams })
    const encodedStateDoc = Buffer.from(
      base.session.encodeAssignments(),
    ).toString('base64')
    const source = makeSession({ tileCount: 1, streams, encodedStateDoc })
    const target = makeSession({ tileCount: 1, streams, encodedStateDoc })
    const observer = vi.fn()
    const unsubscribe = target.session.onAssignmentUpdate(observer)
    unsubscribe()
    source.session.setStream(0, 'alpha')

    target.session.applyAssignmentUpdate(source.session.encodeAssignments())

    expect(observer).not.toHaveBeenCalled()
    expect(target.session.projection.wallSlots[0]!.streamId).toBe('stream-a')
  })

  it('builds and applies layout presets through the window seam', () => {
    const stream = makeStream('stream-a', 'alpha')
    const { session, wall } = makeSession({
      streams: makeStreams(stream),
    })
    session.setStream(0, 'alpha')

    expect(session.buildLayoutPreset('desk', 'Desk')).toMatchObject({
      id: 'desk',
      name: 'Desk',
      cols: 2,
      rows: 1,
      views: { '0': { streamId: 'stream-a' } },
    })

    session.applyLayoutPreset({
      id: 'stack',
      name: 'Stack',
      cols: 1,
      rows: 2,
      views: { '1': { streamId: 'stream-a' } },
    })

    expect(wall.window.setGridSize).toHaveBeenCalledWith(1, 2)
    expect(session.projection.wallSlots.map((slot) => slot.streamId)).toEqual([
      undefined,
      'stream-a',
    ])
  })

  it('does not restart an already started session', () => {
    const { session, wall, published } = makeSession()
    const publicationsBefore = published.length
    vi.mocked(wall.window.setViews).mockClear()

    session.start()

    expect(wall.window.setViews).not.toHaveBeenCalled()
    expect(published).toHaveLength(publicationsBefore)
  })

  it('recovers from an invalid persisted assignment document', () => {
    const encodedStateDoc = Buffer.from('not a Yjs update').toString('base64')

    const { session } = makeSession({ encodedStateDoc })

    expect(session.projection.wallSlots).toHaveLength(2)
  })

  it('applies the one-time fit-mode defaults migration at startup', () => {
    const { storedState, persistedWall } = makeSession({
      needsFitModeDefaultsMigration: true,
    })

    expect(storedState.tiles['0']!.fitMode).toBe('fill')
    expect(persistedWall).toHaveLength(1)
  })

  it('ignores a stream request when a layout no longer has that cell', () => {
    const { session, localStreams } = makeSession()
    session.applyLayoutPreset({
      id: 'single',
      name: 'Single',
      cols: 1,
      rows: 1,
      views: {},
    })

    session.setStream(1, 'alpha')

    expect(localStreams).toEqual([])
  })

  it('moves an existing assignment instead of duplicating its stream', () => {
    const stream = makeStream('stream-a', 'alpha')
    const { session } = makeSession({ streams: makeStreams(stream) })
    session.setStream(0, 'alpha')

    session.setStream(1, 'alpha')

    expect(session.projection.wallSlots.map((slot) => slot.streamId)).toEqual([
      undefined,
      'stream-a',
    ])
  })

  it('swaps two assigned streams and their settings', () => {
    const streamA = makeStream('stream-a', 'alpha')
    const streamB = makeStream('stream-b', 'beta')
    const { session, storedState } = makeSession({
      streams: makeStreams(streamA, streamB),
    })
    session.setStream(0, 'alpha')
    session.setStream(1, 'beta')
    session.dispatch({
      type: 'set-wall-volume',
      viewId: 1,
      viewIdx: 0,
      volume: 0.2,
    })

    session.swapStreams(0, 1)

    expect(session.projection.wallSlots.map((slot) => slot.streamId)).toEqual([
      'stream-b',
      'stream-a',
    ])
    expect(storedState.tiles['1']!.volume).toBe(0.2)
  })

  it('keeps chat hidden without a fullscreen Twitch stream', () => {
    const { session, wall } = makeSession()

    session.setChatVisible(true)

    expect(wall.window.setFullscreenChat).toHaveBeenLastCalledWith(
      undefined,
      false,
    )
    expect(session.projection.fullscreenChatVisible).toBe(false)
  })

  it('discards an encroached stream when a full wall is stretched', () => {
    const streamA = makeStream('stream-a', 'alpha')
    const streamB = makeStream('stream-b', 'beta')
    const { session } = makeSession({
      streams: makeStreams(streamA, streamB),
    })
    session.setStream(0, 'alpha')
    session.setStream(1, 'beta')

    session.resizeTile(0, 1)

    expect(session.projection.wallSlots.map((slot) => slot.streamId)).toEqual([
      'stream-a',
      'stream-a',
    ])
  })

  it('omits offline Twitch streams and tolerates missing tile settings', () => {
    const stream = makeStream('stream-a', 'alpha')
    const { session, wall, statuses, storedState } = makeSession({
      streams: makeStreams(stream),
    })
    statuses.set('alpha', 'offline')
    session.setStream(0, 'alpha')
    delete storedState.tiles['1']
    vi.mocked(wall.window.setViews).mockClear()
    vi.mocked(wall.window.applyWallTileSettings).mockClear()

    session.relayoutAndPublish()

    expect(wall.lastViewContentMap).toEqual(new Map())
    expect(wall.window.applyWallTileSettings).toHaveBeenCalledWith(
      0,
      storedState.tiles['0'],
    )
    expect(wall.window.applyWallTileSettings).not.toHaveBeenCalledWith(
      1,
      expect.anything(),
    )
  })

  it('exits fullscreen when the selected Twitch stream goes offline', () => {
    const stream = makeStream('stream-a', 'alpha')
    const { session, wall, statuses } = makeSession({
      tileCount: 1,
      streams: makeStreams(stream),
    })
    statuses.set('alpha', 'online')
    session.setStream(0, 'alpha')
    session.setFullscreen(0, true)

    statuses.set('alpha', 'offline')
    session.relayoutAndPublish()

    expect(wall.window.setTileNativeFullscreen).toHaveBeenLastCalledWith(false)
    expect(session.projection.fullscreenViewIdx).toBeNull()
  })

  it('falls back to stream scans and the default video kind', () => {
    const stream = {
      ...makeStream('stream-a', 'alpha'),
      kind: '',
    } as unknown as StreamData
    const streams = makeStreams(stream)
    streams.byURL = undefined
    const { session, wall, statuses } = makeSession({ streams })
    statuses.set('alpha', 'online')

    session.setStream(0, 'alpha')

    expect(wall.lastViewContentMap.get('0')).toMatchObject({
      url: stream.link,
      kind: 'video',
    })
  })

  it('contains stream-provider failures during relayout', () => {
    expect(() =>
      makeSession({
        getStreams: () => {
          throw new Error('data source failed')
        },
      }),
    ).not.toThrow()
  })
})
