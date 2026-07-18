import type { TwitchQuality } from './twitchPlayer'

export const STREAM_SESSION_MODES = ['shared', 'isolated'] as const

export type StreamSessionMode = (typeof STREAM_SESSION_MODES)[number]

/**
 * Runtime media settings sent from the main process to every stream preload.
 * Values are normalized and validated by the startup config before they reach
 * a renderer.
 */
export interface StreamMediaConfig {
  /** Whether stream views reuse one persistent browser session/cache. */
  sessionMode: StreamSessionMode
  /** Whether normal Twitch channel URLs use the lightweight official player. */
  twitchPlayer: boolean
  /** Fixed Twitch rendition for dense walls, or Twitch's automatic choice. */
  twitchQuality: TwitchQuality
  /** Milliseconds between poster snapshots; zero disables snapshots. */
  snapshotIntervalMs: number
  /** Upper bound for a snapshot's width, before preserving aspect ratio. */
  snapshotMaxWidth: number
  /** Lossy WebP encoder quality in the inclusive range 0..1. */
  snapshotQuality: number
}

/**
 * Scaling-oriented defaults for this fork. A shared session avoids downloading
 * and retaining a complete copy of Twitch's application shell per tile, while
 * bounded snapshots preserve the seamless-stall poster without capturing a
 * source-resolution PNG every second.
 */
export const DEFAULT_STREAM_MEDIA_CONFIG: StreamMediaConfig = {
  sessionMode: 'shared',
  twitchPlayer: true,
  twitchQuality: '360p',
  snapshotIntervalMs: 10_000,
  snapshotMaxWidth: 640,
  snapshotQuality: 0.65,
}
