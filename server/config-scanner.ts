import { readFile, readdir, stat } from 'fs/promises';
import { join, basename } from 'path';
import { homedir } from 'os';
import { glob } from 'fs/promises';
import { logger } from './logger.js';

const CLAUDE_DIR = join(homedir(), '.claude');

export interface McpServerInfo {
  name: string;
  command?: string;
  url?: string;
  type: 'stdio' | 'sse' | 'unknown';
}

export interface PluginInfo {
  name: string;
  enabled: boolean;
  source: string;  // e.g. "claude-plugins-official"
}

export interface HookInfo {
  name: string;
  event: string;
  source: 'settings' | 'hookify';
  enabled: boolean;
  action?: string;
  pattern?: string;
}

export interface ConfigOverview {
  mcpServers: McpServerInfo[];
  plugins: PluginInfo[];
  hooks: HookInfo[];
}

async function readJsonFile(path: string): Promise<any> {
  try {
    const raw = await readFile(path, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    logger.warn({ err }, 'Failed to read JSON file');
    return {};
  }
}

async function scanMcpServers(): Promise<McpServerInfo[]> {
  const results: McpServerInfo[] = [];

  // Check both global and local settings
  const paths = [
    join(CLAUDE_DIR, 'settings.json'),
    join(CLAUDE_DIR, 'settings.local.json'),
  ];

  for (const path of paths) {
    const data = await readJsonFile(path);
    if (data.mcpServers) {
      for (const [name, config] of Object.entries(data.mcpServers as Record<string, any>)) {
        const type = config.command ? 'stdio' : config.url ? 'sse' : 'unknown';
        results.push({
          name,
          command: config.command,
          url: config.url,
          type,
        });
      }
    }
  }

  return results;
}

async function scanPlugins(): Promise<PluginInfo[]> {
  const results: PluginInfo[] = [];

  // Read enabled plugins from settings
  const settings = await readJsonFile(join(CLAUDE_DIR, 'settings.json'));
  const enabledPlugins: Record<string, boolean> = settings.enabledPlugins || {};

  // Scan the plugin cache for installed plugins
  const cacheDir = join(CLAUDE_DIR, 'plugins', 'cache', 'claude-plugins-official');
  try {
    const entries = await readdir(cacheDir);
    for (const entry of entries) {
      const key = `${entry}@claude-plugins-official`;
      results.push({
        name: entry,
        enabled: enabledPlugins[key] ?? false,
        source: 'claude-plugins-official',
      });
    }
  } catch (err) {
    logger.warn({ err }, 'Failed to scan plugins directory');
  }

  return results.sort((a, b) => a.name.localeCompare(b.name));
}

async function scanHooks(projectDirs?: string[]): Promise<HookInfo[]> {
  const results: HookInfo[] = [];

  // Check settings.json and settings.local.json for hooks
  const paths = [
    join(CLAUDE_DIR, 'settings.json'),
    join(CLAUDE_DIR, 'settings.local.json'),
  ];

  for (const path of paths) {
    const data = await readJsonFile(path);
    if (data.hooks) {
      for (const [event, hookList] of Object.entries(data.hooks as Record<string, any[]>)) {
        if (Array.isArray(hookList)) {
          for (const hook of hookList) {
            results.push({
              name: hook.matcher || hook.command || 'unnamed',
              event,
              source: 'settings',
              enabled: true,
            });
          }
        }
      }
    }
  }

  // Also check project-level settings for hooks
  for (const dir of projectDirs ?? []) {
    const projectPaths = [
      join(dir, '.claude', 'settings.json'),
      join(dir, '.claude', 'settings.local.json'),
    ];
    for (const path of projectPaths) {
      const data = await readJsonFile(path);
      if (data.hooks) {
        for (const [event, hookList] of Object.entries(data.hooks as Record<string, any[]>)) {
          if (Array.isArray(hookList)) {
            for (const hook of hookList) {
              results.push({
                name: hook.matcher || hook.command || 'unnamed',
                event,
                source: 'settings',
                enabled: true,
              });
            }
          }
        }
      }
    }
  }

  // Scan for hookify rule files in global + project locations
  const hookifyLocations = new Set([
    CLAUDE_DIR,
    join(process.cwd(), '.claude'),
    ...(projectDirs ?? []).map(d => join(d, '.claude')),
  ]);

  for (const dir of hookifyLocations) {
    try {
      const entries = await readdir(dir);
      for (const entry of entries) {
        if (entry.startsWith('hookify.') && entry.endsWith('.local.md')) {
          const filePath = join(dir, entry);
          const content = await readFile(filePath, 'utf-8');

          // Parse frontmatter
          const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
          if (fmMatch) {
            const fm = fmMatch[1];
            const name = fm.match(/^name:\s*(.+)$/m)?.[1]?.trim() || entry;
            const event = fm.match(/^event:\s*(.+)$/m)?.[1]?.trim() || 'unknown';
            const enabled = fm.match(/^enabled:\s*(.+)$/m)?.[1]?.trim() !== 'false';
            const action = fm.match(/^action:\s*(.+)$/m)?.[1]?.trim();
            const pattern = fm.match(/^pattern:\s*(.+)$/m)?.[1]?.trim();

            results.push({
              name,
              event,
              source: 'hookify',
              enabled,
              action,
              pattern,
            });
          }
        }
      }
    } catch (err) {
      logger.warn({ err }, 'Failed to scan hookify rules');
    }
  }

  return results;
}

export async function scanConfig(projectDirs?: string[]): Promise<ConfigOverview> {
  const [mcpServers, plugins, hooks] = await Promise.all([
    scanMcpServers(),
    scanPlugins(),
    scanHooks(projectDirs),
  ]);
  return { mcpServers, plugins, hooks };
}
