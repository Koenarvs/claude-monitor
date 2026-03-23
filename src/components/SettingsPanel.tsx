import { useState, useEffect, useCallback } from 'react';
import { FolderBrowser } from './FolderBrowser';

interface WorkingDirectory {
  label: string;
  path: string;
}

interface Config {
  defaultCwd: string;
  defaultPermissionMode: string;
  workingDirectories: WorkingDirectory[];
  vaultPath: string;
  maxSessions: number;
  approvalTimeoutMinutes: number;
}

type BrowseTarget =
  | { field: 'defaultCwd' }
  | { field: 'vaultPath' }
  | { field: 'directory'; index: number };

interface Props {
  open: boolean;
  onClose: () => void;
}

function Tooltip({ text }: { text: string }) {
  return (
    <span className="relative group ml-1 cursor-help">
      <span className="text-gray-500 text-xs">?</span>
      <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 bg-gray-800 border border-gray-700 rounded text-xs text-gray-300 whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-[70]">
        {text}
      </span>
    </span>
  );
}

const defaultConfig: Config = {
  defaultCwd: '',
  defaultPermissionMode: 'autonomous',
  workingDirectories: [],
  vaultPath: '',
  maxSessions: 10,
  approvalTimeoutMinutes: 30,
};

export function SettingsPanel({ open, onClose }: Props) {
  const [original, setOriginal] = useState<Config>(defaultConfig);
  const [config, setConfig] = useState<Config>(defaultConfig);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [browseTarget, setBrowseTarget] = useState<BrowseTarget | null>(null);
  const [showDiscard, setShowDiscard] = useState(false);

  const isDirty = JSON.stringify(config) !== JSON.stringify(original);

  const loadConfig = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/config');
      if (!res.ok) throw new Error('Failed to load config');
      const data: Config = await res.json();
      setOriginal(data);
      setConfig(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load config');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (open) {
      loadConfig();
    }
  }, [open, loadConfig]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !browseTarget) {
        handleCancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, browseTarget, isDirty]);

  const handleCancel = () => {
    if (isDirty) {
      setShowDiscard(true);
    } else {
      onClose();
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to save config');
      }
      setOriginal(config);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save config');
    }
    setSaving(false);
  };

  const handleBrowseSelect = (path: string) => {
    if (!browseTarget) return;
    if (browseTarget.field === 'defaultCwd') {
      setConfig((c) => ({ ...c, defaultCwd: path }));
    } else if (browseTarget.field === 'vaultPath') {
      setConfig((c) => ({ ...c, vaultPath: path }));
    } else if (browseTarget.field === 'directory') {
      const dirs = [...config.workingDirectories];
      dirs[browseTarget.index] = { ...dirs[browseTarget.index], path };
      setConfig((c) => ({ ...c, workingDirectories: dirs }));
    }
    setBrowseTarget(null);
  };

  const addDirectory = () => {
    setConfig((c) => ({
      ...c,
      workingDirectories: [...c.workingDirectories, { label: '', path: '' }],
    }));
  };

  const removeDirectory = (index: number) => {
    setConfig((c) => ({
      ...c,
      workingDirectories: c.workingDirectories.filter((_, i) => i !== index),
    }));
  };

  const updateDirectory = (index: number, field: 'label' | 'path', value: string) => {
    const dirs = [...config.workingDirectories];
    dirs[index] = { ...dirs[index], [field]: value };
    setConfig((c) => ({ ...c, workingDirectories: dirs }));
  };

  const getBrowseInitialPath = (): string => {
    if (!browseTarget) return '';
    if (browseTarget.field === 'defaultCwd') return config.defaultCwd;
    if (browseTarget.field === 'vaultPath') return config.vaultPath;
    if (browseTarget.field === 'directory') {
      return config.workingDirectories[browseTarget.index]?.path || '';
    }
    return '';
  };

  if (!open) return null;

  return (
    <>
      {/* Main overlay */}
      <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
        <div className="bg-gray-900 border border-gray-700 rounded-lg w-[640px] max-w-[95vw] max-h-[90vh] flex flex-col">
          {/* Header */}
          <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between">
            <h2 className="text-base font-semibold text-gray-100">Settings</h2>
            <button
              onClick={handleCancel}
              className="text-gray-500 hover:text-gray-300 text-lg leading-none"
              aria-label="Close settings"
            >
              ✕
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
            {loading && (
              <p className="text-sm text-gray-500">Loading...</p>
            )}

            {!loading && (
              <>
                {/* General section */}
                <section>
                  <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                    General
                  </h3>
                  <div className="space-y-4">
                    {/* Default Working Directory */}
                    <div>
                      <label className="flex items-center text-sm text-gray-300 mb-1">
                        Default Working Directory
                        <Tooltip text="The default directory used when spawning new Claude sessions" />
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={config.defaultCwd}
                          onChange={(e) => setConfig((c) => ({ ...c, defaultCwd: e.target.value }))}
                          className="flex-1 bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-blue-500"
                          placeholder="~"
                        />
                        <button
                          onClick={() => setBrowseTarget({ field: 'defaultCwd' })}
                          className="px-3 py-1.5 bg-gray-800 border border-gray-700 rounded text-sm text-gray-400 hover:text-gray-200 hover:bg-gray-700"
                          title="Browse"
                        >
                          📂
                        </button>
                      </div>
                    </div>

                    {/* Default Permission Mode */}
                    <div>
                      <label className="flex items-center text-sm text-gray-300 mb-1">
                        Default Permission Mode
                        <Tooltip text="Autonomous: Claude acts without approval. Supervised: Claude asks before each tool use." />
                      </label>
                      <select
                        value={config.defaultPermissionMode}
                        onChange={(e) => setConfig((c) => ({ ...c, defaultPermissionMode: e.target.value }))}
                        className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-blue-500"
                      >
                        <option value="autonomous">Autonomous</option>
                        <option value="supervised">Supervised</option>
                      </select>
                    </div>

                    {/* Max Concurrent Sessions */}
                    <div>
                      <label className="flex items-center text-sm text-gray-300 mb-1">
                        Max Concurrent Sessions
                        <Tooltip text="Maximum number of Claude sessions that can run simultaneously (1–20)" />
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={20}
                        value={config.maxSessions}
                        onChange={(e) =>
                          setConfig((c) => ({
                            ...c,
                            maxSessions: Math.max(1, Math.min(20, Number(e.target.value))),
                          }))
                        }
                        className="w-32 bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-blue-500"
                      />
                    </div>

                    {/* Approval Timeout */}
                    <div>
                      <label className="flex items-center text-sm text-gray-300 mb-1">
                        Approval Timeout (minutes)
                        <Tooltip text="How long to wait for tool-use approval before timing out (1–120 minutes)" />
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={120}
                        value={config.approvalTimeoutMinutes}
                        onChange={(e) =>
                          setConfig((c) => ({
                            ...c,
                            approvalTimeoutMinutes: Math.max(1, Math.min(120, Number(e.target.value))),
                          }))
                        }
                        className="w-32 bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-blue-500"
                      />
                    </div>
                  </div>
                </section>

                {/* Saved Directories section */}
                <section>
                  <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                    Saved Directories
                  </h3>
                  <div className="space-y-2">
                    {config.workingDirectories.map((dir, index) => (
                      <div key={index} className="flex gap-2 items-center">
                        <input
                          type="text"
                          value={dir.label}
                          onChange={(e) => updateDirectory(index, 'label', e.target.value)}
                          placeholder="Label"
                          className="w-32 bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-blue-500"
                        />
                        <input
                          type="text"
                          value={dir.path}
                          onChange={(e) => updateDirectory(index, 'path', e.target.value)}
                          placeholder="Path"
                          className="flex-1 bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-blue-500"
                        />
                        <button
                          onClick={() => setBrowseTarget({ field: 'directory', index })}
                          className="px-3 py-1.5 bg-gray-800 border border-gray-700 rounded text-sm text-gray-400 hover:text-gray-200 hover:bg-gray-700"
                          title="Browse"
                        >
                          📂
                        </button>
                        <button
                          onClick={() => removeDirectory(index)}
                          className="px-2 py-1.5 text-gray-500 hover:text-red-400"
                          title="Remove"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                    <button
                      onClick={addDirectory}
                      className="text-sm text-blue-400 hover:text-blue-300 mt-1"
                    >
                      + Add Directory
                    </button>
                  </div>
                </section>

                {/* Vault Logging section */}
                <section>
                  <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                    Vault Logging
                  </h3>
                  <div>
                    <label className="flex items-center text-sm text-gray-300 mb-1">
                      Vault Path
                      <Tooltip text="Path to your Obsidian vault for session logging. Leave empty to disable." />
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={config.vaultPath}
                        onChange={(e) => setConfig((c) => ({ ...c, vaultPath: e.target.value }))}
                        placeholder="Leave empty to disable"
                        className="flex-1 bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-blue-500"
                      />
                      <button
                        onClick={() => setBrowseTarget({ field: 'vaultPath' })}
                        className="px-3 py-1.5 bg-gray-800 border border-gray-700 rounded text-sm text-gray-400 hover:text-gray-200 hover:bg-gray-700"
                        title="Browse"
                      >
                        📂
                      </button>
                    </div>
                  </div>
                </section>
              </>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-gray-800">
            {error && (
              <div className="mb-3 px-3 py-2 bg-red-900/40 border border-red-800 rounded text-sm text-red-300">
                {error}
              </div>
            )}
            <div className="flex justify-end gap-3">
              <button
                onClick={handleCancel}
                className="px-4 py-2 text-sm text-gray-400 hover:text-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 rounded text-sm text-white"
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Discard confirmation overlay */}
      {showDiscard && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[60]">
          <div className="bg-gray-900 border border-gray-700 rounded-lg px-6 py-5 w-[340px] max-w-[90vw]">
            <p className="text-sm text-gray-200 mb-4">Discard unsaved changes?</p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowDiscard(false)}
                className="px-4 py-2 text-sm text-gray-400 hover:text-gray-200"
              >
                Keep Editing
              </button>
              <button
                onClick={() => {
                  setShowDiscard(false);
                  onClose();
                }}
                className="px-4 py-2 bg-red-700 hover:bg-red-600 rounded text-sm text-white"
              >
                Discard
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Folder browser */}
      <FolderBrowser
        open={browseTarget !== null}
        initialPath={getBrowseInitialPath()}
        onSelect={handleBrowseSelect}
        onCancel={() => setBrowseTarget(null)}
      />
    </>
  );
}
