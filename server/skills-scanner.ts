import { readdir, readFile, stat } from 'fs/promises';
import { join, basename } from 'path';
import { homedir } from 'os';

export interface SkillInfo {
  name: string;
  description: string;
  path: string;
  type: 'skill' | 'agent';
}

const SKILLS_DIR = join(homedir(), '.claude', 'skills');
const AGENTS_DIR = join(homedir(), '.claude', 'agents');

async function scanDirectory(dir: string, type: 'skill' | 'agent'): Promise<SkillInfo[]> {
  const results: SkillInfo[] = [];

  try {
    const entries = await readdir(dir);

    for (const entry of entries) {
      const entryPath = join(dir, entry);
      const entryStat = await stat(entryPath).catch(() => null);

      if (entryStat?.isDirectory()) {
        // Look for a skill definition file (skill.md, index.md, or any .md)
        const mdFiles = ['skill.md', 'index.md'];
        let description = '';

        for (const mdFile of mdFiles) {
          try {
            const content = await readFile(join(entryPath, mdFile), 'utf-8');
            // Extract description from frontmatter or first paragraph
            const descMatch = content.match(/^description:\s*(.+)$/m);
            if (descMatch) {
              description = descMatch[1].trim();
            } else {
              // Use first non-empty, non-heading line
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
        });
      }
    }
  } catch {
    // Directory doesn't exist — that's fine
  }

  return results;
}

export async function scanSkillsAndAgents(): Promise<SkillInfo[]> {
  const [skills, agents] = await Promise.all([
    scanDirectory(SKILLS_DIR, 'skill'),
    scanDirectory(AGENTS_DIR, 'agent'),
  ]);
  return [...skills, ...agents].sort((a, b) => a.name.localeCompare(b.name));
}
