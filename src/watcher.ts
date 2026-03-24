/**
 * Watcher engine: manages EventSource lifecycle and routes events to the queue.
 */

import type { ChannelConfig, ChannelEvent, EventSource } from './types.js'
import { EventQueue } from './queue.js'
import { PollingSource } from './sources/polling.js'
import { WebhookSource } from './sources/webhook.js'

export class Watcher {
  private readonly sources: EventSource[] = []
  private readonly queue = new EventQueue()
  private readonly eventLog: Array<{ source: string; lastPoll: number; errors: number }> = []

  constructor(private readonly config: ChannelConfig) {}

  async start(): Promise<void> {
    for (const src of this.config.sources) {
      if (!src.enabled) continue

      if (src.interval < 30) {
        log(`Warning: interval for "${src.name}" clamped to 30s (was ${src.interval}s)`)
        src.interval = 30
      }

      const polling = new PollingSource(src)
      this.wireSource(polling, src.name)
      this.sources.push(polling)
    }

    if (this.config.webhook.enabled) {
      const webhook = new WebhookSource(this.config.webhook)
      this.wireSource(webhook, 'webhook')
      this.sources.push(webhook)
    }

    for (const source of this.sources) {
      await source.start()
    }

    log(`Started ${this.sources.length} source(s)`)
  }

  async stop(): Promise<void> {
    for (const source of this.sources) {
      await source.stop()
    }
  }

  drain(): ChannelEvent[] {
    return this.queue.drain()
  }

  get pendingCount(): number {
    return this.queue.pending
  }

  getStats(): Array<{ source: string; lastPoll: number; errors: number }> {
    return [...this.eventLog]
  }

  private wireSource(source: EventSource, name: string): void {
    const logEntry = { source: name, lastPoll: 0, errors: 0 }
    this.eventLog.push(logEntry)

    source.onEvent((event: ChannelEvent) => {
      logEntry.lastPoll = Date.now()
      if (event.eventType === 'error') {
        logEntry.errors++
      }
      this.queue.push(event)
    })
  }
}

function log(...args: unknown[]): void {
  console.error('[event-channel]', ...args)
}
