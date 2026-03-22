import { useEffect, useState, useCallback } from 'react';

interface Props {
  open: boolean;
  onClose: () => void;
  cwd: string | null;   // Active session's cwd
}

export function ClaudeMdPanel({ open, onClose, cwd }: Props) {
  const [content, setContent] = useState('');
  const [original, setOriginal] = useState('');
  const [exists, setExists] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    if (!cwd) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/claude-md?cwd=${encodeURIComponent(cwd)}`);
      const data = await res.json();
      setContent(data.content);
      setOriginal(data.content);
      setExists(data.exists);
    } catch (err) {
      console.error('Failed to load CLAUDE.md:', err);
    } finally {
      setLoading(false);
    }
  }, [cwd]);

  useEffect(() => {
    if (open && cwd) load();
  }, [open, cwd, load]);

  const handleSave = async () => {
    if (!cwd) return;
    setSaving(true);
    try {
      await fetch('/api/claude-md', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cwd, content }),
      });
      setOriginal(content);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      console.error('Failed to save CLAUDE.md:', err);
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  const dirty = content !== original;

  return (
    <div className="w-96 border-l border-gray-800 bg-gray-900 flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
        <div>
          <h2 className="text-sm font-semibold text-gray-100">CLAUDE.md</h2>
          {cwd && <p className="text-[10px] text-gray-500 truncate max-w-[250px]">{cwd}</p>}
        </div>
        <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-lg">&times;</button>
      </div>

      {!cwd ? (
        <div className="flex-1 flex items-center justify-center text-gray-500 text-sm px-4">
          Select a session to view its CLAUDE.md
        </div>
      ) : loading ? (
        <div className="flex-1 flex items-center justify-center text-gray-500 text-sm">Loading...</div>
      ) : (
        <>
          {!exists && (
            <div className="px-4 py-2 bg-amber-900/20 border-b border-amber-800/30 text-xs text-amber-400">
              No CLAUDE.md found. Editing will create one.
            </div>
          )}
          <textarea
            className="flex-1 bg-gray-950 text-gray-200 text-sm font-mono p-4 resize-none focus:outline-none"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="# Project Instructions&#10;&#10;Add instructions for Claude Code sessions working in this project..."
          />
          <div className="flex items-center justify-between px-4 py-2 border-t border-gray-800">
            <span className="text-xs text-gray-500">
              {saved ? 'Saved!' : dirty ? 'Unsaved changes' : exists ? 'No changes' : 'New file'}
            </span>
            <button
              onClick={handleSave}
              disabled={!dirty || saving}
              className="px-3 py-1 text-xs bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 rounded text-white"
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
