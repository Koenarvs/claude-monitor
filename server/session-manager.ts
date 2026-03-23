import { v4 as uuid } from 'uuid';
import type { WebSocket } from 'ws';
import type { SessionRuntime, SessionView, PermissionMode } from './types.js';
import { toSessionView } from './types.js';
import { generateName, generateInitials } from './auto-namer.js';
import { runSession } from './session-runner.js';
import { writeSessionLog } from './vault-logger.js';
import { SessionStore } from './db.js';
import { logger } from './logger.js';
import { loadConfig } from './config.js';

export class SessionManager {
  private sessions = new Map<string, SessionRuntime>();
  private clients = new Set<WebSocket>();
  private store: SessionStore;

  constructor(store: SessionStore) {
    this.store = store;
    this.restoreSessions();
  }

  private restoreSessions(): void {
    const purged = this.store.purgeOldSessions(7);
    if (purged > 0) {
      logger.info({ count: purged }, 'Purged old sessions from DB');
    }

    const sessions = this.store.getActiveSessions();

    for (const session of sessions) {
      if (session.status === 'waiting_approval') {
        session.status = 'needs_input';
        for (const msg of session.messages) {
          if (msg.approval === 'pending') {
            msg.approval = 'denied';
            this.store.updateMessage(msg.id, { approval: 'denied' });
          }
        }
        const sysMsg = {
          id: uuid(),
          type: 'system' as const,
          content: 'Session restored after server restart. Pending approval was lost.',
          timestamp: Date.now(),
        };
        session.messages.push(sysMsg);
        this.store.insertMessage(session.id, sysMsg);
        this.store.updateSession(session.id, { status: 'needs_input' });
      } else if (session.status === 'spawning' || session.status === 'working') {
        session.status = 'error';
        const sysMsg = {
          id: uuid(),
          type: 'system' as const,
          content: 'Session interrupted by server restart.',
          timestamp: Date.now(),
        };
        session.messages.push(sysMsg);
        this.store.insertMessage(session.id, sysMsg);
        this.store.updateSession(session.id, { status: 'error' });
      }

      this.sessions.set(session.id, session);
    }

    if (sessions.length > 0) {
      logger.info({ count: sessions.length }, 'Restored sessions from DB');
    }
  }

  addClient(ws: WebSocket): void {
    this.clients.add(ws);
    ws.on('close', () => this.clients.delete(ws));
  }

  broadcast(sessionId: string, event: string, data: any): void {
    // Persist based on event type
    try {
      switch (event) {
        case 'session:message':
        case 'session:approval':
          if (data.message) {
            this.store.insertMessage(sessionId, data.message);
          }
          break;
        case 'session:status': {
          const session = this.sessions.get(sessionId);
          if (session) {
            this.store.updateSession(sessionId, {
              sdkSessionId: session.sdkSessionId,
              status: session.status,
              lastActivityAt: session.lastActivityAt,
              cost: session.cost,
              turns: session.turns,
            });
          }
          break;
        }
        case 'session:subagent':
          if (data.subagent) {
            this.store.upsertSubagent(sessionId, data.subagent);
          }
          break;
        case 'session:compaction':
          this.store.updateSession(sessionId, { compactionCount: data.compactionCount });
          break;
        // session:created, session:renamed, session:removed — no persistence here
      }
    } catch (err) {
      logger.error({ err, sessionId, event }, 'DB persist failed');
    }

    // Broadcast to WebSocket clients
    const payload = JSON.stringify({ event, data });
    for (const ws of this.clients) {
      if (ws.readyState === ws.OPEN) {
        ws.send(payload);
      }
    }
  }

  list(): SessionView[] {
    return [...this.sessions.values()].map(toSessionView);
  }

  get(id: string): SessionView | undefined {
    const s = this.sessions.get(id);
    return s ? toSessionView(s) : undefined;
  }

  async spawn(cwd: string, prompt: string, permissionMode: PermissionMode, customName?: string): Promise<SessionView> {
    const config = await loadConfig();
    if (this.sessions.size >= config.maxSessions) {
      throw new Error(`Maximum ${config.maxSessions} concurrent sessions reached`);
    }

    const id = uuid();
    const name = customName || generateName(cwd, prompt);
    const now = Date.now();

    const session: SessionRuntime = {
      id,
      sdkSessionId: null,
      name,
      cwd,
      status: 'spawning',
      permissionMode,
      createdAt: now,
      lastActivityAt: now,
      messages: [],
      cost: 0,
      turns: 0,
      activeGenerator: null,
      pendingApproval: null,
      subagents: [],
      compactionCount: 0,
    };

    this.sessions.set(id, session);
    this.store.insertSession(session);
    const view = toSessionView(session);
    this.broadcast(id, 'session:created', { session: view });

    // Start the session runner (non-blocking)
    runSession(session, prompt, this.broadcast.bind(this)).catch((err) => {
      logger.error({ err, sessionId: id }, 'Session runner failed');
    });

    return view;
  }

