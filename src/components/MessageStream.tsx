// Stub — replaced in Task 12
import type { Message } from '../types';

interface Props {
  messages: Message[];
  approve: (requestId: string) => void;
  deny: (requestId: string) => void;
}

export function MessageStream({ messages }: Props) {
  return (
    <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
      {messages.map((msg) => (
        <div key={msg.id} className="text-sm text-gray-300">{msg.content}</div>
      ))}
    </div>
  );
}
