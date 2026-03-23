import { describe, it, expect } from 'vitest';
import { DirectoryQuerySchema, safePath } from '../../server/validation.js';
import { listDirectories } from '../../server/directories.js';
import { homedir } from 'os';

describe('safePath', () => {
  it('accepts valid absolute path', () => {
    const result = safePath.safeParse('C:/Users/test');
    expect(result.success).toBe(true);
  });

  it('rejects path with .. traversal', () => {
    const result = safePath.safeParse('C:/Users/../Windows');
    expect(result.success).toBe(false);
  });

  it('rejects empty string', () => {
    const result = safePath.safeParse('');
    expect(result.success).toBe(false);
  });
});

describe('DirectoryQuerySchema', () => {
  it('accepts valid path', () => {
    const result = DirectoryQuerySchema.safeParse({ path: 'C:/Users' });
    expect(result.success).toBe(true);
  });

  it('accepts empty path (defaults to home)', () => {
    const result = DirectoryQuerySchema.safeParse({ path: '' });
    expect(result.success).toBe(true);
  });

  it('accepts missing path (defaults to empty)', () => {
    const result = DirectoryQuerySchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('rejects path traversal', () => {
    const result = DirectoryQuerySchema.safeParse({ path: '/home/../etc' });
    expect(result.success).toBe(false);
  });
});

describe('listDirectories', () => {
  it('lists directories in home directory', async () => {
    const result = await listDirectories(homedir());
    expect(result.current).toBe(homedir().replace(/\\/g, '/'));
    expect(Array.isArray(result.directories)).toBe(true);
    expect(result.directories.length).toBeGreaterThan(0);
  });

  it('returns sorted directory names', async () => {
    const result = await listDirectories(homedir());
    const sorted = [...result.directories].sort((a, b) => a.localeCompare(b));
    expect(result.directories).toEqual(sorted);
  });

  it('sets parent to null for drive root', async () => {
    const root = process.platform === 'win32' ? 'C:/' : '/';
    const result = await listDirectories(root);
    expect(result.parent).toBeNull();
  });

  it('returns parent directory', async () => {
    const result = await listDirectories(homedir());
    expect(result.parent).toBeTruthy();
    expect(typeof result.parent).toBe('string');
  });

  it('normalizes paths to forward slashes', async () => {
    const result = await listDirectories(homedir());
    expect(result.current).not.toContain('\\');
    if (result.parent) {
      expect(result.parent).not.toContain('\\');
    }
  });

  it('throws for nonexistent path', async () => {
    await expect(listDirectories('/nonexistent/path/xyz123')).rejects.toThrow();
  });

  it('includes drives array on Windows', async () => {
    const result = await listDirectories(homedir());
    if (process.platform === 'win32') {
      expect(Array.isArray(result.drives)).toBe(true);
      expect(result.drives!.length).toBeGreaterThan(0);
      expect(result.drives).toContain('C:');
    }
  });

  it('resolves ~ to home directory', async () => {
    const result = await listDirectories('~');
    expect(result.current).toBe(homedir().replace(/\\/g, '/'));
  });

  it('defaults empty string to home directory', async () => {
    const result = await listDirectories('');
    expect(result.current).toBe(homedir().replace(/\\/g, '/'));
  });
});
