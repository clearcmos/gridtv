export const TWITCH_QUALITIES = [
  'auto',
  '160p',
  '360p',
  '480p',
  '720p',
] as const

export type TwitchQuality = (typeof TWITCH_QUALITIES)[number]

export const TWITCH_QUALITY_ARG_PREFIX = '--streamwall-twitch-quality='

const TWITCH_CHANNEL_PATTERN = /^[a-zA-Z0-9_]{1,25}$/
const TWITCH_PLAYER_HOST = 'player.twitch.tv'
const TWITCH_RESERVED_PATHS = new Set([
  'directory',
  'downloads',
  'drops',
  'inventory',
  'jobs',
  'p',
  'search',
  'settings',
  'subscriptions',
  'turbo',
  'videos',
  'wallet',
])

/**
 * Rewrites a normal Twitch channel page to Twitch's official lightweight
 * player page. A top-level player accepts its own host as the required parent;
 * this avoids loading the much heavier navigation, chat, and discovery shell
 * once per CCTV tile.
 */
export function twitchPlayerURL(rawURL: string, enabled = true): string {
  if (!enabled) {
    return rawURL
  }

  let url: URL
  try {
    url = new URL(rawURL)
  } catch {
    return rawURL
  }

  const host = url.hostname.toLowerCase().replace(/^www\./, '')
  const path = url.pathname.split('/').filter(Boolean)
  if (
    url.protocol !== 'https:' ||
    host !== 'twitch.tv' ||
    path.length !== 1 ||
    !TWITCH_CHANNEL_PATTERN.test(path[0]) ||
    TWITCH_RESERVED_PATHS.has(path[0].toLowerCase())
  ) {
    return rawURL
  }

  const playerURL = new URL(`https://${TWITCH_PLAYER_HOST}/`)
  playerURL.searchParams.set('channel', path[0])
  playerURL.searchParams.set('parent', TWITCH_PLAYER_HOST)
  playerURL.searchParams.set('autoplay', 'true')
  playerURL.searchParams.set('muted', 'true')
  return playerURL.toString()
}

export function twitchQualityArgument(quality: TwitchQuality): string {
  return `${TWITCH_QUALITY_ARG_PREFIX}${quality}`
}

const TWITCH_STORAGE_QUALITY: Record<Exclude<TwitchQuality, 'auto'>, string> = {
  '160p': '160p30',
  '360p': '360p30',
  '480p': '480p30',
  '720p': '720p60',
}

type QualityStorage = Pick<Storage, 'removeItem' | 'setItem'>

/**
 * Applies the configured Twitch rendition before the official player page's
 * scripts initialize. Twitch persists this same preference when an operator
 * chooses a quality from the player's own settings menu.
 */
export function configureTwitchPlayerQuality(
  href: string,
  storage: QualityStorage,
  argv: readonly string[],
): void {
  let url: URL
  try {
    url = new URL(href)
  } catch {
    return
  }
  if (url.hostname.toLowerCase() !== TWITCH_PLAYER_HOST) {
    return
  }

  const rawQuality = argv
    .find((arg) => arg.startsWith(TWITCH_QUALITY_ARG_PREFIX))
    ?.slice(TWITCH_QUALITY_ARG_PREFIX.length)
  if (!TWITCH_QUALITIES.includes(rawQuality as TwitchQuality)) {
    return
  }
  const quality = rawQuality as TwitchQuality

  try {
    // A bitrate cached for a previous channel can override the named quality.
    storage.removeItem('quality-bitrate')
    if (quality === 'auto') {
      storage.removeItem('video-quality')
      storage.removeItem('video-quality-highest-available')
      return
    }
    storage.setItem(
      'video-quality',
      JSON.stringify({ default: TWITCH_STORAGE_QUALITY[quality] }),
    )
    storage.setItem('video-quality-highest-available', 'false')
  } catch {
    // Storage can be unavailable in an opaque/blocked context. The Twitch
    // player still works and simply falls back to its automatic selection.
  }
}
