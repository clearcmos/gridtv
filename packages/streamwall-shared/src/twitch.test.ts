import { describe, expect, it } from 'vitest'
import { twitchChannelUrl, twitchLoginFromInput } from './twitch.ts'

describe('twitchLoginFromInput', () => {
  it.each([
    ['Lacy', 'lacy'],
    ['@Lacy', 'lacy'],
    ['https://www.twitch.tv/Lacy', 'lacy'],
    ['twitch.tv/lacy/', 'lacy'],
  ])('normalizes %s', (input, expected) => {
    expect(twitchLoginFromInput(input)).toBe(expected)
  })

  it.each([
    '',
    'not a login',
    'https://youtube.com/lacy',
    'https://twitch.tv/directory/category/test',
    'https://twitch.tv/lacy/videos',
  ])('rejects %s', (input) => {
    expect(twitchLoginFromInput(input)).toBeNull()
  })

  it('builds a canonical channel URL', () => {
    expect(twitchChannelUrl('Lacy')).toBe('https://www.twitch.tv/lacy')
  })
})