  async kill(id: string): Promise<void> {
    const session = this.sessions.get(id);
    if (!session) return;

    // Resolve pending approval to unblock hook
    if (session.pendingApproval) {
      session.pendingApproval.resolve(false);
      session.pendingApproval = null;
    }

    // Abort generator
    if (session.activeGenerator) {
      try { await session.activeGenerator.return(undefined); } catch {}
      session.activeGenerator = null;
    }

    session.status = 'done';
    session.lastActivityAt = Date.now();

    // Write vault log
    try {
      await writeSessionLog(session);
    } catch (err) {
      logger.error({ err, sessionId: id }, 'Failed to write vault log');
    }

    this.broadcast(id, 'session:status', {
      id,
      status: 'done',
      lastActivityAt: session.lastActivityAt,
      cost: session.cost,
    });

    // Remove from active map after a short delay (let clients process the status change)
    setTimeout(() => {
      try {
        this.sessions.delete(id);
        this.store.deleteSession(id);
        this.broadcast(id, 'session:removed', { id });
      } catch (err) {
        logger.error({ err, sessionId: id }, 'Failed to clean up session');
      }
    }, 1000);
  }

  rename(id: string, name: string): void {
    const session = this.sessions.get(id);
    if (!session) return;
    session.name = name;
    this.store.updateSession(id, { name });
    this.broadcast(id, 'session:renamed', { id, name });
  }

  async sendInput(id: string, text: string): Promise<void> {
    const session = this.sessions.get(id);
    if (!session || session.status !== 'needs_input') return;

    // Add user message
    const msg = {
      id: uuid(),
      type: 'user' as const,
      content: text,
      timestamp: Date.now(),
    };
    session.messages.push(msg);
    this.broadcast(id, 'session:message', { id, message: msg });

    session.status = 'working';
    this.broadcast(id, 'session:status', {
      id,
      status: 'working',
      lastActivityAt: Date.now(),
    });

    // Resume via new query() call
    runSession(session, text, this.broadcast.bind(this)).catch((err) => {
      logger.error({ err, sessionId: id }, 'Session resume failed');
    });
  }

  approve(id: string, requestId: string): void {
    const session = this.sessions.get(id);
    if (!session?.pendingApproval || session.pendingApproval.requestId !== requestId) return;
    session.pendingApproval.resolve(true);
    session.pendingApproval = null;
    session.status = 'working';
    this.broadcast(id, 'session:status', {
      id,
      status: 'working',
      lastActivityAt: Date.now(),
    });
  }

  deny(id: string, requestId: string): void {
    const session = this.sessions.get(id);
    if (!session?.pendingApproval || session.pendingApproval.requestId !== requestId) return;
    session.pendingApproval.resolve(false);
    session.pendingApproval = null;
    session.status = 'working';
    this.broadcast(id, 'session:status', {
      id,
      status: 'working',
      lastActivityAt: Date.now(),
    });
  }

  getRecentActivity(): string {
    const active = [...this.sessions.values()]
      .filter(s => s.status !== 'done')
      .map(s => {
        const filesChanged = s.messages
          .filter(m => m.type === 'tool_call' && m.toolName && ['Edit', 'Write'].includes(m.toolName))
          .map(m => {
            if (!m.toolArgs) return undefined;
            try {
              const args = JSON.parse(m.toolArgs);
              return typeof args.file_path === 'string' ? args.file_path : undefined;
            } catch { return undefined; }
          })
          .filter(Boolean);

        const recentFiles = [...new Set(filesChanged)].slice(-5);
        const fileStr = recentFiles.length > 0 ? ` (recently touched: ${recentFiles.join(', ')})` : '';

        return `- [${s.status}] "${s.name}" in ${s.cwd}${fileStr}`;
      });

    if (active.length === 0) return '';
    return `Other active sessions:\n${active.join('\n')}`;
  }

  async closeSession(id: string): Promise<void> {
    await this.kill(id);
  }

  async retrySession(id: string): Promise<void> {
    const session = this.sessions.get(id);
    if (!session || session.status !== 'error') return;

    session.status = 'working';
    this.broadcast(id, 'session:status', {
      id,
      status: 'working',
      lastActivityAt: Date.now(),
    });

    runSession(session, 'Continue from where you left off.', this.broadcast.bind(this)).catch((err) => {
      logger.error({ err, sessionId: id }, 'Session retry failed');
    });
  }
}
