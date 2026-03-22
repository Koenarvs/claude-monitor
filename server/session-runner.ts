import { query } from '@anthropic-ai/claude-agent-sdk';
import type { Options, HookInput, HookJSONOutput } from '@anthropic-ai/claude-agent-sdk';
import { v4 as uuid } from 'uuid';
import type { SessionRuntime, Message, SubagentInfo } from './types.js';
import { writeSessionLog } from './vault-logger.js';

type BroadcastFn = (sessionId: string, event: string, data: any) => void;

export async function runSession(
  session: SessionRuntime,
  prompt: string,
  broadcast: BroadcastFn,
): Promise<void> {
  const options: Options = {
    cwd: session.cwd,
    settingSources: ['project', 'user'],
  };

  if (session.permissionMode === 'autonomous') {
    options.permissionMode = 'bypassPermissions';
    options.allowDangerouslySkipPermissions = true;
  } else {
    options.permissionMode = 'default';
    options.hooks = {
      PermissionRequest: [{
        hooks: [async (input: HookInput, _toolUseID: string | undefined, _opts: { signal: AbortSignal }): Promise<HookJSONOutput> => {
          const permInput = input as any;
          const requestId = uuid();
          const toolName = permInput.tool_name || 'unknown';
          const toolArgs = JSON.stringify(permInput.tool_input || {}, null, 2);

          // Create approval message for the UI
          const approvalMsg: Message = {
            id: requestId,
            type: 'tool_call',
            content: '',
            timestamp: Date.now(),
            toolName,
            toolArgs,
            approval: 'pending',
          };
          session.messages.push(approvalMsg);
          broadcast(session.id, 'session:approval', { id: session.id, message: approvalMsg });

          session.status = 'waiting_approval';
          broadcast(session.id, 'session:status', {
            id: session.id,
            status: 'waiting_approval',
            lastActivityAt: Date.now(),
          });

          // Wait for user decision
          const approved = await new Promise<boolean>((resolve) => {
            session.pendingApproval = { requestId, toolName, toolArgs, resolve };
          });
          session.pendingApproval = null;

          // Update the approval message status
          approvalMsg.approval = approved ? 'approved' : 'denied';
          broadcast(session.id, 'session:message', { id: session.id, message: approvalMsg });

          return {
            hookSpecificOutput: {
              hookEventName: 'PermissionRequest',
              decision: approved
                ? { behavior: 'allow' as const }
                : { behavior: 'deny' as const, message: 'User denied permission' },
            },
          };
        }],
      }],
    };
  }

  if (session.sdkSessionId) {
    options.resume = session.sdkSessionId;
  }

  try {
    const generator = query({ prompt, options });
    session.activeGenerator = generator as any;

    for await (const message of generator) {
      const m = message as any;
      session.lastActivityAt = Date.now();

      if (m.type === 'system' && m.subtype === 'init') {
        session.sdkSessionId = m.session_id;
        session.status = 'working';
        broadcast(session.id, 'session:status', {
          id: session.id,
          status: session.status,
          lastActivityAt: session.lastActivityAt,
        });
      }

      if (m.type === 'assistant' && m.message?.content) {
        for (const block of m.message.content) {
          if (block.type === 'text' && block.text) {
            const msg: Message = {
              id: uuid(),
              type: 'assistant',
              content: block.text,
              timestamp: Date.now(),
            };
            session.messages.push(msg);
            broadcast(session.id, 'session:message', { id: session.id, message: msg });
          }
          if (block.type === 'tool_use') {
            const msg: Message = {
              id: uuid(),
              type: 'tool_call',
              content: '',
              timestamp: Date.now(),
              toolName: block.name,
              toolArgs: JSON.stringify(block.input, null, 2),
            };
            session.messages.push(msg);
            broadcast(session.id, 'session:message', { id: session.id, message: msg });

            // Track Agent subagent spawns
            if (block.name === 'Agent') {
              const input = block.input as Record<string, unknown>;
              const description = typeof input?.prompt === 'string'
                ? input.prompt.slice(0, 200)
                : typeof input?.description === 'string'
                  ? input.description.slice(0, 200)
                  : 'Subagent';
              const subagent: SubagentInfo = {
                toolUseId: block.id,
                description,
                status: 'running',
                startedAt: Date.now(),
              };
              session.subagents.push(subagent);
              broadcast(session.id, 'session:subagent', { id: session.id, subagent });
            }
          }
        }
      }

      if (m.type === 'user') {
        // Tool results from SDK
        if (m.message?.content) {
          for (const block of m.message.content) {
            if (block.type === 'tool_result') {
              const content = typeof block.content === 'string'
                ? block.content
                : JSON.stringify(block.content);
              const msg: Message = {
                id: uuid(),
                type: 'tool_result',
                content: content?.slice(0, 2000) || '',
                timestamp: Date.now(),
                toolName: block.tool_use_id,
              };
              session.messages.push(msg);
              broadcast(session.id, 'session:message', { id: session.id, message: msg });

              // Check if this completes a subagent
              const subagent = session.subagents.find(sa => sa.toolUseId === block.tool_use_id);
              if (subagent) {
                subagent.status = 'done';
                subagent.completedAt = Date.now();
                broadcast(session.id, 'session:subagent', { id: session.id, subagent: { ...subagent } });
              }
            }
          }
        }
      }

      if (m.type === 'result') {
        session.cost = m.total_cost_usd ?? session.cost;
        session.turns = m.num_turns ?? session.turns;
        if (m.session_id) session.sdkSessionId = m.session_id;

        if (m.subtype === 'error_during_execution') {
          session.status = 'error';
          const errorText = m.errors?.join('\n') || 'Unknown error';
          const errorMsg: Message = {
            id: uuid(),
            type: 'system',
            content: `Session error: ${errorText}`,
            timestamp: Date.now(),
          };
          session.messages.push(errorMsg);
          broadcast(session.id, 'session:message', { id: session.id, message: errorMsg });
        } else if (m.subtype === 'error_max_budget_usd') {
          // Budget exhausted — no recovery possible, go straight to done
          session.status = 'done';
          const budgetMsg: Message = {
            id: uuid(),
            type: 'system',
            content: 'Session ended: budget limit reached.',
            timestamp: Date.now(),
          };
          session.messages.push(budgetMsg);
          broadcast(session.id, 'session:message', { id: session.id, message: budgetMsg });
          // Trigger vault log
          writeSessionLog(session).catch((err) =>
            console.error(`Vault log failed for ${session.id}:`, err)
          );
        } else {
          // success, error_max_turns → needs_input (user can send more)
          session.status = 'needs_input';
          if (m.result) {
            const resultMsg: Message = {
              id: uuid(),
              type: 'system',
              content: m.result,
              timestamp: Date.now(),
            };
            session.messages.push(resultMsg);
            broadcast(session.id, 'session:message', { id: session.id, message: resultMsg });
          }
        }

        broadcast(session.id, 'session:status', {
          id: session.id,
          status: session.status,
          lastActivityAt: session.lastActivityAt,
          cost: session.cost,
        });
      }
    }
  } catch (err) {
    session.status = 'error';
    const errorMsg: Message = {
      id: uuid(),
      type: 'system',
      content: `SDK error: ${err instanceof Error ? err.message : String(err)}`,
      timestamp: Date.now(),
    };
    session.messages.push(errorMsg);
    broadcast(session.id, 'session:message', { id: session.id, message: errorMsg });
    broadcast(session.id, 'session:status', {
      id: session.id,
      status: 'error',
      lastActivityAt: Date.now(),
    });
  }
}
