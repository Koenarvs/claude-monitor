import { useEffect, useState } from 'react';

interface SkillInfo {
  name: string;
  description: string;
  path: string;
  type: 'skill' | 'agent';
  scope: 'global' | 'project';
}

interface Props {
  open: boolean;
  onClose: () => void;
  onRefine: (skill: { name: string; path: string; type: 'skill' | 'agent' }) => void;
}

export function SkillsBrowser({ open, onClose, onRefine }: Props) {
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [filter, setFilter] = useState<'all' | 'skill' | 'agent'>('all');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch('/api/skills')
      .then(r => r.json())
      .then(setSkills)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [open]);

  if (!open) return null;

  const filtered = filter === 'all' ? skills : skills.filter(s => s.type === filter);
  const skillCount = skills.filter(s => s.type === 'skill').length;
  const agentCount = skills.filter(s => s.type === 'agent').length;

  return (
    <div className="w-80 border-l border-gray-800 bg-gray-900 flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
        <h2 className="text-sm font-semibold text-gray-100">Skills & Agents</h2>
        <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-lg">&times;</button>
      </div>

      <div className="flex gap-1 px-4 py-2 border-b border-gray-800">
        {(['all', 'skill', 'agent'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`text-xs px-2 py-1 rounded ${
              filter === f ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400'
            }`}
          >
            {f === 'all' ? `All (${skills.length})` : f === 'skill' ? `Skills (${skillCount})` : `Agents (${agentCount})`}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-2 space-y-2">
        {loading && <p className="text-xs text-gray-500">Loading...</p>}
        {filtered.map(s => (
          <div key={s.path} className="p-2 bg-gray-800/50 rounded border border-gray-800">
            <div className="flex items-center gap-2">
              <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                s.type === 'skill' ? 'bg-purple-900 text-purple-300' : 'bg-teal-900 text-teal-300'
              }`}>
                {s.type === 'skill' ? 'SKL' : 'AGT'}
              </span>
              <span className="text-sm font-medium text-gray-200 truncate flex-1">{s.name}</span>
              {s.scope === 'project' && (
                <span className="text-[9px] px-1 py-0.5 rounded bg-blue-900 text-blue-300 font-bold flex-shrink-0">PRJ</span>
              )}
            </div>
            {s.description && (
              <p className="text-xs text-gray-500 mt-1 line-clamp-2">{s.description}</p>
            )}
            <div className="flex justify-end mt-2">
              <button
                onClick={() => onRefine({ name: s.name, path: s.path, type: s.type })}
                className="text-[10px] px-2 py-1 bg-amber-800 hover:bg-amber-700 rounded text-amber-200 transition-colors"
                title={`Run /skill-creator to optimize ${s.name}'s description and evaluate performance`}
              >
                Refine
              </button>
            </div>
          </div>
        ))}
        {!loading && filtered.length === 0 && (
          <p className="text-xs text-gray-500">No {filter === 'all' ? 'skills or agents' : `${filter}s`} found.</p>
        )}
      </div>
    </div>
  );
}
