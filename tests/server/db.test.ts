import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SessionStore } from '../../server/db.js';
import { join } from 'path';
import { tmpdir } from 'os';
import { mkdtempSync, rmSync } from 'fs';
import type { SessionRuntime, Message, SubagentInfo } from '../../server/types.js';

function makeSession(overrides: Partial<SessionRuntime> = {}): SessionRuntime {
  return {
    id: 'test-session-1',
    sdkSessionId: null,
    name: 'Test Session',
    cwd: '/test',
    status: 'working',
    permissionMode: 'autonomous',
    createdAt: Date.now(),
    lastActivityAt: Date.now(),
    messages: [],
    cost: 0,
    turns: 0,
    activeGenerator: null,
    pendingApproval: null,
    subagents: [],
    compactionCount: 0,
    ...overrides,
  };
}

function makeMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: 'msg-1',
    type: 'assistant',
    content: 'Hello',
    timestamp: Date.now(),
    ...overrides,
  };
}

describe('SessionStore', () => {
  let store: SessionStore;
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'claude-monitor-test-'));
    store = new SessionStore(join(tmpDir, 'test.db'));
  });

  afterEach(() => {
    store.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('insertSession + getActiveSessions', () => {
    it('inserts and retrieves a session', () => {
      const session = makeSession();
      store.insertSession(session);
      const active = store.getActiveSessions();
      expect(active.length).toBe(1);
      expect(active[0].id).toBe('test-session-1');
      expect(active[0].name).toBe('Test Session');
      expect(active[0].cwd).toBe('/test');
    });

    it('does not return done sessions', () => {
      store.insertSession(makeSession({ status: 'done' }));
      const active = store.getActiveSessions();
      expect(active.length).toBe(0);
    });

    it('does not return error sessions', () => {
      store.insertSession(makeSession({ status: 'error' }));
      const active = store.getActiveSessions();
      expect(active.length).toBe(0);
    });

    it('restores messages with session', () => {
      const session = makeSession();
      store.insertSession(session);
      store.insertMessage(session.id, makeMessage());
      const active = store.getActiveSessions();
      expect(active[0].messages.length).toBe(1);
      expect(active[0].messages[0].content).toBe('Hello');
    });

    it('restores subagents with session', () => {
      const session = makeSession();
      store.insertSession(session);
      const subagent: SubagentInfo = {
        toolUseId: 'tool-1',
        description: 'Test subagent',
        status: 'running',
        startedAt: Date.now(),
      };
      store.upsertSubagent(session.id, subagent);
      const active = store.getActiveSessions();
      expect(active[0].subagents.length).toBe(1);
      expect(active[0].subagents[0].description).toBe('Test subagent');
    });
  });

  describe('updateSession', () => {
    it('updates session fields', () => {
      store.insertSession(makeSession());
      store.updateSession('test-session-1', { name: 'Updated', cost: 1.5 });
      const active = store.getActiveSessions();
      expect(active[0].name).toBe('Updated');
      expect(active[0].cost).toBe(1.5);
    });

    it('updates status', () => {
      store.insertSession(makeSession({ status: 'spawning' }));
      store.updateSession('test-session-1', { status: 'working' });
      const active = store.getActiveSessions();
      expect(active[0].status).toBe('working');
    });
  });

  describe('insertMessage + updateMessage', () => {
    it('inserts a message', () => {
      store.insertSession(makeSession());
      store.insertMessage('test-session-1', makeMessage({ id: 'msg-1', content: 'Hi' }));
      const active = store.getActiveSessions();
      expect(active[0].messages[0].content).toBe('Hi');
    });

    it('updates message approval', () => {
      store.insertSession(makeSession());
      store.insertMessage('test-session-1', makeMessage({ id: 'msg-1', approval: 'pending' }));
      store.updateMessage('msg-1', { approval: 'approved' });
      const active = store.getActiveSessions();
      expect(active[0].messages[0].approval).toBe('approved');
    });

    it('preserves tool_name and tool_args', () => {
      store.insertSession(makeSession());
      store.insertMessage('test-session-1', makeMessage({
        id: 'msg-tool',
        type: 'tool_call',
        toolName: 'Bash',
        toolArgs: '{"command": "ls"}',
      }));
      const active = store.getActiveSessions();
      expect(active[0].messages[0].toolName).toBe('Bash');
      expect(active[0].messages[0].toolArgs).toBe('{"command": "ls"}');
    });
  });

  describe('upsertSubagent', () => {
    it('inserts a subagent', () => {
      store.insertSession(makeSession());
      store.upsertSubagent('test-session-1', {
        toolUseId: 'tool-1',
        description: 'Agent task',
        status: 'running',
        startedAt: Date.now(),
      });
      const active = store.getActiveSessions();
      expect(active[0].subagents[0].status).toBe('running');
    });

    it('updates existing subagent on upsert', () => {
      store.insertSession(makeSession());
      const now = Date.now();
      store.upsertSubagent('test-session-1', {
        toolUseId: 'tool-1',
        description: 'Agent task',
        status: 'running',
        startedAt: now,
      });
      store.upsertSubagent('test-session-1', {
        toolUseId: 'tool-1',
        description: 'Agent task',
        status: 'done',
        startedAt: now,
        completedAt: now + 1000,
      });
      const active = store.getActiveSessions();
      expect(active[0].subagents.length).toBe(1);
      expect(active[0].subagents[0].status).toBe('done');
    });
  });

  describe('deleteSession', () => {
    it('removes session and cascades to messages', () => {
      store.insertSession(makeSession());
      store.insertMessage('test-session-1', makeMessage());
      store.deleteSession('test-session-1');
      const active = store.getActiveSessions();
      expect(active.length).toBe(0);
    });
  });

  describe('markActiveAsError', () => {
    it('marks all active sessions as error', () => {
      store.insertSession(makeSession({ id: 's1', status: 'working' }));
      store.insertSession(makeSession({ id: 's2', status: 'spawning' }));
      store.insertSession(makeSession({ id: 's3', status: 'done' }));
      store.markActiveAsError();
      // s1 and s2 now error (not returned by getActiveSessions)
      // s3 was already done
      const all = (store as any)['db'].prepare('SELECT id, status FROM sessions').all() as any[];
      expect(all.find((r: any) => r.id === 's1').status).toBe('error');
      expect(all.find((r: any) => r.id === 's2').status).toBe('error');
      expect(all.find((r: any) => r.id === 's3').status).toBe('done');
    });
  });

  describe('purgeOldSessions', () => {
    it('purges old done/error sessions', () => {
      const old = Date.now() - 10 * 86400000; // 10 days ago
      store.insertSession(makeSession({ id: 's-old', status: 'done', lastActivityAt: old }));
      store.insertSession(makeSession({ id: 's-new', status: 'done', lastActivityAt: Date.now() }));
      const purged = store.purgeOldSessions(7);
      expect(purged).toBe(1);
      const all = (store as any)['db'].prepare('SELECT id FROM sessions').all() as any[];
      expect(all.length).toBe(1);
      expect(all[0].id).toBe('s-new');
    });

    it('does not purge active sessions', () => {
      const old = Date.now() - 10 * 86400000;
      store.insertSession(makeSession({ id: 's-active', status: 'working', lastActivityAt: old }));
      const purged = store.purgeOldSessions(7);
      expect(purged).toBe(0);
    });
  });
});
