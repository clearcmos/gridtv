import {
  twitchChannelUrl,
  twitchLoginFromInput,
  type StreamDataContent,
} from 'gridtv-shared'
import { createHash } from 'node:crypto'
import * as Y from 'yjs'

/** A deterministic identity that survives source removal, reordering, and restart. */
export function stableCustomStreamId(link: string): string {
  const twitchLogin = twitchLoginFromInput(link)
  if (twitchLogin) {
    return `twitch-${twitchLogin}`
  }
  const digest = createHash('sha256').update(link).digest('hex').slice(0, 12)
  return `custom-${digest}`
}

/** Canonicalizes Twitch links and attaches persistent IDs to stored sources. */
export function addStableCustomStreamIds(
  entries: StreamDataContent[],
): StreamDataContent[] {
  return entries.map((entry) => {
    const twitchLogin = twitchLoginFromInput(entry.link)
    const link = twitchLogin ? twitchChannelUrl(twitchLogin) : entry.link
    return {
      ...entry,
      link,
      _id: stableCustomStreamId(link),
    }
  })
}

function legacyIdBase(entry: StreamDataContent): string | null {
  const idBase = entry.source || entry.label || entry.link
  if (!idBase) {
    return null
  }
  return idBase
    .toLowerCase()
    .replace(/[^\w]/g, '')
    .replace(/^the|^https?(www)?/, '')
    .slice(0, 3)
}

/** Reconstructs the old order-dependent IDs solely for one-time migration. */
export function legacyCustomIdMap(
  entries: StreamDataContent[],
): Map<string, string> {
  const result = new Map<string, string>()
  const used = new Set<string>()
  for (const entry of entries) {
    const base = legacyIdBase(entry)
    if (base == null) {
      continue
    }
    let counter = 0
    let legacyId = base
    while (used.has(legacyId)) {
      counter++
      legacyId = `${base}${counter}`
    }
    used.add(legacyId)
    result.set(legacyId, stableCustomStreamId(entry.link))
  }
  return result
}

/**
 * Converts a pre-live-wall stateDoc from ephemeral three-character IDs to the
 * new deterministic custom IDs. Any unmatched stale cell is filled by the
 * first custom source not otherwise assigned, preserving data instead of
 * leaving a phantom blank tile.
 */
export function migrateLegacyCustomAssignments({
  viewsState,
  transact,
  customEntries,
  knownStreamIds,
}: {
  viewsState: Y.Map<Y.Map<string | undefined>>
  transact: (fn: () => void) => void
  customEntries: StreamDataContent[]
  knownStreamIds: ReadonlySet<string>
}): void {
  const legacyIds = legacyCustomIdMap(customEntries)
  const assigned = new Set<string>()
  const unresolved: Y.Map<string | undefined>[] = []
  const entries = [...viewsState.entries()].sort(
    ([left], [right]) => Number(left) - Number(right),
  )

  transact(() => {
    for (const [, cell] of entries) {
      const current = cell.get('streamId')
      if (!current) {
        continue
      }
      if (knownStreamIds.has(current)) {
        assigned.add(current)
        continue
      }
      const migrated = legacyIds.get(current)
      if (migrated && knownStreamIds.has(migrated) && !assigned.has(migrated)) {
        cell.set('streamId', migrated)
        assigned.add(migrated)
      } else {
        unresolved.push(cell)
      }
    }

    const unusedCustomIds = customEntries
      .map((entry) => stableCustomStreamId(entry.link))
      .filter((id) => knownStreamIds.has(id) && !assigned.has(id))
    unresolved.forEach((cell, idx) => {
      cell.set('streamId', unusedCustomIds[idx])
    })
  })
}
