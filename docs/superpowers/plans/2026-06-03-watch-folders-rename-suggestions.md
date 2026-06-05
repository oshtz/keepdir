# Watch Folders Rename Suggestions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an opt-in per-workspace watched-folder feature that detects new stable files, generates AI rename suggestions, persists them in a review queue, and only renames files after explicit user approval.

**Architecture:** Extract the current rename analysis logic out of `src/main/main.js` into a reusable analysis service, then add a main-process watcher manager that owns `fs.watch` handles and a SQLite-backed suggestion queue. The renderer gets explicit IPC methods, a Workspace Settings tab for watched folders, and a compact watched-suggestion queue in the directory explorer.

**Tech Stack:** Electron main/preload IPC, React 18, MUI, SQLite via `sqlite3`, Jest, React Testing Library, Playwright Electron E2E, Node `fs.watch`.

---

## File Structure

- Create `src/main/watchFolderValidation.js`: pure validation and normalization for watch folders, suggestion ids, statuses, ignored filenames, and direct-child file paths.
- Create `src/main/__tests__/watchFolderValidation.test.js`: focused unit tests for watch-folder validation and ignored file rules.
- Modify `src/main/database.js`: add watch-folder helpers and `watched_rename_suggestions` table helpers.
- Create `src/main/__tests__/watchedRenameDatabase.test.js`: real SQLite contract tests using temporary `APPDATA` or `HOME`.
- Create `src/main/analysisService.js`: reusable sort/rename analysis service extracted from `main.js`.
- Create `src/main/__tests__/analysisService.test.js`: tests for provider-missing and deterministic rename-analysis behavior.
- Create `src/main/watchFolderManager.js`: owns watchers, candidate stability checks, queue transitions, analysis dispatch, and renderer notifications.
- Create `src/main/__tests__/watchFolderManager.test.js`: tests watcher lifecycle, ignored files, duplicate event coalescing, stale handling, and queue transitions with fake dependencies.
- Modify `src/main/main.js`: instantiate analysis service and watcher manager, replace inline analysis calls, register watch-folder IPC handlers, and shut down watchers on quit.
- Modify `src/main/preload.js`: expose watch-folder IPC methods and event subscriptions.
- Modify `src/renderer/electron.d.ts`: add watch-folder and watched-suggestion types and IPC method signatures.
- Create `src/renderer/hooks/useWatchedRenameQueue.ts`: renderer hook for loading queue data, subscribing to main-process changes, and invoking queue actions.
- Create `src/renderer/hooks/__tests__/useWatchedRenameQueue.test.tsx`: hook tests for initial load, subscriptions, and action reloads.
- Create `src/renderer/components/WatchFoldersSettings.tsx`: settings UI for add/remove/enable watched folders.
- Create `src/renderer/components/__tests__/WatchFoldersSettings.test.tsx`: settings UI tests.
- Create `src/renderer/components/WatchedRenameQueue.tsx`: compact review queue for grouped watched rename suggestions.
- Create `src/renderer/components/__tests__/WatchedRenameQueue.test.tsx`: queue UI tests.
- Modify `src/renderer/components/Settings.tsx`: add "Watch Folders" sidepanel tab and render `WatchFoldersSettings`.
- Modify `src/renderer/components/DirectoryExplorer.tsx`: add queue entry point and render `WatchedRenameQueue`.
- Modify `src/renderer/contexts/WorkspaceContext.tsx`: notify main process when the active workspace changes.
- Modify `tests/e2e/electron-smoke.spec.ts`: add deterministic watched-folder E2E flow.
- Modify `ARCHITECTURE.md`: document watcher boundary and review-first safety behavior.
- Modify `C:\Users\USER\Documents\home\02 - DEV\Projects\Kanban\keepdir Kanban.md`: move the watch-folder card as work progresses.

## Task 1: Watch-Folder Validation

**Files:**
- Create: `src/main/watchFolderValidation.js`
- Test: `src/main/__tests__/watchFolderValidation.test.js`

- [ ] **Step 1: Write the failing validation tests**

Add `src/main/__tests__/watchFolderValidation.test.js`:

```js
const path = require('path');

const {
  WATCH_FOLDER_SETTING_KEY,
  isIgnoredWatchedFileName,
  normalizeWatchFolder,
  normalizeWatchFoldersSetting,
  normalizeWatchedSuggestionIds,
  requireDirectChildFilePath,
  toWatchedRenameSuggestionsPayload
} = require('../watchFolderValidation');

describe('watch folder validation', () => {
  it('normalizes a watch folder record', () => {
    expect(WATCH_FOLDER_SETTING_KEY).toBe('watchFolders');
    expect(normalizeWatchFolder({
      id: 'watch-1',
      path: 'C:/Users/Ada/Downloads',
      enabled: true,
      createdAt: '2026-06-03T00:00:00.000Z'
    })).toEqual({
      id: 'watch-1',
      path: path.resolve('C:/Users/Ada/Downloads'),
      enabled: true,
      createdAt: '2026-06-03T00:00:00.000Z'
    });
  });

  it('normalizes a bounded watch folder setting array', () => {
    const folders = normalizeWatchFoldersSetting([
      { id: 'watch-1', path: 'C:/One', enabled: true },
      { id: 'watch-2', path: 'C:/Two', enabled: false }
    ]);

    expect(folders).toHaveLength(2);
    expect(folders[0].enabled).toBe(true);
    expect(folders[1].enabled).toBe(false);
    expect(() => normalizeWatchFoldersSetting('bad')).toThrow('Watch folders must be an array');
  });

  it('rejects unsafe ids and paths', () => {
    expect(() => normalizeWatchFolder({ id: '../bad', path: 'C:/Safe' })).toThrow('Watch folder id is invalid');
    expect(() => normalizeWatchFolder({ id: 'watch-1', path: '' })).toThrow('Watch folder path is required');
    expect(() => normalizeWatchedSuggestionIds(['suggestion-1', '../bad'])).toThrow('Watched suggestion id is invalid');
  });

  it('detects ignored temporary and hidden filenames', () => {
    expect(isIgnoredWatchedFileName('.DS_Store')).toBe(true);
    expect(isIgnoredWatchedFileName('download.crdownload')).toBe(true);
    expect(isIgnoredWatchedFileName('partial.part')).toBe(true);
    expect(isIgnoredWatchedFileName('notes.txt')).toBe(false);
  });

  it('requires direct child file paths', () => {
    const root = path.resolve('C:/Users/Ada/Downloads');
    expect(requireDirectChildFilePath(root, path.join(root, 'receipt.pdf'))).toBe(path.join(root, 'receipt.pdf'));
    expect(() => requireDirectChildFilePath(root, path.join(root, 'nested', 'receipt.pdf'))).toThrow('direct child');
    expect(() => requireDirectChildFilePath(root, path.resolve('C:/Users/Ada/Other/file.txt'))).toThrow('inside watched folder');
  });

  it('maps database rows to renderer payloads', () => {
    expect(toWatchedRenameSuggestionsPayload([{
      id: 'suggestion-1',
      workspace_id: 'workspace-1',
      folder_path: 'C:/Downloads',
      file_path: 'C:/Downloads/a.txt',
      original_name: 'a.txt',
      suggested_name: 'invoice-2026.txt',
      reason: 'Looks like an invoice',
      status: 'suggested',
      file_size: 12,
      file_mtime_ms: 1000,
      error_message: null,
      created_at: '2026-06-03T00:00:00.000Z',
      updated_at: '2026-06-03T00:00:01.000Z'
    }])).toEqual([{
      id: 'suggestion-1',
      workspaceId: 'workspace-1',
      folderPath: 'C:/Downloads',
      filePath: 'C:/Downloads/a.txt',
      originalName: 'a.txt',
      suggestedName: 'invoice-2026.txt',
      reason: 'Looks like an invoice',
      status: 'suggested',
      fileSize: 12,
      fileMtimeMs: 1000,
      errorMessage: null,
      createdAt: '2026-06-03T00:00:00.000Z',
      updatedAt: '2026-06-03T00:00:01.000Z'
    }]);
  });
});
```

- [ ] **Step 2: Run the failing validation tests**

Run:

```powershell
npm test -- --runInBand src/main/__tests__/watchFolderValidation.test.js
```

Expected: FAIL because `src/main/watchFolderValidation.js` does not exist.

- [ ] **Step 3: Implement validation helpers**

Add `src/main/watchFolderValidation.js` with these exports:

```js
const path = require('path');
const { normalizeRecordId } = require('./stateValidation');

const WATCH_FOLDER_SETTING_KEY = 'watchFolders';
const WATCHED_RENAME_STATUSES = new Set([
  'detected',
  'stabilizing',
  'queued',
  'analyzing',
  'suggested',
  'error',
  'dismissed',
  'applied',
  'stale'
]);
const IGNORED_SUFFIXES = ['.tmp', '.temp', '.part', '.crdownload', '.download'];

function normalizeIsoDate(value) {
  if (!value) {
    return new Date().toISOString();
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error('Watch folder date is invalid');
  }
  return parsed.toISOString();
}

function normalizeWatchFolder(folder) {
  if (!folder || typeof folder !== 'object' || Array.isArray(folder)) {
    throw new Error('Watch folder must be an object');
  }
  if (typeof folder.path !== 'string' || !folder.path.trim()) {
    throw new Error('Watch folder path is required');
  }

  return {
    id: normalizeRecordId(folder.id, 'Watch folder id'),
    path: path.resolve(folder.path),
    enabled: folder.enabled === true,
    createdAt: normalizeIsoDate(folder.createdAt)
  };
}

function normalizeWatchFoldersSetting(value) {
  if (value === null || value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new Error('Watch folders must be an array');
  }
  if (value.length > 100) {
    throw new Error('Watch folders cannot contain more than 100 entries');
  }
  return value.map(normalizeWatchFolder);
}

function normalizeWatchedSuggestionIds(ids) {
  if (!Array.isArray(ids) || ids.length === 0) {
    throw new Error('Watched suggestion ids are required');
  }
  if (ids.length > 500) {
    throw new Error('Watched suggestion ids cannot contain more than 500 entries');
  }
  return ids.map((id) => normalizeRecordId(id, 'Watched suggestion id'));
}

function normalizeWatchedRenameStatus(status) {
  if (!WATCHED_RENAME_STATUSES.has(status)) {
    throw new Error(`Watched rename status is invalid: ${status}`);
  }
  return status;
}

function isIgnoredWatchedFileName(fileName) {
  if (typeof fileName !== 'string' || !fileName.trim()) {
    return true;
  }
  const lower = fileName.toLowerCase();
  return fileName.startsWith('.') || fileName.endsWith('~') || IGNORED_SUFFIXES.some((suffix) => lower.endsWith(suffix));
}

function requireDirectChildFilePath(folderPath, filePath) {
  const resolvedFolder = path.resolve(folderPath);
  const resolvedFile = path.resolve(filePath);
  const relative = path.relative(resolvedFolder, resolvedFile);

  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Watched file path must be inside watched folder');
  }
  if (relative.split(path.sep).filter(Boolean).length !== 1) {
    throw new Error('Watched file path must be a direct child of the watched folder');
  }
  return resolvedFile;
}

function toWatchedRenameSuggestionPayload(row) {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    folderPath: row.folder_path,
    filePath: row.file_path,
    originalName: row.original_name,
    suggestedName: row.suggested_name,
    reason: row.reason,
    status: row.status,
    fileSize: row.file_size,
    fileMtimeMs: row.file_mtime_ms,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function toWatchedRenameSuggestionsPayload(rows) {
  return rows.map(toWatchedRenameSuggestionPayload);
}

module.exports = {
  WATCH_FOLDER_SETTING_KEY,
  WATCHED_RENAME_STATUSES,
  isIgnoredWatchedFileName,
  normalizeWatchFolder,
  normalizeWatchFoldersSetting,
  normalizeWatchedRenameStatus,
  normalizeWatchedSuggestionIds,
  requireDirectChildFilePath,
  toWatchedRenameSuggestionPayload,
  toWatchedRenameSuggestionsPayload
};
```

