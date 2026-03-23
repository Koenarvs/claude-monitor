# Session Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist sessions to SQLite so they survive server restarts.

**Architecture:** New `SessionStore` class wraps `better-sqlite3` with synchronous CRUD. `SessionManager` gains a `store` dependency — `broadcast()` is wrapped to checkpoint every event. On startup, recoverable sessions are loaded from DB into the in-memory Map.

**Tech Stack:** better-sqlite3, TypeScript

**Spec:** `docs/superpowers/specs/2026-03-22-session-persistence-design.md`

---

### Task 1: Install dependency

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install better-sqlite3**

Run: `npm install better-sqlite3` then `npm install -D @types/better-sqlite3`

- [ ] **Step 2: Verify import works**

Run: `node -e "const Database = require('better-sqlite3'); const db = new Database(':memory:'); console.log('ok'); db.close()"`

Expected: `ok`

- [ ] **Step 3: Commit**

Stage `package.json` and `package-lock.json`, commit with message: `feat: add better-sqlite3 dependency for session persistence`

---

### Task 2: Create SessionStore (`server/db.ts`)

**Files:**
- Create: `server/db.ts`

- [ ] **Step 1: Create `server/db.ts` with the full `SessionStore` class**

The class must:

1. **Constructor** takes `dbPath: string`:
   - `mkdirSync(dirname(dbPath), { recursive: true })` to ensure data dir exists
   - Open `better-sqlite3` database at `dbPath`
   - Set pragmas: `journal_mode = WAL`, `foreign_keys = ON`
   - Execute schema DDL (all three tables + indexes, using `CREATE TABLE IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS`)
   - Prepare all statements (see below)

2. **Prepared statements** (cached as private fields):
   - `stmtInsertSession` — INSERT into sessions with all 11 columns, using named params matching `SessionRuntime` field names
   - `stmtUpdateSession` — UPDATE sessions SET all mutable columns (sdk_session_id, name, status, last_activity_at, cost, turns, compaction_count) WHERE id = @id
   - `stmtInsertMessage` — INSERT OR REPLACE into messages with all 8 columns. Use `OR REPLACE` because approval messages are re-broadcast with updated `approval` field (e.g., 'pending' → 'approved'/'denied'). This ensures the latest state is always persisted without needing a separate update path.
   - `stmtUpdateMessage` — UPDATE messages SET approval = @approval WHERE id = @id
   - `stmtUpsertSubagent` — INSERT OR REPLACE into subagents with all 6 columns
   - `stmtDeleteSession` — DELETE FROM sessions WHERE id = ?

3. **Public methods:**

   `insertSession(session: SessionRuntime): void`
   — Runs `stmtInsertSession` mapping SessionRuntime fields to named params. Maps `sdkSessionId` to `@sdkSessionId`, `permissionMode` to `@permissionMode`, etc.

   `updateSession(id: string, fields: Partial<{ sdkSessionId, name, status, lastActivityAt, cost, turns, compactionCount }>): void`
   — Builds a dynamic UPDATE from only the provided (non-undefined) fields. Uses a helper that constructs `SET col1 = ?, col2 = ?` from the fields object, mapping camelCase keys to snake_case columns. Returns silently if no fields provided or row not found. This avoids the overhead of a SELECT-merge-write cycle and prevents undefined values from overwriting real data.

   `insertMessage(sessionId: string, message: Message): void`
   — Runs `stmtInsertMessage`. Maps `message.toolName` to `@toolName` (null if undefined), `message.toolArgs` to `@toolArgs` (null if undefined), `message.approval` to `@approval` (null if undefined).

   `updateMessage(id: string, fields: { approval: string }): void`
   — Runs `stmtUpdateMessage` with `{ id, approval: fields.approval }`.

   `upsertSubagent(sessionId: string, subagent: SubagentInfo): void`
   — Runs `stmtUpsertSubagent`. Maps `subagent.completedAt` to null if undefined.

   `getActiveSessions(): SessionRuntime[]`
   — SELECT all sessions WHERE status NOT IN ('done', 'error'). For each row, SELECT associated messages (ORDER BY timestamp, rowid) and subagents. Map DB column names (snake_case) back to TypeScript field names (camelCase). Set `activeGenerator: null` and `pendingApproval: null` on each. Map `null` DB values to `undefined` for optional Message fields (toolName, toolArgs, approval) and SubagentInfo fields (completedAt).

   `deleteSession(id: string): void`
   — Runs `stmtDeleteSession`. CASCADE handles messages and subagents.

   `markActiveAsError(): void`
   — Runs: `UPDATE sessions SET status = 'error' WHERE status NOT IN ('done', 'error')`

   `purgeOldSessions(maxAgeDays: number = 7): number`
   — Calculates cutoff as `Date.now() - maxAgeDays * 86400000`. Runs: `DELETE FROM sessions WHERE status IN ('done', 'error') AND last_activity_at < ?`. Returns `result.changes`.

   `close(): void`
   — Calls `this.db.close()`.

