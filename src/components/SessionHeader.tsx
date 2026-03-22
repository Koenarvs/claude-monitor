import { useState } from 'react';
import type { SessionView } from '../types';

interface Props {
  session: SessionView;
  onRename: (name: string) => void;
  onClose: () => void;
  onRetry: () => void;
}

export function SessionHeader({ session, onRename, onClose, onRetry }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(session.name);

  const handleSubmit = () => {
    onRename(draft);
    setEditing(false);
  };

  return (
    <div className="flex items-center gap-3 px-4 py-2 border-b border-gray-800 bg-gray-900/50">
      <div className="flex-1 min-w-0">
        {editing ? (
          <input
            className="bg-gray-800 text-gray-100 px-2 py-1 rounded text-sm w-full"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={handleSubmit}
            onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
            autoFocus
          />
        ) : (
          <button
            onClick={() => { setDraft(session.name); setEditing(true); }}
            className="text-sm font-semibold text-gray-100 hover:text-white truncate block"
            title="Click to rename"
          >
            {session.name}
          </button>
        )}
        <span className="text-xs text-gray-500">{session.cwd}</span>
      </div>

      <span className="text-xs text-gray-400">
        ${session.cost.toFixed(4)} | {session.turns} turns
      </span>

      {session.compactionCount > 0 && (
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-900 text-orange-300 font-bold" title="Context has been compacted — some earlier context may be summarized">
          {session.compactionCount}x compacted
        </span>
      )}

      {session.status === 'error' && (
        <button onClick={onRetry} className="text-xs px-2 py-1 bg-amber-600 hover:bg-amber-500 rounded text-white">
          Retry
        </button>
      )}

      <button onClick={onClose} className="text-xs px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded text-gray-300">
        Close
      </button>
    </div>
  );
}
