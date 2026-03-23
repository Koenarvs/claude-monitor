# Settings Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a full-screen settings overlay with a server-side folder browser for configuring all Claude Monitor settings through the UI.

**Architecture:** A `GET /api/directories` endpoint serves directory listings for the folder browser. The `SettingsPanel` component loads config via `GET /api/config`, renders editable fields, and saves via `PUT /api/config`. The `FolderBrowser` component is a secondary overlay that calls the directory endpoint to navigate the filesystem.

**Tech Stack:** React 19, Express, zod, TypeScript, vitest

**Spec:** `docs/superpowers/specs/2026-03-22-settings-panel-design.md`

---

## File Structure

### New Files
- `server/directories.ts` — Directory listing logic (readdir, drive enumeration, path normalization)
- `src/components/SettingsPanel.tsx` — Full-screen settings overlay with all config fields
- `src/components/FolderBrowser.tsx` — Directory picker secondary overlay
- `tests/server/directories.test.ts` — Tests for directory listing logic
- `tests/client/SettingsPanel.test.tsx` — Tests for settings panel rendering and save

### Modified Files
- `server/validation.ts` — Export `safePath`, add `DirectoryQuerySchema`
- `server/index.ts` — Add `GET /api/directories` endpoint
- `src/App.tsx` — Add gear icon button (top-right), settings state, render `<SettingsPanel>`

---

## Task 1: Export safePath and add DirectoryQuerySchema

**Files:**
- Modify: `server/validation.ts`
- Create: `tests/server/directories.test.ts` (partial — schema tests only)

- [ ] **Step 1: Write failing test for DirectoryQuerySchema**

Create `tests/server/directories.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { DirectoryQuerySchema, safePath } from '../../server/validation.js';

describe('safePath', () => {
  it('accepts valid absolute path', () => {
    const result = safePath.safeParse('C:/Users/test');
    expect(result.success).toBe(true);
  });

  it('rejects path with .. traversal', () => {
    const result = safePath.safeParse('C:/Users/../Windows');
    expect(result.success).toBe(false);
  });

  it('rejects empty string', () => {
    const result = safePath.safeParse('');
    expect(result.success).toBe(false);
  });
});

describe('DirectoryQuerySchema', () => {
  it('accepts valid path', () => {
    const result = DirectoryQuerySchema.safeParse({ path: 'C:/Users' });
    expect(result.success).toBe(true);
  });

  it('rejects missing path', () => {
    const result = DirectoryQuerySchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('rejects path traversal', () => {
    const result = DirectoryQuerySchema.safeParse({ path: '/home/../etc' });
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd C:/Users/Koena/claude-monitor && npx vitest run tests/server/directories.test.ts`
Expected: FAIL — `safePath` and `DirectoryQuerySchema` not exported

- [ ] **Step 3: Export safePath and add DirectoryQuerySchema**

In `server/validation.ts`, change `const safePath` to `export const safePath` (line 4).

Add below the `AppConfigSchema` line:

```typescript
export const DirectoryQuerySchema = z.object({
  path: z.string().default('').refine(
    (p) => !p.split(/[\\/]/).includes('..'),
    { message: 'Path must not contain ".." segments' },
  ),
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd C:/Users/Koena/claude-monitor && npx vitest run tests/server/directories.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/validation.ts tests/server/directories.test.ts
git commit -m "feat: export safePath and add DirectoryQuerySchema"
```

---

## Task 2: Server-side directory listing logic

**Files:**
- Create: `server/directories.ts`
- Modify: `tests/server/directories.test.ts` (add listing tests)

- [ ] **Step 1: Write failing tests for listDirectories**

Append to `tests/server/directories.test.ts`:

