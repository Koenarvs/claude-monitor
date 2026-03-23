# Session Persistence Design

## Problem

Sessions are stored in-memory only (`Map<string, SessionRuntime>`). Any server restart — crash, code change, PM2 reload — wipes all active sessions instantly. Users lose visibility into running work, conversation history, and the ability to resume idle sessions.

## Solution

Add SQLite persistence via `better-sqlite3`. Checkpoint every state change inline with existing broadcast calls. Restore recoverable sessions on startup.

## Database

Single SQLite file at `data/claude-monitor.db`. Constructor ensures `data/` directory exists via `mkdirSync('data', { recursive: true })`.

Schema uses `CREATE TABLE IF NOT EXISTS` — no migrations framework.

### Pragmas

```sql
PRAGMA journal_mode=WAL;    -- Enables concurrent reads during writes (future history browser)
PRAGMA foreign_keys=ON;     -- Required per-connection for ON DELETE CASCADE to work
```

### Schema

```sql
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  sdk_session_id TEXT,
  name TEXT NOT NULL,
  cwd TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'spawning',
  permission_mode TEXT NOT NULL DEFAULT 'autonomous',
  created_at INTEGER NOT NULL,
  last_activity_at INTEGER NOT NULL,
  cost REAL NOT NULL DEFAULT 0,
  turns INTEGER NOT NULL DEFAULT 0,
  compaction_count INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  timestamp INTEGER NOT NULL,
  tool_name TEXT,
  tool_args TEXT,
  approval TEXT
);
CREATE INDEX idx_messages_session ON messages(session_id, timestamp);

CREATE TABLE subagents (
  tool_use_id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running',
  started_at INTEGER NOT NULL,
  completed_at INTEGER
);
CREATE INDEX idx_subagents_session ON subagents(session_id);
```

## Checkpoint Strategy

Writes happen synchronously on every state-changing event. `better-sqlite3`'s sync API makes single INSERT/UPDATE sub-millisecond.

| Event | DB Operation |
|---|---|
| `spawn()` | INSERT session |
| SDK init (session_id captured) | UPDATE sdk_session_id, status |
| Every message broadcast | INSERT message |
| Every status change broadcast | UPDATE status, cost, lastActivityAt |
| Approval approved/denied | UPDATE message approval field |
| Subagent spawn/complete | UPSERT subagent |
| Compaction | UPDATE compaction_count |
| `rename()` | UPDATE name |
| `kill()` | UPDATE status to 'done' |
| `kill()` after delay | DELETE session + cascade |

No batching, no periodic snapshots. Every event is persisted immediately.

### Broadcast Wrapper Event Mapping

The `broadcast()` method is wrapped to persist based on event name:

```typescript
switch (event) {
  case 'session:message':
  case 'session:approval':    // approval messages use a different event name
    store.insertMessage(sessionId, data.message);
    break;
  case 'session:status':
    store.updateSession(sessionId, { status, lastActivityAt, cost });
    break;
  case 'session:subagent':
    store.upsertSubagent(sessionId, data.subagent);
    break;
  case 'session:compaction':
    store.updateSession(sessionId, { compactionCount });
    break;
  // session:created, session:renamed, session:removed — handled by their respective manager methods directly
}
```

Note: `session:approval` produces a new message (the pending tool_call) and must trigger `insertMessage()` just like `session:message`. The subsequent approval resolution updates the message's `approval` field via `updateMessage()`.

## Startup Restore

On server startup, `SessionStore.getActiveSessions()` returns all sessions with status NOT in (`done`, `error`).

| Status at crash | Restore behavior |
|---|---|
| `needs_input` | Restore as-is. Appears in UI, waits for user input. SDK resumes on next `sendInput()` via stored `sdkSessionId`. |
| `waiting_approval` | Restore as `needs_input`. Update the stale approval message to `approval: 'denied'` in DB. Add a system message: "Session restored after server restart. Pending approval was lost." |
| `spawning` / `working` | Mark as `error` in DB. Add system message: "Session interrupted by server restart." User can retry via existing retry button. |

No auto-resume of `working` sessions. Blindly calling `query({ resume })` could produce duplicate actions.

