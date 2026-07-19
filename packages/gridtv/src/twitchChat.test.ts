import { describe, expect, it } from 'vitest'
import {
  buildTwitchChatEmbedURL,
  computeTwitchChatDockWidth,
  TWITCH_CHAT_PARENT,
} from './twitchChat'

describe('Twitch chat embed', () => {
  it('builds a dark chat URL with the required parent declaration', () => {
    const url = new URL(buildTwitchChatEmbedURL('TwitchDev'))

    expect(url.origin).toBe('https://www.twitch.tv')
    expect(url.pathname).toBe('/embed/twitchdev/chat')
    expect(url.searchParams.get('parent')).toBe(TWITCH_CHAT_PARENT)
    expect(url.searchParams.has('darkpopout')).toBe(true)
  })

  it('rejects input that is not a Twitch login', () => {
    expect(() => buildTwitchChatEmbedURL('../settings')).toThrow(
      'Invalid Twitch channel name',
    )
  })

  it('uses a bounded responsive dock width', () => {
    expect(computeTwitchChatDockWidth(1920)).toBe(420)
    expect(computeTwitchChatDockWidth(1280)).toBe(307)
    expect(computeTwitchChatDockWidth(800)).toBe(280)
    expect(computeTwitchChatDockWidth(240)).toBe(101)
    expect(computeTwitchChatDockWidth(0)).toBe(0)
  })
})
