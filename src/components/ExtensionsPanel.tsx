import { useEffect, useState } from 'react';

interface McpServerInfo {
  name: string;
  command?: string;
  url?: string;
  type: 'stdio' | 'sse' | 'unknown';
}

interface PluginInfo {
  name: string;
  enabled: boolean;
  source: string;
}

interface HookInfo {
  name: string;
  event: string;
  source: 'settings' | 'hookify';
  enabled: boolean;
  action?: string;
  pattern?: string;
}

interface ConfigOverview {
  mcpServers: McpServerInfo[];
  plugins: PluginInfo[];
  hooks: HookInfo[];
}

interface Props {
  open: boolean;
  onClose: () => void;
}

export function ExtensionsPanel({ open, onClose }: Props) {
  const [data, setData] = useState<ConfigOverview | null>(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<'mcp' | 'plugins' | 'hooks'>('mcp');

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch('/api/extensions')
      .then(r => r.json())
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [open]);

  if (!open) return null;

  const tabs = [
    { key: 'mcp' as const, label: 'MCP Servers', count: data?.mcpServers.length ?? 0 },
    { key: 'plugins' as const, label: 'Plugins', count: data?.plugins.length ?? 0 },
    { key: 'hooks' as const, label: 'Hooks', count: data?.hooks.length ?? 0 },
  ];

  return (
    <div className="w-80 border-l border-gray-800 bg-gray-900 flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
        <h2 className="text-sm font-semibold text-gray-100">Extensions</h2>
        <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-lg">&times;</button>
      </div>

      <div className="flex gap-1 px-4 py-2 border-b border-gray-800">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`text-xs px-2 py-1 rounded ${
              tab === t.key ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400'
            }`}
          >
            {t.label} ({t.count})
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-2 space-y-2">
        {loading && <p className="text-xs text-gray-500">Loading...</p>}

        {!loading && tab === 'mcp' && (
          <>
            {data?.mcpServers.length === 0 && (
              <div className="text-xs text-gray-500 py-4 text-center">
                <p>No MCP servers configured.</p>
                <p className="mt-1 text-gray-600">Add servers in ~/.claude/settings.json</p>
              </div>
            )}
            {data?.mcpServers.map(s => (
              <div key={s.name} className="p-2 bg-gray-800/50 rounded border border-gray-800">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] px-1.5 py-0.5 rounded font-bold bg-cyan-900 text-cyan-300">
                    {s.type.toUpperCase()}
                  </span>
                  <span className="text-sm font-medium text-gray-200">{s.name}</span>
                </div>
                {s.command && (
                  <p className="text-xs text-gray-500 mt-1 font-mono truncate">{s.command}</p>
                )}
                {s.url && (
                  <p className="text-xs text-gray-500 mt-1 font-mono truncate">{s.url}</p>
                )}
              </div>
            ))}
          </>
        )}

        {!loading && tab === 'plugins' && (
          <>
            {data?.plugins.map(p => (
              <div key={p.name} className="p-2 bg-gray-800/50 rounded border border-gray-800 flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${p.enabled ? 'bg-green-500' : 'bg-gray-600'}`} />
                <span className="text-sm text-gray-200 flex-1">{p.name}</span>
                <span className="text-[10px] text-gray-500">{p.enabled ? 'enabled' : 'disabled'}</span>
              </div>
            ))}
          </>
        )}

        {!loading && tab === 'hooks' && (
          <>
            {data?.hooks.length === 0 && (
              <div className="text-xs text-gray-500 py-4 text-center">
                <p>No hooks configured.</p>
                <p className="mt-1 text-gray-600">Use /hookify to create rules</p>
              </div>
            )}
            {data?.hooks.map((h, i) => (
              <div key={`${h.name}-${i}`} className="p-2 bg-gray-800/50 rounded border border-gray-800">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${h.enabled ? 'bg-green-500' : 'bg-gray-600'}`} />
                  <span className="text-sm font-medium text-gray-200 flex-1 truncate">{h.name}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                    h.source === 'hookify' ? 'bg-purple-900 text-purple-300' : 'bg-gray-700 text-gray-400'
                  }`}>
                    {h.source === 'hookify' ? 'RULE' : 'HOOK'}
                  </span>
                </div>
                <div className="flex gap-2 mt-1">
                  <span className="text-[10px] px-1 py-0.5 rounded bg-gray-700 text-gray-400">{h.event}</span>
                  {h.action && (
                    <span className={`text-[10px] px-1 py-0.5 rounded ${
                      h.action === 'block' ? 'bg-red-900 text-red-300' : 'bg-amber-900 text-amber-300'
                    }`}>
                      {h.action}
                    </span>
                  )}
                </div>
                {h.pattern && (
                  <p className="text-xs text-gray-500 mt-1 font-mono truncate">{h.pattern}</p>
                )}
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
