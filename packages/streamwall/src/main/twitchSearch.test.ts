import fetch from 'node-fetch'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createTwitchChannelSearch,
  createTwitchLiveStatusLookup,
} from './twitchSearch'

vi.mock('node-fetch', () => ({ default: vi.fn() }))

const mockedFetch = vi.mocked(fetch)

describe('Twitch channel search', () => {
  beforeEach(() => mockedFetch.mockReset())

  it('does not query Twitch for fewer than two characters', async () => {
    const search = createTwitchChannelSearch()
    await expect(search('l')).resolves.toEqual([])
    expect(mockedFetch).not.toHaveBeenCalled()
  })

  it('returns sanitized suggestions and caches an identical query', async () => {
    mockedFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          searchUsers: {
            edges: [
              {
                node: {
                  login: 'Lacy',
                  displayName: 'Lacy',
                  stream: { id: 'live' },
                },
              },
              { node: { login: 42, displayName: 'invalid' } },
            ],
          },
        },
      }),
    } as never)
    const search = createTwitchChannelSearch()

    await expect(search('LAC')).resolves.toEqual([
      { login: 'lacy', displayName: 'Lacy', isLive: true },
    ])
    await expect(search('lac')).resolves.toEqual([
      { login: 'lacy', displayName: 'Lacy', isLive: true },
    ])
    expect(mockedFetch).toHaveBeenCalledTimes(1)
  })

  it('surfaces a non-success response to the caller', async () => {
    mockedFetch.mockResolvedValue({ ok: false, status: 429 } as never)
    const search = createTwitchChannelSearch()
    await expect(search('lacy')).rejects.toThrow('Twitch search failed (429)')
  })
})

describe('Twitch live-status lookup', () => {
  beforeEach(() => mockedFetch.mockReset())

  it('checks several valid logins in one request and caches the result', async () => {
    mockedFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          channel0: { login: 'lacy', stream: { id: 'live' } },
          channel1: { login: 'offline_name', stream: null },
        },
      }),
    } as never)
    const lookup = createTwitchLiveStatusLookup()

    await expect(
      lookup(['Lacy', '@offline_name', 'not a login']),
    ).resolves.toEqual(
      new Map([
        ['lacy', true],
        ['offline_name', false],
      ]),
    )
    await expect(lookup(['lacy'])).resolves.toEqual(new Map([['lacy', true]]))
    expect(mockedFetch).toHaveBeenCalledTimes(1)
    const request = JSON.parse(String(mockedFetch.mock.calls[0][1]?.body)) as {
      query: string
    }
    expect(request.query).toContain('channel1: user(login: "offline_name")')
  })

  it('treats a missing Twitch user as offline', async () => {
    mockedFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ data: { channel0: null } }),
    } as never)

    await expect(createTwitchLiveStatusLookup()(['missing'])).resolves.toEqual(
      new Map([['missing', false]]),
    )
  })

  it('rejects an incomplete response instead of mislabeling it offline', async () => {
    mockedFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ data: {} }),
    } as never)

    await expect(createTwitchLiveStatusLookup()(['lacy'])).rejects.toThrow(
      'incomplete',
    )
  })
})
