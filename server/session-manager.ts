import { v4 as uuid } from 'uuid';
import type { WebSocket } from 'ws';
import type { SessionRuntime, SessionView, PermissionMode } from './types.js';
import { toSessionView } from './types.js';
import { generateName, generateInitials } from './auto-namer.js';
import { runSession } from './session-runner.js';
import { writeSessionLog } from './vault-logger.js';

const MAX_SESSIONS = 10;

export class SessionManager {
  private sessions = new Map<string, SessionRuntime>();
  private clients = new Set<WebSocket>();

  addClient(ws: WebSocket): void {
    this.clients.add(ws);
    ws.on('close', () => this.clients.delete(ws));
  }

  broadcast(sessionId: string, event: string, data: any): void {
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

  spawn(cwd: string, prompt: string, permissionMode: PermissionMode, customName?: string): SessionView {
    if (this.sessions.size >= MAX_SESSIONS) {
      throw new Error(`Maximum ${MAX_SESSIONS} concurrent sessions reached`);
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
    const view = toSessionView(session);
    this.broadcast(id, 'session:created', { session: view });

    // Start the session runner (non-blocking)
    runSession(session, prompt, this.broadcast.bind(this)).catch((err) => {
      console.error(`Session ${id} runner failed:`, err);
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
      console.error(`Failed to write vault log for session ${id}:`, err);
    }

    this.broadcast(id, 'session:status', {
      id,
      status: 'done',
      lastActivityAt: session.lastActivityAt,
      cost: session.cost,
    });

    // Remove from active map after a short delay (let clients process the status change)
    setTimeout(() => {
      this.sessions.delete(id);
      this.broadcast(id, 'session:removed', { id });
    }, 1000);
  }

  rename(id: string, name: string): void {
    const session = this.sessions.get(id);
    if (!session) return;
    session.name = name;
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
      console.error(`Session ${id} resume failed:`, err);
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
            const match = m.toolArgs?.match(/"file_path"\s*:\s*"([^"]+)"/);
            return match?.[1];
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
      console.error(`Session ${id} retry failed:`, err);
    });
  }
}
