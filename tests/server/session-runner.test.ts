import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SessionRuntime } from '../../server/types.js';

// Module-level array that each test populates before calling runSession
const mockMessages: any[] = [];

// Mock the SDK query function — returns an async generator over mockMessages
vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: vi.fn(() => {
    async function* gen() {
      for (const msg of mockMessages) {
        yield msg;
      }
    }
    return gen();
  }),
}));

// Mock the logger to avoid needing pino installed
vi.mock('../../server/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock vault logger
vi.mock('../../server/vault-logger.js', () => ({
  writeSessionLog: vi.fn().mockResolvedValue(''),
}));

// Mock config
vi.mock('../../server/config.js', () => ({
  loadConfig: vi.fn().mockResolvedValue({
    approvalTimeoutMinutes: 30,
    maxSessions: 10,
    vaultPath: '',
    defaultCwd: '/fake',
    defaultPermissionMode: 'autonomous',
    workingDirectories: [],
  }),
}));

import { runSession } from '../../server/session-runner.js';

function makeSession(overrides: Partial<SessionRuntime> = {}): SessionRuntime {
  return {
    id: 'test-session',
    sdkSessionId: null,
    name: 'Test',
    cwd: '/test',
    status: 'spawning',
    permissionMode: 'autonomous',
    createdAt: Date.now(),
    lastActivityAt: Date.now(),
    messages: [],
    cost: 0,
    turns: 0,
    activeGenerator: null,
    pendingApproval: null,
    subagents: [],
    compactionCount: 0,
    ...overrides,
  };
}

describe('runSession', () => {
  let broadcast: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    broadcast = vi.fn();
    mockMessages.length = 0;
  });

  it('sets session to working on init message', async () => {
    mockMessages.push(
      { type: 'system', subtype: 'init', session_id: 'sdk-123' },
      { type: 'result', subtype: 'success', total_cost_usd: 0.01, num_turns: 1 },
    );
    const session = makeSession();
    await runSession(session, 'hello', broadcast);

    expect(session.sdkSessionId).toBe('sdk-123');
    expect(session.status).toBe('needs_input');
  });

  it('captures assistant text messages', async () => {
    mockMessages.push(
      { type: 'system', subtype: 'init', session_id: 'sdk-1' },
      {
        type: 'assistant',
        message: {
          content: [{ type: 'text', text: 'Hello world' }],
        },
      },
      { type: 'result', subtype: 'success', total_cost_usd: 0.05, num_turns: 1 },
    );
    const session = makeSession();
    await runSession(session, 'hi', broadcast);

    const assistantMsgs = session.messages.filter(m => m.type === 'assistant');
    expect(assistantMsgs.length).toBe(1);
    expect(assistantMsgs[0].content).toBe('Hello world');
  });

  it('captures tool calls', async () => {
    mockMessages.push(
      { type: 'system', subtype: 'init', session_id: 'sdk-1' },
      {
        type: 'assistant',
        message: {
          content: [{
            type: 'tool_use',
            id: 'tool-1',
            name: 'Bash',
            input: { command: 'ls' },
          }],
        },
      },
      { type: 'result', subtype: 'success', total_cost_usd: 0.05, num_turns: 1 },
    );
    const session = makeSession();
    await runSession(session, 'list files', broadcast);

    const toolCalls = session.messages.filter(m => m.type === 'tool_call');
    expect(toolCalls.length).toBe(1);
    expect(toolCalls[0].toolName).toBe('Bash');
  });

  it('tracks Agent subagent spawns', async () => {
    mockMessages.push(
      { type: 'system', subtype: 'init', session_id: 'sdk-1' },
      {
        type: 'assistant',
        message: {
          content: [{
            type: 'tool_use',
            id: 'agent-1',
            name: 'Agent',
            input: { description: 'Research task', prompt: 'Do research' },
          }],
        },
      },
      { type: 'result', subtype: 'success', total_cost_usd: 0.1, num_turns: 1 },
    );
    const session = makeSession();
    await runSession(session, 'research', broadcast);

    expect(session.subagents.length).toBe(1);
    expect(session.subagents[0].toolUseId).toBe('agent-1');
    expect(session.subagents[0].status).toBe('running');
  });

  it('captures tool results and completes subagents', async () => {
    mockMessages.push(
      { type: 'system', subtype: 'init', session_id: 'sdk-1' },
      {
        type: 'assistant',
        message: {
          content: [{
            type: 'tool_use',
            id: 'agent-1',
            name: 'Agent',
            input: { prompt: 'Do stuff' },
          }],
        },
      },
      {
        type: 'user',
        message: {
          content: [{
            type: 'tool_result',
            tool_use_id: 'agent-1',
            content: 'Done',
          }],
        },
      },
      { type: 'result', subtype: 'success', total_cost_usd: 0.2, num_turns: 2 },
    );
    const session = makeSession();
    await runSession(session, 'go', broadcast);

    expect(session.subagents[0].status).toBe('done');
    expect(session.subagents[0].completedAt).toBeDefined();
  });

  it('updates cost and turns from result', async () => {
    mockMessages.push(
      { type: 'system', subtype: 'init', session_id: 'sdk-1' },
      { type: 'result', subtype: 'success', total_cost_usd: 1.23, num_turns: 5, session_id: 'sdk-1' },
    );
    const session = makeSession();
    await runSession(session, 'work', broadcast);

    expect(session.cost).toBe(1.23);
    expect(session.turns).toBe(5);
  });

  it('sets error status on error_during_execution', async () => {
    mockMessages.push(
      { type: 'system', subtype: 'init', session_id: 'sdk-1' },
      { type: 'result', subtype: 'error_during_execution', errors: ['Something broke'] },
    );
    const session = makeSession();
    await runSession(session, 'fail', broadcast);

    expect(session.status).toBe('error');
    const errorMsgs = session.messages.filter(m => m.content.includes('Something broke'));
    expect(errorMsgs.length).toBe(1);
  });

  it('sets done on budget exceeded', async () => {
    mockMessages.push(
      { type: 'system', subtype: 'init', session_id: 'sdk-1' },
      { type: 'result', subtype: 'error_max_budget_usd' },
    );
    const session = makeSession();
    await runSession(session, 'expensive', broadcast);

    expect(session.status).toBe('done');
  });

  it('handles SDK throw gracefully', async () => {
    // Replace the mock implementation for this one test
    const { query } = await import('@anthropic-ai/claude-agent-sdk');
    (query as ReturnType<typeof vi.fn>).mockImplementationOnce(() => {
      async function* gen() {
        throw new Error('Network failure');
      }
      return gen();
    });

    const session = makeSession();
    await runSession(session, 'crash', broadcast);

    expect(session.status).toBe('error');
    const errorMsgs = session.messages.filter(m => m.content.includes('Network failure'));
    expect(errorMsgs.length).toBe(1);
  });

  it('broadcasts status changes', async () => {
    mockMessages.push(
      { type: 'system', subtype: 'init', session_id: 'sdk-1' },
      { type: 'result', subtype: 'success', total_cost_usd: 0.01, num_turns: 1 },
    );
    const session = makeSession();
    await runSession(session, 'test', broadcast);

    const statusCalls = broadcast.mock.calls.filter((c: any[]) => c[1] === 'session:status');
    // init → working, result → needs_input
    expect(statusCalls.length).toBeGreaterThanOrEqual(2);
  });

  it('tracks compaction events', async () => {
    mockMessages.push(
      { type: 'system', subtype: 'init', session_id: 'sdk-1' },
      { type: 'system', subtype: 'compact_boundary', compact_metadata: { pre_tokens: 50000 } },
      { type: 'result', subtype: 'success', total_cost_usd: 0.5, num_turns: 10 },
    );
    const session = makeSession();
    await runSession(session, 'long task', broadcast);

    expect(session.compactionCount).toBe(1);
    const compactMsgs = session.messages.filter(m => m.content.includes('compacted'));
    expect(compactMsgs.length).toBe(1);
  });
});
