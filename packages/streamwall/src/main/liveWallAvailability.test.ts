import type { StreamData, TwitchLiveStatus } from 'streamwall-shared'
import { describe, expect, it } from 'vitest'
import {
  canLoadLiveWallStream,
  twitchStatusForStream,
} from './liveWallAvailability'

function stream(link: string): StreamData {
  return {
    _id: link,
    _dataSource: 'test',
    kind: 'video',
    link,
  }
}

describe('live-wall availability gate', () => {
  const statuses = new Map<string, TwitchLiveStatus>([
    ['online_name', 'online'],
    ['offline_name', 'offline'],
    ['unknown_name', 'unknown'],
  ])

  it('loads only Twitch channels positively confirmed online', () => {
    expect(
      canLoadLiveWallStream(
        stream('https://www.twitch.tv/online_name'),
        statuses,
      ),
    ).toBe(true)
    expect(
      canLoadLiveWallStream(
        stream('https://www.twitch.tv/offline_name'),
        statuses,
      ),
    ).toBe(false)
    expect(
      canLoadLiveWallStream(
        stream('https://www.twitch.tv/unknown_name'),
        statuses,
      ),
    ).toBe(false)
  })

  it('treats an unchecked Twitch assignment as checking and does not load it', () => {
    const assigned = stream('https://www.twitch.tv/new_name')
    expect(twitchStatusForStream(assigned, statuses)).toBe('checking')
    expect(canLoadLiveWallStream(assigned, statuses)).toBe(false)
  })

  it('does not gate non-Twitch sources', () => {
    expect(
      canLoadLiveWallStream(stream('https://example.com/live.m3u8'), statuses),
    ).toBe(true)
  })
})
