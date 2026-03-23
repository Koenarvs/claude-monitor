# Settings Panel Design

**Date:** 2026-03-22
**Status:** Approved

## Overview

Add a full-screen settings overlay to Claude Monitor, accessible via the gear icon in the top-right of the toolbar. Provides a GUI for all `config.json` fields, with a server-side folder browser for path selection.

## Layout

Full-screen modal overlay (same pattern as SpawnDialog). Gear icon positioned top-right of the toolbar bar using `ml-auto`, opposite the left-aligned panel toggle buttons (Skills, CLAUDE.md, Extensions). Clicking the gear opens the overlay; Save, Cancel, or Escape closes it.

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

Triggered by clicking the folder browser button next to any path input. Opens as a secondary overlay.

**UI elements:**
- Breadcrumb bar at top showing current path segments, each clickable to navigate up
- List of subdirectories (no files), each clickable to navigate into
- "Select" button — confirms current directory and populates the text field
- "Cancel" button — closes without changing the field

**Starting directory:** Current value of the text field, or user's home directory if empty/invalid.

**Server endpoint:** `GET /api/directories?path=/some/path`

Response shape:
```json
{
  "current": "/home/user/projects",
  "parent": "/home/user",
  "directories": ["project-a", "project-b", ".git"]
}
```

Validates path exists, is a directory, and passes safePath validation (no `..` traversal). Returns 400 if path doesn't exist or is invalid.

## Footer

- **Save** button (primary blue) — PUTs to `/api/config`, server clears config cache so changes take effect immediately, closes overlay
- **Cancel** button — discards all changes, closes overlay
- If user has unsaved changes and clicks Cancel or Escape, show a brief confirmation ("Discard unsaved changes?")

## File Changes

### New Files
- `src/components/SettingsPanel.tsx` — Full-screen settings overlay with all config fields
- `src/components/FolderBrowser.tsx` — Directory picker overlay component

### Modified Files
- `src/App.tsx` — Add gear icon button (top-right of toolbar, `ml-auto`), settings open/close state, render `<SettingsPanel>`
- `server/index.ts` — Add `GET /api/directories?path=` endpoint with directory listing
- `server/config.ts` — Call `clearConfigCache()` inside `saveConfig()` so changes take effect immediately

## Validation

All config fields validated by existing zod `SaveConfigSchema` on save. The server returns structured error messages if validation fails. The UI should display the error near the relevant field.

## Design Decisions

- **Full-screen overlay over slide-in panel:** Settings is a "stop and configure" action, not a glance-alongside-sessions panel. The spawn dialog established this pattern.
- **Server-side folder browser over paste-only:** Better UX for discovering paths. The server already has filesystem access; adding a directory listing endpoint is minimal.
- **Explicit save over auto-save:** Config changes shouldn't be accidental. Save/Cancel gives a clear commit/revert model.
- **Tooltips over inline help text:** Keeps the UI clean. Every field gets a tooltip explaining what it does.
- **Cache clear on save:** Changes take effect immediately without server restart.
