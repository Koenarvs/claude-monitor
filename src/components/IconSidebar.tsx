import { useSessionState, useSessionDispatch } from '../context/SessionContext';
import { SessionIcon } from './SessionIcon';
import type { SessionView, SessionStatus } from '../types';

const STATUS_PRIORITY: Record<SessionStatus, number> = {
  waiting_approval: 0,
  needs_input: 1,
  working: 2,
  spawning: 3,
  error: 4,
  done: 5,
};

function sortSessions(sessions: SessionView[]): SessionView[] {
  return [...sessions].sort((a, b) => {
    const pa = STATUS_PRIORITY[a.status];
    const pb = STATUS_PRIORITY[b.status];
    if (pa !== pb) return pa - pb;
    return b.lastActivityAt - a.lastActivityAt;
  });
}

interface Props {
  onNewSession: () => void;
}

export function IconSidebar({ onNewSession }: Props) {
  const { sessions, activeSessionId } = useSessionState();
  const dispatch = useSessionDispatch();
  const sorted = sortSessions([...sessions.values()]);

  return (
    <div className="w-12 bg-gray-900 border-r border-gray-800 flex flex-col items-center py-2 gap-2">
      <img
        src="/icons/logo-512.png"
        alt="Claude Monitor"
        className="w-8 h-8 mb-1 opacity-80"
        title="Claude Monitor"
      />
      <div className="w-6 border-t border-gray-700 mb-1" />
      {sorted.map((s) => (
        <SessionIcon
          key={s.id}
          session={s}
          isActive={s.id === activeSessionId}
          onClick={() => dispatch({ type: 'SET_ACTIVE', id: s.id })}
        />
      ))}
      <div className="mt-auto">
        <button
          onClick={onNewSession}
          className="w-8 h-8 rounded-md bg-gray-800 hover:bg-gray-700 border border-gray-700 flex items-center justify-center transition-colors"
          title="New Session"
        >
          <img src="/icons/spawn.png" alt="New Session" className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}
