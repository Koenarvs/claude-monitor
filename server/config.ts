import { readFile, writeFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { homedir } from 'os';
import { AppConfigSchema, type AppConfig } from './validation.js';
import { logger } from './logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = join(__dirname, '..', 'config.json');

const DEFAULT_CONFIG: AppConfig = {
  defaultCwd: homedir(),
  defaultPermissionMode: 'autonomous',
  workingDirectories: [],
  vaultPath: '',
  maxSessions: 10,
  approvalTimeoutMinutes: 30,
};

let cached: AppConfig | null = null;

export async function loadConfig(): Promise<AppConfig> {
  if (cached) return cached;
  try {
    const raw = await readFile(CONFIG_PATH, 'utf-8');
    const merged = { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
    const parsed = AppConfigSchema.safeParse(merged);
    if (!parsed.success) {
      logger.warn({ issues: parsed.error.issues }, 'Invalid config.json, using defaults');
      cached = DEFAULT_CONFIG;
      return cached;
    }
    cached = parsed.data;
    return cached;
  } catch {
    // First run — write defaults so user has a template
    logger.info('No config.json found, creating with defaults');
    try {
      await writeFile(CONFIG_PATH, JSON.stringify(DEFAULT_CONFIG, null, 2), 'utf-8');
    } catch (writeErr) {
      logger.warn({ err: writeErr }, 'Could not write default config.json');
    }
    cached = DEFAULT_CONFIG;
    return cached;
  }
}

export async function saveConfig(config: AppConfig): Promise<void> {
  await writeFile(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
  cached = config;
}

export function clearConfigCache(): void {
  cached = null;
}

export type { AppConfig } from './validation.js';
