import {
  twitchLoginFromInput,
  type StreamData,
  type TwitchLiveStatus,
} from 'gridtv-shared'

export function twitchStatusForStream(
  stream: StreamData,
  statuses: ReadonlyMap<string, TwitchLiveStatus>,
): TwitchLiveStatus | undefined {
  const login = twitchLoginFromInput(stream.link)
  return login ? (statuses.get(login) ?? 'checking') : undefined
}

/** Twitch players are created only after a positive live-status response. */
export function canLoadLiveWallStream(
  stream: StreamData,
  statuses: ReadonlyMap<string, TwitchLiveStatus>,
): boolean {
  const twitchStatus = twitchStatusForStream(stream, statuses)
  return twitchStatus == null || twitchStatus === 'online'
}
