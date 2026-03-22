import { readdir, readFile, stat } from 'fs/promises';
import { join, basename } from 'path';
import { homedir } from 'os';

export interface SkillInfo {
  name: string;
  description: string;
  path: string;
  type: 'skill' | 'agent';
  scope: 'global' | 'project';
}

const GLOBAL_SKILLS_DIR = join(homedir(), '.claude', 'skills');
const GLOBAL_AGENTS_DIR = join(homedir(), '.claude', 'agents');

async function scanDirectory(dir: string, type: 'skill' | 'agent', scope: 'global' | 'project'): Promise<SkillInfo[]> {
  const results: SkillInfo[] = [];

  try {
    const entries = await readdir(dir);

    for (const entry of entries) {
      const entryPath = join(dir, entry);
      const entryStat = await stat(entryPath).catch(() => null);

      if (entryStat?.isDirectory()) {
        const mdFiles = ['skill.md', 'index.md'];
        let description = '';

        for (const mdFile of mdFiles) {
          try {
            const content = await readFile(join(entryPath, mdFile), 'utf-8');
            const descMatch = content.match(/^description:\s*(.+)$/m);
            if (descMatch) {
              description = descMatch[1].trim();
            } else {
              const lines = content.split('\n').filter(l => l.trim() && !l.startsWith('#') && !l.startsWith('---'));
              description = lines[0]?.trim().slice(0, 200) || '';
            }
            break;
          } catch { /* file doesn't exist, try next */ }
        }

        results.push({
          name: basename(entryPath),
          description,
          path: entryPath,
          type,
          scope,
        });
      }
    }
  } catch {
    // Directory doesn't exist
  }

  return results;
}

export async function scanSkillsAndAgents(projectDirs?: string[]): Promise<SkillInfo[]> {
  const scans: Promise<SkillInfo[]>[] = [
    scanDirectory(GLOBAL_SKILLS_DIR, 'skill', 'global'),
    scanDirectory(GLOBAL_AGENTS_DIR, 'agent', 'global'),
  ];

  // Scan project-level skills/agents from active session cwds and config directories
  const scannedPaths = new Set<string>();
  for (const dir of projectDirs ?? []) {
    const projectSkills = join(dir, '.claude', 'skills');
    const projectAgents = join(dir, '.claude', 'agents');
    if (!scannedPaths.has(projectSkills)) {
      scannedPaths.add(projectSkills);
      scans.push(scanDirectory(projectSkills, 'skill', 'project'));
    }
    if (!scannedPaths.has(projectAgents)) {
      scannedPaths.add(projectAgents);
      scans.push(scanDirectory(projectAgents, 'agent', 'project'));
    }
  }

  const results = (await Promise.all(scans)).flat();

  // Deduplicate by name — project-level takes precedence over global
  const byName = new Map<string, SkillInfo>();
  for (const item of results) {
    const existing = byName.get(item.name);
    if (!existing || (item.scope === 'project' && existing.scope === 'global')) {
      byName.set(item.name, item);
    }
  }

  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}