```typescript
import { listDirectories } from '../../server/directories.js';
import { homedir } from 'os';

describe('listDirectories', () => {
  it('lists directories in home directory', async () => {
    const result = await listDirectories(homedir());
    expect(result.current).toBe(homedir().replace(/\\/g, '/'));
    expect(Array.isArray(result.directories)).toBe(true);
    expect(result.directories.length).toBeGreaterThan(0);
  });

  it('returns sorted directory names', async () => {
    const result = await listDirectories(homedir());
    const sorted = [...result.directories].sort((a, b) => a.localeCompare(b));
    expect(result.directories).toEqual(sorted);
  });

  it('sets parent to null for drive root', async () => {
    // On Windows, test C:/; on Unix, test /
    const root = process.platform === 'win32' ? 'C:/' : '/';
    const result = await listDirectories(root);
    expect(result.parent).toBeNull();
  });

  it('returns parent directory', async () => {
    const result = await listDirectories(homedir());
    expect(result.parent).toBeTruthy();
    expect(typeof result.parent).toBe('string');
  });

  it('normalizes paths to forward slashes', async () => {
    const result = await listDirectories(homedir());
    expect(result.current).not.toContain('\\');
    if (result.parent) {
      expect(result.parent).not.toContain('\\');
    }
  });

  it('throws for nonexistent path', async () => {
    await expect(listDirectories('/nonexistent/path/xyz123')).rejects.toThrow();
  });

  it('includes drives array on Windows', async () => {
    const result = await listDirectories(homedir());
    if (process.platform === 'win32') {
      expect(Array.isArray(result.drives)).toBe(true);
      expect(result.drives!.length).toBeGreaterThan(0);
      expect(result.drives).toContain('C:');
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd C:/Users/Koena/claude-monitor && npx vitest run tests/server/directories.test.ts`
Expected: FAIL — `listDirectories` not found

- [ ] **Step 3: Create directory listing module**

Create `server/directories.ts`:

```typescript
import { readdir, stat } from 'fs/promises';
import { join, dirname, resolve } from 'path';
import { homedir } from 'os';
import { existsSync } from 'fs';

export interface DirectoryListing {
  current: string;
  parent: string | null;
  directories: string[];
  drives?: string[];
}

function normalize(p: string): string {
  return p.replace(/\\/g, '/');
}

function isDriveRoot(p: string): boolean {
  // Windows drive root: C:/ or C:
  return /^[A-Za-z]:\/?$/.test(p);
}

function isFilesystemRoot(p: string): boolean {
  if (process.platform === 'win32') return isDriveRoot(p);
  return p === '/';
}

async function listDrives(): Promise<string[]> {
  if (process.platform !== 'win32') return [];
  const drives: string[] = [];
  for (let i = 65; i <= 90; i++) {
    const letter = String.fromCharCode(i);
    const drivePath = `${letter}:\\`;
    if (existsSync(drivePath)) {
      drives.push(`${letter}:`);
    }
  }
  return drives;
}

export async function listDirectories(dirPath: string): Promise<DirectoryListing> {
  // Resolve ~ to home directory (path.resolve doesn't handle this)
  const expanded = dirPath === '~' || dirPath.startsWith('~/') || dirPath.startsWith('~\\')
    ? join(homedir(), dirPath.slice(1))
    : dirPath;
  const resolved = resolve(expanded || homedir());
  const st = await stat(resolved);
  if (!st.isDirectory()) {
    throw new Error(`Not a directory: ${dirPath}`);
  }

  const entries = await readdir(resolved, { withFileTypes: true });
  const directories = entries
    .filter(e => e.isDirectory())
    .map(e => e.name)
    .sort((a, b) => a.localeCompare(b));

  const current = normalize(resolved);
  const parentRaw = dirname(resolved);
  const parent = isFilesystemRoot(resolved) ? null : normalize(parentRaw);

  const result: DirectoryListing = { current, parent, directories };

  if (process.platform === 'win32') {
    result.drives = await listDrives();
  }

  return result;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd C:/Users/Koena/claude-monitor && npx vitest run tests/server/directories.test.ts`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add server/directories.ts tests/server/directories.test.ts
