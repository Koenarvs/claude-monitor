import { describe, it, expect } from 'vitest';
import { extractFilesChanged, extractCommandsRun } from '../../server/vault-logger.js';
import type { SessionRuntime } from '../../server/types.js';

function makeSession(messages: any[]): SessionRuntime {
  return {
    id: 'test-id',
    sdkSessionId: null,
    name: 'Test Session',
    cwd: '/test',
    status: 'done',
    permissionMode: 'autonomous',
    createdAt: Date.now(),
    lastActivityAt: Date.now(),
    messages,
    cost: 0,
    turns: 0,
    activeGenerator: null,
    pendingApproval: null,
    subagents: [],
    compactionCount: 0,
  };
}

describe('extractFilesChanged', () => {
  it('returns empty array for no tool calls', () => {
    const session = makeSession([
      { id: '1', type: 'assistant', content: 'Hello', timestamp: Date.now() },
    ]);
    expect(extractFilesChanged(session)).toEqual([]);
  });

  it('extracts file paths from Edit tool calls', () => {
    const session = makeSession([
      {
        id: '1',
        type: 'tool_call',
        content: '',
        timestamp: Date.now(),
        toolName: 'Edit',
        toolArgs: '{"file_path": "/src/index.ts", "old_string": "x", "new_string": "y"}',
      },
    ]);
    expect(extractFilesChanged(session)).toEqual(['/src/index.ts']);
  });

  it('deduplicates file paths', () => {
    const session = makeSession([
      { id: '1', type: 'tool_call', content: '', timestamp: Date.now(), toolName: 'Edit', toolArgs: '{"file_path": "/src/index.ts"}' },
      { id: '2', type: 'tool_call', content: '', timestamp: Date.now(), toolName: 'Write', toolArgs: '{"file_path": "/src/index.ts"}' },
    ]);
    expect(extractFilesChanged(session)).toEqual(['/src/index.ts']);
  });
});

describe('extractCommandsRun', () => {
  it('returns empty array for no bash calls', () => {
    const session = makeSession([]);
    expect(extractCommandsRun(session)).toEqual([]);
  });

  it('extracts commands from Bash tool calls', () => {
    const session = makeSession([
      {
        id: '1',
        type: 'tool_call',
        content: '',
        timestamp: Date.now(),
        toolName: 'Bash',
        toolArgs: '{"command": "npm test"}',
      },
    ]);
    expect(extractCommandsRun(session)).toEqual(['npm test']);
  });

  it('limits to 20 commands', () => {
    const messages = Array.from({ length: 25 }, (_, i) => ({
      id: String(i),
      type: 'tool_call' as const,
      content: '',
      timestamp: Date.now(),
      toolName: 'Bash',
      toolArgs: `{"command": "cmd${i}"}`,
    }));
    const session = makeSession(messages);
    expect(extractCommandsRun(session).length).toBe(20);
  });
});
