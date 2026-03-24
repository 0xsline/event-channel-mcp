/**
 * event-channel types: events, config, and event source interface.
 */

/** A platform event to be pushed to the AI session. */
export interface ChannelEvent {
  /** Dedup key */
  id: string
  /** Source name from config */
  source: string
  /** Event type */
  eventType: string
  /** Human-readable summary */
  content: string
  /** Original data */
  raw?: unknown
  /** Epoch ms when detected */
  timestamp: number
}

/** Configuration for a single polling source. */
export interface PollingSourceConfig {
  /** Display name */
  name: string
  /** Shell command to execute (must return JSON array) */
  command: string
  /** Poll interval in seconds (minimum 30) */
  interval: number
  /** Whether this source is active */
  enabled: boolean
  /** Override field name for dedup key derivation */
  dedupField?: string
  /** JSONPath-like key to extract array from result (e.g. "data.items") */
  jsonPath?: string
}

/** Configuration for the webhook receiver. */
export interface WebhookConfig {
  enabled: boolean
  /** HTTP port (default 8788, localhost only) */
  port: number
  /** Bearer token for auth. Empty = no auth. Supports $ENV_VAR syntax. */
  token: string
}

/** Top-level config (channel.yaml). */
export interface ChannelConfig {
  sources: PollingSourceConfig[]
  webhook: WebhookConfig
}

/** Handler called when an event source produces a new event. */
export type EventHandler = (event: ChannelEvent) => void

/** Pluggable event source interface. */
export interface EventSource {
  readonly type: string
  start(): Promise<void>
  stop(): Promise<void>
  onEvent(handler: EventHandler): void
}
