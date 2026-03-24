# event-channel-mcp

Push platform events into your AI coding session. Monitor any CLI command, API, or webhook and get real-time notifications in Claude Code.

```
Platform events (Twitter, GitHub, HN, email...)
    ↓ polling / webhook
event-channel-mcp (MCP stdio server)
    ↓ claude/channel protocol
Claude Code session ← notification appears here
```

## Install

```bash
npm install -g event-channel-mcp
```

## Quick Start

### 1. Create config

```bash
mkdir -p ~/.config/event-channel-mcp
cat > ~/.config/event-channel-mcp/config.yaml << 'EOF'
sources:
  # Monitor Hacker News top stories
  - name: hackernews
    command: "curl -s https://hacker-news.firebaseio.com/v0/topstories.json"
    interval: 300
    enabled: true

  # Monitor GitHub notifications (requires gh CLI)
  - name: github-notifications
    command: "gh api /notifications"
    interval: 120
    enabled: true

  # Monitor your server health
  - name: server-health
    command: "curl -s https://api.myapp.com/health"
    interval: 60
    enabled: true

webhook:
  enabled: true
  port: 8788
  token: ""
EOF
```

### 2. Register in Claude Code

Add to `~/.claude.json` under `mcpServers`:

```json
{
  "event-channel-mcp": {
    "command": "event-channel-mcp",
    "type": "stdio"
  }
}
```

Or for development:

```json
{
  "event-channel-mcp": {
    "command": "npx",
    "args": ["event-channel-mcp"],
    "type": "stdio"
  }
}
```

### 3. Launch

```bash
claude --dangerously-load-development-channels server:event-channel-mcp
```

Events will now push into your session automatically.

## Configuration

### Polling Sources

Any command that outputs a JSON array can be a polling source:

```yaml
sources:
  - name: my-source          # display name
    command: "curl -s ..."    # shell command (must output JSON)
    interval: 60              # seconds between polls (min: 30)
    enabled: true             # toggle on/off
    dedupField: "id"          # optional: override dedup key field
    jsonPath: "data.items"    # optional: extract array from nested JSON
```

**Dedup key priority:** `id` > `url` > `title` > `name` > SHA-256 hash

**Examples:**

| Source | Command |
|--------|---------|
| GitHub notifications | `gh api /notifications` |
| Hacker News | `curl -s https://hacker-news.firebaseio.com/v0/topstories.json` |
| RSS feed (with jq) | `curl -s https://example.com/feed.json \| jq '.items'` |
| Docker containers | `docker ps --format json` |
| Custom script | `node my-monitor.js` |
| Any CLI tool | Any command that outputs JSON |

### Webhook

Receive events via HTTP POST:

```yaml
webhook:
  enabled: true
  port: 8788                  # localhost only
  token: "my-secret"          # optional Bearer token, supports $ENV_VAR
```

Send events:

```bash
curl -X POST http://127.0.0.1:8788/events \
  -H "Content-Type: application/json" \
  -d '{"source": "ci", "event": "build_failed", "message": "Build failed on main"}'
```

**Webhook payload:**

| Field | Type | Description |
|-------|------|-------------|
| `source` | string | Platform name |
| `event` | string | Event type |
| `message` | string | Human-readable summary |
| `data` | object | Optional raw data |

### Environment Variables

| Variable | Description |
|----------|-------------|
| `EVENT_CHANNEL_CONFIG` | Override config file path |

## How It Works

1. **Polling sources** execute your shell command on an interval
2. Results are compared against the previous snapshot (diff detection)
3. Only **new items** are pushed as notifications
4. **Webhook source** accepts HTTP POST and pushes immediately
5. Events go through a bounded queue (200 max, dedup by ID)
6. Notifications are delivered via MCP `claude/channel` protocol

## Error Handling

- **Command fails:** Exponential backoff (×2, ×4, max 5min), one notification to user
- **Invalid JSON output:** Skip cycle, log warning
- **Queue overflow:** Discard oldest silently
- **Session disconnect:** Graceful shutdown

## Requirements

- Node.js >= 20
- Claude Code >= 2.1.80 (Channels is research preview)
- `claude.ai` login (API key auth not supported for Channels)

## License

MIT
