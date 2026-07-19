/** Domain declared to Twitch for the dedicated Electron chat embed. */
export const TWITCH_CHAT_PARENT = 'localhost'

/** Referrer paired with {@link TWITCH_CHAT_PARENT} for Twitch's parent check. */
export const TWITCH_CHAT_REFERRER = `https://${TWITCH_CHAT_PARENT}/`

/**
 * Keeps chat readable on normal desktop walls without consuming too much of
 * the video on smaller windows.
 */
export function computeTwitchChatDockWidth(wallWidth: number): number {
  if (!Number.isFinite(wallWidth) || wallWidth <= 0) {
    return 0
  }
  return Math.min(
    420,
    Math.max(280, Math.round(wallWidth * 0.24)),
    Math.round(wallWidth * 0.42),
  )
}

/** Builds Twitch's supported standalone chat embed URL for one channel. */
export function buildTwitchChatEmbedURL(channel: string): string {
  if (!/^[a-zA-Z0-9_]{1,25}$/.test(channel)) {
    throw new Error('Invalid Twitch channel name')
  }
  const url = new URL(
    `https://www.twitch.tv/embed/${encodeURIComponent(channel.toLowerCase())}/chat`,
  )
  url.searchParams.set('parent', TWITCH_CHAT_PARENT)
  url.searchParams.set('darkpopout', '')
  return url.toString()
}
