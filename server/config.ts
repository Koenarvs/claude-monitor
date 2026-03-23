import { readFile, writeFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = join(__dirname, '..', 'config.json');

export interface WorkingDirectory {
  label: string;
  path: string;
}

export interface AppConfig {
  defaultCwd: string;
  defaultPermissionMode: 'autonomous' | 'supervised';
  workingDirectories: WorkingDirectory[];
  vaultPath: string;
  maxSessions: number;
}

const DEFAULT_CONFIG: AppConfig = {
  defaultCwd: process.cwd(),
  defaultPermissionMode: 'supervised',
  workingDirectories: [],
  vaultPath: '',
  maxSessions: 10,
};

let cached: AppConfig | null = null;

export async function loadConfig(): Promise<AppConfig> {
  if (cached) return cached;
  try {
    const raw = await readFile(CONFIG_PATH, 'utf-8');
    cached = { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
    return cached!;
  } catch {
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