4. **Imports needed:**
   - `Database` from `better-sqlite3`
   - `mkdirSync` from `fs`
   - `dirname` from `path`
   - Types: `SessionRuntime`, `Message`, `SubagentInfo` from `./types.js`

- [ ] **Step 2: Verify typecheck passes**

Run: `npx tsc --noEmit` from project root.

Expected: No errors.

- [ ] **Step 3: Commit**

Stage `server/db.ts`, commit with message: `feat: add SessionStore with SQLite schema and CRUD methods`

---

### Task 3: Integrate store into SessionManager

**Files:**
- Modify: `server/session-manager.ts`

Three changes: (a) accept store in constructor + restore, (b) persist in spawn/kill/rename, (c) wrap broadcast for event-based checkpointing.

- [ ] **Step 1: Add store as constructor dependency**

Add import: `import { SessionStore } from './db.js';`

Add private field `private store: SessionStore;` to the class.

Change from implicit no-arg constructor to explicit:
```typescript
constructor(store: SessionStore) {
  this.store = store;
  this.restoreSessions();
}
```

- [ ] **Step 2: Add `restoreSessions()` private method**

Add after constructor. This method:

1. Calls `this.store.purgeOldSessions(7)` — logs count if > 0
2. Calls `this.store.getActiveSessions()` — gets all non-terminal sessions
3. For each session, applies status transition:
   - `needs_input` — no change, restore as-is
   - `waiting_approval` — set `session.status = 'needs_input'`, find all messages with `approval === 'pending'` and set to `'denied'` (call `store.updateMessage` for each), push a system message "Session restored after server restart. Pending approval was lost." (use `uuid()` from the `uuid` package for consistency with codebase), call `store.insertMessage` for it, call `store.updateSession` with `{ status: 'needs_input' }`
   - `spawning` or `working` — set `session.status = 'error'`, push system message "Session interrupted by server restart." (use `uuid()` for ID), persist both message and status update
4. Calls `this.sessions.set(session.id, session)` for each
5. Logs `Restored N session(s) from DB` if any were restored

- [ ] **Step 3: Add store calls to `spawn()`**

After `this.sessions.set(id, session);` (line 65) and before `const view = toSessionView(session);` (line 66), add:

```typescript
this.store.insertSession(session);
```

- [ ] **Step 4: Add store calls to `kill()`**

Do NOT add a direct `store.updateSession()` call for the status change — the `broadcast('session:status', ...)` call that already follows will trigger the broadcast wrapper's persistence. This avoids a double-write.

Inside the `setTimeout` callback (around line 111-113), after `this.sessions.delete(id);`, add:

```typescript
this.store.deleteSession(id);
```

- [ ] **Step 5: Add store call to `rename()`**

After `session.name = name;` (line 119), add:

```typescript
this.store.updateSession(id, { name });
```

- [ ] **Step 6: Wrap `broadcast()` with persistence layer**

Replace the body of the existing `broadcast()` method. The new version first persists based on event type, then broadcasts to WebSocket clients.

Persistence switch cases:
- `'session:message'` or `'session:approval'` — if `data.message` exists, call `this.store.insertMessage(sessionId, data.message)`. Uses `INSERT OR REPLACE` so approval resolution updates (same message ID, changed `approval` field) are correctly persisted.
- `'session:status'` — look up the runtime session via `this.sessions.get(sessionId)` and persist from the runtime object, NOT from `data`. This is critical because: (a) `sdkSessionId` is set on the runtime object by session-runner.ts but never included in broadcast data — without reading from runtime, session resume after restart would fail; (b) `turns` is only set on the runtime object, never in broadcast data; (c) `cost` may not be present in all status broadcasts. Call `this.store.updateSession(sessionId, { sdkSessionId: session.sdkSessionId, status: session.status, lastActivityAt: session.lastActivityAt, cost: session.cost, turns: session.turns })`.
- `'session:subagent'` — if `data.subagent` exists, call `this.store.upsertSubagent(sessionId, data.subagent)`
- `'session:compaction'` — call `this.store.updateSession(sessionId, { compactionCount: data.compactionCount })`
- All other events (`session:created`, `session:renamed`, `session:removed`) — no persistence (handled by their respective manager methods)

