/**
 * Bounded event queue with dedup window.
 */

import type { ChannelEvent } from './types.js'

export interface QueueOptions {
  maxSize?: number
  dedupWindowSize?: number
}

export class EventQueue {
  private readonly events: ChannelEvent[] = []
  private readonly seenIds: string[] = []
  private readonly seenSet = new Set<string>()
  private readonly maxSize: number
  private readonly dedupWindowSize: number

  constructor(opts: QueueOptions = {}) {
    this.maxSize = opts.maxSize ?? 200
    this.dedupWindowSize = opts.dedupWindowSize ?? 500
  }

  push(event: ChannelEvent): boolean {
    if (this.seenSet.has(event.id)) return false
    this.trackId(event.id)
    this.events.push(event)
    while (this.events.length > this.maxSize) {
      this.events.shift()
    }
    return true
  }

  drain(): ChannelEvent[] {
    return this.events.splice(0)
  }

  get pending(): number {
    return this.events.length
  }

  private trackId(id: string): void {
    this.seenIds.push(id)
    this.seenSet.add(id)
    while (this.seenIds.length > this.dedupWindowSize) {
      const old = this.seenIds.shift()!
      this.seenSet.delete(old)
    }
  }
}