- [ ] **Step 4: Run validation tests until green**

Run:

```powershell
npm test -- --runInBand src/main/__tests__/watchFolderValidation.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit validation helpers**

Run:

```powershell
git add src/main/watchFolderValidation.js src/main/__tests__/watchFolderValidation.test.js
git commit -m "Add watch folder validation"
```

## Task 2: Database Contract For Watch Folders And Queue

**Files:**
- Modify: `src/main/database.js`
- Test: `src/main/__tests__/watchedRenameDatabase.test.js`

- [ ] **Step 1: Write failing database contract tests**

Add `src/main/__tests__/watchedRenameDatabase.test.js`:

```js
const fs = require('fs/promises');
const os = require('os');
const path = require('path');

describe('watched rename database contract', () => {
  let tempHome;
  let Database;
  let db;

  beforeEach(async () => {
    jest.resetModules();
    tempHome = await fs.mkdtemp(path.join(os.tmpdir(), 'keepdir-watch-db-'));
    process.env.APPDATA = tempHome;
    process.env.HOME = tempHome;
    Database = require('../database');
    db = new Database();
    await new Promise((resolve) => setTimeout(resolve, 50));
  });

  afterEach(async () => {
    db?.close();
    await fs.rm(tempHome, { recursive: true, force: true });
  });

  it('persists watch folders through workspace settings helpers', async () => {
    await db.saveWorkspace({ id: 'workspace-1', name: 'Workspace', emoji: 'K' });
    const saved = await db.saveWatchFolder('workspace-1', {
      id: 'watch-1',
      path: path.join(tempHome, 'Downloads'),
      enabled: true,
      createdAt: '2026-06-03T00:00:00.000Z'
    });

    expect(saved.success).toBe(true);
    await db.setWatchFolderEnabled('workspace-1', 'watch-1', false);
    const folders = await db.getWatchFolders('workspace-1');

    expect(folders).toEqual([{
      id: 'watch-1',
      path: path.resolve(tempHome, 'Downloads'),
      enabled: false,
      createdAt: '2026-06-03T00:00:00.000Z'
    }]);
  });

  it('upserts watched rename suggestions without duplicate active rows', async () => {
    await db.saveWorkspace({ id: 'workspace-1', name: 'Workspace', emoji: 'K' });
    const filePath = path.join(tempHome, 'Downloads', 'scan.pdf');
    await db.upsertWatchedRenameSuggestion({
      id: 'suggestion-1',
      workspaceId: 'workspace-1',
      folderPath: path.dirname(filePath),
      filePath,
      originalName: 'scan.pdf',
      suggestedName: 'invoice-2026.pdf',
      reason: 'Looks like an invoice',
      status: 'suggested',
      fileSize: 12,
      fileMtimeMs: 1000
    });
    await db.upsertWatchedRenameSuggestion({
      id: 'suggestion-2',
      workspaceId: 'workspace-1',
      folderPath: path.dirname(filePath),
      filePath,
      originalName: 'scan.pdf',
      suggestedName: 'receipt-2026.pdf',
      reason: 'Newer suggestion',
      status: 'suggested',
      fileSize: 12,
      fileMtimeMs: 1000
    });

    const rows = await db.getWatchedRenameSuggestions('workspace-1');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: 'suggestion-1',
      workspace_id: 'workspace-1',
      original_name: 'scan.pdf',
      suggested_name: 'receipt-2026.pdf',
      status: 'suggested'
    });
  });

  it('loads suggestions by id and updates statuses', async () => {
    await db.saveWorkspace({ id: 'workspace-1', name: 'Workspace', emoji: 'K' });
    await db.upsertWatchedRenameSuggestion({
      id: 'suggestion-1',
      workspaceId: 'workspace-1',
      folderPath: tempHome,
      filePath: path.join(tempHome, 'a.txt'),
      originalName: 'a.txt',
      suggestedName: 'alpha.txt',
      reason: 'Readable name',
      status: 'suggested',
      fileSize: 1,
      fileMtimeMs: 10
    });

    const byId = await db.getWatchedRenameSuggestionsByIds('workspace-1', ['suggestion-1']);
    expect(byId).toHaveLength(1);

    await db.updateWatchedRenameSuggestionStatus('workspace-1', 'suggestion-1', 'dismissed', 'Not useful');
    const visible = await db.getWatchedRenameSuggestions('workspace-1');
    expect(visible).toHaveLength(0);

    const dismissed = await db.getWatchedRenameSuggestions('workspace-1', ['dismissed']);
    expect(dismissed[0].error_message).toBe('Not useful');
  });
});
```

- [ ] **Step 2: Run the failing database tests**

Run:

```powershell
npm test -- --runInBand src/main/__tests__/watchedRenameDatabase.test.js
```

Expected: FAIL because the database methods and table do not exist.

- [ ] **Step 3: Add database table and helpers**

Modify `src/main/database.js`:

1. Import watch-folder validation helpers near the top:

```js
const {
  WATCH_FOLDER_SETTING_KEY,
  normalizeWatchFolder,
  normalizeWatchFoldersSetting,
  normalizeWatchedRenameStatus,
  normalizeWatchedSuggestionIds
} = require('./watchFolderValidation');
```

2. Add this table inside the constructor `this.db.serialize(() => { ... })` block after `workspace_settings`:

```js
this.db.run(`
  CREATE TABLE IF NOT EXISTS watched_rename_suggestions (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    folder_path TEXT NOT NULL,
    file_path TEXT NOT NULL,
    original_name TEXT NOT NULL,
    suggested_name TEXT,
    reason TEXT,
    status TEXT CHECK(status IN ('detected', 'stabilizing', 'queued', 'analyzing', 'suggested', 'error', 'dismissed', 'applied', 'stale')) NOT NULL,
    file_size INTEGER NOT NULL DEFAULT 0,
    file_mtime_ms INTEGER NOT NULL DEFAULT 0,
    error_message TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
  )
`);
this.db.run('CREATE UNIQUE INDEX IF NOT EXISTS idx_watched_rename_active_file ON watched_rename_suggestions(workspace_id, file_path) WHERE status NOT IN (\\'dismissed\\', \\'applied\\')');
this.db.run('CREATE INDEX IF NOT EXISTS idx_watched_rename_workspace_status ON watched_rename_suggestions(workspace_id, status)');
this.db.run('CREATE INDEX IF NOT EXISTS idx_watched_rename_updated ON watched_rename_suggestions(updated_at)');
```

3. Add methods to the `Database` class before `close()`:

```js
async getWatchFolders(workspaceId) {
  const value = await this.getWorkspaceSetting(workspaceId, WATCH_FOLDER_SETTING_KEY);
  return normalizeWatchFoldersSetting(value || []);
}

async saveWatchFolder(workspaceId, folder) {
  const normalized = normalizeWatchFolder(folder);
  const folders = await this.getWatchFolders(workspaceId);
  const nextFolders = folders.some((item) => item.id === normalized.id)
    ? folders.map((item) => item.id === normalized.id ? normalized : item)
    : [...folders, normalized];
  await this.saveWorkspaceSetting(workspaceId, WATCH_FOLDER_SETTING_KEY, nextFolders);
  return { success: true, folder: normalized };
}

async removeWatchFolder(workspaceId, folderId) {
  const id = normalizeWatchedSuggestionIds([folderId])[0];
  const folders = await this.getWatchFolders(workspaceId);
  await this.saveWorkspaceSetting(
    workspaceId,
    WATCH_FOLDER_SETTING_KEY,
    folders.filter((folder) => folder.id !== id)
  );
  return { success: true };
}

async setWatchFolderEnabled(workspaceId, folderId, enabled) {
  const id = normalizeWatchedSuggestionIds([folderId])[0];
  const folders = await this.getWatchFolders(workspaceId);
  const nextFolders = folders.map((folder) => (
    folder.id === id ? { ...folder, enabled: enabled === true } : folder
  ));
  await this.saveWorkspaceSetting(workspaceId, WATCH_FOLDER_SETTING_KEY, nextFolders);
  return { success: true };
}

async upsertWatchedRenameSuggestion(suggestion) {
  const status = normalizeWatchedRenameStatus(suggestion.status);
  await this._run(
    `INSERT INTO watched_rename_suggestions (
       id, workspace_id, folder_path, file_path, original_name,
       suggested_name, reason, status, file_size, file_mtime_ms, error_message
     )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(workspace_id, file_path) WHERE status NOT IN ('dismissed', 'applied')
     DO UPDATE SET
       suggested_name = excluded.suggested_name,
       reason = excluded.reason,
       status = excluded.status,
       file_size = excluded.file_size,
       file_mtime_ms = excluded.file_mtime_ms,
       error_message = excluded.error_message,
       updated_at = CURRENT_TIMESTAMP`,
    [
      suggestion.id,
      suggestion.workspaceId,
      this._normalizePath(suggestion.folderPath),
      this._normalizePath(suggestion.filePath),
      this._normalizeFilename(suggestion.originalName),
      suggestion.suggestedName || null,
      suggestion.reason || null,
      status,
      Number(suggestion.fileSize) || 0,
      Number(suggestion.fileMtimeMs) || 0,
      suggestion.errorMessage || null
    ]
  );
}

