import { useState, useEffect } from 'react';
import { SessionProvider, useSessionState } from './context/SessionContext';
import { useSessionSocket } from './hooks/useSessionSocket';
import { IconSidebar } from './components/IconSidebar';
import { MainPanel } from './components/MainPanel';
import { ErrorBoundary } from './components/ErrorBoundary';
import { SpawnDialog } from './components/SpawnDialog';
import { ToolbarButton } from './components/ToolbarButton';
import { SkillsBrowser } from './components/SkillsBrowser';
import { ClaudeMdPanel } from './components/ClaudeMdPanel';
import { ExtensionsPanel } from './components/ExtensionsPanel';
import { requestNotificationPermission, notifySessionNeedsAttention, updateTabTitle } from './utils/notifications';
import type { PermissionMode } from './types';

function AppContent() {
  const [spawnOpen, setSpawnOpen] = useState(false);
  const [skillsOpen, setSkillsOpen] = useState(false);
  const [claudeMdOpen, setClaudeMdOpen] = useState(false);
  const [extensionsOpen, setExtensionsOpen] = useState(false);
  const { sendInput, approve, deny } = useSessionSocket();
  const { sessions, activeSessionId } = useSessionState();
  const activeSession = activeSessionId ? sessions.get(activeSessionId) : undefined;

  useEffect(() => {
    requestNotificationPermission();
  }, []);

  // Tab title + notifications
  useEffect(() => {
    const attentionStatuses = ['needs_input', 'waiting_approval'];
    let count = 0;
    for (const s of sessions.values()) {
      if (attentionStatuses.includes(s.status)) count++;
    }
    updateTabTitle(count);
  }, [sessions]);

  const handleSpawn = async (cwd: string, prompt: string, permissionMode: PermissionMode, includeContext: boolean) => {
    try {
      await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cwd, prompt, permissionMode, includeContext }),
      });
    } catch (err) {
      console.error('Failed to spawn session:', err);
    }
  };

  const handleClose = async (id: string) => {
    await fetch(`/api/sessions/${id}`, { method: 'DELETE' });
  };

  const handleRetry = async (id: string) => {
    await fetch(`/api/sessions/${id}/retry`, { method: 'POST' });
  };

  const handleRename = async (id: string, name: string) => {
    await fetch(`/api/sessions/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
  };

  const handleRefineSkill = async (skill: { name: string; path: string; type: 'skill' | 'agent' }) => {
    const parentDir = skill.path.replace(/[\\/][^\\/]+$/, '').replace(/[\\/][^\\/]+$/, '');
    const prompt = `/skill-creator Optimize the "${skill.name}" ${skill.type}. The ${skill.type} is located at ${skill.path}. Run the eval loop to test trigger accuracy, then refine the description for better triggering. Show results after each iteration.`;
    try {
      await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cwd: parentDir,
          prompt,
          permissionMode: 'autonomous',
          includeContext: false,
        }),
      });
    } catch (err) {
      console.error('Failed to spawn refine session:', err);
    }
  };

  return (
    <div className="flex h-screen bg-gray-950 text-gray-100">
      <IconSidebar onNewSession={() => setSpawnOpen(true)} />
      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex items-center gap-1 px-2 py-1 border-b border-gray-800 bg-gray-900/50">
          <ToolbarButton label="Skills & Agents" icon="/icons/skills.png" active={skillsOpen} onClick={() => setSkillsOpen(!skillsOpen)} />
          <ToolbarButton label="CLAUDE.md" icon="/icons/dashboard.png" active={claudeMdOpen} onClick={() => setClaudeMdOpen(!claudeMdOpen)} />
          <ToolbarButton label="Extensions" icon="/icons/extensions.png" active={extensionsOpen} onClick={() => setExtensionsOpen(!extensionsOpen)} />
        </div>
        <div className="flex-1 flex min-h-0">
          <ErrorBoundary fallback={<div className="flex-1 flex items-center justify-center text-gray-500">Session panel crashed. Click Try again.</div>}>
            <MainPanel
              onNewSession={() => setSpawnOpen(true)}
              sendInput={sendInput}
              approve={approve}
              deny={deny}
              onClose={handleClose}
              onRetry={handleRetry}
              onRename={handleRename}
            />
          </ErrorBoundary>
          <SkillsBrowser open={skillsOpen} onClose={() => setSkillsOpen(false)} onRefine={handleRefineSkill} />
          <ClaudeMdPanel open={claudeMdOpen} onClose={() => setClaudeMdOpen(false)} cwd={activeSession?.cwd ?? null} />
          <ExtensionsPanel open={extensionsOpen} onClose={() => setExtensionsOpen(false)} />
        </div>
      </div>
      <SpawnDialog
        open={spawnOpen}
        onClose={() => setSpawnOpen(false)}
        onSpawn={handleSpawn}
      />
    </div>
  );
}

export function App() {
  return (
    <SessionProvider>
      <AppContent />
    </SessionProvider>
  );
}
