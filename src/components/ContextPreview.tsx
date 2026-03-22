import { useEffect, useState } from 'react';

interface Props {
  enabled: boolean;
}

export function ContextPreview({ enabled }: Props) {
  const [context, setContext] = useState('');

  useEffect(() => {
    if (!enabled) { setContext(''); return; }
    fetch('/api/context')
      .then(r => r.json())
      .then(d => setContext(d.context))
      .catch(() => setContext(''));
  }, [enabled]);

  if (!enabled || !context) return null;

  return (
    <div className="bg-blue-900/20 border border-blue-800/30 rounded p-2 text-xs text-blue-300">
      <div className="font-semibold mb-1">Context from other sessions:</div>
      <pre className="whitespace-pre-wrap text-blue-400/80">{context}</pre>
    </div>
  );
}