async getWatchedRenameSuggestions(workspaceId, statuses = ['queued', 'analyzing', 'suggested', 'error', 'stale']) {
  const normalizedStatuses = statuses.map(normalizeWatchedRenameStatus);
  const placeholders = normalizedStatuses.map(() => '?').join(', ');
  return this._all(
    `SELECT * FROM watched_rename_suggestions
     WHERE workspace_id = ? AND status IN (${placeholders})
     ORDER BY updated_at DESC, created_at DESC`,
    [workspaceId, ...normalizedStatuses]
  );
}

async getWatchedRenameSuggestionsByIds(workspaceId, suggestionIds) {
  const ids = normalizeWatchedSuggestionIds(suggestionIds);
  const placeholders = ids.map(() => '?').join(', ');
  return this._all(
    `SELECT * FROM watched_rename_suggestions
     WHERE workspace_id = ? AND id IN (${placeholders})
     ORDER BY updated_at DESC, created_at DESC`,
    [workspaceId, ...ids]
  );
}

async updateWatchedRenameSuggestionStatus(workspaceId, suggestionId, status, errorMessage = null) {
  const id = normalizeWatchedSuggestionIds([suggestionId])[0];
  const normalizedStatus = normalizeWatchedRenameStatus(status);
  await this._run(
    `UPDATE watched_rename_suggestions
     SET status = ?, error_message = ?, updated_at = CURRENT_TIMESTAMP
     WHERE workspace_id = ? AND id = ?`,
    [normalizedStatus, errorMessage, workspaceId, id]
  );
}
```

- [ ] **Step 4: Run database tests until green**

Run:

```powershell
npm test -- --runInBand src/main/__tests__/watchedRenameDatabase.test.js
```

Expected: PASS.

- [ ] **Step 5: Run existing database parsing tests**

Run:

```powershell
npm test -- --runInBand src/main/__tests__/databaseParsing.test.js
```

Expected: PASS.

- [ ] **Step 6: Commit database support**

Run:

```powershell
git add src/main/database.js src/main/__tests__/watchedRenameDatabase.test.js
git commit -m "Add watched rename persistence"
```

## Task 3: Extract Reusable Analysis Service

**Files:**
- Create: `src/main/analysisService.js`
- Test: `src/main/__tests__/analysisService.test.js`
- Modify: `src/main/main.js`

- [ ] **Step 1: Write failing service tests**

Add `src/main/__tests__/analysisService.test.js`:

```js
const path = require('path');

const { createAnalysisService } = require('../analysisService');

function createDb(overrides = {}) {
  return {
    getUnprocessedRenames: jest.fn(async (paths) => paths),
    getUnprocessedSorts: jest.fn(async (paths) => paths),
    getAllSettings: jest.fn(async () => ({
      selectedProvider: 'openai',
      selectedModel: 'gpt-4o-mini',
      apiKeys: { openai: 'sk-test' }
    })),
    bulkCacheRenameSuggestions: jest.fn(async () => undefined),
    bulkCacheSortSuggestions: jest.fn(async () => undefined),
    getFileHash: jest.fn(async () => 'hash'),
    isFileCached: jest.fn(async () => false),
    getCachedContent: jest.fn(async () => null),
    cacheFile: jest.fn(async () => undefined),
    ...overrides
  };
}

describe('analysis service', () => {
  it('returns provider configuration errors without throwing', async () => {
    const service = createAnalysisService({
      db: createDb({
        getAllSettings: jest.fn(async () => ({
          selectedProvider: 'openai',
          apiKeys: {}
        }))
      }),
      getProvider: () => ({ defaultModel: 'gpt-4o-mini', supportsVision: true }),
      fsModule: {
        readdir: jest.fn(),
        lstat: jest.fn()
      }
    });

    const result = await service.analyzeEntries({
      sender: { send: jest.fn() },
      directoryPath: path.resolve('C:/Downloads'),
      renameFiles: true,
      fileEntries: [{ name: 'scan.txt', path: path.resolve('C:/Downloads/scan.txt') }],
      forceRefresh: true
    });

    expect(result.error).toBe('openai API key not configured');
  });

  it('produces normalized rename suggestions for explicit entries', async () => {
    const db = createDb();
    const provider = {
      defaultModel: 'gpt-4o-mini',
      supportsVision: false,
      sendMessage: jest.fn(async () => '{"renames":[{"originalName":"scan.txt","suggestedName":"invoice-2026.txt","reason":"Invoice"}]}')
    };
    const service = createAnalysisService({
      db,
      getProvider: () => provider,
      fsModule: {
        readdir: jest.fn(),
        lstat: jest.fn(async () => ({
          isFile: () => true,
          isSymbolicLink: () => false,
          size: 4,
          mtime: new Date('2026-06-03T00:00:00.000Z')
        }))
      }
    });

    const result = await service.analyzeEntries({
      sender: { send: jest.fn() },
      directoryPath: path.resolve('C:/Downloads'),
      renameFiles: true,
      fileEntries: [{ name: 'scan.txt', path: path.resolve('C:/Downloads/scan.txt') }],
      forceRefresh: true
    });

    expect(result.suggestions.categories[0].renames).toEqual([{
      originalName: 'scan.txt',
      suggestedName: 'invoice-2026.txt',
      reason: 'Invoice'
    }]);
    expect(db.bulkCacheRenameSuggestions).toHaveBeenCalledWith([{
      filePath: path.join(path.resolve('C:/Downloads'), 'scan.txt'),
      originalName: 'scan.txt',
      suggestedName: 'invoice-2026.txt',
      reason: 'Invoice'
    }]);
  });
});
```

- [ ] **Step 2: Run the failing service tests**

Run:

```powershell
npm test -- --runInBand src/main/__tests__/analysisService.test.js
```

Expected: FAIL because `createAnalysisService` does not exist.

- [ ] **Step 3: Extract service from `main.js`**

Create `src/main/analysisService.js`. Move the body of `analyzeDirectory` from `src/main/main.js` into this service. Preserve these exact exported methods:

```js
function createAnalysisService({
  db,
  getProvider,
  fsModule = require('fs').promises,
  pathModule = require('path'),
  parseJson = parseJsonPayload,
  logger = console
}) {
  async function analyzeDirectory({ sender, directoryPath, renameFiles, selectedPaths, forceRefresh = false }) {
    const safeDirectoryPath = await requireExistingDirectoryPath(directoryPath);
    const selectedFileEntries = await normalizeSelectedAnalysisEntries(selectedPaths, safeDirectoryPath);
    const allFileEntries = selectedFileEntries?.length
      ? selectedFileEntries
      : (await fsModule.readdir(safeDirectoryPath, { withFileTypes: true }))
        .filter(isAnalyzableDirectoryEntry)
        .map((file) => ({
          name: file.name,
          path: pathModule.join(safeDirectoryPath, file.name)
        }));

    return analyzeEntries({
      sender,
      directoryPath: safeDirectoryPath,
      renameFiles,
      fileEntries: allFileEntries,
      forceRefresh
    });
  }

  async function analyzeEntries({ sender, directoryPath, renameFiles, fileEntries, forceRefresh = false }) {
    if (process.env.KEEPDIR_E2E_WATCH_RENAME_STUB === '1' && renameFiles) {
      const renames = fileEntries.map((entry) => ({
        originalName: entry.name,
        suggestedName: `organized-${entry.name}`,
        reason: 'Deterministic E2E rename suggestion'
      }));
      return {
        suggestions: {
          categories: [{
            name: 'Files to Rename',
            description: 'Files that will be renamed',
            suggestedPath: '.',
            files: renames.map((rename) => rename.originalName),
            renames
          }]
        }
      };
    }

    // Extraction recipe:
    // 1. Move the existing cache lookup, provider selection, image preparation,
    //    batch request, JSON parse, suggestion normalization, and bulk cache
    //    sections from main.js into this function.
    // 2. Replace every filesystem call with fsModule.
    // 3. Replace every path helper call with pathModule.
    // 4. Replace require('./providers').getProvider with injected getProvider.
    // 5. Replace parseJsonPayload(response) with parseJson(response).
    // 6. Replace debugLog calls with logger.debug and console.error calls with logger.error.
    // 7. Keep the returned sort and rename response shapes byte-for-byte compatible
    //    with the current IPC consumers.
  }

  return {
    analyzeDirectory,
    analyzeEntries
  };
}

module.exports = {
  createAnalysisService
};
```

Keep the existing analysis response shape unchanged:

```js
{
  suggestions: {
    categories: [{
      name: 'Files to Rename',
      description: 'Files that will be renamed',
      suggestedPath: '.',
      files: ['scan.txt'],
      renames: [{
        originalName: 'scan.txt',
        suggestedName: 'invoice-2026.txt',
        reason: 'Invoice'
      }]
    }]
  }
}
```

- [ ] **Step 4: Wire `main.js` to the service**

In `src/main/main.js`, add near the existing imports:

```js
const { createAnalysisService } = require('./analysisService');
const { getProvider } = require('./providers');
```

Inside `createWindow()`, before registering analysis handlers:

```js
const analysisService = createAnalysisService({
  db,
  getProvider,
  logger: {
    debug: debugLog,
    error: console.error
  }
});
```

Replace the four analysis IPC handlers with:

```js
registerHandler('analyze-directory-for-sort', async (event, directoryPath, selectedPaths) => {
  return analysisService.analyzeDirectory({
    sender: event.sender,
    directoryPath,
    renameFiles: false,
    selectedPaths
  });
});

registerHandler('analyze-directory-for-rename', async (event, directoryPath, selectedPaths) => {
  return analysisService.analyzeDirectory({
    sender: event.sender,
    directoryPath,
    renameFiles: true,
    selectedPaths
  });
});

registerHandler('analyze-directory-for-sort-fresh', async (event, directoryPath, selectedPaths) => {
  return analysisService.analyzeDirectory({
    sender: event.sender,
    directoryPath,
    renameFiles: false,
    selectedPaths,
    forceRefresh: true
  });
});

registerHandler('analyze-directory-for-rename-fresh', async (event, directoryPath, selectedPaths) => {
  return analysisService.analyzeDirectory({
    sender: event.sender,
    directoryPath,
    renameFiles: true,
    selectedPaths,
    forceRefresh: true
  });
});
```

Remove the old nested `analyzeDirectory` function from `main.js` after the handlers are wired.

- [ ] **Step 5: Run service and existing analysis-adjacent tests**

Run:

```powershell
npm test -- --runInBand src/main/__tests__/analysisService.test.js src/main/__tests__/jsonExtraction.test.js src/main/__tests__/suggestionValidation.test.js src/main/__tests__/ipcValidation.test.js
```

Expected: PASS.

- [ ] **Step 6: Run a full local check**

Run:

```powershell
npm run check
```

Expected: PASS.

- [ ] **Step 7: Commit the extraction**

Run:

```powershell
git add src/main/main.js src/main/analysisService.js src/main/__tests__/analysisService.test.js
git commit -m "Extract reusable analysis service"
```

## Task 4: Watch Folder Manager

**Files:**
- Create: `src/main/watchFolderManager.js`
- Test: `src/main/__tests__/watchFolderManager.test.js`

- [ ] **Step 1: Write failing manager tests**

Add `src/main/__tests__/watchFolderManager.test.js`:

```js
const path = require('path');

