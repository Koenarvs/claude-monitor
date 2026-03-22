import { readFile, writeFile, stat } from 'fs/promises';
import { join } from 'path';

export interface ClaudeMdInfo {
  path: string;
  content: string;
  exists: boolean;
  lastModified?: number;
}

export async function readClaudeMd(cwd: string): Promise<ClaudeMdInfo> {
  const path = join(cwd, 'CLAUDE.md');

  try {
    const fileStat = await stat(path);
    const content = await readFile(path, 'utf-8');
    return {
      path,
      content,
      exists: true,
      lastModified: fileStat.mtimeMs,
    };
  } catch {
    return { path, content: '', exists: false };
  }
}

export async function writeClaudeMd(cwd: string, content: string): Promise<void> {
  const path = join(cwd, 'CLAUDE.md');
  await writeFile(path, content, 'utf-8');
}
