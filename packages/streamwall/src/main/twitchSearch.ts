import fetch from 'node-fetch'
import type { TwitchChannelSuggestion } from 'streamwall-shared'

const TWITCH_GQL_ENDPOINT = 'https://gql.twitch.tv/gql'
// Twitch's website client id is public by design. This keeps the personal
// desktop build zero-setup; the lookup is best-effort because GQL is not part
// of the documented Helix compatibility contract.
const TWITCH_WEB_CLIENT_ID = 'kimne78kx3ncx6brgo4mv6wki5h1ko'
const CACHE_TTL_MS = 60 * 1000
const REQUEST_TIMEOUT_MS = 5000

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
