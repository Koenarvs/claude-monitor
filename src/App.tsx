import { useState, useEffect } from 'react';
import { SessionProvider, useSessionState } from './context/SessionContext';
import { useSessionSocket } from './hooks/useSessionSocket';
import { IconSidebar } from './components/IconSidebar';
import { MainPanel } from './components/MainPanel';
import { SpawnDialog } from './components/SpawnDialog';
import { ToolbarButton } from './components/ToolbarButton';
import { SkillsBrowser } from './components/SkillsBrowser';
import { requestNotificationPermission, notifySessionNeedsAttention, updateTabTitle } from './utils/notifications';
import type { PermissionMode } from './types';

function AppContent() {
  const [spawnOpen, setSpawnOpen] = useState(false);
  const [skillsOpen, setSkillsOpen] = useState(false);
  const { sendInput, approve, deny } = useSessionSocket();
  const { sessions } = useSessionState();

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

  const handleSpawn = async (cwd: string, prompt: string, permissionMode: PermissionMode) => {
    try {
      await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cwd, prompt, permissionMode }),
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

  return (
    <div className="flex h-screen bg-gray-950 text-gray-100">
      <IconSidebar onNewSession={() => setSpawnOpen(true)} />
      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex items-center gap-1 px-2 py-1 border-b border-gray-800 bg-gray-900/50">
          <ToolbarButton label="Skills & Agents" icon="⚡" active={skillsOpen} onClick={() => setSkillsOpen(!skillsOpen)} />
        </div>
        <div className="flex-1 flex min-h-0">
          <MainPanel
            onNewSession={() => setSpawnOpen(true)}
            sendInput={sendInput}
            approve={approve}
            deny={deny}
            onClose={handleClose}
            onRetry={handleRetry}
            onRename={handleRename}
          />
          <SkillsBrowser open={skillsOpen} onClose={() => setSkillsOpen(false)} />
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
