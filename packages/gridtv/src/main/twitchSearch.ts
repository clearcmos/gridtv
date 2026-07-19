import {
  twitchLoginFromInput,
  type TwitchChannelSuggestion,
} from 'gridtv-shared'
import fetch from 'node-fetch'

const TWITCH_GQL_ENDPOINT = 'https://gql.twitch.tv/gql'
// Twitch's website client id is public by design. This keeps the personal
// desktop build zero-setup; the lookup is best-effort because GQL is not part
// of the documented Helix compatibility contract.
const TWITCH_WEB_CLIENT_ID = 'kimne78kx3ncx6brgo4mv6wki5h1ko'
const CACHE_TTL_MS = 60 * 1000
const REQUEST_TIMEOUT_MS = 5000
const LIVE_STATUS_CACHE_TTL_MS = 30 * 1000
const MAX_LIVE_STATUS_CHANNELS = 9

const SEARCH_QUERY = `
  query StreamwallSearchUsers($query: String!) {
    searchUsers(userQuery: $query, first: 8) {
      edges {
        node {
          login
          displayName
          stream { id }
        }
      }
    }
  }
`

type SearchResponse = {
  data?: {
    searchUsers?: {
      edges?: Array<{
        node?: {
          login?: unknown
          displayName?: unknown
          stream?: unknown
        }
      }>
    }
  }
}

function parseSuggestions(raw: SearchResponse): TwitchChannelSuggestion[] {
  const suggestions: TwitchChannelSuggestion[] = []
  for (const edge of raw.data?.searchUsers?.edges ?? []) {
    const { node } = edge
    if (
      typeof node?.login !== 'string' ||
      typeof node.displayName !== 'string'
    ) {
      continue
    }
    suggestions.push({
      login: node.login.toLowerCase(),
      displayName: node.displayName,
      isLive: node.stream != null,
    })
  }
  return suggestions
}

/** Debounced by the renderer and cached here so repeated lookups stay cheap. */
export function createTwitchChannelSearch() {
  const cache = new Map<
    string,
    { expiresAt: number; suggestions: TwitchChannelSuggestion[] }
  >()

  return async function searchTwitchChannels(
    rawQuery: string,
  ): Promise<TwitchChannelSuggestion[]> {
    const query = rawQuery.trim().toLowerCase()
    if (query.length < 2) {
      return []
    }
    const cached = cache.get(query)
    if (cached && cached.expiresAt > Date.now()) {
      return cached.suggestions
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    try {
      const response = await fetch(TWITCH_GQL_ENDPOINT, {
        method: 'POST',
        headers: {
          'Client-ID': TWITCH_WEB_CLIENT_ID,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: SEARCH_QUERY,
          variables: { query },
        }),
        signal: controller.signal,
      })
      if (!response.ok) {
        throw new Error(`Twitch search failed (${response.status})`)
      }
      const suggestions = parseSuggestions(
        (await response.json()) as SearchResponse,
      )
      cache.set(query, {
        expiresAt: Date.now() + CACHE_TTL_MS,
        suggestions,
      })
      return suggestions
    } finally {
      clearTimeout(timeout)
    }
  }
}

type LiveStatusResponse = {
  data?: Record<
    string,
    { login?: unknown; stream?: unknown } | null | undefined
  >
}

/**
 * Checks up to a full wall of Twitch channels in one request. A new lookup is
 * created for every app process, so persisted assignments are always checked
 * afresh after restart before any player WebContents is created.
 */
export function createTwitchLiveStatusLookup() {
  const cache = new Map<string, { expiresAt: number; isLive: boolean }>()

  return async function lookupTwitchLiveStatus(
    rawLogins: readonly string[],
  ): Promise<Map<string, boolean>> {
    const logins = [
      ...new Set(
        rawLogins
          .map((input) => twitchLoginFromInput(input))
          .filter((login): login is string => login != null),
      ),
    ].slice(0, MAX_LIVE_STATUS_CHANNELS)
    const now = Date.now()
    const result = new Map<string, boolean>()
    const misses: string[] = []

    for (const login of logins) {
      const cached = cache.get(login)
      if (cached && cached.expiresAt > now) {
        result.set(login, cached.isLive)
      } else {
        misses.push(login)
      }
    }
    if (misses.length === 0) {
      return result
    }

    const fields = misses
      .map(
        (login, idx) =>
          `channel${idx}: user(login: ${JSON.stringify(login)}) { login stream { id } }`,
      )
      .join('\n')
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    try {
      const response = await fetch(TWITCH_GQL_ENDPOINT, {
        method: 'POST',
        headers: {
          'Client-ID': TWITCH_WEB_CLIENT_ID,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: `query StreamwallLiveStatus {\n${fields}\n}`,
        }),
        signal: controller.signal,
      })
      if (!response.ok) {
        throw new Error(`Twitch live-status check failed (${response.status})`)
      }
      const payload = (await response.json()) as LiveStatusResponse
      if (!payload.data || typeof payload.data !== 'object') {
        throw new Error('Twitch live-status response was malformed')
      }

      misses.forEach((login, idx) => {
        const key = `channel${idx}`
        if (!Object.prototype.hasOwnProperty.call(payload.data, key)) {
          throw new Error('Twitch live-status response was incomplete')
        }
        const channel = payload.data?.[key]
        if (
          channel != null &&
          (typeof channel.login !== 'string' ||
            channel.login.toLowerCase() !== login)
        ) {
          throw new Error('Twitch live-status response was malformed')
        }
        const isLive = channel?.stream != null
        result.set(login, isLive)
        cache.set(login, {
          expiresAt: Date.now() + LIVE_STATUS_CACHE_TTL_MS,
          isLive,
        })
      })
      return result
    } finally {
      clearTimeout(timeout)
    }
  }
}
