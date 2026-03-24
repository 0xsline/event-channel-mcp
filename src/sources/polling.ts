/**
 * Polling event source: executes any shell command on an interval,
 * diffs results against previous snapshot, emits new items.
 */

import { exec } from 'node:child_process'
import { createHash } from 'node:crypto'
import type { ChannelEvent, EventHandler, EventSource, PollingSourceConfig } from '../types.js'

const MAX_SNAPSHOT_KEYS = 100
const MIN_INTERVAL = 30
const EXEC_TIMEOUT = 30_000 // 30s per command

export class PollingSource implements EventSource {
  readonly type = 'polling'

  private readonly config: PollingSourceConfig
  private readonly handlers: EventHandler[] = []
  private previousKeys = new Set<string>()
  private timer: ReturnType<typeof setTimeout> | null = null
  private backoffMultiplier = 1
  private consecutiveErrors = 0
  private stopped = false

  constructor(config: PollingSourceConfig) {
    this.config = config
  }

  onEvent(handler: EventHandler): void {
    this.handlers.push(handler)
  }

  async start(): Promise<void> {
    this.stopped = false
    await this.pollOnce()
    this.scheduleNext()
  }

  async stop(): Promise<void> {
    this.stopped = true
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
  }

  private scheduleNext(): void {
    if (this.stopped) return
    const delayMs = Math.max(this.config.interval, MIN_INTERVAL) * 1000 * this.backoffMultiplier
    this.timer = setTimeout(async () => {
      await this.pollOnce()
      this.scheduleNext()
    }, delayMs)
  }

  /** Execute shell command and return parsed JSON. */
  private execCommand(): Promise<unknown> {
    return new Promise((resolve, reject) => {
      exec(this.config.command, { timeout: EXEC_TIMEOUT, maxBuffer: 5 * 1024 * 1024 }, (err, stdout, stderr) => {
        if (err) {
          reject(new Error(`Command failed: ${err.message}${stderr ? `\nstderr: ${stderr.slice(0, 200)}` : ''}`))
          return
        }
        try {
          resolve(JSON.parse(stdout))
        } catch {
          reject(new Error(`Invalid JSON output from: ${this.config.command}`))
        }
      })
    })
  }

  /** Extract array from result using jsonPath config. */
  private extractArray(result: unknown): unknown[] {
    if (Array.isArray(result)) return result

    if (this.config.jsonPath && typeof result === 'object' && result !== null) {
      const parts = this.config.jsonPath.split('.')
      let current: unknown = result
      for (const part of parts) {
        if (typeof current === 'object' && current !== null && part in current) {
          current = (current as Record<string, unknown>)[part]
        } else {
          return []
        }
      }
      if (Array.isArray(current)) return current
    }

    return []
  }

  /** Execute a single poll cycle. Exposed for testing. */
  async pollOnce(): Promise<void> {
    let result: unknown
    try {
      result = await this.execCommand()
    } catch (err) {
      this.consecutiveErrors++
      if (this.consecutiveErrors <= 3) {
        this.backoffMultiplier = Math.min(this.backoffMultiplier * 2, 10)
      }
      if (this.consecutiveErrors === 1) {
        this.emit({
          id: `${this.config.name}:error:${Date.now()}`,
          source: this.config.name,
          eventType: 'error',
          content: `Polling error for "${this.config.name}": ${err instanceof Error ? err.message : String(err)}`,
          timestamp: Date.now(),
        })
      }
      return
    }

    this.consecutiveErrors = 0
    this.backoffMultiplier = 1

    const items = this.extractArray(result)
    if (items.length === 0) return

    const currentKeys = new Set<string>()
    const newItems: ChannelEvent[] = []

    for (const item of items) {
      if (typeof item !== 'object' || item === null) continue
      const record = item as Record<string, unknown>
      const key = this.deriveKey(record)
      currentKeys.add(key)

      if (!this.previousKeys.has(key)) {
        newItems.push({
          id: `${this.config.name}:${key}`,
          source: this.config.name,
          eventType: 'new_item',
          content: this.formatItem(record),
          raw: item,
          timestamp: Date.now(),
        })
      }
    }

    this.previousKeys = currentKeys.size <= MAX_SNAPSHOT_KEYS
      ? currentKeys
      : new Set([...currentKeys].slice(0, MAX_SNAPSHOT_KEYS))

    for (const event of newItems) {
      this.emit(event)
    }
  }

  private deriveKey(item: Record<string, unknown>): string {
    if (this.config.dedupField && item[this.config.dedupField] != null) {
      return String(item[this.config.dedupField])
    }
    if (item.id != null) return String(item.id)
    if (item.url != null) return String(item.url)
    if (item.title != null) return String(item.title)
    if (item.name != null) return String(item.name)
    return createHash('sha256').update(JSON.stringify(item)).digest('hex').slice(0, 16)
  }

  private formatItem(item: Record<string, unknown>): string {
    const parts: string[] = []
    if (item.title) parts.push(String(item.title))
    if (item.description) parts.push(String(item.description))
    if (item.message) parts.push(String(item.message))
    if (item.url) parts.push(String(item.url))
    if (item.author || item.user) parts.push(`by ${item.author ?? item.user}`)
    return parts.join('\n') || JSON.stringify(item).slice(0, 300)
  }

  private emit(event: ChannelEvent): void {
    for (const handler of this.handlers) {
      handler(event)
    }
  }
}
