import { useEffect, useRef, useCallback } from 'react';
import { useSessionDispatch } from '../context/SessionContext';
import { notifySessionNeedsAttention } from '../utils/notifications';

export function useSessionSocket() {
  const dispatch = useSessionDispatch();
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const reconnectDelay = useRef(1000);

  const connect = useCallback(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${protocol}//${window.location.host}/ws`;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      reconnectDelay.current = 1000;
    };

    ws.onmessage = (e) => {
      const { event, data } = JSON.parse(e.data);

      switch (event) {
        case 'init':
          dispatch({ type: 'INIT', sessions: data.sessions });
          break;
        case 'session:created':
          dispatch({ type: 'SESSION_CREATED', session: data.session });
          break;
        case 'session:status':
          dispatch({
            type: 'SESSION_STATUS',
            id: data.id,
            status: data.status,
            cost: data.cost,
            lastActivityAt: data.lastActivityAt,
          });
          if (data.status === 'needs_input' || data.status === 'waiting_approval') {
            notifySessionNeedsAttention(data.id, data.status === 'needs_input' ? 'Ready for input' : 'Approval needed');
          }
          break;
        case 'session:message':
          dispatch({ type: 'SESSION_MESSAGE', id: data.id, message: data.message });
          break;
        case 'session:approval':
          dispatch({ type: 'SESSION_APPROVAL', id: data.id, message: data.message });
          break;
        case 'session:renamed':
          dispatch({ type: 'RENAME_SESSION', id: data.id, name: data.name });
          break;
        case 'session:subagent':
          dispatch({ type: 'SESSION_SUBAGENT', id: data.id, subagent: data.subagent });
          break;
        case 'session:compaction':
          dispatch({ type: 'SESSION_COMPACTION', id: data.id, compactionCount: data.compactionCount });
          notifySessionNeedsAttention(data.id, `Context compacted (#${data.compactionCount})`);
          break;
        case 'session:removed':
          dispatch({ type: 'SESSION_REMOVED', id: data.id });
          break;
      }
    };

    ws.onclose = () => {
      reconnectTimer.current = setTimeout(() => {
        reconnectDelay.current = Math.min(reconnectDelay.current * 2, 30000);
        connect();
      }, reconnectDelay.current);
    };
  }, [dispatch]);

  useEffect(() => {
    connect();
    return () => {
      clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [connect]);

  const send = useCallback((event: string, data: unknown) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ event, data }));
    }
  }, []);

  const sendInput = useCallback((id: string, text: string) => send('session:input', { id, text }), [send]);
  const approve = useCallback((id: string, requestId: string) => send('session:approve', { id, requestId }), [send]);
  const deny = useCallback((id: string, requestId: string) => send('session:deny', { id, requestId }), [send]);

  return { sendInput, approve, deny };
}
