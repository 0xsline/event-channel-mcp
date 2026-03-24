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

/** Filter rule: match events by field conditions. */
export interface FilterRule {
  /** Field name to check */
  field: string
  /** Operator */
  op: 'contains' | 'equals' | 'matches' | 'gt' | 'lt' | 'exists' | 'not_exists'
  /** Value to compare against (not needed for exists/not_exists) */
  value?: string | number
}

/** Transform rule: customize notification content. */
export interface TransformRule {
  /** Template string with {{field}} placeholders for content */
  template?: string
  /** Fields to include in the notification (default: auto-detect) */
  fields?: string[]
  /** Override event type label */
  eventType?: string
}

/** Configuration for a single polling source. */
export interface PollingSourceConfig {
  /** Display name */
  name: string
  /** Shell command to execute (must return JSON array) */
  command: string
  /** Poll interval in seconds (minimum 30). Ignored if cron is set. */
  interval: number
  /** Cron expression (e.g. "0 9 * * *"). Overrides interval if set. */
  cron?: string
  /** Whether this source is active */
  enabled: boolean
  /** Override field name for dedup key derivation */
  dedupField?: string
  /** JSONPath-like key to extract array from result (e.g. "data.items") */
  jsonPath?: string
  /** Filter rules: only emit events matching ALL rules (AND logic) */
  filter?: FilterRule[]
  /** Transform rule: customize notification content */
  transform?: TransformRule
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