const { createWatchFolderManager } = require('../watchFolderManager');

function createFs() {
  const stats = new Map();
  return {
    stats,
    watch: jest.fn(() => ({ close: jest.fn() })),
    readdir: jest.fn(async () => []),
    lstat: jest.fn(async (filePath) => {
      const value = stats.get(filePath);
      if (!value) {
        const error = new Error('ENOENT');
        error.code = 'ENOENT';
        throw error;
      }
      return value;
    })
  };
}

function fileStat(size = 10, mtimeMs = 1000) {
  return {
    isFile: () => true,
    isDirectory: () => false,
    isSymbolicLink: () => false,
    size,
    mtimeMs
  };
}

describe('watch folder manager', () => {
  it('starts only enabled folders for the active workspace', async () => {
    const fsModule = createFs();
    const db = {
      getWatchFolders: jest.fn(async () => [
        { id: 'watch-1', path: path.resolve('C:/One'), enabled: true },
        { id: 'watch-2', path: path.resolve('C:/Two'), enabled: false }
      ])
    };
    const manager = createWatchFolderManager({
      db,
      analysisService: { analyzeEntries: jest.fn() },
      fsModule,
      notify: jest.fn(),
      createId: () => 'suggestion-1',
      delay: async () => undefined
    });

    await manager.setActiveWorkspace('workspace-1');

    expect(fsModule.watch).toHaveBeenCalledTimes(1);
    expect(fsModule.watch).toHaveBeenCalledWith(path.resolve('C:/One'), expect.any(Function));
  });

  it('ignores temporary and hidden files', async () => {
    const fsModule = createFs();
    const db = {
      getWatchFolders: jest.fn(async () => []),
      upsertWatchedRenameSuggestion: jest.fn()
    };
    const manager = createWatchFolderManager({
      db,
      analysisService: { analyzeEntries: jest.fn() },
      fsModule,
      notify: jest.fn(),
      createId: () => 'suggestion-1',
      delay: async () => undefined
    });

    await manager.handleDetectedPath({
      workspaceId: 'workspace-1',
      folderPath: path.resolve('C:/Downloads'),
      filePath: path.resolve('C:/Downloads/.hidden')
    });

    expect(db.upsertWatchedRenameSuggestion).not.toHaveBeenCalled();
  });

  it('queues a stable file and stores the rename suggestion', async () => {
    const fsModule = createFs();
    const folderPath = path.resolve('C:/Downloads');
    const filePath = path.join(folderPath, 'scan.txt');
    fsModule.stats.set(filePath, fileStat(12, 1000));

    const db = {
      getWatchFolders: jest.fn(async () => []),
      upsertWatchedRenameSuggestion: jest.fn(),
      updateWatchedRenameSuggestionStatus: jest.fn()
    };
    const analysisService = {
      analyzeEntries: jest.fn(async () => ({
        suggestions: {
          categories: [{
            renames: [{
              originalName: 'scan.txt',
              suggestedName: 'invoice-2026.txt',
              reason: 'Invoice'
            }]
          }]
        }
      }))
    };
    const manager = createWatchFolderManager({
      db,
      analysisService,
      fsModule,
      notify: jest.fn(),
      createId: () => 'suggestion-1',
      delay: async () => undefined
    });

    await manager.handleDetectedPath({ workspaceId: 'workspace-1', folderPath, filePath });

    expect(analysisService.analyzeEntries).toHaveBeenCalledWith(expect.objectContaining({
      directoryPath: folderPath,
      renameFiles: true,
      forceRefresh: true,
      fileEntries: [{ name: 'scan.txt', path: filePath }]
    }));
    expect(db.upsertWatchedRenameSuggestion).toHaveBeenLastCalledWith(expect.objectContaining({
      id: 'suggestion-1',
      workspaceId: 'workspace-1',
      folderPath,
      filePath,
      originalName: 'scan.txt',
      suggestedName: 'invoice-2026.txt',
      status: 'suggested'
    }));
  });

  it('marks analysis errors in the queue', async () => {
    const fsModule = createFs();
    const folderPath = path.resolve('C:/Downloads');
    const filePath = path.join(folderPath, 'scan.txt');
    fsModule.stats.set(filePath, fileStat(12, 1000));

    const db = {
      getWatchFolders: jest.fn(async () => []),
      upsertWatchedRenameSuggestion: jest.fn()
    };
    const manager = createWatchFolderManager({
      db,
      analysisService: { analyzeEntries: jest.fn(async () => ({ error: 'openai API key not configured' })) },
      fsModule,
      notify: jest.fn(),
      createId: () => 'suggestion-1',
      delay: async () => undefined
    });

    await manager.handleDetectedPath({ workspaceId: 'workspace-1', folderPath, filePath });

    expect(db.upsertWatchedRenameSuggestion).toHaveBeenLastCalledWith(expect.objectContaining({
      status: 'error',
      errorMessage: 'openai API key not configured'
    }));
  });
});
```

- [ ] **Step 2: Run the failing manager tests**

Run:

```powershell
npm test -- --runInBand src/main/__tests__/watchFolderManager.test.js
```

Expected: FAIL because `src/main/watchFolderManager.js` does not exist.

- [ ] **Step 3: Implement manager factory**

Create `src/main/watchFolderManager.js` with this public interface:

```js
const path = require('path');
const fs = require('fs').promises;
const { watch } = require('fs');
const {
  isIgnoredWatchedFileName,
  requireDirectChildFilePath
} = require('./watchFolderValidation');

