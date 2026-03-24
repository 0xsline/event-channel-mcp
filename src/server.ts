#!/usr/bin/env node
/**
 * event-channel — Push platform events into your AI coding session.
 *
 * MCP server with claude/channel experimental capability.
 * Monitors any CLI command or webhook and delivers notifications.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import yaml from 'js-yaml'
import { Watcher } from './watcher.js'
import type { ChannelConfig } from './types.js'

const CONFIG_PATH = process.env.EVENT_CHANNEL_CONFIG
  ?? path.join(os.homedir(), '.config', 'event-channel', 'config.yaml')
const STATE_PATH = path.join(os.homedir(), '.config', 'event-channel', 'state.json')
const LOCK_PATH = path.join(os.homedir(), '.config', 'event-channel', 'channel.lock')
const PUSH_INTERVAL = 1000
const STATE_INTERVAL = 10000

// stdout is reserved for MCP protocol
console.log = (...args: unknown[]) => console.error(...args)

function log(...args: unknown[]): void {
  console.error('[event-channel]', ...args)
}

// ── Lock ────────────────────────────────────────────────────────────────

function acquireLock(): boolean {
  try {
    const raw = fs.readFileSync(LOCK_PATH, 'utf-8')
    const data = JSON.parse(raw) as { pid: number }
    try {
      process.kill(data.pid, 0)
      return false
    } catch { /* stale */ }
  } catch { /* no lock */ }

  fs.mkdirSync(path.dirname(LOCK_PATH), { recursive: true })
  fs.writeFileSync(LOCK_PATH, JSON.stringify({ pid: process.pid, startedAt: Date.now() }))
  return true
}

function releaseLock(): void {
  try {
    const raw = fs.readFileSync(LOCK_PATH, 'utf-8')
    const data = JSON.parse(raw) as { pid: number }
    if (data.pid === process.pid) fs.unlinkSync(LOCK_PATH)
  } catch { /* no-op */ }
}

// ── Config ──────────────────────────────────────────────────────────────

function loadConfig(): ChannelConfig {
  const defaults: ChannelConfig = {
    sources: [],
    webhook: { enabled: false, port: 8788, token: '' },
  }

  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf-8')
    const parsed = yaml.load(raw) as Partial<ChannelConfig>
    return {
      sources: parsed.sources ?? defaults.sources,
      webhook: { ...defaults.webhook, ...parsed.webhook },
    }
  } catch {
    log(`No config found at ${CONFIG_PATH}`)
    log('Create a config file or set EVENT_CHANNEL_CONFIG env var.')
    log('Example config:')
    log('')
    log('sources:')
    log('  - name: hackernews')
    log('    command: "curl -s https://hacker-news.firebaseio.com/v0/topstories.json"')
    log('    interval: 300')
    log('    enabled: true')
    log('')
    log('webhook:')
    log('  enabled: true')
    log('  port: 8788')
    log('  token: ""')
    return defaults
  }
}

// ── Main ────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  if (!acquireLock()) {
    log('Another instance is already running. Exiting.')
    process.exit(1)
  }

  const config = loadConfig()

  const enabledSources = config.sources.filter(s => s.enabled).length
  if (enabledSources === 0 && !config.webhook.enabled) {
    log('No sources configured.')
  }

  const mcp = new Server(
    { name: 'event-channel', version: '0.1.0' },
    {
      capabilities: {
        experimental: { 'claude/channel': {} },
      },
      instructions: `Platform events arrive as <channel source="event-channel" event_type="...">.
Inform the user about new events. Summarize what happened and ask if they want to take action.`,
    },
  )

  const watcher = new Watcher(config)
  await watcher.start()

  // Push events from queue → MCP notifications
  const pushTimer = setInterval(async () => {
    const events = watcher.drain()
    for (const event of events) {
      try {
        await (mcp as unknown as {
          notification(n: { method: string; params: unknown }): Promise<void>
        }).notification({
          method: 'notifications/claude/channel',
          params: {
            content: event.content,
            meta: {
              event_type: event.eventType,
              source: event.source,
              event_id: event.id,
            },
          },
        })
      } catch (err) {
        log(`Failed to push: ${err instanceof Error ? err.message : err}`)
      }
    }
  }, PUSH_INTERVAL)

  // Write state file periodically
  const stateTimer = setInterval(() => {
    try {
      const state = {
        pid: process.pid,
        uptime: process.uptime(),
        sources: watcher.getStats(),
        pendingEvents: watcher.pendingCount,
        updatedAt: Date.now(),
      }
      fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true })
      fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2))
    } catch { /* non-critical */ }
  }, STATE_INTERVAL)

  // Graceful shutdown
  async function shutdown(): Promise<void> {
    clearInterval(pushTimer)
    clearInterval(stateTimer)
    await watcher.stop()
    releaseLock()
    try { fs.unlinkSync(STATE_PATH) } catch { /* ignore */ }
    process.exit(0)
  }

  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)
  process.stdin.on('end', shutdown)

  const transport = new StdioServerTransport()
  await mcp.connect(transport)

  log(`Server started (${enabledSources} polling source(s), webhook ${config.webhook.enabled ? 'on' : 'off'})`)
}

main().catch((err) => {
  log('Fatal:', err)
  process.exit(1)
})
