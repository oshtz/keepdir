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

function fileEntry(name) {
  return {
    name,
    isFile: () => true,
    isDirectory: () => false,
    isSymbolicLink: () => false
  };
}

function createDb(overrides = {}) {
  return {
    getWatchFolders: jest.fn(async () => []),
    upsertWatchedRenameSuggestion: jest.fn(),
    updateWatchedRenameSuggestionStatus: jest.fn(),
    ...overrides
  };
}

describe('watch folder manager', () => {
  it('starts only enabled folders for the active workspace', async () => {
    const fsModule = createFs();
    const db = createDb({
      getWatchFolders: jest.fn(async () => [
        { id: 'watch-1', path: path.resolve('C:/One'), enabled: true },
        { id: 'watch-2', path: path.resolve('C:/Two'), enabled: false }
      ])
    });
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
    manager.shutdown();
  });

  it('ignores temporary and hidden files', async () => {
    const fsModule = createFs();
    const db = createDb();
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
    expect(fsModule.lstat).not.toHaveBeenCalled();
  });

  it('queues a stable file and stores the rename suggestion', async () => {
    const fsModule = createFs();
    const folderPath = path.resolve('C:/Downloads');
    const filePath = path.join(folderPath, 'scan.txt');
    fsModule.stats.set(filePath, fileStat(12, 1000));

    const db = createDb();
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
    const notify = jest.fn();
    const manager = createWatchFolderManager({
      db,
      analysisService,
      fsModule,
      notify,
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
    expect(db.upsertWatchedRenameSuggestion).toHaveBeenNthCalledWith(1, expect.objectContaining({
      id: 'suggestion-1',
      status: 'analyzing'
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
    expect(notify).toHaveBeenCalledWith('watched-rename-suggestions-changed', { workspaceId: 'workspace-1' });
  });

  it('marks analysis errors in the queue', async () => {
    const fsModule = createFs();
    const folderPath = path.resolve('C:/Downloads');
    const filePath = path.join(folderPath, 'scan.txt');
    fsModule.stats.set(filePath, fileStat(12, 1000));

    const db = createDb();
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

  it('drops files that disappear or change before the stability check completes', async () => {
    const fsModule = createFs();
    const folderPath = path.resolve('C:/Downloads');
    const filePath = path.join(folderPath, 'scan.txt');
    fsModule.lstat
      .mockResolvedValueOnce(fileStat(12, 1000))
      .mockResolvedValueOnce(fileStat(13, 1001));

    const db = createDb();
    const analysisService = { analyzeEntries: jest.fn() };
    const manager = createWatchFolderManager({
      db,
      analysisService,
      fsModule,
      notify: jest.fn(),
      createId: () => 'suggestion-1',
      delay: async () => undefined
    });

    await manager.handleDetectedPath({ workspaceId: 'workspace-1', folderPath, filePath });

    expect(db.upsertWatchedRenameSuggestion).not.toHaveBeenCalled();
    expect(analysisService.analyzeEntries).not.toHaveBeenCalled();

    fsModule.lstat
      .mockResolvedValueOnce(fileStat(12, 1000))
      .mockRejectedValueOnce(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));

    await expect(manager.handleDetectedPath({ workspaceId: 'workspace-1', folderPath, filePath }))
      .resolves.toBeUndefined();
  });

  it('coalesces repeated watcher events into one folder scan', async () => {
    jest.useFakeTimers();
    const fsModule = createFs();
    const folderPath = path.resolve('C:/Downloads');
    const filePath = path.join(folderPath, 'scan.txt');
    fsModule.stats.set(filePath, fileStat(12, 1000));
    fsModule.readdir.mockResolvedValue([fileEntry('scan.txt')]);

    const db = createDb({
      getWatchFolders: jest.fn(async () => [
        { id: 'watch-1', path: folderPath, enabled: true }
      ])
    });
    const analysisService = {
      analyzeEntries: jest.fn(async () => ({
        suggestions: {
          categories: [{
            renames: [{
              originalName: 'scan.txt',
              suggestedName: 'invoice-2026.txt'
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
      delay: async () => undefined,
      scanDebounceMs: 300
    });

    try {
      await manager.setActiveWorkspace('workspace-1');
      const watcherCallback = fsModule.watch.mock.calls[0][1];

      watcherCallback('rename', 'scan.txt');
      watcherCallback('change', 'scan.txt');
      await jest.advanceTimersByTimeAsync(300);

      expect(fsModule.readdir).toHaveBeenCalledTimes(1);
    } finally {
      manager.shutdown();
      jest.useRealTimers();
    }
  });
});
