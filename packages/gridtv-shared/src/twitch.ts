/** Twitch login names contain only ASCII letters, digits, and underscores. */
const TWITCH_LOGIN_RE = /^[a-zA-Z0-9_]{1,25}$/

/**
 * Accepts either a bare login (`lacy`, `@lacy`) or a normal Twitch channel URL
 * and returns its canonical lowercase login. Other Twitch routes and malformed
 * input are rejected.
 */
export function twitchLoginFromInput(input: string): string | null {
  const trimmed = input.trim()
  if (!trimmed) {
    return null
  }

  const bare = trimmed.startsWith('@') ? trimmed.slice(1) : trimmed
  if (TWITCH_LOGIN_RE.test(bare)) {
    return bare.toLowerCase()
  }

  let parsed: URL
  try {
    const withProtocol = /^[a-z][a-z\d+.-]*:\/\//i.test(trimmed)
      ? trimmed
      : `https://${trimmed}`
    parsed = new URL(withProtocol)
  } catch {
    return null
  }

  const host = parsed.hostname.toLowerCase().replace(/^www\./, '')
  if (host !== 'twitch.tv') {
    return null
  }
  const segments = parsed.pathname.split('/').filter(Boolean)
  if (segments.length !== 1 || !TWITCH_LOGIN_RE.test(segments[0])) {
    return null
  }
  return segments[0].toLowerCase()
}

export function twitchChannelUrl(login: string): string {
  return `https://www.twitch.tv/${login.toLowerCase()}`
}
