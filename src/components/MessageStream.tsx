import { useEffect, useRef, useCallback, CSSProperties } from 'react';
import { List, useDynamicRowHeight, useListRef } from 'react-window';
import type { Message } from '../types';
import { MessageBubble } from './MessageBubble';

interface Props {
  messages: Message[];
  approve: (requestId: string) => void;
  deny: (requestId: string) => void;
}

// Estimate row height based on message type and content (used as defaultRowHeight seed)
function estimateHeight(message: Message): number {
  if (message.type === 'system') return 28;
  if (message.type === 'tool_call') return 32;
  if (message.type === 'tool_result') return 32;
  // assistant/user: ~20px per line, min 40px
  const lines = Math.ceil(message.content.length / 80) || 1;
  return Math.max(40, lines * 20 + 16);
}

// Row component props required by react-window v2
interface RowProps {
  messages: Message[];
  approve: (requestId: string) => void;
  deny: (requestId: string) => void;
  observeElements: (elements: NodeListOf<Element> | Element[]) => () => void;
}

function MessageRow({
  ariaAttributes,
  index,
  style,
  messages,
  approve,
  deny,
  observeElements,
}: {
  ariaAttributes: { 'aria-posinset': number; 'aria-setsize': number; role: 'listitem' };
  index: number;
  style: CSSProperties;
  messages: Message[];
  approve: (requestId: string) => void;
  deny: (requestId: string) => void;
  observeElements: (elements: NodeListOf<Element> | Element[]) => () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    return observeElements([ref.current]);
  }, [observeElements, index]);

  const message = messages[index];
  if (!message) return null;

  return (
    <div ref={ref} style={style} {...ariaAttributes} className="px-4 py-1.5">
      <MessageBubble message={message} approve={approve} deny={deny} />
    </div>
  );
}

export function MessageStream({ messages, approve, deny }: Props) {
  const listRef = useListRef(null);
  const isNearBottom = useRef(true);
  const prevLengthRef = useRef(messages.length);

  // Average estimate across all current messages for a reasonable default
  const avgHeight = messages.length > 0
    ? Math.round(messages.reduce((sum, m) => sum + estimateHeight(m), 0) / messages.length)
    : 40;

  const rowHeight = useDynamicRowHeight({
    defaultRowHeight: avgHeight,
    key: messages.length,
  });

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (messages.length !== prevLengthRef.current) {
      prevLengthRef.current = messages.length;
      if (isNearBottom.current && listRef.current && messages.length > 0) {
        listRef.current.scrollToRow({ index: messages.length - 1, align: 'end' });
      }
    }
  }, [messages.length, listRef]);

  const handleScroll = useCallback((event: React.UIEvent<HTMLDivElement>) => {
    const el = event.currentTarget;
    isNearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
  }, []);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rowProps = {
    messages,
    approve,
    deny,
    observeElements: rowHeight.observeRowElements,
  } as any;

  // Fallback for very few messages — no virtualization overhead for short sessions
  if (messages.length < 50) {
    return (
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3" onScroll={handleScroll}>
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} approve={approve} deny={deny} />
        ))}
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-hidden" onScroll={handleScroll}>
      <List
        listRef={listRef}
        rowCount={messages.length}
        rowHeight={rowHeight}
        rowComponent={MessageRow}
        rowProps={rowProps}
        overscanCount={10}
        className="flex-1"
      />
    </div>
  );
}