git commit -m "feat: add server-side directory listing with drive enumeration"
```

---

## Task 3: Add GET /api/directories endpoint

**Files:**
- Modify: `server/index.ts:133` (add endpoint before Extensions section)

- [ ] **Step 1: Add the endpoint**

In `server/index.ts`, add after the PUT `/api/config` handler (after line 132) and before the Extensions comment (line 134):

```typescript
// Directory browser
app.get('/api/directories', async (req, res) => {
  const parsed = DirectoryQuerySchema.safeParse({ path: req.query.path });
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0].message });
    return;
  }
  try {
    const listing = await listDirectories(parsed.data.path);
    res.json(listing);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('EACCES') || message.includes('permission')) {
      res.status(403).json({ error: 'Permission denied' });
    } else {
      res.status(400).json({ error: message });
    }
  }
});
```

Add imports at top of `server/index.ts`:

```typescript
import { DirectoryQuerySchema } from './validation.js';
import { listDirectories } from './directories.js';
```

Update the existing validation import line to include `DirectoryQuerySchema`:

```typescript
import { SpawnSessionSchema, RenameSessionSchema, UpdateClaudeMdSchema, SaveConfigSchema, DirectoryQuerySchema } from './validation.js';
```

And add:

```typescript
import { listDirectories } from './directories.js';
```

Also clean up the existing import on line 10 — remove the unused `clearConfigCache`:

```typescript
import { loadConfig, saveConfig } from './config.js';
```

- [ ] **Step 2: Run full test suite**

Run: `cd C:/Users/Koena/claude-monitor && npx vitest run`
Expected: All pass

- [ ] **Step 3: Manual verification**

```bash
curl "http://localhost:3002/api/directories?path=C:/" 2>/dev/null | head -c 500
```

Expected: JSON with `current`, `parent`, `directories`, `drives` fields.

- [ ] **Step 4: Commit**

```bash
git add server/index.ts
git commit -m "feat: add GET /api/directories endpoint for folder browser"
```

---

## Task 4: FolderBrowser component

**Files:**
- Create: `src/components/FolderBrowser.tsx`

- [ ] **Step 1: Create FolderBrowser component**

Create `src/components/FolderBrowser.tsx`:

```tsx
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
```

- [ ] **Step 2: Verify typecheck**

Run: `cd C:/Users/Koena/claude-monitor && npx tsc --noEmit`
Expected: Clean

- [ ] **Step 3: Commit**

```bash
git add src/components/FolderBrowser.tsx
git commit -m "feat: add FolderBrowser component with drive support and breadcrumbs"
```

---

## Task 5: SettingsPanel component

**Files:**
- Create: `src/components/SettingsPanel.tsx`
- Create: `tests/client/SettingsPanel.test.tsx`

- [ ] **Step 1: Create SettingsPanel component**

Create `src/components/SettingsPanel.tsx`:

```tsx
import { useState, useEffect, useCallback } from 'react';
import { FolderBrowser } from './FolderBrowser';

interface WorkingDirectory {
  label: string;
  path: string;
}

interface AppConfig {
  defaultCwd: string;
  defaultPermissionMode: 'autonomous' | 'supervised';
  workingDirectories: WorkingDirectory[];
  vaultPath: string;
  maxSessions: number;
  approvalTimeoutMinutes: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
}

type BrowseTarget = { field: 'defaultCwd' } | { field: 'vaultPath' } | { field: 'directory'; index: number };

function Tooltip({ text }: { text: string }) {
  return (
    <span className="relative group ml-1 cursor-help">
      <span className="text-gray-500 text-xs">?</span>
      <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 bg-gray-800 border border-gray-700 rounded text-xs text-gray-300 whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-[70]">
        {text}
      </span>
    </span>
  );
}

