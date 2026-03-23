import { describe, it, expect } from 'vitest';
import {
  SpawnSessionSchema,
  RenameSessionSchema,
  UpdateClaudeMdSchema,
  AppConfigSchema,
} from '../../server/validation.js';

describe('SpawnSessionSchema', () => {
  it('accepts valid spawn request', () => {
    const result = SpawnSessionSchema.safeParse({
      cwd: 'C:/Users/Koena/claude-monitor',
      prompt: 'Fix the bug',
      permissionMode: 'autonomous',
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing cwd', () => {
    const result = SpawnSessionSchema.safeParse({ prompt: 'Fix the bug' });
    expect(result.success).toBe(false);
  });

  it('rejects missing prompt', () => {
    const result = SpawnSessionSchema.safeParse({ cwd: '/home/user' });
    expect(result.success).toBe(false);
  });

  it('rejects empty prompt', () => {
    const result = SpawnSessionSchema.safeParse({ cwd: '/home/user', prompt: '' });
    expect(result.success).toBe(false);
  });

  it('rejects empty cwd', () => {
    const result = SpawnSessionSchema.safeParse({ cwd: '', prompt: 'hello' });
    expect(result.success).toBe(false);
  });

  it('rejects invalid permission mode', () => {
    const result = SpawnSessionSchema.safeParse({
      cwd: '/home',
      prompt: 'hi',
      permissionMode: 'yolo',
    });
    expect(result.success).toBe(false);
  });

  it('defaults permissionMode to autonomous', () => {
    const result = SpawnSessionSchema.parse({
      cwd: '/home',
      prompt: 'hi',
    });
    expect(result.permissionMode).toBe('autonomous');
  });

  it('rejects cwd with path traversal (..)', () => {
    const result = SpawnSessionSchema.safeParse({
      cwd: 'C:/Users/Koena/../../Windows/System32',
      prompt: 'hi',
    });
    expect(result.success).toBe(false);
  });
});

describe('RenameSessionSchema', () => {
  it('accepts valid name', () => {
    const result = RenameSessionSchema.safeParse({ name: 'My Session' });
    expect(result.success).toBe(true);
  });

  it('rejects empty name', () => {
    const result = RenameSessionSchema.safeParse({ name: '' });
    expect(result.success).toBe(false);
  });

  it('rejects name over 100 chars', () => {
    const result = RenameSessionSchema.safeParse({ name: 'x'.repeat(101) });
    expect(result.success).toBe(false);
  });
});

describe('UpdateClaudeMdSchema', () => {
  it('accepts valid request', () => {
    const result = UpdateClaudeMdSchema.safeParse({
      cwd: '/home/user/project',
      content: '# My Project',
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing cwd', () => {
    const result = UpdateClaudeMdSchema.safeParse({ content: '# hi' });
    expect(result.success).toBe(false);
  });
});

describe('AppConfigSchema', () => {
  it('accepts valid config', () => {
    const result = AppConfigSchema.safeParse({
      defaultCwd: 'C:/Users/Koena',
      defaultPermissionMode: 'autonomous',
      workingDirectories: [{ label: 'Test', path: '/test' }],
      vaultPath: 'D:/vault/sessions',
      maxSessions: 10,
    });
    expect(result.success).toBe(true);
  });

  it('rejects maxSessions below 1', () => {
    const result = AppConfigSchema.safeParse({
      defaultCwd: '/home',
      defaultPermissionMode: 'autonomous',
      workingDirectories: [],
      vaultPath: '/vault',
      maxSessions: 0,
    });
    expect(result.success).toBe(false);
  });

  it('rejects maxSessions above 20', () => {
    const result = AppConfigSchema.safeParse({
      defaultCwd: '/home',
      defaultPermissionMode: 'autonomous',
      workingDirectories: [],
      vaultPath: '/vault',
      maxSessions: 25,
    });
    expect(result.success).toBe(false);
  });
});
