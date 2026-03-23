import { readdir, stat } from 'fs/promises';
import { join, dirname, resolve } from 'path';
import { homedir } from 'os';
import { existsSync } from 'fs';

export interface DirectoryListing {
  current: string;
  parent: string | null;
  directories: string[];
  drives?: string[];
}

function normalize(p: string): string {
  return p.replace(/\\/g, '/');
}

function isDriveRoot(p: string): boolean {
  // Match both forward and backslash variants: C:, C:/, C:\
  return /^[A-Za-z]:[/\\]?$/.test(p);
}

function isFilesystemRoot(p: string): boolean {
  if (process.platform === 'win32') return isDriveRoot(p);
  return p === '/';
}

async function listDrives(): Promise<string[]> {
  if (process.platform !== 'win32') return [];
  const drives: string[] = [];
  for (let i = 65; i <= 90; i++) {
    const letter = String.fromCharCode(i);
    const drivePath = `${letter}:\\`;
    if (existsSync(drivePath)) {
      drives.push(`${letter}:`);
    }
  }
  return drives;
}

export async function listDirectories(dirPath: string): Promise<DirectoryListing> {
  // Resolve ~ to home directory (path.resolve doesn't handle this)
  const expanded = dirPath === '~' || dirPath.startsWith('~/') || dirPath.startsWith('~\\')
    ? join(homedir(), dirPath.slice(1))
    : dirPath;
  const resolved = resolve(expanded || homedir());

  const st = await stat(resolved);
  if (!st.isDirectory()) {
    throw new Error(`Not a directory: ${dirPath}`);
  }

  const entries = await readdir(resolved, { withFileTypes: true });
  const directories = entries
    .filter(e => e.isDirectory())
    .map(e => e.name)
    .sort((a, b) => a.localeCompare(b));

  const current = normalize(resolved);
  const parentRaw = dirname(resolved);
  const parent = isFilesystemRoot(resolved) ? null : normalize(parentRaw);

  const result: DirectoryListing = { current, parent, directories };

  if (process.platform === 'win32') {
    result.drives = await listDrives();
  }

  return result;
}
