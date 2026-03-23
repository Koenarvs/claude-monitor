import { useState, useEffect, useCallback } from 'react';

interface DirectoryListing {
  current: string;
  parent: string | null;
  directories: string[];
  drives?: string[];
}

interface Props {
  open: boolean;
  initialPath: string;
  onSelect: (path: string) => void;
  onCancel: () => void;
}

export function FolderBrowser({ open, initialPath, onSelect, onCancel }: Props) {
  const [listing, setListing] = useState<DirectoryListing | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const navigate = useCallback(async (path: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/directories?path=${encodeURIComponent(path)}`);
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Failed to read directory');
        setLoading(false);
        return;
      }
      const data: DirectoryListing = await res.json();
      setListing(data);
    } catch {
      setError('Failed to connect to server');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (open) {
      // Empty path tells server to use home directory
      navigate(initialPath || '');
    }
  }, [open, initialPath, navigate]);

  if (!open) return null;

  const breadcrumbs = listing?.current.split('/').filter(Boolean) || [];

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onCancel();
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60]"
      onClick={onCancel}
      onKeyDown={handleKeyDown}
    >
      <div
        className="bg-gray-900 border border-gray-700 rounded-lg w-[500px] max-w-[90vw] max-h-[70vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-gray-800">
          <h3 className="text-sm font-semibold text-gray-100 mb-2">Select Folder</h3>

          {/* Drive buttons (Windows) */}
          {listing?.drives && listing.drives.length > 0 && (
            <div className="flex gap-1 mb-2 flex-wrap">
              {listing.drives.map((drive) => (
                <button
                  key={drive}
                  onClick={() => navigate(`${drive}/`)}
                  className={`text-xs px-2 py-1 rounded ${
                    listing.current.startsWith(drive)
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                  }`}
                >
                  {drive}
                </button>
              ))}
            </div>
          )}

          {/* Breadcrumb */}
          <div className="flex items-center gap-1 text-xs text-gray-400 flex-wrap">
            <button
              onClick={() => {
                const root = listing?.drives ? `${listing.current.slice(0, 2)}/` : '/';
                navigate(root);
              }}
              className="hover:text-gray-200"
            >
              /
            </button>
            {breadcrumbs.map((seg, i) => {
              const pathUpTo = breadcrumbs.slice(0, i + 1).join('/');
              const fullPath = listing?.current.match(/^[A-Za-z]:/)
                ? `${listing.current.slice(0, 2)}/${pathUpTo}`
                : `/${pathUpTo}`;
              return (
                <span key={i} className="flex items-center gap-1">
                  <span className="text-gray-600">/</span>
                  <button onClick={() => navigate(fullPath)} className="hover:text-gray-200">
                    {seg}
                  </button>
                </span>
              );
            })}
          </div>
        </div>

        {/* Directory list */}
        <div className="flex-1 overflow-y-auto px-2 py-1 min-h-[200px]">
          {loading && (
            <p className="text-xs text-gray-500 p-2">Loading...</p>
          )}
          {error && (
            <p className="text-xs text-red-400 p-2">{error}</p>
          )}
          {!loading && !error && listing && (
            <>
              {listing.parent && (
                <button
                  onClick={() => navigate(listing.parent!)}
                  className="w-full text-left px-3 py-1.5 text-sm text-gray-400 hover:bg-gray-800 rounded flex items-center gap-2"
                >
                  <span className="text-gray-600">..</span>
                  <span>Parent directory</span>
                </button>
              )}
              {listing.directories.map((dir) => (
                <button
                  key={dir}
                  onClick={() => navigate(listing.current.endsWith('/') ? listing.current + dir : listing.current + '/' + dir)}
                  className="w-full text-left px-3 py-1.5 text-sm text-gray-200 hover:bg-gray-800 rounded truncate"
                >
                  {dir}
                </button>
              ))}
              {listing.directories.length === 0 && (
                <p className="text-xs text-gray-500 p-2">No subdirectories</p>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-gray-800 flex justify-between items-center">
          <span className="text-xs text-gray-500 truncate max-w-[300px]">
            {listing?.current || ''}
          </span>
          <div className="flex gap-2">
            <button onClick={onCancel} className="px-3 py-1.5 text-sm text-gray-400 hover:text-gray-200">
              Cancel
            </button>
            <button
              onClick={() => listing && onSelect(listing.current)}
              disabled={!listing}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 rounded text-sm text-white"
            >
              Select
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
