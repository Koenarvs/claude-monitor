# Settings Panel Design

**Date:** 2026-03-22
**Status:** Approved

## Overview

Add a full-screen settings overlay to Claude Monitor, accessible via the gear icon in the top-right of the toolbar. Provides a GUI for all `config.json` fields, with a server-side folder browser for path selection.

## Layout

Full-screen modal overlay (same pattern as SpawnDialog). Gear icon positioned top-right of the toolbar bar using `ml-auto` — a plain `<button>` (not `ToolbarButton`, since settings is a modal, not a toggle panel). Clicking the gear opens the overlay; Save, Cancel, or Escape closes it.

The panel pre-populates all fields from `GET /api/config` on open (the loaded config, not schema defaults).

## Sections

### 1. General

| Field | Control | Tooltip |
|-------|---------|---------|
| Default Working Directory | Text input + folder browser button | Starting directory for new sessions when no saved directory is selected |
| Default Permission Mode | Dropdown: Autonomous / Supervised | Permission mode pre-selected when spawning new sessions |
| Max Concurrent Sessions | Number input (1-20) | Maximum number of sessions that can run at the same time |
| Approval Timeout | Number input (1-120 minutes) | In supervised mode, tool calls are auto-denied after this many minutes with no response |

### 2. Saved Directories

Editable list. Each row contains:
- Text input for label
- Text input for path + folder browser button
- Delete (X) button

"Add Directory" button at the bottom adds an empty row.

Section header tooltip: "Quick-select directories shown in the spawn dialog"

### 3. Vault Logging

| Field | Control | Tooltip |
|-------|---------|---------|
| Vault Path | Text input + folder browser button | Directory where session logs are saved as markdown files. Leave empty to disable vault logging. |

## Folder Browser

Triggered by clicking the folder browser button next to any path input. Opens as a secondary overlay at `z-60` (above the settings panel at `z-50`).

**UI elements:**
- Breadcrumb bar at top showing current path segments, each clickable to navigate up
- On Windows: drive letter buttons (C:, D:, etc.) at the start of the breadcrumb bar for switching drives
- List of subdirectories (no files), sorted alphabetically, including hidden/dot directories
- Loading spinner while fetching directory contents
- Error message if directory is unreadable (permission denied)
- "Select" button — confirms current directory and populates the text field
- "Cancel" button — closes without changing the field

**Escape key behavior:** When folder browser is open, Escape closes the folder browser only (not the settings panel behind it). Standard topmost-overlay-first behavior.

**Starting directory:** Current value of the text field, or user's home directory if empty/invalid.

**Server endpoint:** `GET /api/directories?path=/some/path`

Response shape:
```typescript
interface DirectoryListing {
  current: string;       // Normalized path (forward slashes)
  parent: string | null; // null if at filesystem root
  directories: string[]; // Sorted alphabetically, names only
  drives?: string[];     // Windows only: available drive letters ["C:", "D:"]
}
```

Path validation: Export `safePath` from `validation.ts` and use it to validate the query parameter. Create a small zod schema for the query: `z.object({ path: safePath })`.

Returns 400 if path doesn't exist, isn't a directory, or contains `..` segments. Returns 403 if the directory exists but is unreadable (EACCES).

**Windows drive roots:** When `current` is a drive root (e.g., `C:/`), `parent` is `null`. The response always includes a `drives` array on Windows (populated via a quick check of common drive letters A-Z). This lets the folder browser show drive buttons for navigation between drives.

**Path normalization:** All paths in the response use forward slashes, matching the rest of the codebase.

## Footer

- **Save** button (primary blue) — PUTs to `/api/config`, closes overlay on success
- **Cancel** button — discards all changes, closes overlay
- If user has unsaved changes and clicks Cancel or Escape, show a brief confirmation ("Discard unsaved changes?")
- Validation errors displayed as a banner message above the footer (single string from server, not per-field)

## File Changes

### New Files
- `src/components/SettingsPanel.tsx` — Full-screen settings overlay with all config fields
- `src/components/FolderBrowser.tsx` — Directory picker overlay component

### Modified Files
- `src/App.tsx` — Add gear icon button (top-right of toolbar, `ml-auto`), settings open/close state, render `<SettingsPanel>`
- `server/index.ts` — Add `GET /api/directories?path=` endpoint with directory listing and drive enumeration
- `server/validation.ts` — Export `safePath` refinement; add `DirectoryQuerySchema` for the query param

### No Changes Needed
- `server/config.ts` — `saveConfig()` already updates the in-memory cache directly (`cached = config`). No `clearConfigCache()` call needed; that would force an unnecessary disk re-read.

## Types

Add `DirectoryListing` interface to a shared location (or inline in `FolderBrowser.tsx` since it's only used there).

## Testing

- **`tests/server/directories.test.ts`** — Unit tests for the `GET /api/directories` endpoint:
  - Valid path returns directory listing
  - Nonexistent path returns 400
  - Path with `..` traversal returns 400
  - Response directories are sorted alphabetically
  - Windows drive enumeration (if on Windows)
- **`tests/client/SettingsPanel.test.tsx`** — Component tests:
  - Renders all config fields
  - Save triggers PUT with correct payload
  - Cancel closes without saving

## Design Decisions

- **Full-screen overlay over slide-in panel:** Settings is a "stop and configure" action, not a glance-alongside-sessions panel. The spawn dialog established this pattern.
- **Server-side folder browser over paste-only:** Better UX for discovering paths. The server already has filesystem access; adding a directory listing endpoint is minimal.
- **Explicit save over auto-save:** Config changes shouldn't be accidental. Save/Cancel gives a clear commit/revert model.
- **Tooltips over inline help text:** Keeps the UI clean. Every field gets a tooltip explaining what it does.
- **Plain button for gear icon:** Unlike the panel toggle buttons (Skills, CLAUDE.md, Extensions) which use `ToolbarButton` with an active state, the settings gear opens a modal — no active/inactive toggle needed.
- **Banner errors over per-field errors:** The existing API returns a single error string. Per-field mapping would require changing the API response format. Banner is sufficient for v1 and consistent with existing patterns.
- **Include hidden directories:** Show everything `readdir` returns. Users configuring paths need to see `.git`, `.claude`, etc. On Windows, no special handling of the hidden file attribute — just list whatever the OS returns.
