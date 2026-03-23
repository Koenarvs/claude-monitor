import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the session-runner to avoid real SDK calls
vi.mock('../../server/session-runner.js', () => ({
  runSession: vi.fn().mockResolvedValue(undefined),
}));

// Mock vault-logger
vi.mock('../../server/vault-logger.js', () => ({
  writeSessionLog: vi.fn().mockResolvedValue('/fake/path.md'),
}));

// Mock config to avoid reading real config.json from disk
vi.mock('../../server/config.js', () => ({
  loadConfig: vi.fn().mockResolvedValue({
    maxSessions: 10,
    vaultPath: '/fake/vault',
    defaultCwd: '/fake',
    defaultPermissionMode: 'autonomous',
    workingDirectories: [],
  }),
  clearConfigCache: vi.fn(),
}));

// Mock SessionStore (SQLite persistence)
vi.mock('../../server/db.js', () => ({
  SessionStore: vi.fn().mockImplementation(() => ({
    purgeOldSessions: vi.fn().mockReturnValue(0),
    getActiveSessions: vi.fn().mockReturnValue([]),
    insertSession: vi.fn(),
    updateSession: vi.fn(),
    deleteSession: vi.fn(),
    insertMessage: vi.fn(),
    updateMessage: vi.fn(),
    upsertSubagent: vi.fn(),
    markActiveAsError: vi.fn(),
    close: vi.fn(),
  })),
}));

import { SessionManager } from '../../server/session-manager.js';
import { SessionStore } from '../../server/db.js';

describe('SessionManager', () => {
  let manager: SessionManager;

  beforeEach(() => {
    const store = new SessionStore('fake.db');
    manager = new SessionManager(store);
  });

  it('starts with no sessions', () => {
    expect(manager.list()).toEqual([]);
  });

  it('spawns a session and returns a view', async () => {
    const view = await manager.spawn('/test', 'hello', 'autonomous');
    expect(view).toBeDefined();
    expect(view.cwd).toBe('/test');
    expect(view.status).toBe('spawning');
    expect(view.permissionMode).toBe('autonomous');
  });

  it('lists spawned sessions', async () => {
    await manager.spawn('/test', 'hello', 'autonomous');
    const list = manager.list();
    expect(list.length).toBe(1);
  });

  it('gets a session by id', async () => {
    const view = await manager.spawn('/test', 'hello', 'autonomous');
    const got = manager.get(view.id);
    expect(got?.id).toBe(view.id);
  });

  it('returns undefined for unknown id', () => {
    expect(manager.get('nonexistent')).toBeUndefined();
  });

  it('renames a session', async () => {
    const view = await manager.spawn('/test', 'hello', 'autonomous');
    manager.rename(view.id, 'New Name');
    const got = manager.get(view.id);
    expect(got?.name).toBe('New Name');
  });

  it('rename is no-op for unknown id', () => {
    manager.rename('nonexistent', 'whatever');
  });

  it('uses custom name when provided', async () => {
    const view = await manager.spawn('/test', 'hello', 'autonomous', 'My Custom Name');
    expect(view.name).toBe('My Custom Name');
  });

  it('auto-generates name when not provided', async () => {
    const view = await manager.spawn('/test/my-project', 'Fix the bug', 'autonomous');
    expect(view.name).toContain('my-project');
  });

  it('kills a session', async () => {
    const view = await manager.spawn('/test', 'hello', 'autonomous');
    await manager.kill(view.id);
  });

  it('kill is no-op for unknown id', async () => {
    await manager.kill('nonexistent');
  });
});
