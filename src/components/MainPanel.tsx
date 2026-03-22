import { useSessionState } from '../context/SessionContext';
import { SessionHeader } from './SessionHeader';
import { MessageStream } from './MessageStream';
import { InputBar } from './InputBar';
import type { SessionView } from '../types';

interface Props {
  onNewSession: () => void;
  sendInput: (id: string, text: string) => void;
  approve: (id: string, requestId: string) => void;
  deny: (id: string, requestId: string) => void;
  onClose: (id: string) => void;
  onRetry: (id: string) => void;
  onRename: (id: string, name: string) => void;
}

export function MainPanel({ onNewSession, sendInput, approve, deny, onClose, onRetry, onRename }: Props) {
  const { sessions, activeSessionId } = useSessionState();
  const session: SessionView | undefined = activeSessionId
    ? sessions.get(activeSessionId)
    : undefined;

  if (!session) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-gray-500 gap-4">
        <p className="text-lg">Claude Monitor</p>
        <p className="text-sm">No sessions yet.</p>
        <button
          onClick={onNewSession}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-md text-white text-sm"
        >
          Start a Session
        </button>
      </div>
    );
  }

  const inputDisabled = session.status === 'working' || session.status === 'spawning'
    || session.status === 'done' || session.status === 'waiting_approval';

  return (
    <div className="flex-1 flex flex-col min-w-0">
      <SessionHeader
        session={session}
        onRename={(name) => onRename(session.id, name)}
        onClose={() => onClose(session.id)}
        onRetry={() => onRetry(session.id)}
      />
      <MessageStream
        messages={session.messages}
        approve={(requestId) => approve(session.id, requestId)}
        deny={(requestId) => deny(session.id, requestId)}
      />
      <InputBar
        disabled={inputDisabled}
        onSend={(text) => sendInput(session.id, text)}
      />
    </div>
  );
}