export function SettingsPanel({ open, onClose }: Props) {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [original, setOriginal] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [browseTarget, setBrowseTarget] = useState<BrowseTarget | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  useEffect(() => {
    if (!open) return;
    fetch('/api/config')
      .then((r) => r.json())
      .then((data: AppConfig) => {
        setConfig(data);
        setOriginal(JSON.stringify(data));
        setError(null);
      })
      .catch(() => setError('Failed to load config'));
  }, [open]);

  const isDirty = config && JSON.stringify(config) !== original;

  const handleClose = useCallback(() => {
    if (isDirty) {
      setConfirmDiscard(true);
    } else {
      onClose();
    }
  }, [isDirty, onClose]);

  const handleSave = async () => {
    if (!config) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Failed to save');
        setSaving(false);
        return;
      }
      setSaving(false);
      onClose();
    } catch {
      setError('Failed to save config');
      setSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape' && !browseTarget) {
      handleClose();
    }
  };

  const updateField = <K extends keyof AppConfig>(key: K, value: AppConfig[K]) => {
    setConfig((prev) => prev ? { ...prev, [key]: value } : prev);
  };

  const updateDirectory = (index: number, field: 'label' | 'path', value: string) => {
    setConfig((prev) => {
      if (!prev) return prev;
      const dirs = [...prev.workingDirectories];
      dirs[index] = { ...dirs[index], [field]: value };
      return { ...prev, workingDirectories: dirs };
    });
  };

  const addDirectory = () => {
    setConfig((prev) => {
      if (!prev) return prev;
      return { ...prev, workingDirectories: [...prev.workingDirectories, { label: '', path: '' }] };
    });
  };

  const removeDirectory = (index: number) => {
    setConfig((prev) => {
      if (!prev) return prev;
      const dirs = prev.workingDirectories.filter((_, i) => i !== index);
      return { ...prev, workingDirectories: dirs };
    });
  };

  const handleBrowseSelect = (path: string) => {
    if (!browseTarget || !config) return;
    if (browseTarget.field === 'defaultCwd') {
      updateField('defaultCwd', path);
    } else if (browseTarget.field === 'vaultPath') {
      updateField('vaultPath', path);
    } else if (browseTarget.field === 'directory') {
      updateDirectory(browseTarget.index, 'path', path);
    }
    setBrowseTarget(null);
  };

  if (!open) return null;

  return (
    <>
      <div
        className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
        onClick={handleClose}
        onKeyDown={handleKeyDown}
      >
        <div
          className="bg-gray-900 border border-gray-700 rounded-lg w-[560px] max-w-[90vw] max-h-[90vh] flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="px-6 py-4 border-b border-gray-800 flex items-center gap-2">
            <img src="/icons/settings.png" alt="" className="w-5 h-5" />
            <h2 className="text-lg font-semibold text-gray-100">Settings</h2>
          </div>

          {/* Scrollable content */}
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
            {!config ? (
              <p className="text-sm text-gray-500">{error || 'Loading...'}</p>
            ) : (
              <>
                {/* General */}
                <section>
                  <h3 className="text-sm font-semibold text-gray-300 uppercase mb-3">General</h3>

                  {/* Default Working Directory */}
                  <div className="mb-3">
                    <label className="text-xs text-gray-400 flex items-center mb-1">
                      Default Working Directory
                      <Tooltip text="Starting directory for new sessions when no saved directory is selected" />
                    </label>
                    <div className="flex gap-1">
                      <input
                        className="flex-1 bg-gray-800 text-gray-100 px-3 py-2 rounded text-sm"
                        value={config.defaultCwd}
                        onChange={(e) => updateField('defaultCwd', e.target.value)}
                      />
                      <button
                        onClick={() => setBrowseTarget({ field: 'defaultCwd' })}
                        className="px-2 py-2 bg-gray-800 hover:bg-gray-700 rounded text-gray-400 text-sm"
                        title="Browse"
                      >
                        📂
                      </button>
                    </div>
                  </div>

                  {/* Default Permission Mode */}
                  <div className="mb-3">
                    <label className="text-xs text-gray-400 flex items-center mb-1">
                      Default Permission Mode
                      <Tooltip text="Permission mode pre-selected when spawning new sessions" />
                    </label>
                    <select
                      className="w-full bg-gray-800 text-gray-100 px-3 py-2 rounded text-sm"
                      value={config.defaultPermissionMode}
                      onChange={(e) => updateField('defaultPermissionMode', e.target.value as 'autonomous' | 'supervised')}
                    >
                      <option value="autonomous">Autonomous</option>
                      <option value="supervised">Supervised</option>
                    </select>
                  </div>

                  {/* Max Sessions */}
                  <div className="mb-3">
                    <label className="text-xs text-gray-400 flex items-center mb-1">
                      Max Concurrent Sessions
                      <Tooltip text="Maximum number of sessions that can run at the same time" />
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={20}
                      className="w-24 bg-gray-800 text-gray-100 px-3 py-2 rounded text-sm"
                      value={config.maxSessions}
                      onChange={(e) => updateField('maxSessions', parseInt(e.target.value) || 1)}
                    />
                  </div>

                  {/* Approval Timeout */}
                  <div className="mb-3">
                    <label className="text-xs text-gray-400 flex items-center mb-1">
                      Approval Timeout (minutes)
                      <Tooltip text="In supervised mode, tool calls are auto-denied after this many minutes with no response" />
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={120}
                      className="w-24 bg-gray-800 text-gray-100 px-3 py-2 rounded text-sm"
                      value={config.approvalTimeoutMinutes}
                      onChange={(e) => updateField('approvalTimeoutMinutes', parseInt(e.target.value) || 30)}
                    />
                  </div>
                </section>

                {/* Saved Directories */}
                <section>
                  <h3 className="text-sm font-semibold text-gray-300 uppercase mb-3 flex items-center">
                    Saved Directories
                    <Tooltip text="Quick-select directories shown in the spawn dialog" />
                  </h3>

                  <div className="space-y-2">
                    {config.workingDirectories.map((dir, i) => (
                      <div key={i} className="flex gap-1 items-center">
                        <input
                          className="w-32 bg-gray-800 text-gray-100 px-2 py-1.5 rounded text-sm"
                          value={dir.label}
                          onChange={(e) => updateDirectory(i, 'label', e.target.value)}
                          placeholder="Label"
                        />
                        <input
                          className="flex-1 bg-gray-800 text-gray-100 px-2 py-1.5 rounded text-sm"
                          value={dir.path}
                          onChange={(e) => updateDirectory(i, 'path', e.target.value)}
                          placeholder="Path"
                        />
                        <button
                          onClick={() => setBrowseTarget({ field: 'directory', index: i })}
                          className="px-2 py-1.5 bg-gray-800 hover:bg-gray-700 rounded text-gray-400 text-sm"
                          title="Browse"
                        >
                          📂
                        </button>
                        <button
                          onClick={() => removeDirectory(i)}
                          className="px-2 py-1.5 text-gray-500 hover:text-red-400 text-sm"
                          title="Remove"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>

                  <button
                    onClick={addDirectory}
                    className="mt-2 text-xs text-blue-400 hover:text-blue-300"
                  >
                    + Add Directory
                  </button>
                </section>

                {/* Vault Logging */}
                <section>
                  <h3 className="text-sm font-semibold text-gray-300 uppercase mb-3">Vault Logging</h3>
                  <div>
                    <label className="text-xs text-gray-400 flex items-center mb-1">
                      Vault Path
                      <Tooltip text="Directory where session logs are saved as markdown files. Leave empty to disable vault logging." />
                    </label>
                    <div className="flex gap-1">
                      <input
                        className="flex-1 bg-gray-800 text-gray-100 px-3 py-2 rounded text-sm"
                        value={config.vaultPath}
                        onChange={(e) => updateField('vaultPath', e.target.value)}
                        placeholder="Leave empty to disable"
                      />
                      <button
                        onClick={() => setBrowseTarget({ field: 'vaultPath' })}
                        className="px-2 py-2 bg-gray-800 hover:bg-gray-700 rounded text-gray-400 text-sm"
                        title="Browse"
                      >
                        📂
                      </button>
                    </div>
                  </div>
                </section>
              </>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-3 border-t border-gray-800">
            {error && config && (
              <p className="text-xs text-red-400 mb-2">{error}</p>
            )}
            <div className="flex justify-end gap-2">
              <button onClick={handleClose} className="px-4 py-2 text-sm text-gray-400 hover:text-gray-200">
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !config}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 rounded text-sm text-white"
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Discard confirmation */}
      {confirmDiscard && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60]">
          <div className="bg-gray-900 border border-gray-700 rounded-lg p-6 w-[320px] space-y-4">
            <p className="text-sm text-gray-200">Discard unsaved changes?</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirmDiscard(false)} className="px-3 py-1.5 text-sm text-gray-400">
                Keep Editing
              </button>
              <button
                onClick={() => { setConfirmDiscard(false); onClose(); }}
                className="px-3 py-1.5 bg-red-600 hover:bg-red-500 rounded text-sm text-white"
              >
                Discard
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Folder Browser */}
      <FolderBrowser
        open={browseTarget !== null}
        initialPath={
          browseTarget?.field === 'defaultCwd' ? config?.defaultCwd || '' :
          browseTarget?.field === 'vaultPath' ? config?.vaultPath || '' :
          browseTarget?.field === 'directory' ? config?.workingDirectories[browseTarget.index]?.path || '' :
          ''
        }
        onSelect={handleBrowseSelect}
        onCancel={() => setBrowseTarget(null)}
      />
    </>
  );
}
```

- [ ] **Step 2: Write tests**

Create `tests/client/SettingsPanel.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { SettingsPanel } from '../../src/components/SettingsPanel';

