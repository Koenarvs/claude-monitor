let notificationPermission: NotificationPermission = 'default';

export async function requestNotificationPermission(): Promise<void> {
  if ('Notification' in window) {
    notificationPermission = await Notification.requestPermission();
  }
}

export function notifySessionNeedsAttention(sessionName: string, reason: string): void {
  if (notificationPermission === 'granted' && document.hidden) {
    new Notification(`Claude Monitor: ${sessionName}`, {
      body: reason,
      icon: '/favicon.ico',
    });
  }
}

export function updateTabTitle(attentionCount: number): void {
  document.title = attentionCount > 0
    ? `(${attentionCount}) Claude Monitor`
    : 'Claude Monitor';
}
