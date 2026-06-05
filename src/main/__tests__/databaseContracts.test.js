const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

function runSqlite(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(error) {
      if (error) {
        reject(error);
        return;
      }
      resolve(this);
    });
  });
}

function closeSqlite(db) {
  return new Promise((resolve, reject) => {
    db.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

describe('database local-first contract', () => {
  let tempHome;
  let originalAppData;
  let originalHome;
  let Database;
  let db;

  beforeEach(async () => {
    jest.resetModules();
    originalAppData = process.env.APPDATA;
    originalHome = process.env.HOME;
    tempHome = await fs.mkdtemp(path.join(os.tmpdir(), 'keepdir-db-contract-'));
    process.env.APPDATA = tempHome;
    process.env.HOME = tempHome;
    Database = require('../database');
    db = new Database();
    await db._get('SELECT 1 as ready');
  });

  afterEach(async () => {
    try {
      await db?.close();
      await fs.rm(tempHome, { recursive: true, force: true });
    } finally {
      if (originalAppData === undefined) {
        delete process.env.APPDATA;
      } else {
        process.env.APPDATA = originalAppData;
      }

      if (originalHome === undefined) {
        delete process.env.HOME;
      } else {
        process.env.HOME = originalHome;
      }

      db = null;
    }
  });

  it('filters unsafe legacy workspace setting keys from full backups', async () => {
    await db.saveWorkspace({ id: 'workspace-1', name: 'Workspace', emoji: 'K' });
    await db.saveWorkspaceSetting('workspace-1', 'selectedProvider', 'openai');
    await db._run(
      'INSERT INTO workspace_settings (workspace_id, key, value) VALUES (?, ?, ?), (?, ?, ?)',
      [
        'workspace-1',
        'bad.key',
        '"unsafe"',
        'workspace-1',
        '__proto__',
        '{"polluted":true}'
      ]
    );

    const backup = await db.exportAllData();
    const exportedSettings = backup.workspaces[0].settings;

    expect(exportedSettings).toEqual({ selectedProvider: 'openai' });
    expect(exportedSettings.polluted).toBeUndefined();
  });

  it('ignores unsafe setting keys when importing a full backup', async () => {
    const result = await db.importAllData({
      version: '1.0',
      exportedAt: '2026-06-04T00:00:00.000Z',
      settings: {
        selectedProvider: 'openai',
        'bad.key': 'unsafe'
      },
      workspaces: [{
        workspace: {
          id: 'workspace-1',
          name: 'Workspace',
          emoji: 'K',
          created_at: '2026-06-04T00:00:00.000Z',
          updated_at: '2026-06-04T00:00:00.000Z'
        },
        settings: {
          selectedModel: 'gpt-4.1',
          'bad.key': 'unsafe',
          __proto__: { polluted: true }
        },
        customSections: []
      }]
    });

    expect(result).toMatchObject({
      success: true,
      imported: {
        workspaces: 1,
        settings: 1,
        customSections: 0
      },
      errors: []
    });

    await expect(db._get('SELECT value FROM settings WHERE key = ?', ['bad.key']))
      .resolves.toBeNull();
    await expect(db.getAllSettings()).resolves.toEqual({ selectedProvider: 'openai' });
    await expect(db.getWorkspaceSettings('workspace-1'))
      .resolves.toEqual({ selectedModel: 'gpt-4.1' });
    await expect(db._get(
      'SELECT value FROM workspace_settings WHERE workspace_id = ? AND key = ?',
      ['workspace-1', 'bad.key']
    )).resolves.toBeNull();
  });

  it('ignores unsafe setting keys when importing one workspace', async () => {
    const result = await db.importWorkspace({
      version: '1.0',
      exportedAt: '2026-06-04T00:00:00.000Z',
      workspace: {
        id: 'workspace-1',
        name: 'Workspace',
        emoji: 'K',
        created_at: '2026-06-04T00:00:00.000Z',
        updated_at: '2026-06-04T00:00:00.000Z'
      },
      settings: {
        selectedModel: 'gpt-4.1',
        'bad.key': 'unsafe'
      },
      customSections: []
    });

    expect(result).toMatchObject({
      success: true,
      workspaceId: 'workspace-1',
      imported: {
        workspace: 'Workspace',
        settings: 1,
        customSections: 0
      }
    });
    await expect(db.getWorkspaceSettings('workspace-1'))
      .resolves.toEqual({ selectedModel: 'gpt-4.1' });
    await expect(db._get(
      'SELECT value FROM workspace_settings WHERE workspace_id = ? AND key = ?',
      ['workspace-1', 'bad.key']
    )).resolves.toBeNull();
  });

  it('deletes workspace-owned settings and custom sections with the workspace', async () => {
    await db.saveWorkspace({ id: 'workspace-1', name: 'Workspace', emoji: 'K' });
    await db.saveWorkspaceSetting('workspace-1', 'selectedModel', 'gpt-4.1');
    const section = await db.createCustomSection('workspace-1', {
      name: 'Pinned',
      icon: 'P',
      color: '#123456',
      items: [{ id: 'item-1', path: path.join(tempHome, 'note.txt') }]
    });

    await db.deleteWorkspace('workspace-1');

    await expect(db.getWorkspaceSettings('workspace-1')).resolves.toEqual({});
    await expect(db.getCustomSections('workspace-1')).resolves.toEqual([]);
    await expect(db._get('SELECT id FROM custom_sections WHERE id = ?', [section.id]))
      .resolves.toBeNull();
  });

  it('round-trips workspace settings and custom sections through workspace export/import', async () => {
    await db.saveWorkspace({ id: 'workspace-1', name: 'Workspace', emoji: 'K' });
    await db.saveWorkspaceSetting('workspace-1', 'selectedModel', 'gpt-4.1');
    await db.saveWorkspaceSetting('workspace-1', 'viewState', {
      layout: 'grid',
      showHidden: false
    });
    const originalSection = await db.createCustomSection('workspace-1', {
      name: 'Pinned',
      icon: 'P',
      color: '#123456',
      items: [
        { id: 'item-1', name: 'Note', path: path.join(tempHome, 'note.txt') },
        { id: 'item-2', name: 'Scan', path: path.join(tempHome, 'scan.pdf') }
      ]
    });

    const exported = await db.exportWorkspace('workspace-1');
    const result = await db.importWorkspace(exported, { generateNewId: true });

    expect(result.success).toBe(true);
    expect(result.workspaceId).not.toBe('workspace-1');
    await expect(db.getWorkspaceSettings(result.workspaceId)).resolves.toEqual({
      selectedModel: 'gpt-4.1',
      viewState: {
        layout: 'grid',
        showHidden: false
      }
    });

    const importedSections = await db.getCustomSections(result.workspaceId);
    expect(importedSections).toHaveLength(1);
    expect(importedSections[0]).toMatchObject({
      workspace_id: result.workspaceId,
      name: 'Pinned',
      icon: 'P',
      color: '#123456',
      items: [
        { id: 'item-1', name: 'Note', path: path.join(tempHome, 'note.txt') },
        { id: 'item-2', name: 'Scan', path: path.join(tempHome, 'scan.pdf') }
      ]
    });
    expect(importedSections[0].id).not.toBe(originalSection.id);
  });

  it('migrates legacy processed_files rows into processed_renames', async () => {
    await db.close();
    db = null;

    const keepdirPath = path.join(tempHome, '.keepdir');
    const dbPath = path.join(keepdirPath, 'cache.db');
    await fs.rm(keepdirPath, { recursive: true, force: true });
    await fs.mkdir(keepdirPath, { recursive: true });
    const legacyDb = new sqlite3.Database(dbPath);
    try {
      await runSqlite(legacyDb, `
        CREATE TABLE processed_files (
          file_path TEXT PRIMARY KEY,
          original_name TEXT NOT NULL,
          suggested_name TEXT,
          reason TEXT,
          status TEXT NOT NULL,
          processed_at DATETIME,
          applied_at DATETIME
        )
      `);
      await runSqlite(
        legacyDb,
        `INSERT INTO processed_files
         (file_path, original_name, suggested_name, reason, status, processed_at, applied_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          path.join(tempHome, 'legacy.txt'),
          'legacy.txt',
          'renamed-legacy.txt',
          'Readable name',
          'suggested',
          '2026-06-04 10:00:00',
          null
        ]
      );
    } finally {
      await closeSqlite(legacyDb);
    }

    db = new Database();
    await db._get('SELECT 1 as ready');

    await expect(db._get('SELECT * FROM processed_renames WHERE file_path = ?', [
      path.join(tempHome, 'legacy.txt')
    ])).resolves.toMatchObject({
      original_name: 'legacy.txt',
      suggested_name: 'renamed-legacy.txt',
      reason: 'Readable name',
      status: 'suggested'
    });
    await expect(db._get(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'processed_files'"
    )).resolves.toBeNull();
  });

  it('cancels initial maintenance cleanup when the scheduler is stopped', async () => {
    await db.close();
    db = null;

    jest.useFakeTimers();
    const cleanupSpy = jest.spyOn(Database.prototype, 'cleanupCache').mockResolvedValue();

    try {
      db = new Database();
      await db._get('SELECT 1 as ready');
      db.stopMaintenanceScheduler();

      jest.advanceTimersByTime(30_000);
      await Promise.resolve();

      expect(cleanupSpy).not.toHaveBeenCalled();
    } finally {
      cleanupSpy.mockRestore();
      jest.useRealTimers();
    }
  });
});