**SDK resume assumption:** Restored `needs_input` sessions rely on `sdkSessionId` being valid on the SDK side after restart. If the SDK session has expired or been garbage collected, the next `query({ resume })` call will fail and the existing error handler (session-runner.ts catch block) will set the session to `error` status. This is acceptable — the user retries.

**MAX_SESSIONS:** The restore path bypasses the `MAX_SESSIONS` check since these sessions already existed. They insert directly into `this.sessions` Map.

### Message Ordering

Restored messages are ordered by `timestamp, rowid` (SQLite's implicit rowid serves as tiebreaker for same-millisecond messages).

### Cleanup

Sessions in `done` or `error` status older than 7 days are purged from DB on startup. This prevents unbounded growth.

## Integration

### Changed files

**`server/db.ts`** (new) — `SessionStore` class:
- Constructor: ensure `data/` dir, open/create DB, set pragmas (WAL, foreign_keys), run schema DDL, prepare statements
- `insertSession(session: SessionRuntime)` — INSERT session row
- `updateSession(id, fields)` — UPDATE partial session fields (status, name, cost, etc.)
- `insertMessage(sessionId, message: Message)` — INSERT message row
- `updateMessage(id, fields)` — UPDATE message (approval status changes)
- `upsertSubagent(sessionId, subagent: SubagentInfo)` — INSERT OR REPLACE subagent
- `getActiveSessions()` — SELECT sessions + messages + subagents for non-terminal statuses
- `deleteSession(id)` — DELETE session (cascades to messages, subagents)
- `markActiveAsError()` — UPDATE all non-terminal sessions to `error` (for shutdown)
- `purgeOldSessions(maxAgeDays)` — DELETE done/error sessions older than threshold
- `close()` — Close DB connection

**`server/session-manager.ts`** — Constructor accepts `SessionStore`:
- `constructor(store)` — calls `restoreSessions()` to reload from DB
- `restoreSessions()` — loads active sessions, applies status transitions per restore table above, inserts into Map
- `spawn()` — calls `store.insertSession()` after creating runtime
- `kill()` — calls `store.updateSession()` on status change; `store.deleteSession()` in the setTimeout
- `rename()` — calls `store.updateSession()`
- `broadcast()` — wrapped with event-based persistence mapping (see Broadcast Wrapper section above)

**`server/index.ts`**:
- Import and instantiate `SessionStore` before `SessionManager`
- Pass `store` to `SessionManager` constructor
- Add `SIGTERM`/`SIGINT` handler (see Graceful Shutdown below)

### Graceful Shutdown

```typescript
async function shutdown() {
  // Kill all active sessions (aborts generators, resolves pending approvals)
  const active = manager.list().filter(s => !['done', 'error'].includes(s.status));
  await Promise.allSettled(active.map(s => manager.kill(s.id)));

  // Safety net: mark any remaining non-terminal sessions as error
  store.markActiveAsError();
  store.close();
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
```

Note: `kill()` schedules `deleteSession()` in a 1-second setTimeout which won't fire before `process.exit()`. This means gracefully killed sessions will persist as `done` in the DB until the 7-day purge. This is acceptable — they won't be restored (only non-terminal statuses are restored).

### Unchanged files

- **`server/session-runner.ts`** — No changes. Persistence happens through SessionManager's broadcast wrapper. Runner is unaware of DB.
- **`server/types.ts`** — No changes. `SessionRuntime` keeps its shape. Store maps between DB rows and runtime objects internally.
- **Frontend (all files)** — No changes. WebSocket protocol is unchanged. Frontend doesn't know sessions are persisted.

### New dependency

- `better-sqlite3` + `@types/better-sqlite3` (dev)

## Scope Boundaries

**In scope:**
- SQLite persistence of sessions, messages, subagents
- Checkpoint on every state change
- Restore recoverable sessions on startup
- Graceful shutdown handler
- Stale session cleanup

**Out of scope:**
- Historical session browser UI (DB supports it, but no frontend work in this spec)
- Session export/import
- Cross-machine session sharing
- Automatic resume of `working` sessions
