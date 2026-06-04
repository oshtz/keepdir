const fs = require('fs/promises');
const os = require('os');
const path = require('path');

describe('watched rename database contract', () => {
  let tempHome;
  let originalAppData;
  let originalHome;
  let Database;
  let db;

  beforeEach(async () => {
    jest.resetModules();
    originalAppData = process.env.APPDATA;
    originalHome = process.env.HOME;
    tempHome = await fs.mkdtemp(path.join(os.tmpdir(), 'keepdir-watch-db-'));
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

  it('serializes concurrent watch folder saves without losing entries', async () => {
    await db.saveWorkspace({ id: 'workspace-1', name: 'Workspace', emoji: 'K' });
    const folders = Array.from({ length: 10 }, (_, index) => ({
      id: `watch-${index + 1}`,
      path: path.join(tempHome, `Folder-${index + 1}`),
      enabled: true,
      createdAt: '2026-06-03T00:00:00.000Z'
    }));

    await Promise.all(folders.map((folder) => db.saveWatchFolder('workspace-1', folder)));

    const savedFolders = await db.getWatchFolders('workspace-1');
    expect(savedFolders.map((folder) => folder.id).sort()).toEqual(
      folders.map((folder) => folder.id).sort()
    );
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

  it('rejects terminal-status upserts and preserves the active suggestion', async () => {
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

    await expect(db.upsertWatchedRenameSuggestion({
      id: 'suggestion-2',
      workspaceId: 'workspace-1',
      folderPath: path.dirname(filePath),
      filePath,
      originalName: 'scan.pdf',
      suggestedName: 'receipt-2026.pdf',
      reason: 'Terminal update should use status helper',
      status: 'applied',
      fileSize: 12,
      fileMtimeMs: 1000
    })).rejects.toThrow('Watched rename suggestion status must be updated explicitly');

    const rows = await db.getWatchedRenameSuggestions('workspace-1', ['suggested', 'applied']);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: 'suggestion-1',
      suggested_name: 'invoice-2026.pdf',
      status: 'suggested'
    });
  });

  it('rejects malformed watched rename suggestions before persistence', async () => {
    await db.saveWorkspace({ id: 'workspace-1', name: 'Workspace', emoji: 'K' });
    const folderPath = path.join(tempHome, 'Downloads');
    const validSuggestion = {
      id: 'suggestion-1',
      workspaceId: 'workspace-1',
      folderPath,
      filePath: path.join(folderPath, 'scan.pdf'),
      originalName: 'scan.pdf',
      suggestedName: 'invoice-2026.pdf',
      reason: 'Looks like an invoice',
      status: 'suggested',
      fileSize: 12,
      fileMtimeMs: 1000
    };

    await expect(db.upsertWatchedRenameSuggestion({
      ...validSuggestion,
      id: undefined
    })).rejects.toThrow('Watched suggestion id must be a string');
    await expect(db.upsertWatchedRenameSuggestion({
      ...validSuggestion,
      filePath: path.join(tempHome, 'Other', 'scan.pdf')
    })).rejects.toThrow('inside watched folder');
    await expect(db.upsertWatchedRenameSuggestion({
      ...validSuggestion,
      suggestedName: 'nested/invoice.pdf'
    })).rejects.toThrow('Suggested file name must be a file name');
    await expect(db.upsertWatchedRenameSuggestion({
      ...validSuggestion,
      fileSize: -1
    })).rejects.toThrow('File size cannot be negative');

    const rows = await db.getWatchedRenameSuggestions('workspace-1');
    expect(rows).toHaveLength(0);
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
