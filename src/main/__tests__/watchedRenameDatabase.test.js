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
    await db?.close();
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
