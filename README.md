# Claude Monitor

A local web dashboard for spawning, monitoring, and interacting with multiple Claude Code sessions from a single browser interface.

Built on the [Claude Agent SDK](https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk), Claude Monitor gives you a single pane of glass for all your Claude Code work — run orchestrator sessions in supervised mode, fire off autonomous tasks in parallel, and watch everything happen in real time.

## Quick Start

```bash
git clone https://github.com/YOUR_USERNAME/claude-monitor.git
cd claude-monitor
npm install
npm run dev
```

Open **http://localhost:5173** in your browser. A `config.json` will be auto-generated on first run with sensible defaults.

## Prerequisites

- **Node.js 22+** (tested on 23.x)
- **Claude Code CLI** installed and authenticated

Claude Monitor inherits your CLI authentication. Whatever method your `claude` command uses will work:

| Auth Method | Setup |
|-------------|-------|
| Anthropic API Key | Set `ANTHROPIC_API_KEY` environment variable |
| Claude Code Pro | Log in via `claude` CLI |
| OAuth / Vertex AI | Authenticate via `gcloud auth` (re-auth every ~6 hours) |

No additional API keys or auth configuration is needed in the app itself.

## Features

- **Multi-session management** — Spawn up to 10 concurrent Claude Code sessions
- **Real-time streaming** — WebSocket-powered live message updates
- **Autonomous + Supervised modes** — Per-session: run freely or approve each tool call
- **Approval timeout** — Auto-denies unattended approvals after 30 min (configurable)
- **Session persistence** — SQLite-backed; sessions survive server restarts
- **Subagent tracking** — See active subagents with badge counts
- **Skills & Agents browser** — Browse all installed Claude Code skills and agents
- **CLAUDE.md editor** — View and edit project instructions from the dashboard
- **Extensions panel** — Browse MCP servers, plugins, and hooks
- **Cross-session context** — Inject awareness of other active sessions when spawning
- **Session logging** — Structured markdown logs to an Obsidian vault (optional)
- **Browser notifications** — Tab title badge and OS notifications when sessions need attention

## Configuration

On first run, `config.json` is auto-generated. Edit it to customize your setup:

```json
{
  "defaultCwd": "~/projects",
  "defaultPermissionMode": "autonomous",
  "workingDirectories": [
    { "label": "My App", "path": "/home/user/my-app" },
    { "label": "Another Project", "path": "/home/user/another" }
  ],
  "vaultPath": "",
  "maxSessions": 10,
  "approvalTimeoutMinutes": 30
}
```

| Field | Description |
|-------|-------------|
| `defaultCwd` | Default working directory for new sessions |
| `defaultPermissionMode` | `"autonomous"` or `"supervised"` |
| `workingDirectories` | Quick-select list shown in spawn dialog |
| `vaultPath` | Directory for session log markdown files (leave empty to disable) |
| `maxSessions` | Maximum concurrent sessions (1-20) |
| `approvalTimeoutMinutes` | Auto-deny timeout for supervised mode (1-120) |

A `config.example.json` is included in the repo as a reference.

## Usage

### Spawning Sessions

Click the rocket icon at the bottom of the sidebar (or the empty-state button) to open the spawn dialog:

1. **Pick a working directory** from saved directories or type a path
2. **Optionally select a skill or agent** to prefix your prompt
3. **Write your prompt** — what should Claude work on?
4. **Choose permission mode** — autonomous runs freely; supervised requires your approval for each tool call
5. **Toggle cross-session context** — injects awareness of other running sessions

### Session Lifecycle

| State | Description |
|-------|-------------|
| Spawning | Session initializing with the SDK |
| Working | Claude is actively thinking and executing tools |
| Needs Input | Claude finished a turn and is waiting for your follow-up |
| Waiting Approval | A tool call needs your permission (supervised mode only) |
| Done | Session completed or was closed |
| Error | Something went wrong (retry available) |

Sessions in **Needs Input** or **Waiting Approval** state pulse in the sidebar and trigger browser notifications.

### Supervised Mode

When running supervised, each tool call pauses for your approval. You'll see the tool name and arguments, then click **Allow** or **Deny**. If you don't respond within the configured timeout (default 30 minutes), the tool call is automatically denied.

### Toolbar Panels

- **Skills & Agents** — Browse installed skills and agents; click Refine to optimize a skill's trigger accuracy
- **CLAUDE.md** — View and edit the active session's project instructions
- **Extensions** — See configured MCP servers, plugins, and hooks

## Commands

| Command | Purpose |
|---------|---------|
| `npm run dev` | Start Vite dev server (5173) + Express API (3002) |
| `npm run build` | Build frontend + compile server for production |
| `npm start` | Run production server (serves built frontend) |
| `npm test` | Run test suite |
| `npm run test:watch` | Run tests in watch mode |
| `npm run typecheck` | Type-check without emitting |

## Production

For long-running deployment, use PM2:

```bash
npm run build
npx pm2 start ecosystem.config.cjs
```

The included `ecosystem.config.cjs` is pre-configured. In production mode, the Express server serves the built frontend on port 3002 — no separate Vite server needed.

## Architecture

```
Browser (React 19 + Vite + Tailwind v4)
    |
    |-- HTTP REST (/api/*)     Session CRUD, config, skills, extensions
    |-- WebSocket (/ws)        Real-time message streaming, approvals
    |
Express Server (Node.js + TypeScript)
    |
    |-- SessionManager         Session lifecycle, broadcast to clients
    |-- SessionRunner          SDK integration, message parsing
    |-- SessionStore (SQLite)  Persistence across restarts
    |-- VaultLogger            Markdown session logs (optional)
    |-- ConfigScanner          MCP servers, plugins, hooks discovery
    |-- SkillsScanner          Skills & agents discovery
    |
@anthropic-ai/claude-agent-sdk
```

The server spawns Claude Code sessions via the Agent SDK's `query()` function and streams results to the browser over WebSocket. Sessions are persisted in SQLite so they survive server restarts. Vault logging writes structured markdown summaries to a configurable directory (designed for Obsidian but works with any markdown reader).

## Tech Stack

- **Frontend:** React 19, Vite 6, Tailwind CSS v4, TypeScript
- **Backend:** Express 5, ws, better-sqlite3, TypeScript
- **SDK:** @anthropic-ai/claude-agent-sdk
- **Validation:** zod
- **Logging:** pino + pino-pretty
- **Testing:** vitest, @testing-library/react
- **Production:** PM2

## License

MIT
