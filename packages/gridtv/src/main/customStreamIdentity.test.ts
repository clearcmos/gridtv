import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import {
  addStableCustomStreamIds,
  legacyCustomIdMap,
  migrateLegacyCustomAssignments,
  stableCustomStreamId,
} from './customStreamIdentity'

describe('custom stream identity', () => {
  it('uses a readable deterministic Twitch ID', () => {
    expect(stableCustomStreamId('https://www.twitch.tv/Lacy')).toBe(
      'twitch-lacy',
    )
  })

  it('uses a deterministic hash for non-Twitch sources', () => {
    const first = stableCustomStreamId('https://example.com/live.m3u8')
    expect(first).toMatch(/^custom-[a-f0-9]{12}$/)
    expect(first).toBe(stableCustomStreamId('https://example.com/live.m3u8'))
    expect(first).not.toBe(stableCustomStreamId('https://example.com/b.m3u8'))
  })

  it('canonicalizes and annotates stored Twitch sources', () => {
    expect(
      addStableCustomStreamIds([
        { link: 'twitch.tv/Lacy/', kind: 'video', label: 'Lacy' },
      ]),
    ).toEqual([
      {
        link: 'https://www.twitch.tv/lacy',
        kind: 'video',
        label: 'Lacy',
        _id: 'twitch-lacy',
      },
    ])
  })

  it('reconstructs the old collision suffixes in source order', () => {
    expect([
      ...legacyCustomIdMap([
        { link: 'https://www.twitch.tv/lacy', kind: 'video' },
        { link: 'https://www.twitch.tv/suburbbaby', kind: 'video' },
        { link: 'https://www.twitch.tv/sodapoppin', kind: 'video' },
      ]),
    ]).toEqual([
      ['twi', 'twitch-lacy'],
      ['twi1', 'twitch-suburbbaby'],
      ['twi2', 'twitch-sodapoppin'],
    ])
  })

  it('migrates old IDs and fills an unmatched stale cell with the unused source', () => {
    const customEntries = addStableCustomStreamIds([
      { link: 'https://www.twitch.tv/lacy', kind: 'video' },
      { link: 'https://www.twitch.tv/suburbbaby', kind: 'video' },
      { link: 'https://www.twitch.tv/sodapoppin', kind: 'video' },
    ])
    const doc = new Y.Doc()
    const viewsState = doc.getMap<Y.Map<string | undefined>>('views')
    ;['twi1', 'twi3', 'twi2'].forEach((streamId, idx) => {
      const cell = new Y.Map<string | undefined>()
      cell.set('streamId', streamId)
      viewsState.set(String(idx), cell)
    })

    migrateLegacyCustomAssignments({
      viewsState,
      transact: (fn) => doc.transact(fn),
      customEntries,
      knownStreamIds: new Set([
        'twitch-lacy',
        'twitch-suburbbaby',
        'twitch-sodapoppin',
      ]),
    })

    expect(
      [...viewsState.values()].map((cell) => cell.get('streamId')),
    ).toEqual(['twitch-suburbbaby', 'twitch-lacy', 'twitch-sodapoppin'])
  })
})
