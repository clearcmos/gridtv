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
}: {
  tileCount?: number
  streams?: StreamList
  encodedStateDoc?: string
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
    window: wall.window,
    twitchStatuses: statuses,
    getStreams: () => streams,
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

    expect(storedState.tiles['0'].volume).toBe(0.4)
    expect(storedState.tiles['1'].volume).toBe(0.4)
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
    expect(session.projection.wallSlots[0].streamId).toBe('twitch-alpha')
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
    expect(target.session.projection.wallSlots[0].streamId).toBe('stream-a')
  })
})
