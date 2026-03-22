import { useEffect, useRef } from 'react';
import type { Message } from '../types';
import { MessageBubble } from './MessageBubble';

interface Props {
  messages: Message[];
  approve: (requestId: string) => void;
  deny: (requestId: string) => void;
}

export function MessageStream({ messages, approve, deny }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const isNearBottom = useRef(true);

  const handleScroll = () => {
    const el = containerRef.current;
    if (!el) return;
    const threshold = 100;
    isNearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
  };

  useEffect(() => {
    if (isNearBottom.current && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [messages.length]);

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className="flex-1 overflow-y-auto px-4 py-3 space-y-3"
    >
      {messages.map((msg) => (
        <MessageBubble key={msg.id} message={msg} approve={approve} deny={deny} />
      ))}
    </div>
  );
}
