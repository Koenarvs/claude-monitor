# Claude Monitor

A local web dashboard for spawning, monitoring, and interacting with multiple Claude Code sessions from a single browser interface.

## Features

- **Multi-session management** — Spawn and run multiple Claude Code sessions concurrently
- **Real-time streaming** — WebSocket-powered live message updates
- **Subagent tracking** — See active subagents with badge counts and expandable details
- **Permission modes** — Per-session choice: autonomous (runs freely) or supervised (approval UI)
- **Skills/Agents browser** — Browse all installed Claude Code skills and agents
- **CLAUDE.md editor** — View and edit project instructions from the dashboard
- **Session logging** — Automatic structured markdown logs to Obsidian vault on session close
- **LLM summarization** — AI-generated session summaries with deterministic fallback
- **Cross-session context** — Inject awareness of other active sessions when spawning
- **Saved directories** — Config file with predefined project directories for quick access
- **Skill/Agent selector** — Choose a skill or agent at session spawn time
- **Browser notifications** — Tab title badge and OS notifications when sessions need attention

## Quick Start

```bash
git clone https://github.com/YOUR_USERNAME/claude-monitor.git
cd claude-monitor
cp config.example.json config.json  # Edit with your project directories
npm install
npm run dev
```

Open http://localhost:5173

## Configuration

Edit `config.json` to customize:

```json
{
  "defaultCwd": "C:/Users/You",
  "defaultPermissionMode": "autonomous",
  "workingDirectories": [
    { "label": "My Project", "path": "C:/Users/You/my-project" }
  ],
  "vaultPath": "D:/your-vault/_claude-memory/sessions",
  "maxSessions": 10
}
```

## Architecture

```
Browser (React + Vite + Tailwind)
    │ WebSocket
Express Server (Node.js)
    │
@anthropic-ai/claude-agent-sdk
```

- **Server** manages sessions via the Agent SDK's `query()` function
- **WebSocket** pushes real-time updates to the browser
- **Sessions are in-memory** — no database required
- **Session logs** written as markdown to your Obsidian vault on close

## Tech Stack

- Frontend: React 19, Vite, Tailwind CSS v4, TypeScript
- Backend: Express, ws (WebSocket), TypeScript
- SDK: @anthropic-ai/claude-agent-sdk
- Dev: tsx, concurrently
- Production: PM2

## Commands

| Command | Purpose |
|---------|---------|
| `npm run dev` | Start Vite (5173) + Express (3002) dev servers |
| `npm run build` | Build frontend + compile server |
| `npm start` | Run production server |
| `npm run typecheck` | Type-check without emitting |

## Session States

| State | Icon Color | Meaning |
|-------|-----------|---------|
| Spawning | Blue | Session initializing |
| Working | Green | Claude is actively thinking/acting |
| Needs Input | Amber (pulse) | Waiting for your message |
| Waiting Approval | Amber (solid) | Tool call needs permission |
| Done | Gray | Session closed |
| Error | Red | Session encountered an error |

## Requirements

- Node.js 22+
- `ANTHROPIC_API_KEY` environment variable set
- Claude Code CLI installed (`@anthropic-ai/claude-code`)

## License

MIT
