export type SessionStatus =
  | 'spawning'
  | 'working'
  | 'needs_input'
  | 'waiting_approval'
  | 'done'
  | 'error';

export type PermissionMode = 'autonomous' | 'supervised';

export interface Message {
  id: string;
  type: 'user' | 'assistant' | 'tool_call' | 'tool_result' | 'system';
  content: string;
  timestamp: number;
  toolName?: string;
  toolArgs?: string;
  approval?: 'pending' | 'approved' | 'denied';
}

export interface SubagentInfo {
  toolUseId: string;
  description: string;
  status: 'running' | 'done';
  startedAt: number;
  completedAt?: number;
}

export interface PendingApproval {
  requestId: string;
  toolName: string;
  toolArgs: string;
  resolve: (approved: boolean) => void;
}

export interface SessionRuntime {
  id: string;
  sdkSessionId: string | null;
  name: string;
  cwd: string;
  status: SessionStatus;
  permissionMode: PermissionMode;
  createdAt: number;
  lastActivityAt: number;
  messages: Message[];
  cost: number;
  turns: number;
  activeGenerator: AsyncGenerator<any, any, any> | null;
  pendingApproval: PendingApproval | null;
  subagents: SubagentInfo[];
  compactionCount: number;
}

export interface SessionView {
  id: string;
  sdkSessionId: string | null;
  name: string;
  cwd: string;
  status: SessionStatus;
  permissionMode: PermissionMode;
  createdAt: number;
  lastActivityAt: number;
  messages: Message[];
  cost: number;
  turns: number;
  subagents: SubagentInfo[];
  compactionCount: number;
}

export function toSessionView(s: SessionRuntime): SessionView {
  return {
    id: s.id,
    sdkSessionId: s.sdkSessionId,
    name: s.name,
    cwd: s.cwd,
    status: s.status,
    permissionMode: s.permissionMode,
    createdAt: s.createdAt,
    lastActivityAt: s.lastActivityAt,
    messages: s.messages,
    cost: s.cost,
    turns: s.turns,
    subagents: s.subagents,
    compactionCount: s.compactionCount,
  };
}
