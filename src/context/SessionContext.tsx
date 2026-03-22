import { createContext, useContext, useReducer, type ReactNode, type Dispatch } from 'react';
import type { SessionView, SessionStatus, Message } from '../types';

interface AppState {
  sessions: Map<string, SessionView>;
  activeSessionId: string | null;
}

type Action =
  | { type: 'INIT'; sessions: SessionView[] }
  | { type: 'SESSION_CREATED'; session: SessionView }
  | { type: 'SESSION_STATUS'; id: string; status: SessionStatus; cost?: number; lastActivityAt?: number }
  | { type: 'SESSION_MESSAGE'; id: string; message: Message }
  | { type: 'SESSION_APPROVAL'; id: string; message: Message }
  | { type: 'SESSION_REMOVED'; id: string }
  | { type: 'SET_ACTIVE'; id: string }
  | { type: 'RENAME_SESSION'; id: string; name: string };

function reducer(state: AppState, action: Action): AppState {
  const sessions = new Map(state.sessions);

  switch (action.type) {
    case 'INIT': {
      const map = new Map<string, SessionView>();
      for (const s of action.sessions) map.set(s.id, s);
      return { ...state, sessions: map };
    }
    case 'SESSION_CREATED': {
      sessions.set(action.session.id, action.session);
      const activeId = state.activeSessionId ?? action.session.id;
      return { sessions, activeSessionId: activeId };
    }
    case 'SESSION_STATUS': {
      const s = sessions.get(action.id);
      if (!s) return state;
      sessions.set(action.id, {
        ...s,
        status: action.status,
        cost: action.cost ?? s.cost,
        lastActivityAt: action.lastActivityAt ?? s.lastActivityAt,
      });
      return { ...state, sessions };
    }
    case 'SESSION_MESSAGE': {
      const s = sessions.get(action.id);
      if (!s) return state;
      // If message already exists (e.g. approval status update), replace it
      const existing = s.messages.findIndex(m => m.id === action.message.id);
      const updatedMessages = existing >= 0
        ? s.messages.map((m, i) => i === existing ? action.message : m)
        : [...s.messages, action.message];
      sessions.set(action.id, { ...s, messages: updatedMessages });
      return { ...state, sessions };
    }
    case 'SESSION_APPROVAL': {
      const s = sessions.get(action.id);
      if (!s) return state;
      sessions.set(action.id, {
        ...s,
        messages: [...s.messages, action.message],
        status: 'waiting_approval',
      });
      return { ...state, sessions };
    }
    case 'SESSION_REMOVED': {
      sessions.delete(action.id);
      const activeId = state.activeSessionId === action.id ? null : state.activeSessionId;
      return { sessions, activeSessionId: activeId };
    }
    case 'SET_ACTIVE':
      return { ...state, activeSessionId: action.id };
    case 'RENAME_SESSION': {
      const s = sessions.get(action.id);
      if (!s) return state;
      sessions.set(action.id, { ...s, name: action.name });
      return { ...state, sessions };
    }
    default:
      return state;
  }
}

const StateContext = createContext<AppState>({ sessions: new Map(), activeSessionId: null });
const DispatchContext = createContext<Dispatch<Action>>(() => {});

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, {
    sessions: new Map(),
    activeSessionId: null,
  });

  return (
    <StateContext.Provider value={state}>
      <DispatchContext.Provider value={dispatch}>
        {children}
      </DispatchContext.Provider>
    </StateContext.Provider>
  );
}

export function useSessionState() { return useContext(StateContext); }
export function useSessionDispatch() { return useContext(DispatchContext); }