const mockConfig = {
  defaultCwd: '/home/user',
  defaultPermissionMode: 'autonomous',
  workingDirectories: [{ label: 'Test', path: '/test' }],
  vaultPath: '/vault',
  maxSessions: 10,
  approvalTimeoutMinutes: 30,
};

beforeEach(() => {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(mockConfig),
  }) as any;
});

describe('SettingsPanel', () => {
  it('does not render when closed', () => {
    const { container } = render(<SettingsPanel open={false} onClose={() => {}} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders settings header when open', async () => {
    render(<SettingsPanel open={true} onClose={() => {}} />);
    await waitFor(() => {
      expect(screen.getByText('Settings')).toBeDefined();
    });
  });

  it('loads and displays config values', async () => {
    render(<SettingsPanel open={true} onClose={() => {}} />);
    await waitFor(() => {
      expect(screen.getByDisplayValue('/home/user')).toBeDefined();
      expect(screen.getByDisplayValue('10')).toBeDefined();
      expect(screen.getByDisplayValue('30')).toBeDefined();
    });
  });

  it('renders saved directories', async () => {
    render(<SettingsPanel open={true} onClose={() => {}} />);
    await waitFor(() => {
      expect(screen.getByDisplayValue('Test')).toBeDefined();
      expect(screen.getByDisplayValue('/test')).toBeDefined();
    });
  });

  it('shows Save and Cancel buttons', async () => {
    render(<SettingsPanel open={true} onClose={() => {}} />);
    await waitFor(() => {
      expect(screen.getByText('Save')).toBeDefined();
      expect(screen.getByText('Cancel')).toBeDefined();
    });
  });

  it('save triggers PUT with config payload', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(mockConfig) }) // GET
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ ok: true }) }); // PUT
    global.fetch = fetchMock as any;
    const onClose = vi.fn();

    render(<SettingsPanel open={true} onClose={onClose} />);
    await waitFor(() => screen.getByText('Save'));

    const { fireEvent } = await import('@testing-library/react');
    fireEvent.click(screen.getByText('Save'));

    await waitFor(() => {
      const putCall = fetchMock.mock.calls.find((c: any[]) => c[1]?.method === 'PUT');
      expect(putCall).toBeDefined();
      expect(putCall![0]).toBe('/api/config');
    });
  });

  it('cancel closes without saving', async () => {
    const onClose = vi.fn();
    render(<SettingsPanel open={true} onClose={onClose} />);
    await waitFor(() => screen.getByText('Cancel'));

    const { fireEvent } = await import('@testing-library/react');
    fireEvent.click(screen.getByText('Cancel'));

    // Should close without PUT (no changes made)
    expect(onClose).toHaveBeenCalled();
    const putCalls = (global.fetch as any).mock.calls.filter((c: any[]) => c[1]?.method === 'PUT');
    expect(putCalls.length).toBe(0);
  });
});
```

- [ ] **Step 3: Run tests**

Run: `cd C:/Users/Koena/claude-monitor && npx vitest run`
Expected: All pass

- [ ] **Step 4: Commit**

```bash
git add src/components/SettingsPanel.tsx tests/client/SettingsPanel.test.tsx
git commit -m "feat: add SettingsPanel component with all config fields"
```

---

## Task 6: Wire settings into App.tsx

**Files:**
- Modify: `src/App.tsx:1-14,89-93,111-115`

- [ ] **Step 1: Add gear icon and SettingsPanel to App**

In `src/App.tsx`:

Add import at top:
```typescript
import { SettingsPanel } from './components/SettingsPanel';
```

Add state in `AppContent`:
```typescript
const [settingsOpen, setSettingsOpen] = useState(false);
```

In the toolbar div (line 89), add the gear icon button with `ml-auto` to push it right:

```tsx
<div className="flex items-center gap-1 px-2 py-1 border-b border-gray-800 bg-gray-900/50">
  <ToolbarButton label="Skills & Agents" icon="/icons/skills.png" active={skillsOpen} onClick={() => setSkillsOpen(!skillsOpen)} />
  <ToolbarButton label="CLAUDE.md" icon="/icons/dashboard.png" active={claudeMdOpen} onClick={() => setClaudeMdOpen(!claudeMdOpen)} />
  <ToolbarButton label="Extensions" icon="/icons/extensions.png" active={extensionsOpen} onClick={() => setExtensionsOpen(!extensionsOpen)} />
  <div className="ml-auto">
    <button
      onClick={() => setSettingsOpen(true)}
      className="w-8 h-8 rounded flex items-center justify-center bg-gray-800 hover:bg-gray-700 transition-colors"
      title="Settings"
    >
      <img src="/icons/settings.png" alt="Settings" className="w-5 h-5" />
    </button>
  </div>
