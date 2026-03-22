import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import type { SessionRuntime } from './types.js';

const VAULT_PATH = 'D:/greyhawk-grand-campaign/_claude-memory/sessions';

export async function writeSessionLog(session: SessionRuntime): Promise<string> {
  await mkdir(VAULT_PATH, { recursive: true });

  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);
  const filename = `${dateStr}_${session.id}.md`;
  const filepath = join(VAULT_PATH, filename);

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

  const sections: string[] = [frontmatter, '', `## ${session.name}`, ''];

  if (filesChanged.length > 0) {
    sections.push('## Files Changed', ...filesChanged.map(f => `- ${f}`), '');
  }

  if (commandsRun.length > 0) {
    sections.push('## Commands Run', ...commandsRun.map(c => `- \`${c}\``), '');
  }

  // Open items for incomplete sessions
  if (session.status === 'error') {
    const lastAssistant = [...session.messages]
      .reverse()
      .find(m => m.type === 'assistant');
    if (lastAssistant) {
      sections.push(
        '## Open Items',
        `Session ended with error. Last assistant message:`,
        `> ${lastAssistant.content.slice(0, 500)}`,
        ''
      );
    }
  }

  await writeFile(filepath, sections.join('\n'), 'utf-8');
  return filepath;
}

function extractFilesChanged(session: SessionRuntime): string[] {
  const files = new Set<string>();
  for (const msg of session.messages) {
    if (msg.type === 'tool_call' && msg.toolName) {
      if (['Edit', 'Write', 'NotebookEdit'].includes(msg.toolName) && msg.toolArgs) {
        const match = msg.toolArgs.match(/"file_path"\s*:\s*"([^"]+)"/);
        if (match) files.add(match[1]);
      }
    }
  }
  return [...files];
}

function extractCommandsRun(session: SessionRuntime): string[] {
  const commands: string[] = [];
  for (const msg of session.messages) {
    if (msg.type === 'tool_call' && msg.toolName === 'Bash' && msg.toolArgs) {
      const match = msg.toolArgs.match(/"command"\s*:\s*"([^"]+)"/);
      if (match && commands.length < 20) {
        commands.push(match[1].slice(0, 100));
      }
    }
  }
  return commands;
}