**Important:** Wrap all store calls in the broadcast method with try/catch. Log errors but don't throw — a DB write failure should not crash the session. The in-memory state remains the source of truth.

Then the existing WebSocket broadcast logic (JSON.stringify + send to all open clients).

- [ ] **Step 7: Verify typecheck passes**

Run: `npx tsc --noEmit`

Expected: No errors.

- [ ] **Step 8: Commit**

Stage `server/session-manager.ts`, commit with message: `feat: integrate SessionStore into SessionManager with checkpoint-on-broadcast`

---

### Task 4: Wire up in server entry point + graceful shutdown

**Files:**
- Modify: `server/index.ts`
- Modify or create: `.gitignore`

- [ ] **Step 1: Import SessionStore and instantiate before SessionManager**

Add import: `import { SessionStore } from './db.js';`

Replace `const manager = new SessionManager();` with:

```typescript
const store = new SessionStore(join(__dirname, '..', 'data', 'claude-monitor.db'));
const manager = new SessionManager(store);
```

Note: `__dirname` and `join` are already defined/imported in this file. In dev mode (tsx), `__dirname` points to the `server/` directory via the `fileURLToPath` setup on line 12. In production (compiled to `dist/server/`), `join(__dirname, '..', 'data', ...)` would resolve to `dist/data/` which is wrong. Instead, use `process.cwd()`:

```typescript
const store = new SessionStore(join(process.cwd(), 'data', 'claude-monitor.db'));
const manager = new SessionManager(store);
```

This ensures the DB is always at `<project-root>/data/claude-monitor.db` regardless of whether running via tsx or compiled.

- [ ] **Step 2: Add graceful shutdown handler**

Add before `server.listen()`:

```typescript
async function shutdown() {
  console.log('Shutting down...');
  const active = manager.list().filter(s => !['done', 'error'].includes(s.status));
  await Promise.allSettled(active.map(s => manager.kill(s.id)));
  store.markActiveAsError();
  store.close();
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
```

- [ ] **Step 3: Add `data/` to `.gitignore`**

Check if `.gitignore` exists. If so, append `data/` on a new line. If not, create it with `data/` as the only entry.

- [ ] **Step 4: Verify typecheck passes**

Run: `npx tsc --noEmit`

Expected: No errors.

- [ ] **Step 5: Commit**

Stage `server/index.ts` and `.gitignore`, commit with message: `feat: wire SessionStore into server with graceful shutdown`

---

### Task 5: Manual verification

**Files:** None (testing only)

- [ ] **Step 1: Start the dev server**

Run: `npm run dev` from project root.

Expected: Server starts cleanly. `data/claude-monitor.db` is created. No restore messages on first run.

- [ ] **Step 2: Spawn a session and let it reach `needs_input`**

Open `http://localhost:5173`. Spawn a session with a simple prompt. Wait for it to complete a turn and reach `needs_input` status.

- [ ] **Step 3: Restart the server**

Kill the dev server (Ctrl+C), then start it again (`npm run dev`).

Expected: Console prints `Restored 1 session(s) from DB`. The session appears in the UI with all messages, in `needs_input` status. Sending new input should resume it.

- [ ] **Step 4: Test crash recovery of `working` session**

Spawn a new session. While it's actively `working`, kill the server. Restart.

Expected: Session appears with `error` status and system message "Session interrupted by server restart." Retry button should work.

- [ ] **Step 5: Commit any fixes discovered during testing**

---

### Task 6: Update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update architecture section**

Replace the line `- Sessions are in-memory (no database)` with:
```
- Sessions persisted to SQLite (`data/claude-monitor.db`) via better-sqlite3
- Checkpoint on every state change — survives server restarts
- Active sessions restored on startup; working sessions marked as error (retryable)
```

- [ ] **Step 2: Commit**

Stage `CLAUDE.md`, commit with message: `docs: update CLAUDE.md with session persistence architecture`
