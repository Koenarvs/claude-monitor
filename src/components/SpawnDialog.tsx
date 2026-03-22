import { useState, useEffect, type KeyboardEvent } from 'react';
import type { PermissionMode } from '../types';
import { ContextPreview } from './ContextPreview';

interface WorkingDirectory {
  label: string;
  path: string;
}

interface SkillInfo {
  name: string;
  description: string;
  type: 'skill' | 'agent';
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
  const [showDropdown, setShowDropdown] = useState(false);
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [selectedSkill, setSelectedSkill] = useState<string>('');
  const [showSkillDropdown, setShowSkillDropdown] = useState(false);
  const [skillFilter, setSkillFilter] = useState('');

  useEffect(() => {
    fetch('/api/config')
      .then(r => r.json())
      .then(config => {
        setDirectories(config.workingDirectories || []);
        if (!cwd) setCwd(config.defaultCwd || 'C:/Users/Koena');
        if (config.defaultPermissionMode) setMode(config.defaultPermissionMode);
      })
      .catch(() => {});

    fetch('/api/skills')
      .then(r => r.json())
      .then(setSkills)
      .catch(() => {});
  }, []);

  if (!open) return null;

  const handleSpawn = () => {
    if (!cwd.trim() || !prompt.trim()) return;

    let fullPrompt = prompt.trim();
    if (selectedSkill) {
      const skill = skills.find(s => s.name === selectedSkill);
      if (skill) {
        if (skill.type === 'skill') {
          fullPrompt = `/${selectedSkill} ${fullPrompt}`;
        } else {
          fullPrompt = `Use the ${selectedSkill} agent: ${fullPrompt}`;
        }
      }
    }

    onSpawn(cwd.trim(), fullPrompt, mode, includeContext);
    setPrompt('');
    setSelectedSkill('');
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

  const filteredDirs = cwd
    ? directories.filter(d =>
        d.label.toLowerCase().includes(cwd.toLowerCase()) ||
        d.path.toLowerCase().includes(cwd.toLowerCase())
      )
    : directories;

  const filteredSkills = skillFilter
    ? skills.filter(s =>
        s.name.toLowerCase().includes(skillFilter.toLowerCase()) ||
        s.description.toLowerCase().includes(skillFilter.toLowerCase())
      )
    : skills;

  const selectedSkillInfo = selectedSkill ? skills.find(s => s.name === selectedSkill) : null;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-gray-900 border border-gray-700 rounded-lg p-6 w-[500px] max-w-[90vw] space-y-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <h2 className="text-lg font-semibold text-gray-100">New Session</h2>

        {/* Working Directory */}
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
          {showDropdown && filteredDirs.length > 0 && (
            <div className="absolute z-10 mt-1 w-full bg-gray-800 border border-gray-700 rounded shadow-lg max-h-48 overflow-y-auto">
              {filteredDirs.map(d => (
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

        {/* Skill / Agent selector */}
        <div className="relative">
          <label className="text-xs text-gray-400 uppercase block mb-1">Skill / Agent (optional)</label>
          {selectedSkillInfo ? (
            <div className="flex items-center gap-2 bg-gray-800 rounded px-3 py-2">
              <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                selectedSkillInfo.type === 'skill' ? 'bg-purple-900 text-purple-300' : 'bg-teal-900 text-teal-300'
              }`}>
                {selectedSkillInfo.type === 'skill' ? 'SKL' : 'AGT'}
              </span>
              <span className="text-sm text-gray-200 flex-1">{selectedSkillInfo.name}</span>
              <button
                onClick={() => setSelectedSkill('')}
                className="text-gray-500 hover:text-gray-300 text-sm"
                title="Clear selection"
              >
                &times;
              </button>
            </div>
          ) : (
            <>
              <div className="flex gap-1">
                <input
                  className="flex-1 bg-gray-800 text-gray-100 px-3 py-2 rounded text-sm"
                  value={skillFilter}
                  onChange={(e) => { setSkillFilter(e.target.value); setShowSkillDropdown(true); }}
                  onFocus={() => setShowSkillDropdown(true)}
                  placeholder="Search skills & agents, or leave empty..."
                />
                {skills.length > 0 && (
                  <button
                    onClick={() => setShowSkillDropdown(!showSkillDropdown)}
                    className="px-2 py-2 bg-gray-800 hover:bg-gray-700 rounded text-gray-400 text-sm"
                    title="Browse skills & agents"
                  >
                    ▾
                  </button>
                )}
              </div>
              {showSkillDropdown && filteredSkills.length > 0 && (
                <div className="absolute z-10 mt-1 w-full bg-gray-800 border border-gray-700 rounded shadow-lg max-h-48 overflow-y-auto">
                  {filteredSkills.map(s => (
                    <button
                      key={s.name}
                      onClick={() => { setSelectedSkill(s.name); setSkillFilter(''); setShowSkillDropdown(false); }}
                      className="w-full text-left px-3 py-2 hover:bg-gray-700 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                          s.type === 'skill' ? 'bg-purple-900 text-purple-300' : 'bg-teal-900 text-teal-300'
                        }`}>
                          {s.type === 'skill' ? 'SKL' : 'AGT'}
                        </span>
                        <span className="text-sm text-gray-200">{s.name}</span>
                      </div>
                      {s.description && (
                        <p className="text-xs text-gray-500 mt-0.5 truncate">{s.description}</p>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Prompt */}
        <div>
          <label className="text-xs text-gray-400 uppercase block mb-1">Prompt</label>
          <textarea
            className="w-full bg-gray-800 text-gray-100 px-3 py-2 rounded text-sm h-24 resize-none"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={selectedSkillInfo
              ? `Instructions for /${selectedSkillInfo.name}...`
              : 'What should Claude work on?'}
            autoFocus
          />
        </div>

        {/* Permission Mode */}
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

        {/* Context injection */}
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

        {/* Actions */}
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
