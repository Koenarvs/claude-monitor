import { writeFile, mkdir } from 'fs/promises';
import { logger } from './logger.js';
import { join } from 'path';
import type { SessionRuntime } from './types.js';
import { summarizeSession } from './session-summarizer.js';
import { loadConfig } from './config.js';

export async function writeSessionLog(session: SessionRuntime): Promise<string> {
  const config = await loadConfig();
  const vaultPath = config.vaultPath;
  if (!vaultPath) {
    logger.debug('Vault logging disabled (no vaultPath configured)');
    return '';
  }
  await mkdir(vaultPath, { recursive: true });

  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);
  const filename = `${dateStr}_${session.id}.md`;
  const filepath = join(vaultPath, filename);

  const started = new Date(session.createdAt);
  const durationMs = now.getTime() - session.createdAt;
  const durationMin = Math.round(durationMs / 60000);
  const durationStr = durationMin < 60
    ? `${durationMin}m`
    : `${Math.floor(durationMin / 60)}h ${durationMin % 60}m`;

  const status = session.status === 'error' ? 'error' : 'success';

  const filesChanged = extractFilesChanged(session);
  const commandsRun = extractCommandsRun(session);

  const frontmatter = [
    '---',
    `session_id: ${session.sdkSessionId || session.id}`,
    `name: "${session.name.replace(/"/g, '\\"')}"`,
    `cwd: ${session.cwd}`,
    `started: ${started.toISOString()}`,
    `ended: ${now.toISOString()}`,
    `duration: ${durationStr}`,
    `cost_usd: ${session.cost.toFixed(4)}`,
    `turns: ${session.turns}`,
    `status: ${status}`,
    `permission_mode: ${session.permissionMode}`,
    '---',
  ].join('\n');

  // Try LLM-powered summary first, fall back to deterministic
  let body = '';
  try {
    body = await summarizeSession(session);
  } catch {
    // Summarizer failed, use fallback
  }

  if (!body) {
    // Deterministic fallback (existing logic)
    const bodyParts: string[] = [`## ${session.name}`, ''];

    if (filesChanged.length > 0) {
      bodyParts.push('## Files Changed', ...filesChanged.map(f => `- ${f}`), '');
    }
    if (commandsRun.length > 0) {
      bodyParts.push('## Commands Run', ...commandsRun.map(c => `- \`${c}\``), '');
    }
    if (session.status === 'error') {
      const lastAssistant = [...session.messages].reverse().find(m => m.type === 'assistant');
      if (lastAssistant) {
        bodyParts.push('## Open Items', `Session ended with error. Last assistant message:`, `> ${lastAssistant.content.slice(0, 500)}`, '');
      }
    }
    body = bodyParts.join('\n');
  }

  const sections: string[] = [frontmatter, '', body];

  await writeFile(filepath, sections.join('\n'), 'utf-8');
  return filepath;
}

export function extractFilesChanged(session: SessionRuntime): string[] {
  const files = new Set<string>();
  for (const msg of session.messages) {
    if (msg.type === 'tool_call' && msg.toolName) {
      if (['Edit', 'Write', 'NotebookEdit'].includes(msg.toolName)) {
        const args = tryParseArgs(msg.toolArgs);
        if (args && typeof args.file_path === 'string') {
          files.add(args.file_path);
        }
      }
    }
  }
  return [...files];
}

export function extractCommandsRun(session: SessionRuntime): string[] {
  const commands: string[] = [];
  for (const msg of session.messages) {
    if (msg.type === 'tool_call' && msg.toolName === 'Bash') {
      const args = tryParseArgs(msg.toolArgs);
      if (args && typeof args.command === 'string' && commands.length < 20) {
        commands.push(args.command.slice(0, 100));
      }
    }
  }
  return commands;
}
