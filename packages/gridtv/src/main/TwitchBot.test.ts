import type { PrivmsgMessage } from 'dank-twitch-irc'
import { EventEmitter } from 'events'
import type { StreamData, StreamwallState } from 'gridtv-shared'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type TwitchBotType from './TwitchBot'

class FakeLoginError extends Error {}

class FakeChatClient extends EventEmitter {
  ready = false
  setColor = vi.fn().mockResolvedValue(undefined)
  join = vi.fn().mockResolvedValue(undefined)
  say = vi.fn().mockResolvedValue(undefined)
  connect = vi.fn()
  close = vi.fn()
  use = vi.fn()
}

let fakeClient: FakeChatClient

vi.mock('dank-twitch-irc', () => ({
  ChatClient: vi.fn().mockImplementation(function ChatClient() {
    return fakeClient
  }),
  LoginError: FakeLoginError,
  SlowModeRateLimiter: vi.fn(),
}))

const CONFIG = {
  channel: 'testchannel',
  username: 'testuser',
  token: 'testtoken',
  color: '#ff0000',
  announce: { template: 'now playing', interval: 60, delay: 30 },
  vote: { template: 'winner', interval: 5 },
}

const STREAM: StreamData = {
  kind: 'video',
  link: 'https://example.com/stream',
  _id: 'id1',
  _dataSource: 'test',
}