function createWatchFolderManager({
  db,
  analysisService,
  fsModule = fs,
  nativeWatch = watch,
  notify,
  createId = () => `watch-suggestion-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
  delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  stableDelayMs = 1500
}) {
  let activeWorkspaceId = null;
  const watchers = new Map();
  const pending = new Map();

  function emit(channel, payload) {
    if (typeof notify === 'function') {
      notify(channel, payload);
    }
  }

  async function setActiveWorkspace(workspaceId) {
    activeWorkspaceId = workspaceId || null;
    await reloadWatchers();
  }

  async function reloadWatchers() {
    stopAll();
    if (!activeWorkspaceId) {
      return;
    }

    const folders = await db.getWatchFolders(activeWorkspaceId);
    for (const folder of folders.filter((item) => item.enabled)) {
      startWatcher(folder);
    }
    emit('watch-folders-changed', { workspaceId: activeWorkspaceId });
  }

  function startWatcher(folder) {
    const folderPath = path.resolve(folder.path);
    const watcher = nativeWatch(folderPath, () => {
      scheduleFolderScan(folderPath);
    });
    watchers.set(folder.id, watcher);
    scheduleFolderScan(folderPath);
  }

  function scheduleFolderScan(folderPath) {
    if (!activeWorkspaceId) {
      return;
    }
    const key = `${activeWorkspaceId}:${folderPath}`;
    if (pending.has(key)) {
      clearTimeout(pending.get(key));
    }
    const timeoutId = setTimeout(() => {
      pending.delete(key);
      scanFolder(activeWorkspaceId, folderPath).catch((error) => {
        emit('watch-folders-changed', { workspaceId: activeWorkspaceId, error: error.message });
      });
    }, 300);
    pending.set(key, timeoutId);
  }

  async function scanFolder(workspaceId, folderPath) {
    const entries = await fsModule.readdir(folderPath, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile() || isIgnoredWatchedFileName(entry.name)) {
        continue;
      }
      await handleDetectedPath({
        workspaceId,
        folderPath,
        filePath: path.join(folderPath, entry.name)
      });
    }
  }

  async function handleDetectedPath({ workspaceId, folderPath, filePath }) {
    const safeFilePath = requireDirectChildFilePath(folderPath, filePath);
    const originalName = path.basename(safeFilePath);
    if (isIgnoredWatchedFileName(originalName)) {
      return;
    }

    const firstStats = await fsModule.lstat(safeFilePath);
    if (!firstStats.isFile() || firstStats.isSymbolicLink()) {
      return;
    }

    await delay(stableDelayMs);
    const secondStats = await fsModule.lstat(safeFilePath);
    if (firstStats.size !== secondStats.size || firstStats.mtimeMs !== secondStats.mtimeMs) {
      return;
    }

    const suggestionId = createId();
    await db.upsertWatchedRenameSuggestion({
      id: suggestionId,
      workspaceId,
      folderPath,
      filePath: safeFilePath,
      originalName,
      status: 'analyzing',
      fileSize: secondStats.size,
      fileMtimeMs: secondStats.mtimeMs
    });
    emit('watched-rename-suggestions-changed', { workspaceId });

    const result = await analysisService.analyzeEntries({
      sender: { send: () => {} },
      directoryPath: folderPath,
      renameFiles: true,
      fileEntries: [{ name: originalName, path: safeFilePath }],
      forceRefresh: true
    });

    if (result.error) {
      await db.upsertWatchedRenameSuggestion({
        id: suggestionId,
        workspaceId,
        folderPath,
        filePath: safeFilePath,
        originalName,
        status: 'error',
        fileSize: secondStats.size,
        fileMtimeMs: secondStats.mtimeMs,
        errorMessage: result.error
      });
      emit('watched-rename-suggestions-changed', { workspaceId });
      return;
    }

    const rename = result.suggestions?.categories?.[0]?.renames?.find((item) => item.originalName === originalName);
    if (!rename) {
      await db.upsertWatchedRenameSuggestion({
        id: suggestionId,
        workspaceId,
        folderPath,
        filePath: safeFilePath,
        originalName,
        status: 'error',
        fileSize: secondStats.size,
        fileMtimeMs: secondStats.mtimeMs,
        errorMessage: 'No rename suggestion returned'
      });
      emit('watched-rename-suggestions-changed', { workspaceId });
      return;
    }

    await db.upsertWatchedRenameSuggestion({
      id: suggestionId,
      workspaceId,
      folderPath,
      filePath: safeFilePath,
      originalName,
      suggestedName: rename.suggestedName,
      reason: rename.reason,
      status: 'suggested',
      fileSize: secondStats.size,
      fileMtimeMs: secondStats.mtimeMs
    });
    emit('watched-rename-suggestions-changed', { workspaceId });
  }

  function stopAll() {
    for (const watcher of watchers.values()) {
      watcher.close();
    }
    watchers.clear();
    for (const timeoutId of pending.values()) {
      clearTimeout(timeoutId);
    }
    pending.clear();
  }

  return {
    handleDetectedPath,
    reloadWatchers,
    setActiveWorkspace,
    shutdown: stopAll
  };
}

module.exports = {
  createWatchFolderManager
};
```

- [ ] **Step 4: Run manager tests until green**

Run:

```powershell
npm test -- --runInBand src/main/__tests__/watchFolderManager.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit manager**

Run:

```powershell
git add src/main/watchFolderManager.js src/main/__tests__/watchFolderManager.test.js
git commit -m "Add watched folder manager"
```

## Task 5: IPC And Main-Process Apply Flow

**Files:**
- Modify: `src/main/main.js`
- Modify: `src/main/preload.js`
- Modify: `src/renderer/electron.d.ts`

- [ ] **Step 1: Add watch manager to `main.js`**

Import helpers:

```js
const { randomUUID } = require('crypto');
const { createWatchFolderManager } = require('./watchFolderManager');
const {
  normalizeWatchFolder,
  normalizeWatchedSuggestionIds,
  toWatchedRenameSuggestionsPayload
} = require('./watchFolderValidation');
```

Inside `createWindow()` after `analysisService` is created:

```js
const notifyRenderer = (channel, payload) => {
  if (!mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
};

const watchFolderManager = createWatchFolderManager({
  db,
  analysisService,
  notify: notifyRenderer,
  createId: () => randomUUID()
});
```

- [ ] **Step 2: Register IPC handlers**

Add these handlers near the workspace settings handlers:

```js
registerHandler('set-active-watch-workspace', async (_event, workspaceId) => {
  try {
    const normalizedWorkspaceId = workspaceId ? normalizeWorkspaceId(workspaceId) : null;
    await watchFolderManager.setActiveWorkspace(normalizedWorkspaceId);
    return { success: true };
  } catch (error) {
    console.error('Failed to set active watch workspace:', error);
    return { error: error.message };
  }
});

registerHandler('get-watch-folders', async (_event, workspaceId) => {
  try {
    const normalizedWorkspaceId = normalizeWorkspaceId(workspaceId);
    return { success: true, folders: await db.getWatchFolders(normalizedWorkspaceId) };
  } catch (error) {
    return { error: error.message };
  }
});

registerHandler('save-watch-folder', async (_event, workspaceId, folder) => {
  try {
    const normalizedWorkspaceId = normalizeWorkspaceId(workspaceId);
    const normalizedFolder = normalizeWatchFolder(folder);
    const result = await db.saveWatchFolder(normalizedWorkspaceId, normalizedFolder);
    await watchFolderManager.reloadWatchers();
    notifyRenderer('watch-folders-changed', { workspaceId: normalizedWorkspaceId });
    return result;
  } catch (error) {
    return { error: error.message };
  }
});

registerHandler('remove-watch-folder', async (_event, workspaceId, folderId) => {
  try {
    const normalizedWorkspaceId = normalizeWorkspaceId(workspaceId);
    const result = await db.removeWatchFolder(normalizedWorkspaceId, folderId);
    await watchFolderManager.reloadWatchers();
    notifyRenderer('watch-folders-changed', { workspaceId: normalizedWorkspaceId });
    return result;
  } catch (error) {
    return { error: error.message };
  }
});

registerHandler('set-watch-folder-enabled', async (_event, workspaceId, folderId, enabled) => {
  try {
    const normalizedWorkspaceId = normalizeWorkspaceId(workspaceId);
    const result = await db.setWatchFolderEnabled(normalizedWorkspaceId, folderId, enabled === true);
    await watchFolderManager.reloadWatchers();
    notifyRenderer('watch-folders-changed', { workspaceId: normalizedWorkspaceId });
    return result;
  } catch (error) {
    return { error: error.message };
  }
});

registerHandler('get-watched-rename-suggestions', async (_event, workspaceId) => {
  try {
    const normalizedWorkspaceId = normalizeWorkspaceId(workspaceId);
    const rows = await db.getWatchedRenameSuggestions(normalizedWorkspaceId);
    return { success: true, suggestions: toWatchedRenameSuggestionsPayload(rows) };
  } catch (error) {
    return { error: error.message };
  }
});

registerHandler('dismiss-watched-rename-suggestions', async (_event, workspaceId, suggestionIds) => {
  try {
    const normalizedWorkspaceId = normalizeWorkspaceId(workspaceId);
    const ids = normalizeWatchedSuggestionIds(suggestionIds);
    await Promise.all(ids.map((id) => db.updateWatchedRenameSuggestionStatus(normalizedWorkspaceId, id, 'dismissed')));
    notifyRenderer('watched-rename-suggestions-changed', { workspaceId: normalizedWorkspaceId });
    return { success: true };
  } catch (error) {
    return { error: error.message };
  }
});
```

- [ ] **Step 3: Add refresh and apply IPC handlers**

Add:

```js
registerHandler('refresh-watched-rename-suggestions', async (event, workspaceId, suggestionIds) => {
  try {
    const normalizedWorkspaceId = normalizeWorkspaceId(workspaceId);
    const ids = normalizeWatchedSuggestionIds(suggestionIds);
    const rows = await db.getWatchedRenameSuggestionsByIds(normalizedWorkspaceId, ids);
    for (const row of rows) {
      await watchFolderManager.handleDetectedPath({
        workspaceId: normalizedWorkspaceId,
        folderPath: row.folder_path,
        filePath: row.file_path
      });
    }
    notifyRenderer('watched-rename-suggestions-changed', { workspaceId: normalizedWorkspaceId });
    return { success: true };
  } catch (error) {
    return { error: error.message };
  }
});

registerHandler('apply-watched-rename-suggestions', async (event, workspaceId, suggestionIds) => {
  try {
    const normalizedWorkspaceId = normalizeWorkspaceId(workspaceId);
    const ids = normalizeWatchedSuggestionIds(suggestionIds);
    const rows = await db.getWatchedRenameSuggestionsByIds(normalizedWorkspaceId, ids);
    const groupedByFolder = new Map();

    for (const row of rows) {
      const stats = await fs.lstat(row.file_path);
      if (!stats.isFile() || stats.size !== row.file_size || stats.mtimeMs !== row.file_mtime_ms) {
        await db.updateWatchedRenameSuggestionStatus(normalizedWorkspaceId, row.id, 'stale', 'File changed since suggestion was generated');
        continue;
      }
      if (!groupedByFolder.has(row.folder_path)) {
        groupedByFolder.set(row.folder_path, []);
      }
      groupedByFolder.get(row.folder_path).push({
        id: row.id,
        originalName: row.original_name,
        suggestedName: row.suggested_name,
        reason: row.reason || ''
      });
    }

    const results = [];
    for (const [directoryPath, renames] of groupedByFolder.entries()) {
      const result = await applyRenameSuggestions({
        directoryPath,
        suggestions: {
          categories: [{
            name: 'Files to Rename',
            description: 'Files that will be renamed',
            suggestedPath: '.',
            files: renames.map((rename) => rename.originalName),
            renames
          }]
        },
        db,
        onProgress: (channel, progressPayload) => event.sender.send(channel, progressPayload)
      });
      results.push(result);

      const errorsByFile = new Map((result.errors || []).map((item) => [item.file, item.error]));
      for (const rename of renames) {
        const error = errorsByFile.get(rename.originalName);
        await db.updateWatchedRenameSuggestionStatus(
          normalizedWorkspaceId,
          rename.id,
          error ? 'error' : 'applied',
          error || null
        );
      }
    }

    notifyRenderer('watched-rename-suggestions-changed', { workspaceId: normalizedWorkspaceId });
    return { success: results.every((result) => result.success), results };
  } catch (error) {
    return { error: error.message };
  }
});
```

- [ ] **Step 4: Clean up watchers on app quit**

In `app.on('before-quit', ...)`, call the manager:

```js
app.on('before-quit', () => {
  if (global.watchFolderManager) {
    global.watchFolderManager.shutdown();
  }
  db.close();
});
```

If `watchFolderManager` is scoped inside `createWindow`, assign it after creation:

```js
global.watchFolderManager = watchFolderManager;
```

- [ ] **Step 5: Expose preload methods**

Add to `src/main/preload.js`:

```js
setActiveWatchWorkspace: (workspaceId) => ipcRenderer.invoke('set-active-watch-workspace', workspaceId),
getWatchFolders: (workspaceId) => ipcRenderer.invoke('get-watch-folders', workspaceId),
saveWatchFolder: (workspaceId, folder) => ipcRenderer.invoke('save-watch-folder', workspaceId, folder),
removeWatchFolder: (workspaceId, folderId) => ipcRenderer.invoke('remove-watch-folder', workspaceId, folderId),
setWatchFolderEnabled: (workspaceId, folderId, enabled) => ipcRenderer.invoke('set-watch-folder-enabled', workspaceId, folderId, enabled),
getWatchedRenameSuggestions: (workspaceId) => ipcRenderer.invoke('get-watched-rename-suggestions', workspaceId),
dismissWatchedRenameSuggestions: (workspaceId, suggestionIds) => ipcRenderer.invoke('dismiss-watched-rename-suggestions', workspaceId, suggestionIds),
refreshWatchedRenameSuggestions: (workspaceId, suggestionIds) => ipcRenderer.invoke('refresh-watched-rename-suggestions', workspaceId, suggestionIds),
applyWatchedRenameSuggestions: (workspaceId, suggestionIds) => ipcRenderer.invoke('apply-watched-rename-suggestions', workspaceId, suggestionIds),
onWatchFoldersChanged: createEventHandler('watch-folders-changed'),
onWatchedRenameSuggestionsChanged: createEventHandler('watched-rename-suggestions-changed'),
```

- [ ] **Step 6: Add renderer IPC types**

Add these interfaces to `src/renderer/electron.d.ts`:

```ts
export interface WatchFolder {
  id: string;
  path: string;
  enabled: boolean;
  createdAt?: string;
}

export type WatchedRenameSuggestionStatus =
  | 'detected'
  | 'stabilizing'
  | 'queued'
  | 'analyzing'
  | 'suggested'
  | 'error'
  | 'dismissed'
  | 'applied'
  | 'stale';

export interface WatchedRenameSuggestion {
  id: string;
  workspaceId: string;
  folderPath: string;
  filePath: string;
  originalName: string;
  suggestedName?: string | null;
  reason?: string | null;
  status: WatchedRenameSuggestionStatus;
  fileSize: number;
  fileMtimeMs: number;
  errorMessage?: string | null;
  createdAt: string;
  updatedAt: string;
}
```

Add methods to `ElectronAPI`:

```ts
setActiveWatchWorkspace: (workspaceId: string | null) => Promise<ApiResult>;
getWatchFolders: (workspaceId: string) => Promise<ApiResult & { folders?: WatchFolder[] }>;
saveWatchFolder: (workspaceId: string, folder: WatchFolder) => Promise<ApiResult & { folder?: WatchFolder }>;
removeWatchFolder: (workspaceId: string, folderId: string) => Promise<ApiResult>;
setWatchFolderEnabled: (workspaceId: string, folderId: string, enabled: boolean) => Promise<ApiResult>;
getWatchedRenameSuggestions: (workspaceId: string) => Promise<ApiResult & { suggestions?: WatchedRenameSuggestion[] }>;
dismissWatchedRenameSuggestions: (workspaceId: string, suggestionIds: string[]) => Promise<ApiResult>;
refreshWatchedRenameSuggestions: (workspaceId: string, suggestionIds: string[]) => Promise<ApiResult>;
applyWatchedRenameSuggestions: (workspaceId: string, suggestionIds: string[]) => Promise<ApiResult & { results?: RenameApplyResult[] }>;
onWatchFoldersChanged: (callback: (payload: { workspaceId: string; error?: string }) => void) => () => void;
onWatchedRenameSuggestionsChanged: (callback: (payload: { workspaceId: string }) => void) => () => void;
```

- [ ] **Step 7: Run typecheck and main tests**

Run:

```powershell
npm run typecheck
npm test -- --runInBand src/main/__tests__/watchFolderValidation.test.js src/main/__tests__/watchedRenameDatabase.test.js src/main/__tests__/watchFolderManager.test.js
```

Expected: PASS.

- [ ] **Step 8: Commit IPC integration**

Run:

```powershell
git add src/main/main.js src/main/preload.js src/renderer/electron.d.ts
git commit -m "Wire watched rename IPC"
```

## Task 6: Renderer Hook For Watched Rename Queue

**Files:**
- Create: `src/renderer/hooks/useWatchedRenameQueue.ts`
- Test: `src/renderer/hooks/__tests__/useWatchedRenameQueue.test.tsx`

- [ ] **Step 1: Write failing hook tests**

Add `src/renderer/hooks/__tests__/useWatchedRenameQueue.test.tsx`:

```tsx
import { act, renderHook, waitFor } from '@testing-library/react';
import { useWatchedRenameQueue } from '../useWatchedRenameQueue';

const mockElectronAPI = {
  getWatchedRenameSuggestions: jest.fn(),
  dismissWatchedRenameSuggestions: jest.fn(),
  refreshWatchedRenameSuggestions: jest.fn(),
  applyWatchedRenameSuggestions: jest.fn(),
  onWatchedRenameSuggestionsChanged: jest.fn(),
};

Object.defineProperty(window, 'electronAPI', {
  value: mockElectronAPI,
  writable: true,
});

describe('useWatchedRenameQueue', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockElectronAPI.getWatchedRenameSuggestions.mockResolvedValue({
      success: true,
      suggestions: [{
        id: 'suggestion-1',
        workspaceId: 'workspace-1',
        folderPath: 'C:/Downloads',
        filePath: 'C:/Downloads/scan.txt',
        originalName: 'scan.txt',
        suggestedName: 'invoice-2026.txt',
        reason: 'Invoice',
        status: 'suggested',
        fileSize: 12,
        fileMtimeMs: 1000,
        createdAt: '2026-06-03T00:00:00.000Z',
        updatedAt: '2026-06-03T00:00:01.000Z'
      }]
    });
    mockElectronAPI.dismissWatchedRenameSuggestions.mockResolvedValue({ success: true });
    mockElectronAPI.refreshWatchedRenameSuggestions.mockResolvedValue({ success: true });
    mockElectronAPI.applyWatchedRenameSuggestions.mockResolvedValue({ success: true, results: [] });
    mockElectronAPI.onWatchedRenameSuggestionsChanged.mockReturnValue(jest.fn());
  });

  it('loads suggestions for the current workspace', async () => {
    const { result } = renderHook(() => useWatchedRenameQueue('workspace-1'));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(mockElectronAPI.getWatchedRenameSuggestions).toHaveBeenCalledWith('workspace-1');
    expect(result.current.suggestions).toHaveLength(1);
    expect(result.current.error).toBeNull();
  });

  it('reloads after queue actions', async () => {
    const { result } = renderHook(() => useWatchedRenameQueue('workspace-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.dismiss(['suggestion-1']);
    });

    expect(mockElectronAPI.dismissWatchedRenameSuggestions).toHaveBeenCalledWith('workspace-1', ['suggestion-1']);
    expect(mockElectronAPI.getWatchedRenameSuggestions).toHaveBeenCalledTimes(2);
  });

  it('subscribes to watched suggestion change events', async () => {
    let callback: (payload: { workspaceId: string }) => void = () => {};
    mockElectronAPI.onWatchedRenameSuggestionsChanged.mockImplementation((handler) => {
      callback = handler;
      return jest.fn();
    });

    renderHook(() => useWatchedRenameQueue('workspace-1'));
    await waitFor(() => expect(mockElectronAPI.getWatchedRenameSuggestions).toHaveBeenCalledTimes(1));

    await act(async () => {
      callback({ workspaceId: 'workspace-1' });
    });

    expect(mockElectronAPI.getWatchedRenameSuggestions).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run the failing hook tests**

Run:

```powershell
npm test -- --runInBand src/renderer/hooks/__tests__/useWatchedRenameQueue.test.tsx
```

Expected: FAIL because `useWatchedRenameQueue` does not exist.

- [ ] **Step 3: Implement hook**

Add `src/renderer/hooks/useWatchedRenameQueue.ts`:

```ts
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { WatchedRenameSuggestion } from '../electron';

export function useWatchedRenameQueue(workspaceId?: string | null) {
  const [suggestions, setSuggestions] = useState<WatchedRenameSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!workspaceId) {
      setSuggestions([]);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const result = await window.electronAPI.getWatchedRenameSuggestions(workspaceId);
      if (result.error) {
        setError(result.error);
        setSuggestions([]);
      } else {
        setError(null);
        setSuggestions(result.suggestions || []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load watched rename suggestions');
      setSuggestions([]);
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const unsubscribe = window.electronAPI.onWatchedRenameSuggestionsChanged((payload) => {
      if (payload.workspaceId === workspaceId) {
        load();
      }
    });
    return unsubscribe;
  }, [load, workspaceId]);

  const dismiss = useCallback(async (ids: string[]) => {
    if (!workspaceId || ids.length === 0) return { success: false };
    const result = await window.electronAPI.dismissWatchedRenameSuggestions(workspaceId, ids);
    await load();
    return result;
  }, [load, workspaceId]);

  const refresh = useCallback(async (ids: string[]) => {
    if (!workspaceId || ids.length === 0) return { success: false };
    const result = await window.electronAPI.refreshWatchedRenameSuggestions(workspaceId, ids);
    await load();
    return result;
  }, [load, workspaceId]);

  const apply = useCallback(async (ids: string[]) => {
    if (!workspaceId || ids.length === 0) return { success: false };
    const result = await window.electronAPI.applyWatchedRenameSuggestions(workspaceId, ids);
    await load();
    return result;
  }, [load, workspaceId]);

  const groupedByFolder = useMemo(() => {
    return suggestions.reduce<Record<string, WatchedRenameSuggestion[]>>((groups, suggestion) => {
      if (!groups[suggestion.folderPath]) {
        groups[suggestion.folderPath] = [];
      }
      groups[suggestion.folderPath].push(suggestion);
      return groups;
    }, {});
  }, [suggestions]);

  return {
    suggestions,
    groupedByFolder,
    loading,
    error,
    load,
    dismiss,
    refresh,
    apply
  };
}
```

- [ ] **Step 4: Run hook tests until green**

Run:

```powershell
npm test -- --runInBand src/renderer/hooks/__tests__/useWatchedRenameQueue.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit hook**

Run:

```powershell
git add src/renderer/hooks/useWatchedRenameQueue.ts src/renderer/hooks/__tests__/useWatchedRenameQueue.test.tsx
git commit -m "Add watched rename queue hook"
```

## Task 7: Watch Folders Settings UI

**Files:**
- Create: `src/renderer/components/WatchFoldersSettings.tsx`
- Test: `src/renderer/components/__tests__/WatchFoldersSettings.test.tsx`
- Modify: `src/renderer/components/Settings.tsx`

- [ ] **Step 1: Write failing settings component tests**

Add `src/renderer/components/__tests__/WatchFoldersSettings.test.tsx`:

```tsx
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import WatchFoldersSettings from '../WatchFoldersSettings';

const mockElectronAPI = {
  selectDirectory: jest.fn(),
  getWatchFolders: jest.fn(),
  saveWatchFolder: jest.fn(),
  removeWatchFolder: jest.fn(),
  setWatchFolderEnabled: jest.fn(),
  onWatchFoldersChanged: jest.fn(),
};

Object.defineProperty(window, 'electronAPI', {
  value: mockElectronAPI,
  writable: true,
});

describe('WatchFoldersSettings', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockElectronAPI.getWatchFolders.mockResolvedValue({
      success: true,
      folders: [{ id: 'watch-1', path: 'C:/Downloads', enabled: true, createdAt: '2026-06-03T00:00:00.000Z' }]
    });
    mockElectronAPI.saveWatchFolder.mockResolvedValue({ success: true });
    mockElectronAPI.removeWatchFolder.mockResolvedValue({ success: true });
    mockElectronAPI.setWatchFolderEnabled.mockResolvedValue({ success: true });
    mockElectronAPI.selectDirectory.mockResolvedValue('C:/Desktop');
    mockElectronAPI.onWatchFoldersChanged.mockReturnValue(jest.fn());
  });

  it('renders current watched folders', async () => {
    render(<WatchFoldersSettings workspaceId="workspace-1" />);

    await waitFor(() => expect(screen.getByText('C:/Downloads')).toBeInTheDocument());
    expect(screen.getByRole('checkbox', { name: /watch C:\/Downloads/i })).toBeChecked();
  });

  it('adds a selected folder', async () => {
    const user = userEvent.setup();
    render(<WatchFoldersSettings workspaceId="workspace-1" />);

    await user.click(screen.getByRole('button', { name: /add watched folder/i }));

    expect(mockElectronAPI.selectDirectory).toHaveBeenCalled();
    expect(mockElectronAPI.saveWatchFolder).toHaveBeenCalledWith(
      'workspace-1',
      expect.objectContaining({ path: 'C:/Desktop', enabled: true })
    );
  });

  it('toggles and removes a folder', async () => {
    const user = userEvent.setup();
    render(<WatchFoldersSettings workspaceId="workspace-1" />);

    await waitFor(() => expect(screen.getByText('C:/Downloads')).toBeInTheDocument());
    await user.click(screen.getByRole('checkbox', { name: /watch C:\/Downloads/i }));
    await user.click(screen.getByRole('button', { name: /remove C:\/Downloads/i }));

    expect(mockElectronAPI.setWatchFolderEnabled).toHaveBeenCalledWith('workspace-1', 'watch-1', false);
    expect(mockElectronAPI.removeWatchFolder).toHaveBeenCalledWith('workspace-1', 'watch-1');
  });
});
```

- [ ] **Step 2: Run failing settings tests**

Run:

```powershell
npm test -- --runInBand src/renderer/components/__tests__/WatchFoldersSettings.test.tsx
```

Expected: FAIL because `WatchFoldersSettings` does not exist.

- [ ] **Step 3: Implement settings component**

Add `src/renderer/components/WatchFoldersSettings.tsx`:

```tsx
import React, { useCallback, useEffect, useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import IconButton from '@mui/material/IconButton';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Switch from '@mui/material/Switch';
import Typography from '@mui/material/Typography';
import Alert from '@mui/material/Alert';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import FolderIcon from '@mui/icons-material/Folder';
import type { WatchFolder } from '../electron';

interface WatchFoldersSettingsProps {
  workspaceId?: string | null;
}

const WatchFoldersSettings: React.FC<WatchFoldersSettingsProps> = ({ workspaceId }) => {
  const [folders, setFolders] = useState<WatchFolder[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadFolders = useCallback(async () => {
    if (!workspaceId) {
      setFolders([]);
      return;
    }
    setLoading(true);
    const result = await window.electronAPI.getWatchFolders(workspaceId);
    if (result.error) {
      setError(result.error);
      setFolders([]);
    } else {
      setError(null);
      setFolders(result.folders || []);
    }
    setLoading(false);
  }, [workspaceId]);

  useEffect(() => {
    loadFolders();
  }, [loadFolders]);

  useEffect(() => {
    const unsubscribe = window.electronAPI.onWatchFoldersChanged((payload) => {
      if (payload.workspaceId === workspaceId) {
        loadFolders();
      }
    });
    return unsubscribe;
  }, [loadFolders, workspaceId]);

  const handleAdd = async () => {
    if (!workspaceId) return;
    const selectedPath = await window.electronAPI.selectDirectory();
    if (!selectedPath) return;
    const result = await window.electronAPI.saveWatchFolder(workspaceId, {
      id: `watch-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      path: selectedPath,
      enabled: true,
      createdAt: new Date().toISOString()
    });
    if (result.error) {
      setError(result.error);
      return;
    }
    await loadFolders();
  };

  const handleToggle = async (folder: WatchFolder) => {
    if (!workspaceId) return;
    const result = await window.electronAPI.setWatchFolderEnabled(workspaceId, folder.id, !folder.enabled);
    if (result.error) {
      setError(result.error);
      return;
    }
    await loadFolders();
  };

  const handleRemove = async (folder: WatchFolder) => {
    if (!workspaceId) return;
    const result = await window.electronAPI.removeWatchFolder(workspaceId, folder.id);
    if (result.error) {
      setError(result.error);
      return;
    }
    await loadFolders();
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
        <Box>
          <Typography variant="h6" sx={{ fontFamily: 'var(--font-header)' }}>
            Watch Folders
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ fontFamily: 'var(--font-body)' }}>
            KeepDir watches these folders while the app is open and queues rename suggestions for new files.
          </Typography>
        </Box>
        <Button variant="contained" startIcon={<AddIcon />} onClick={handleAdd} disabled={!workspaceId || loading}>
          Add Watched Folder
        </Button>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {loading && <CircularProgress size={20} />}

      <List dense>
        {folders.map((folder) => (
          <ListItem
            key={folder.id}
            secondaryAction={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Switch
                  checked={folder.enabled}
                  onChange={() => handleToggle(folder)}
                  inputProps={{ 'aria-label': `Watch ${folder.path}` }}
                />
                <IconButton aria-label={`Remove ${folder.path}`} onClick={() => handleRemove(folder)}>
                  <DeleteIcon />
                </IconButton>
              </Box>
            }
          >
            <FolderIcon sx={{ mr: 1.5, color: 'primary.main' }} />
            <ListItemText
              primary={folder.path}
              secondary={folder.enabled ? 'Watching while KeepDir is open' : 'Paused'}
              primaryTypographyProps={{ sx: { fontFamily: 'var(--font-body)' } }}
              secondaryTypographyProps={{ sx: { fontFamily: 'var(--font-body)' } }}
            />
          </ListItem>
        ))}
      </List>

      {!loading && folders.length === 0 && (
        <Typography variant="body2" color="text.secondary" sx={{ fontFamily: 'var(--font-body)', mt: 2 }}>
          No watched folders configured for this workspace.
        </Typography>
      )}
    </Box>
  );
};

export default WatchFoldersSettings;
```

- [ ] **Step 4: Add settings tab**

Modify `src/renderer/components/Settings.tsx`:

1. Add import:

```ts
import WatchFoldersSettings from './WatchFoldersSettings';
```

2. Add case to `renderTabContent()`:

```tsx
case 'watch-folders':
  return <WatchFoldersSettings workspaceId={currentWorkspace?.id || null} />;
```

3. Add tab entry in `SettingsSidepanel` `tabs` array after Workspace:

```tsx
{ id: 'watch-folders', label: 'Watch Folders', icon: null },
```

- [ ] **Step 5: Run settings tests**

Run:

```powershell
npm test -- --runInBand src/renderer/components/__tests__/WatchFoldersSettings.test.tsx src/renderer/components/__tests__/Settings.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit settings UI**

Run:

```powershell
git add src/renderer/components/WatchFoldersSettings.tsx src/renderer/components/__tests__/WatchFoldersSettings.test.tsx src/renderer/components/Settings.tsx
git commit -m "Add watch folders settings UI"
```

## Task 8: Watched Rename Queue UI

**Files:**
- Create: `src/renderer/components/WatchedRenameQueue.tsx`
- Test: `src/renderer/components/__tests__/WatchedRenameQueue.test.tsx`
- Modify: `src/renderer/components/DirectoryExplorer.tsx`
- Modify: `src/renderer/contexts/WorkspaceContext.tsx`

- [ ] **Step 1: Write failing queue tests**

Add `src/renderer/components/__tests__/WatchedRenameQueue.test.tsx`:

```tsx
import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import WatchedRenameQueue from '../WatchedRenameQueue';
import { useWatchedRenameQueue } from '../../hooks/useWatchedRenameQueue';

jest.mock('../../hooks/useWatchedRenameQueue', () => ({
  useWatchedRenameQueue: jest.fn(),
}));

const mockUseWatchedRenameQueue = useWatchedRenameQueue as jest.MockedFunction<typeof useWatchedRenameQueue>;

describe('WatchedRenameQueue', () => {
  beforeEach(() => {
    mockUseWatchedRenameQueue.mockReturnValue({
      suggestions: [{
        id: 'suggestion-1',
        workspaceId: 'workspace-1',
        folderPath: 'C:/Downloads',
        filePath: 'C:/Downloads/scan.txt',
        originalName: 'scan.txt',
        suggestedName: 'invoice-2026.txt',
        reason: 'Invoice',
        status: 'suggested',
        fileSize: 12,
        fileMtimeMs: 1000,
        createdAt: '2026-06-03T00:00:00.000Z',
        updatedAt: '2026-06-03T00:00:01.000Z'
      }],
      groupedByFolder: {
        'C:/Downloads': [{
          id: 'suggestion-1',
          workspaceId: 'workspace-1',
          folderPath: 'C:/Downloads',
          filePath: 'C:/Downloads/scan.txt',
          originalName: 'scan.txt',
          suggestedName: 'invoice-2026.txt',
          reason: 'Invoice',
          status: 'suggested',
          fileSize: 12,
          fileMtimeMs: 1000,
          createdAt: '2026-06-03T00:00:00.000Z',
          updatedAt: '2026-06-03T00:00:01.000Z'
        }]
      },
      loading: false,
      error: null,
      load: jest.fn(),
      dismiss: jest.fn(async () => ({ success: true })),
      refresh: jest.fn(async () => ({ success: true })),
      apply: jest.fn(async () => ({ success: true }))
    });
  });

  it('renders grouped suggestions and actions', () => {
    render(<WatchedRenameQueue workspaceId="workspace-1" open onClose={jest.fn()} />);

    expect(screen.getByText('C:/Downloads')).toBeInTheDocument();
    expect(screen.getByText('scan.txt')).toBeInTheDocument();
    expect(screen.getByText('invoice-2026.txt')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /apply selected/i })).toBeInTheDocument();
  });

  it('applies selected suggestions', async () => {
    const user = userEvent.setup();
    const queue = mockUseWatchedRenameQueue();
    render(<WatchedRenameQueue workspaceId="workspace-1" open onClose={jest.fn()} />);

    await user.click(screen.getByRole('checkbox', { name: /select scan.txt/i }));
    await user.click(screen.getByRole('button', { name: /apply selected/i }));

    expect(queue.apply).toHaveBeenCalledWith(['suggestion-1']);
  });
});
```

- [ ] **Step 2: Run failing queue tests**

Run:

```powershell
npm test -- --runInBand src/renderer/components/__tests__/WatchedRenameQueue.test.tsx
```

Expected: FAIL because `WatchedRenameQueue` does not exist.

- [ ] **Step 3: Implement queue component**

Add `src/renderer/components/WatchedRenameQueue.tsx`:

```tsx
import React, { useMemo, useState } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Typography from '@mui/material/Typography';
import Alert from '@mui/material/Alert';
import CloseIcon from '@mui/icons-material/Close';
import RefreshIcon from '@mui/icons-material/Refresh';
import DeleteIcon from '@mui/icons-material/Delete';
import CheckIcon from '@mui/icons-material/Check';
import { useWatchedRenameQueue } from '../hooks/useWatchedRenameQueue';

interface WatchedRenameQueueProps {
  workspaceId?: string | null;
  open: boolean;
  onClose: () => void;
}

const WatchedRenameQueue: React.FC<WatchedRenameQueueProps> = ({ workspaceId, open, onClose }) => {
  const { groupedByFolder, suggestions, loading, error, apply, dismiss, refresh } = useWatchedRenameQueue(workspaceId);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const selected = useMemo(() => Array.from(selectedIds), [selectedIds]);
  const toggle = (id: string) => {
    setSelectedIds((previous) => {
      const next = new Set(previous);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const runAction = async (action: (ids: string[]) => Promise<unknown>) => {
    await action(selected);
    setSelectedIds(new Set());
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth PaperProps={{ tabIndex: -1 }}>
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          <Typography variant="h6" sx={{ flex: 1, fontFamily: 'var(--font-header)' }}>
            Watched Rename Queue
          </Typography>
          <IconButton aria-label="close" onClick={onClose}>
            <CloseIcon />
          </IconButton>
        </Box>
      </DialogTitle>
      <DialogContent dividers>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        {loading && <Typography>Loading watched suggestions...</Typography>}
        {!loading && suggestions.length === 0 && (
          <Typography color="text.secondary">No watched rename suggestions waiting for review.</Typography>
        )}

        {Object.entries(groupedByFolder).map(([folderPath, folderSuggestions]) => (
          <Box key={folderPath} sx={{ mb: 2 }}>
            <Typography variant="subtitle2" sx={{ fontFamily: 'var(--font-header)', mb: 1 }}>
              {folderPath}
            </Typography>
            <List dense>
              {folderSuggestions.map((suggestion) => (
                <ListItem
                  key={suggestion.id}
                  secondaryAction={<Chip label={suggestion.status} size="small" color={suggestion.status === 'error' ? 'error' : 'default'} />}
                >
                  <Checkbox
                    checked={selectedIds.has(suggestion.id)}
                    onChange={() => toggle(suggestion.id)}
                    inputProps={{ 'aria-label': `Select ${suggestion.originalName}` }}
                  />
                  <ListItemText
                    primary={`${suggestion.originalName} -> ${suggestion.suggestedName || '(no suggestion)'}`}
                    secondary={suggestion.errorMessage || suggestion.reason || ''}
                    primaryTypographyProps={{ sx: { fontFamily: 'var(--font-body)' } }}
                    secondaryTypographyProps={{ sx: { fontFamily: 'var(--font-body)' } }}
                  />
                </ListItem>
              ))}
            </List>
          </Box>
        ))}
      </DialogContent>
      <DialogActions sx={{ p: 2, gap: 1 }}>
        <Button startIcon={<DeleteIcon />} disabled={selected.length === 0} onClick={() => runAction(dismiss)}>
          Dismiss Selected
        </Button>
        <Button startIcon={<RefreshIcon />} disabled={selected.length === 0} onClick={() => runAction(refresh)}>
          Refresh Selected
        </Button>
        <Button variant="contained" startIcon={<CheckIcon />} disabled={selected.length === 0} onClick={() => runAction(apply)}>
          Apply Selected
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default WatchedRenameQueue;
```

- [ ] **Step 4: Notify main process when workspace changes**

Modify `src/renderer/contexts/WorkspaceContext.tsx` after the workspace settings load effect:

```tsx
useEffect(() => {
  window.electronAPI.setActiveWatchWorkspace(currentWorkspace?.id || null).catch((error) => {
    console.error('Failed to sync active watch workspace:', error);
  });
}, [currentWorkspace]);
```

- [ ] **Step 5: Add queue entry point in DirectoryExplorer**

Modify `src/renderer/components/DirectoryExplorer.tsx`:

1. Import:

```ts
import Badge from '@mui/material/Badge';
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive';
import WatchedRenameQueue from './WatchedRenameQueue';
import { useWatchedRenameQueue } from '../hooks/useWatchedRenameQueue';
```

2. Pull `currentWorkspace` from `useWorkspace()`:

```ts
currentWorkspace,
```

3. Add state and hook near other state:

```ts
const [watchQueueOpen, setWatchQueueOpen] = useState(false);
const watchedQueue = useWatchedRenameQueue(currentWorkspace?.id || null);
```

4. Add button near Rename/Sort:

```tsx
<IconButton
  className="enhanced-icon-button"
  onClick={() => setWatchQueueOpen(true)}
  size="small"
  aria-label="Open watched rename queue"
  title="Watched Rename Queue"
>
  <Badge badgeContent={watchedQueue.suggestions.length} color="primary">
    <NotificationsActiveIcon />
  </Badge>
</IconButton>
```

5. Render queue near dialogs:

```tsx
<WatchedRenameQueue
  workspaceId={currentWorkspace?.id || null}
  open={watchQueueOpen}
  onClose={() => setWatchQueueOpen(false)}
/>
```

- [ ] **Step 6: Run renderer tests**

Run:

```powershell
npm test -- --runInBand src/renderer/components/__tests__/WatchedRenameQueue.test.tsx src/renderer/contexts/__tests__/WorkspaceContext.test.tsx src/renderer/components/__tests__/DirectoryExplorer.test.tsx
```

Expected: PASS after updating mocks for new `electronAPI` methods in existing tests.

- [ ] **Step 7: Commit queue UI**

Run:

```powershell
git add src/renderer/components/WatchedRenameQueue.tsx src/renderer/components/__tests__/WatchedRenameQueue.test.tsx src/renderer/components/DirectoryExplorer.tsx src/renderer/contexts/WorkspaceContext.tsx src/renderer/contexts/__tests__/WorkspaceContext.test.tsx src/renderer/components/__tests__/DirectoryExplorer.test.tsx
git commit -m "Add watched rename review queue"
```

## Task 9: E2E Coverage And Documentation

**Files:**
- Modify: `tests/e2e/electron-smoke.spec.ts`
- Modify: `ARCHITECTURE.md`
- Modify: `C:\Users\USER\Documents\home\02 - DEV\Projects\Kanban\keepdir Kanban.md`

- [ ] **Step 1: Add E2E watched-folder flow**

Modify `tests/e2e/electron-smoke.spec.ts`:

1. Add `mkdir` and `writeFile` already exist; add `readdir` and `rename` imports if needed:

```ts
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'fs/promises';
```

2. Add test:

```ts
test('queues and applies a watched-folder rename suggestion', async () => {
  tempHome = await mkdtemp(path.join(os.tmpdir(), 'keepdir-e2e-'));
  const watchedDirectory = path.join(tempHome, 'watched-inbox');
  await mkdir(watchedDirectory, { recursive: true });

  const launched = await launchApp(tempHome, {
    KEEPDIR_E2E_SELECT_DIRECTORY: watchedDirectory,
    KEEPDIR_E2E_WATCH_RENAME_STUB: '1',
  });
  app = launched.app;
  const { page } = launched;

  await expect(page.getByText('WORKSPACES')).toBeVisible();
  await page.getByText('Settings').click();
  const settingsDialog = page.getByRole('dialog');
  await settingsDialog.getByText('Watch Folders').click();
  await settingsDialog.getByRole('button', { name: /add watched folder/i }).click();
  await expect(settingsDialog.getByText(watchedDirectory)).toBeVisible();
  await settingsDialog.getByRole('button', { name: 'close' }).click();

  await writeFile(path.join(watchedDirectory, 'scan.txt'), 'watched file');

  await page.getByRole('button', { name: /open watched rename queue/i }).click();
  const queueDialog = page.getByRole('dialog');
  await expect(queueDialog.getByText('scan.txt -> organized-scan.txt')).toBeVisible({ timeout: 20_000 });
  await queueDialog.getByRole('checkbox', { name: /select scan.txt/i }).check();
  await queueDialog.getByRole('button', { name: /apply selected/i }).click();

  await expect.poll(async () => readdir(watchedDirectory)).toContain('organized-scan.txt');
});
```

- [ ] **Step 2: Update architecture docs**

Add to `ARCHITECTURE.md` under "Local Storage":

```md
- Watched-folder configuration is stored per workspace. Generated watched rename suggestions are stored in SQLite so review queues survive renderer reloads and app restarts.
```

Add under "Safety Boundaries":

```md
- Watch folders are opt-in and active only while the app is running. They can enqueue AI rename suggestions for direct-child files, but no watched file is renamed until the user applies selected suggestions.
```

- [ ] **Step 3: Update Kanban when implementation starts**

In `C:\Users\USER\Documents\home\02 - DEV\Projects\Kanban\keepdir Kanban.md`, move card `h_20260603_keepdir_watch_folders_rename_queue` from "Polish / Next Up" to "In Progress" at the start of implementation. After all verification passes, move it to "Done" and include the final commit hash.

- [ ] **Step 4: Run E2E test**

Run:

```powershell
npm run test:e2e -- --reporter=list
```

Expected: PASS, including the new watched-folder queue flow.

- [ ] **Step 5: Commit E2E and docs**

Run:

```powershell
git add tests/e2e/electron-smoke.spec.ts ARCHITECTURE.md "C:\Users\USER\Documents\home\02 - DEV\Projects\Kanban\keepdir Kanban.md"
git commit -m "Cover watched rename queue e2e"
```

## Task 10: Final Verification And Release Readiness Check

**Files:**
- Modify only if verification reveals a concrete failure.

- [ ] **Step 1: Run complete verification**

Run:

```powershell
npm run check
npm run format:check
npm run test:e2e -- --reporter=list
```

Expected:

```text
npm run check exits 0
npm run format:check exits 0
npm run test:e2e -- --reporter=list exits 0
```

- [ ] **Step 2: Inspect git state**

Run:

```powershell
git status --short --branch --untracked-files=all
git log --oneline --decorate -8
```

Expected: clean worktree on `codex/local-first-quality-hardening`, ahead of `origin/codex/local-first-quality-hardening`.

- [ ] **Step 3: Push feature branch**

Run:

```powershell
git push origin codex/local-first-quality-hardening
```

Expected: branch push succeeds. Do not merge to `main` and do not trigger a release until the user explicitly chooses a `v1.0.2` release path.

- [ ] **Step 4: Final implementation summary**

Report:

```text
Implemented opt-in watched folders with persisted rename suggestion queue.
Verification passed: npm run check, npm run format:check, npm run test:e2e -- --reporter=list.
Branch pushed: codex/local-first-quality-hardening.
Not released: package version is still 1.0.1 and main is untouched.
```

## Plan Self-Review

- Spec coverage: The tasks cover opt-in per-workspace watch folders, direct-child detection, stability checks, ignored temp/hidden files, persisted queue rows, manual apply, provider-missing errors, queue UI, settings UI, E2E, and docs.
- Scope check: The plan intentionally excludes recursive watching, background daemon behavior, automatic rename, auth, sync, and rule-learning.
- Type consistency: `WatchFolder`, `WatchedRenameSuggestion`, `WatchedRenameSuggestionStatus`, IPC names, database methods, and queue hook method names are consistent across tasks.
- Release boundary: This plan pushes the feature branch only. It does not merge to `main` or create a release.
