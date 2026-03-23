import type { Message } from '../types';

interface Props {
  messages: Message[];
  approve: (requestId: string) => void;
  deny: (requestId: string) => void;
}

export function ApprovalBanner({ messages, approve, deny }: Props) {
  const pending = messages.filter(m => m.approval === 'pending');
  if (pending.length === 0) return null;

  return (
    <div className="border-t border-amber-700 bg-amber-900/30 px-4 py-3 space-y-3">
      {pending.map((m) => (
        <div key={m.id} className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-amber-400 uppercase">Approval Required</span>
              <span className="text-xs font-mono text-gray-300">{m.toolName}</span>
            </div>
            {m.toolArgs && (
              <pre className="text-xs text-gray-400 bg-gray-900/50 rounded p-2 mt-1 overflow-x-auto max-h-32">
                {m.toolArgs}
              </pre>
            )}
          </div>
          <div className="flex gap-2 shrink-0 pt-1">
            <button
              onClick={() => approve(m.id)}
              className="text-sm px-4 py-1.5 bg-green-700 hover:bg-green-600 rounded text-white font-medium"
            >
              Allow
            </button>
            <button
              onClick={() => deny(m.id)}
              className="text-sm px-4 py-1.5 bg-red-700 hover:bg-red-600 rounded text-white font-medium"
            >
              Deny
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
