import type { SessionView, SessionStatus } from '../types';

const STATUS_COLORS: Record<SessionStatus, string> = {
  spawning: 'border-blue-500',
  working: 'border-green-500',
  needs_input: 'border-amber-400',
  waiting_approval: 'border-amber-500',
  done: 'border-gray-600',
  error: 'border-red-500',
};

const PULSE_STATUSES: SessionStatus[] = ['needs_input', 'waiting_approval'];

function getInitials(name: string): string {
  const words = name.split(/[-_:\s]+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

interface Props {
  session: SessionView;
  isActive: boolean;
  onClick: () => void;
}

export function SessionIcon({ session, isActive, onClick }: Props) {
  const borderColor = STATUS_COLORS[session.status];
  const pulse = PULSE_STATUSES.includes(session.status) ? 'animate-pulse' : '';
  const activeBg = isActive ? 'bg-gray-700' : 'bg-gray-800 hover:bg-gray-750';

  return (
    <button
      onClick={onClick}
      title={`${session.name}\n${session.status}`}
      className={`w-8 h-8 rounded-md border-2 ${borderColor} ${pulse} ${activeBg} flex items-center justify-center text-[10px] font-bold text-gray-300 transition-colors`}
    >
      {getInitials(session.name)}
    </button>
  );
}
