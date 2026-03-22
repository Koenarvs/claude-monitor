import { useState, useEffect } from 'react';
import { SessionProvider, useSessionState } from './context/SessionContext';
import { useSessionSocket } from './hooks/useSessionSocket';
import { IconSidebar } from './components/IconSidebar';
import { MainPanel } from './components/MainPanel';
import { SpawnDialog } from './components/SpawnDialog';
import { requestNotificationPermission, notifySessionNeedsAttention, updateTabTitle } from './utils/notifications';
import type { PermissionMode } from './types';

function AppContent() {
  const [spawnOpen, setSpawnOpen] = useState(false);
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
      <MainPanel
        onNewSession={() => setSpawnOpen(true)}
        sendInput={sendInput}
        approve={approve}
        deny={deny}
        onClose={handleClose}
        onRetry={handleRetry}
        onRename={handleRename}
      />
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
