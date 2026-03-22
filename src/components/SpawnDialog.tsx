import { useState, useEffect, type KeyboardEvent } from 'react';
import type { PermissionMode } from '../types';
import { ContextPreview } from './ContextPreview';

interface WorkingDirectory {
  label: string;
  path: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSpawn: (cwd: string, prompt: string, permissionMode: PermissionMode, includeContext: boolean) => void;
}

export function SpawnDialog({ open, onClose, onSpawn }: Props) {
  const [cwd, setCwd] = useState('');
  const [prompt, setPrompt] = useState('');
  const [mode, setMode] = useState<PermissionMode>('autonomous');
  const [includeContext, setIncludeContext] = useState(true);
  const [directories, setDirectories] = useState<WorkingDirectory[]>([]);
  const [defaultCwd, setDefaultCwd] = useState('C:/Users/Koena');
  const [showDropdown, setShowDropdown] = useState(false);

  useEffect(() => {
    fetch('/api/config')
      .then(r => r.json())
      .then(config => {
        setDirectories(config.workingDirectories || []);
        setDefaultCwd(config.defaultCwd || 'C:/Users/Koena');
        if (!cwd) setCwd(config.defaultCwd || 'C:/Users/Koena');
        if (config.defaultPermissionMode) setMode(config.defaultPermissionMode);
      })
      .catch(() => {});
  }, []);

  if (!open) return null;

  const handleSpawn = () => {
    if (!cwd.trim() || !prompt.trim()) return;
    onSpawn(cwd.trim(), prompt.trim(), mode, includeContext);
    setPrompt('');
    onClose();
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      handleSpawn();
    }
    if (e.key === 'Escape') onClose();
  };

  const handleSelectDirectory = (path: string) => {
    setCwd(path);
    setShowDropdown(false);
  };

  // Filter directories based on current input
  const filtered = cwd
    ? directories.filter(d =>
        d.label.toLowerCase().includes(cwd.toLowerCase()) ||
        d.path.toLowerCase().includes(cwd.toLowerCase())
      )
    : directories;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-gray-900 border border-gray-700 rounded-lg p-6 w-[500px] max-w-[90vw] space-y-4"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <h2 className="text-lg font-semibold text-gray-100">New Session</h2>

        <div className="relative">
          <label className="text-xs text-gray-400 uppercase block mb-1">Working Directory</label>
          <div className="flex gap-1">
            <input
              className="flex-1 bg-gray-800 text-gray-100 px-3 py-2 rounded text-sm"
              value={cwd}
              onChange={(e) => { setCwd(e.target.value); setShowDropdown(true); }}
              onFocus={() => setShowDropdown(true)}
              placeholder="C:/Users/Koena/my-project"
            />
            {directories.length > 0 && (
              <button
                onClick={() => setShowDropdown(!showDropdown)}
                className="px-2 py-2 bg-gray-800 hover:bg-gray-700 rounded text-gray-400 text-sm"
                title="Saved directories"
              >
                ▾
              </button>
            )}
          </div>
          {showDropdown && filtered.length > 0 && (
            <div className="absolute z-10 mt-1 w-full bg-gray-800 border border-gray-700 rounded shadow-lg max-h-48 overflow-y-auto">
              {filtered.map(d => (
                <button
                  key={d.path}
                  onClick={() => handleSelectDirectory(d.path)}
                  className="w-full text-left px-3 py-2 hover:bg-gray-700 transition-colors"
                >
                  <div className="text-sm text-gray-200">{d.label}</div>
                  <div className="text-xs text-gray-500 truncate">{d.path}</div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div>
          <label className="text-xs text-gray-400 uppercase block mb-1">Prompt</label>
          <textarea
            className="w-full bg-gray-800 text-gray-100 px-3 py-2 rounded text-sm h-24 resize-none"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="What should Claude work on?"
            autoFocus
          />
        </div>

        <div>
          <label className="text-xs text-gray-400 uppercase block mb-1">Permission Mode</label>
          <div className="flex gap-3">
            <button
              onClick={() => setMode('autonomous')}
              className={`flex-1 py-2 rounded text-sm ${mode === 'autonomous' ? 'bg-green-700 text-white' : 'bg-gray-800 text-gray-400'}`}
            >
              Autonomous
            </button>
            <button
              onClick={() => setMode('supervised')}
              className={`flex-1 py-2 rounded text-sm ${mode === 'supervised' ? 'bg-amber-700 text-white' : 'bg-gray-800 text-gray-400'}`}
            >
              Supervised
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            {mode === 'autonomous'
              ? 'All tool calls execute without approval'
              : 'Tool calls require your approval'}
          </p>
        </div>

        <div>
          <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
            <input
              type="checkbox"
              checked={includeContext}
              onChange={(e) => setIncludeContext(e.target.checked)}
              className="rounded border-gray-600"
            />
            Include context from other sessions
          </label>
          <ContextPreview enabled={includeContext} />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-400 hover:text-gray-200">
            Cancel
          </button>
          <button
            onClick={handleSpawn}
            disabled={!cwd.trim() || !prompt.trim()}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 rounded text-sm text-white"
          >
            Start Session
          </button>
        </div>
      </div>
    </div>
  );
}