describe('TwitchBot', () => {
  let TwitchBot: typeof TwitchBotType
  let unhandledRejections: unknown[]
  let onUnhandledRejection: (err: unknown) => void
  let consoleError: ReturnType<typeof vi.spyOn>

  beforeEach(async () => {
    vi.resetModules()
    fakeClient = new FakeChatClient()
    ;({ default: TwitchBot } = await import('./TwitchBot'))
    vi.useFakeTimers()
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    unhandledRejections = []
    onUnhandledRejection = (err) => unhandledRejections.push(err)
    process.on('unhandledRejection', onUnhandledRejection)
  })

  afterEach(() => {
    process.off('unhandledRejection', onUnhandledRejection)
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('connects and emits "connected" once the client is ready', async () => {
    const bot = new TwitchBot(CONFIG)
    const connected = vi.fn()
    bot.on('connected', connected)

    fakeClient.emit('ready')
    await vi.advanceTimersByTimeAsync(0)

    expect(fakeClient.join).toHaveBeenCalledWith(CONFIG.channel)
    expect(connected).toHaveBeenCalled()
    expect(unhandledRejections).toEqual([])
  })

  it('forwards connect and closes only after a login error', () => {
    const bot = new TwitchBot(CONFIG)

    bot.connect()
    expect(fakeClient.connect).toHaveBeenCalledOnce()

    fakeClient.emit('error', new Error('temporary failure'))
    expect(fakeClient.close).not.toHaveBeenCalled()

    fakeClient.emit('error', new FakeLoginError('bad credentials'))
    expect(fakeClient.close).toHaveBeenCalledOnce()
  })

  it('handles clean and error disconnect notifications', () => {
    new TwitchBot(CONFIG)

    expect(() => fakeClient.emit('close', null)).not.toThrow()
    expect(() =>
      fakeClient.emit('close', new Error('connection lost')),
    ).not.toThrow()
  })

  it('does not crash the process when onReady rejects', async () => {
    fakeClient.setColor.mockRejectedValue(new Error('setColor failed'))
    new TwitchBot(CONFIG)

    fakeClient.emit('ready')
    await vi.advanceTimersByTimeAsync(0)

    expect(unhandledRejections).toEqual([])
    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining('onReady'),
      expect.any(Error),
    )
  })

  it('does not crash the process when the vote tally interval rejects', async () => {
    fakeClient.say.mockRejectedValue(new Error('say failed'))
    const bot = new TwitchBot(CONFIG)
    bot.votes.set(1, 3)

    await vi.advanceTimersByTimeAsync(CONFIG.vote.interval * 1000)

    expect(fakeClient.say).toHaveBeenCalled()
    expect(unhandledRejections).toEqual([])
    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining('tallyVotes'),
      expect.any(Error),
    )
  })

  it('does not crash the process when the dwell-timeout announce rejects', async () => {
    fakeClient.ready = true
    fakeClient.say.mockRejectedValue(new Error('say failed'))
    const bot = new TwitchBot(CONFIG)
    bot.streams = [STREAM]
    bot.listeningURL = STREAM.link

    bot.onListeningURLChange(STREAM.link)
    await vi.advanceTimersByTimeAsync(CONFIG.announce.delay * 1000)

    expect(fakeClient.say).toHaveBeenCalled()
    expect(unhandledRejections).toEqual([])
    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining('announce'),
      expect.any(Error),
    )
  })

  it('tallies a vote when a chat message matches the vote pattern', () => {
    const bot = new TwitchBot(CONFIG)

    bot.onMsg({ messageText: '!2' } as PrivmsgMessage)
    bot.onMsg({ messageText: '!2' } as PrivmsgMessage)

    expect(bot.votes.get(2)).toBe(2)
  })

  it('ignores chat messages that do not match the vote pattern', () => {
    const bot = new TwitchBot(CONFIG)

    bot.onMsg({ messageText: 'hello there' } as PrivmsgMessage)

    expect(bot.votes.size).toBe(0)
  })

  it('ignores votes when voting is disabled', () => {
    const bot = new TwitchBot({
      ...CONFIG,
      vote: { ...CONFIG.vote, interval: 0 },
    })

    bot.onMsg({ messageText: '!2' } as PrivmsgMessage)

    expect(bot.votes).toBeUndefined()
  })

  it('tracks a newly-listened stream but ignores absent or unchanged audio', () => {
    const bot = new TwitchBot(CONFIG)
    const onListeningURLChange = vi.spyOn(bot, 'onListeningURLChange')
    const state = (viewState: string, url = STREAM.link) =>
      ({
        streams: [STREAM],
        views: [
          {
            state: viewState,
            context: { content: { url } },
          },
        ],
      }) as unknown as StreamwallState

    bot.onState(state('displaying.running.audio.muted'))
    expect(onListeningURLChange).not.toHaveBeenCalled()

    bot.onState(state('displaying.running.audio.listening'))
    expect(onListeningURLChange).toHaveBeenCalledWith(STREAM.link)

    onListeningURLChange.mockClear()
    bot.onState(state('displaying.running.audio.listening'))
    expect(onListeningURLChange).not.toHaveBeenCalled()
  })

  it('does not schedule announcements for an empty listening URL', () => {
    const bot = new TwitchBot(CONFIG)
    const announce = vi.spyOn(bot, 'announce')

    bot.onListeningURLChange(null)
    vi.advanceTimersByTime(CONFIG.announce.delay * 1000)

    expect(announce).not.toHaveBeenCalled()
  })

  it('does not announce a URL that already has a repeat timer', () => {
    const bot = new TwitchBot(CONFIG)
    const announce = vi.spyOn(bot, 'announce')
    bot.announceTimeouts.set(
      STREAM.link,
      setTimeout(() => {}, 60_000),
    )

    bot.onListeningURLChange(STREAM.link)
    vi.advanceTimersByTime(CONFIG.announce.delay * 1000)

    expect(announce).not.toHaveBeenCalled()
  })

  it('announces only when the client, URL, and stream are ready', async () => {
    const bot = new TwitchBot(CONFIG)
    bot.listeningURL = STREAM.link

    await bot.announce()
    expect(fakeClient.say).not.toHaveBeenCalled()

    fakeClient.ready = true
    bot.listeningURL = null
    await bot.announce()
    expect(fakeClient.say).not.toHaveBeenCalled()

    bot.listeningURL = STREAM.link
    await bot.announce()
    expect(fakeClient.say).not.toHaveBeenCalled()

    bot.streams = [STREAM]
    await bot.announce()
    expect(fakeClient.say).toHaveBeenCalledWith(
      CONFIG.channel,
      CONFIG.announce.template,
    )
  })

  it('does not repeat an announcement after listening moves elsewhere', async () => {
    fakeClient.ready = true
    const bot = new TwitchBot(CONFIG)
    bot.streams = [STREAM]
    bot.listeningURL = STREAM.link

    await bot.announce()
    bot.listeningURL = 'https://example.com/other'
    await vi.advanceTimersByTimeAsync(CONFIG.announce.interval * 1000)

    expect(fakeClient.say).toHaveBeenCalledTimes(1)
  })

  it('returns early when there are no votes or no positive winner', async () => {
    const bot = new TwitchBot(CONFIG)

    await bot.tallyVotes()
    bot.votes.set(1, 0)
    await bot.tallyVotes()

    expect(fakeClient.say).not.toHaveBeenCalled()
  })

  it('announces the highest vote, emits its zero-based view, and resets', async () => {
    const bot = new TwitchBot(CONFIG)
    const setListeningView = vi.fn()
    bot.on('setListeningView', setListeningView)
    bot.votes.set(1, 2)
    bot.votes.set(2, 4)
    bot.votes.set(3, 4)

    await bot.tallyVotes()

    expect(fakeClient.say).toHaveBeenCalledWith(
      CONFIG.channel,
      CONFIG.vote.template,
    )
    expect(setListeningView).toHaveBeenCalledWith(1)
    expect(bot.votes.size).toBe(0)
  })

  it('does not crash the process when the repeat-announce timeout rejects', async () => {
    fakeClient.ready = true
    const bot = new TwitchBot(CONFIG)
    bot.streams = [STREAM]
    bot.listeningURL = STREAM.link

    await bot.announce()
    expect(fakeClient.say).toHaveBeenCalledTimes(1)

    fakeClient.say.mockRejectedValue(new Error('say failed'))
    await vi.advanceTimersByTimeAsync(CONFIG.announce.interval * 1000)

    expect(fakeClient.say).toHaveBeenCalledTimes(2)
    expect(unhandledRejections).toEqual([])
    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining('announce'),
      expect.any(Error),
    )
  })
})
