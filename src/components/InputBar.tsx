import { useState, type KeyboardEvent } from 'react';

interface Props {
  disabled: boolean;
  onSend: (text: string) => void;
}

export function InputBar({ disabled, onSend }: Props) {
  const [text, setText] = useState('');

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setText('');
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex gap-2 px-4 py-3 border-t border-gray-800 bg-gray-900/50">
      <input
        className="flex-1 bg-gray-800 text-gray-100 px-3 py-2 rounded-md text-sm placeholder-gray-500 disabled:opacity-50"
        placeholder={disabled ? 'Session is working...' : 'Send a message...'}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
      />
      <button
        onClick={handleSend}
        disabled={disabled || !text.trim()}
        className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 rounded-md text-sm text-white transition-colors"
      >
        Send
      </button>
    </div>
  );
}
