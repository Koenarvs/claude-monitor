import { useState } from 'react';
import type { SubagentInfo } from '../types';

interface Props {
  subagents: SubagentInfo[];
}

function formatElapsed(startedAt: number, completedAt?: number): string {
  const end = completedAt || Date.now();
  const seconds = Math.floor((end - startedAt) / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return `${minutes}m ${remaining}s`;
}

export function SubagentList({ subagents }: Props) {
  const [expanded, setExpanded] = useState(false);

  if (subagents.length === 0) return null;

  const running = subagents.filter(sa => sa.status === 'running').length;
  const done = subagents.filter(sa => sa.status === 'done').length;

  const parts: string[] = [];
  if (running > 0) parts.push(`${running} running`);
  if (done > 0) parts.push(`${done} done`);
  const summary = `Subagents (${parts.join(', ')})`;

  return (
    <div className="border-b border-gray-800">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-2 flex items-center gap-2 text-xs text-gray-400 hover:text-gray-300 hover:bg-gray-800/50 transition-colors"
      >
        <span className={`transition-transform ${expanded ? 'rotate-90' : ''}`}>&#9654;</span>
        <span>{summary}</span>
      </button>
      {expanded && (
        <div className="px-4 pb-2 space-y-1">
          {subagents.map(sa => (
            <div key={sa.toolUseId} className="flex items-center gap-2 text-xs py-1 px-2 rounded bg-gray-800/50">
              {sa.status === 'running' ? (
                <span className="w-3 h-3 rounded-full border-2 border-green-400 border-t-transparent animate-spin flex-shrink-0" />
              ) : (
                <span className="text-gray-500 flex-shrink-0">&#10003;</span>
              )}
              <span className="text-gray-300 truncate flex-1">{sa.description}</span>
              <span className="text-gray-500 flex-shrink-0">{formatElapsed(sa.startedAt, sa.completedAt)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
