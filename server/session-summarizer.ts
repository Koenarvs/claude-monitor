import { query } from '@anthropic-ai/claude-agent-sdk';
import type { SessionRuntime } from './types.js';
import { logger } from './logger.js';

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('Timeout')), ms)),
  ]);
}

export async function summarizeSession(session: SessionRuntime): Promise<string> {
  // Build a condensed transcript from messages
  const transcript = session.messages
    .filter(m => m.type === 'user' || m.type === 'assistant' || m.type === 'system')
    .map(m => {
      if (m.type === 'user') return `User: ${m.content.slice(0, 500)}`;
      if (m.type === 'assistant') return `Assistant: ${m.content.slice(0, 500)}`;
      return `System: ${m.content.slice(0, 200)}`;
    })
    .join('\n\n');

  // If transcript is too short, skip LLM and return empty
  if (transcript.length < 100) return '';

  const prompt = `Summarize this Claude Code session transcript into structured markdown sections. Be concise and factual.

Session: "${session.name}"
Working directory: ${session.cwd}

<transcript>
${transcript.slice(0, 8000)}
</transcript>

Output ONLY these sections (skip any that don't apply):

## Summary
One sentence describing what was accomplished.

## Decisions Made
- Bullet list of decisions or choices made during the session

## Key Findings
- Bullet list of important discoveries or insights

## Open Items
- Bullet list of unfinished work or follow-up needed`;

  try {
    const summarize = async (): Promise<string> => {
      let result = '';
      for await (const message of query({
        prompt,
        options: {
          maxTurns: 1,
          permissionMode: 'bypassPermissions',
          allowDangerouslySkipPermissions: true,
          allowedTools: [],  // No tools needed — just summarize
        } as any,
      })) {
        const m = message as any;
        if (m.type === 'result' && m.result) {
          result = m.result;
        }
      }
      return result;
    };

    return await withTimeout(summarize(), 30000);
  } catch (err) {
    logger.error({ err }, 'Session summarization failed or timed out');
    return '';  // Fall back to deterministic extraction
  }
}