</div>
```

After the `<SpawnDialog>` at the end of the return, add:
```tsx
<SettingsPanel
  open={settingsOpen}
  onClose={() => setSettingsOpen(false)}
/>
```

- [ ] **Step 2: Run full test suite and typecheck**

Run: `cd C:/Users/Koena/claude-monitor && npx vitest run && npx tsc --noEmit`
Expected: All pass

- [ ] **Step 3: Build production**

Run: `cd C:/Users/Koena/claude-monitor && npm run build`
Expected: Clean build

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx
git commit -m "feat: wire settings panel into App toolbar with gear icon"
```

---

## Task 7: Final verification

- [ ] **Step 1: Run full test suite**

```bash
cd C:/Users/Koena/claude-monitor && npx vitest run
```

Expected: All tests pass

- [ ] **Step 2: Run typecheck**

```bash
cd C:/Users/Koena/claude-monitor && npx tsc --noEmit
```

Expected: Clean

- [ ] **Step 3: Build production**

```bash
cd C:/Users/Koena/claude-monitor && npm run build
```

Expected: Clean build

- [ ] **Step 4: Manual smoke test**

Start dev server (`npm run dev`) and verify in browser:
- Gear icon visible in top-right of toolbar
- Clicking gear opens settings overlay
- All config fields load with current values
- Folder browser opens and navigates directories
- Drive letters visible in folder browser (Windows)
- Breadcrumb navigation works
- Adding/removing saved directories works
- Save writes config and closes overlay
- Cancel with unsaved changes shows discard confirmation
- Escape closes folder browser first, then settings panel
- Tooltips appear on hover for each field

- [ ] **Step 5: Commit any fixes**

```bash
git add -A
git commit -m "chore: settings panel final verification and fixes"
```
