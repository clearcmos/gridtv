import fetch from 'node-fetch'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createTwitchChannelSearch } from './twitchSearch'

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
