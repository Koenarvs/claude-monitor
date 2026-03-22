# Claude Monitor

Local web app for managing multiple Claude Code sessions from a single dashboard.

## Stack
- Frontend: React 19 + Vite + Tailwind CSS v4
- Backend: Express + WebSocket (ws) + TypeScript
- SDK: @anthropic-ai/claude-agent-sdk

## Commands
- `npm run dev` — Start both Vite and Express dev servers
- `npm run build` — Build for production
- `npm start` — Run production server
- `npm run typecheck` — Type-check without emitting

## Architecture
- Server manages sessions via Agent SDK `query()` calls
- WebSocket pushes real-time updates to browser
- Sessions are in-memory (no database)
- Session logs written to `D:/greyhawk-grand-campaign/_claude-memory/sessions/` on completion

## Ports
- Express server: 3002
- Vite dev: 5173 (proxies /api and /ws to 3002)
