import { useState } from 'react';
import type { Message } from '../types';

interface Props {
  message: Message;
  approve?: (requestId: string) => void;
  deny?: (requestId: string) => void;
}

export function MessageBubble({ message, approve, deny }: Props) {
  const [expanded, setExpanded] = useState(false);

  if (message.type === 'user') {
    return (
      <div className="flex justify-end">
        <div className="bg-blue-600/20 border border-blue-800 rounded-lg px-3 py-2 max-w-[80%]">
          <p className="text-sm text-gray-200 whitespace-pre-wrap">{message.content}</p>
        </div>
      </div>
    );
  }

  if (message.type === 'assistant') {
    return (
      <div className="max-w-[90%]">
        <p className="text-sm text-gray-200 whitespace-pre-wrap">{message.content}</p>
      </div>
    );
  }

  if (message.type === 'tool_call') {
    return (
      <div className="max-w-[90%]">
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-xs text-gray-400 hover:text-gray-300 flex items-center gap-1"
        >
          <span>{expanded ? '▼' : '▶'}</span>
          <span className="font-mono">{message.toolName}</span>
        </button>
        {expanded && message.toolArgs && (
          <pre className="text-xs text-gray-500 bg-gray-900 rounded p-2 mt-1 overflow-x-auto max-h-40">
            {message.toolArgs}
          </pre>
        )}
        {message.approval === 'pending' && approve && deny && (
          <div className="flex gap-2 mt-2">
            <button
              onClick={() => approve(message.id)}
              className="text-xs px-3 py-1 bg-green-700 hover:bg-green-600 rounded text-white"
            >
              Allow
            </button>
            <button
              onClick={() => deny(message.id)}
              className="text-xs px-3 py-1 bg-red-700 hover:bg-red-600 rounded text-white"
            >
              Deny
            </button>
          </div>
        )}
      </div>
    );
  }

  if (message.type === 'tool_result') {
    return (
      <div className="max-w-[90%]">
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-xs text-green-600 flex items-center gap-1"
        >
          <span>{expanded ? '▼' : '▶'}</span>
          <span>Result</span>
        </button>
        {expanded && (
          <pre className="text-xs text-gray-500 bg-gray-900 rounded p-2 mt-1 overflow-x-auto max-h-40">
            {message.content}
          </pre>
        )}
      </div>
    );
  }

  // system messages
  return (
    <div className="max-w-[90%]">
      <p className="text-xs text-gray-500 italic">{message.content}</p>
    </div>
  );
}
