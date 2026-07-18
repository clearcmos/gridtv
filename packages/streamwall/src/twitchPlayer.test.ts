import { describe, expect, it, vi } from 'vitest'
import {
  configureTwitchPlayerQuality,
  twitchPlayerURL,
  twitchQualityArgument,
} from './twitchPlayer'

describe('twitchPlayerURL', () => {
  it('rewrites a standard Twitch channel URL to the official player', () => {
    const result = new URL(twitchPlayerURL('https://www.twitch.tv/some_name'))

    expect(result.origin).toBe('https://player.twitch.tv')
    expect(result.searchParams.get('channel')).toBe('some_name')
    expect(result.searchParams.get('parent')).toBe('player.twitch.tv')
    expect(result.searchParams.get('autoplay')).toBe('true')
    expect(result.searchParams.get('muted')).toBe('true')
  })

  it.each([
    'https://www.twitch.tv/directory',
    'https://www.twitch.tv/channel/videos',
    'https://player.twitch.tv/?channel=channel&parent=example.com',
    'http://www.twitch.tv/channel',
    'https://example.com/channel',
  ])('leaves non-channel or non-HTTPS URLs unchanged: %s', (url) => {
    expect(twitchPlayerURL(url)).toBe(url)
  })

  it('can keep the full Twitch website when lightweight mode is disabled', () => {
    const url = 'https://www.twitch.tv/channel'
    expect(twitchPlayerURL(url, false)).toBe(url)
  })
})

describe('configureTwitchPlayerQuality', () => {
  function fakeStorage() {
    return { removeItem: vi.fn(), setItem: vi.fn() }
  }

  it('sets the same persistent quality preference used by the Twitch player', () => {
    const storage = fakeStorage()

    configureTwitchPlayerQuality(
      'https://player.twitch.tv/?channel=test',
      storage,
      [twitchQualityArgument('360p')],
    )

    expect(storage.removeItem).toHaveBeenCalledWith('quality-bitrate')
    expect(storage.setItem).toHaveBeenCalledWith(
      'video-quality',
      JSON.stringify({ default: '360p30' }),
    )
    expect(storage.setItem).toHaveBeenCalledWith(
      'video-quality-highest-available',
      'false',
    )
  })

  it('selects Twitch source/pass-through as the highest available quality', () => {
    const storage = fakeStorage()

    configureTwitchPlayerQuality(
      'https://player.twitch.tv/?channel=test',
      storage,
      [twitchQualityArgument('source')],
    )

    expect(storage.setItem).toHaveBeenCalledWith(
      'video-quality',
      JSON.stringify({ default: 'chunked' }),
    )
    expect(storage.setItem).toHaveBeenCalledWith(
      'video-quality-highest-available',
      'true',
    )
  })

  it('clears a fixed preference when automatic quality is selected', () => {
    const storage = fakeStorage()

    configureTwitchPlayerQuality(
      'https://player.twitch.tv/?channel=test',
      storage,
      [twitchQualityArgument('auto')],
    )

    expect(storage.removeItem).toHaveBeenCalledWith('quality-bitrate')
    expect(storage.removeItem).toHaveBeenCalledWith('video-quality')
    expect(storage.removeItem).toHaveBeenCalledWith(
      'video-quality-highest-available',
    )
    expect(storage.setItem).not.toHaveBeenCalled()
  })

  it('does not touch storage on unrelated pages', () => {
    const storage = fakeStorage()

    configureTwitchPlayerQuality('https://example.com/', storage, [
      twitchQualityArgument('360p'),
    ])

    expect(storage.removeItem).not.toHaveBeenCalled()
    expect(storage.setItem).not.toHaveBeenCalled()
  })
})
