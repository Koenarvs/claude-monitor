import { SessionProvider } from './context/SessionContext';

export function App() {
  return (
    <SessionProvider>
      <div className="flex h-screen bg-gray-950 text-gray-100">
        <div className="w-12 bg-gray-900 border-r border-gray-800 flex flex-col items-center py-2">
          {/* IconSidebar placeholder */}
          <div className="w-8 h-8 rounded bg-gray-700 flex items-center justify-center text-xs">+</div>
        </div>
        <div className="flex-1 flex items-center justify-center text-gray-500">
          <p>Claude Monitor — No sessions yet. Click + to start one.</p>
        </div>
      </div>
    </SessionProvider>
  );
}
