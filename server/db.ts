import Database, { type Statement } from 'better-sqlite3';
import { mkdirSync } from 'fs';
import { dirname } from 'path';
import type { SessionRuntime, Message, SubagentInfo } from './types.js';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  sdk_session_id TEXT,
  name TEXT NOT NULL,
  cwd TEXT NOT NULL,
  status TEXT NOT NULL,
  permission_mode TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  last_activity_at INTEGER NOT NULL,
  cost REAL NOT NULL DEFAULT 0,
  turns INTEGER NOT NULL DEFAULT 0,
  compaction_count INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  content TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  tool_name TEXT,
  tool_args TEXT,
  approval TEXT
);

CREATE TABLE IF NOT EXISTS subagents (
  tool_use_id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  status TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  completed_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_messages_session_id ON messages(session_id);
CREATE INDEX IF NOT EXISTS idx_subagents_session_id ON subagents(session_id);
CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
`;

const CAMEL_TO_SNAKE: Record<string, string> = {
  sdkSessionId: 'sdk_session_id',
  name: 'name',
  status: 'status',
  lastActivityAt: 'last_activity_at',
  cost: 'cost',
  turns: 'turns',
  compactionCount: 'compaction_count',
};

export class SessionStore {
  private db: Database.Database;
  private stmtInsertSession: Statement;
  private stmtUpdateSession: Statement;
  private stmtInsertMessage: Statement;
  private stmtUpdateMessage: Statement;
  private stmtUpsertSubagent: Statement;
  private stmtDeleteSession: Statement;

  constructor(dbPath: string) {
    mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);

    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');

    this.db.exec(SCHEMA);

    this.stmtInsertSession = this.db.prepare(`
      INSERT INTO sessions (
        id, sdk_session_id, name, cwd, status, permission_mode,
        created_at, last_activity_at, cost, turns, compaction_count
      ) VALUES (
        @id, @sdkSessionId, @name, @cwd, @status, @permissionMode,
        @createdAt, @lastActivityAt, @cost, @turns, @compactionCount
      )
    `);

    this.stmtUpdateSession = this.db.prepare(`
      UPDATE sessions SET
        sdk_session_id = @sdkSessionId,
        name = @name,
        status = @status,
        last_activity_at = @lastActivityAt,
        cost = @cost,
        turns = @turns,
        compaction_count = @compactionCount
      WHERE id = @id
    `);

    this.stmtInsertMessage = this.db.prepare(`
      INSERT OR REPLACE INTO messages (
        id, session_id, type, content, timestamp, tool_name, tool_args, approval
      ) VALUES (
        @id, @sessionId, @type, @content, @timestamp, @toolName, @toolArgs, @approval
      )
    `);

    this.stmtUpdateMessage = this.db.prepare(`
      UPDATE messages SET approval = @approval WHERE id = @id
    `);

    this.stmtUpsertSubagent = this.db.prepare(`
      INSERT OR REPLACE INTO subagents (
        tool_use_id, session_id, description, status, started_at, completed_at
      ) VALUES (
        @toolUseId, @sessionId, @description, @status, @startedAt, @completedAt
      )
    `);

    this.stmtDeleteSession = this.db.prepare(`
      DELETE FROM sessions WHERE id = ?
    `);
  }

  insertSession(session: SessionRuntime): void {
    this.stmtInsertSession.run({
      id: session.id,
      sdkSessionId: session.sdkSessionId,
      name: session.name,
      cwd: session.cwd,
      status: session.status,
      permissionMode: session.permissionMode,
      createdAt: session.createdAt,
      lastActivityAt: session.lastActivityAt,
      cost: session.cost,
      turns: session.turns,
      compactionCount: session.compactionCount,
    });
  }

  updateSession(
    id: string,
    fields: Partial<{
      sdkSessionId: string | null;
      name: string;
      status: string;
      lastActivityAt: number;
      cost: number;
      turns: number;
      compactionCount: number;
    }>
  ): void {
    const entries = Object.entries(fields).filter(([, v]) => v !== undefined);
    if (entries.length === 0) return;

    const setClauses = entries
      .map(([key]) => {
        const col = CAMEL_TO_SNAKE[key];
        if (!col) throw new Error(`Unknown field: ${key}`);
        return `${col} = ?`;
      })
      .join(', ');

    const values: unknown[] = entries.map(([, v]) => v);
    values.push(id);

    const stmt = this.db.prepare(`UPDATE sessions SET ${setClauses} WHERE id = ?`);
    stmt.run(...values);
  }

  insertMessage(sessionId: string, message: Message): void {
    this.stmtInsertMessage.run({
      id: message.id,
      sessionId,
      type: message.type,
      content: message.content,
      timestamp: message.timestamp,
      toolName: message.toolName ?? null,
      toolArgs: message.toolArgs ?? null,
      approval: message.approval ?? null,
    });
  }

  updateMessage(id: string, fields: { approval: string }): void {
    this.stmtUpdateMessage.run({ id, approval: fields.approval });
  }

  upsertSubagent(sessionId: string, subagent: SubagentInfo): void {
    this.stmtUpsertSubagent.run({
      toolUseId: subagent.toolUseId,
      sessionId,
      description: subagent.description,
      status: subagent.status,
      startedAt: subagent.startedAt,
      completedAt: subagent.completedAt ?? null,
    });
  }

  getActiveSessions(): SessionRuntime[] {
    const sessionRows = this.db
      .prepare(`SELECT * FROM sessions WHERE status NOT IN ('done', 'error')`)
      .all() as Array<Record<string, unknown>>;

    const getMessages = this.db.prepare(
      `SELECT * FROM messages WHERE session_id = ? ORDER BY timestamp, rowid`
    );
    const getSubagents = this.db.prepare(
      `SELECT * FROM subagents WHERE session_id = ?`
    );

    return sessionRows.map((row) => {
      const msgRows = getMessages.all(row['id']) as Array<Record<string, unknown>>;
      const subRows = getSubagents.all(row['id']) as Array<Record<string, unknown>>;

      const messages: Message[] = msgRows.map((m) => ({
        id: m['id'] as string,
        type: m['type'] as Message['type'],
        content: m['content'] as string,
        timestamp: m['timestamp'] as number,
        toolName: m['tool_name'] != null ? (m['tool_name'] as string) : undefined,
        toolArgs: m['tool_args'] != null ? (m['tool_args'] as string) : undefined,
        approval: m['approval'] != null ? (m['approval'] as Message['approval']) : undefined,
      }));

      const subagents: SubagentInfo[] = subRows.map((s) => ({
        toolUseId: s['tool_use_id'] as string,
        description: s['description'] as string,
        status: s['status'] as SubagentInfo['status'],
        startedAt: s['started_at'] as number,
        completedAt: s['completed_at'] != null ? (s['completed_at'] as number) : undefined,
      }));

      return {
        id: row['id'] as string,
        sdkSessionId: row['sdk_session_id'] as string | null,
        name: row['name'] as string,
        cwd: row['cwd'] as string,
        status: row['status'] as SessionRuntime['status'],
        permissionMode: row['permission_mode'] as SessionRuntime['permissionMode'],
        createdAt: row['created_at'] as number,
        lastActivityAt: row['last_activity_at'] as number,
        cost: row['cost'] as number,
        turns: row['turns'] as number,
        compactionCount: row['compaction_count'] as number,
        messages,
        subagents,
        activeGenerator: null,
        pendingApproval: null,
      };
    });
  }

  deleteSession(id: string): void {
    this.stmtDeleteSession.run(id);
  }

  markActiveAsError(): void {
    this.db
      .prepare(`UPDATE sessions SET status = 'error' WHERE status NOT IN ('done', 'error')`)
      .run();
  }

  purgeOldSessions(maxAgeDays: number = 7): number {
    const cutoff = Date.now() - maxAgeDays * 86400000;
    const result = this.db
      .prepare(
        `DELETE FROM sessions WHERE status IN ('done', 'error') AND last_activity_at < ?`
      )
      .run(cutoff);
    return result.changes;
  }

  close(): void {
    this.db.close();
  }
}
