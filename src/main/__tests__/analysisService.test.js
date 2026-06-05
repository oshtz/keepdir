const path = require('path');

const { createAnalysisService } = require('../analysisService');

describe('analysisService', () => {
  const filePath = path.resolve('C:/Workspace/scan.txt');
  const fileEntries = [{
    name: 'scan.txt',
    path: filePath
  }];

  function createDb(overrides = {}) {
    return {
      getUnprocessedRenames: jest.fn(async (paths) => paths),
      getUnprocessedSorts: jest.fn(async (paths) => paths),
      getProcessedRename: jest.fn(),
      getProcessedSort: jest.fn(),
      getAllSettings: jest.fn(async () => ({
        selectedProvider: 'missing',
        apiKeys: { missing: 'key' }
      })),
      getFileHash: jest.fn(),
      isFileCached: jest.fn(),
      getCachedContent: jest.fn(),
      cacheFile: jest.fn(),
      bulkCacheRenameSuggestions: jest.fn(),
      bulkCacheSortSuggestions: jest.fn(),
      ...overrides
    };
  }

  it('returns a provider-missing error from analyzed entries', async () => {
    const service = createAnalysisService({
      db: createDb(),
      getProvider: jest.fn(() => null),
      logger: { debug: jest.fn(), error: jest.fn() }
    });

    await expect(service.analyzeEntries({
      sender: { send: jest.fn() },
      directoryPath: path.dirname(filePath),
      renameFiles: true,
      fileEntries
    })).resolves.toEqual({ error: 'Provider missing not found' });
  });

  it('returns deterministic rename suggestions when the E2E watch stub is enabled', async () => {
    const previous = process.env.KEEPDIR_E2E_WATCH_RENAME_STUB;
    process.env.KEEPDIR_E2E_WATCH_RENAME_STUB = '1';

    const db = createDb();
    const service = createAnalysisService({
      db,
      getProvider: jest.fn(() => null),
      logger: { debug: jest.fn(), error: jest.fn() }
    });

    try {
      await expect(service.analyzeEntries({
        sender: { send: jest.fn() },
        directoryPath: path.dirname(filePath),
        renameFiles: true,
        fileEntries
      })).resolves.toEqual({
        suggestions: {
          categories: [{
            name: 'Files to Rename',
            description: 'Files that will be renamed',
            suggestedPath: '.',
            files: ['scan.txt'],
            renames: [{
              originalName: 'scan.txt',
              suggestedName: 'organized-scan.txt',
              reason: 'Deterministic E2E rename suggestion'
            }]
          }]
        }
      });
    } finally {
      if (previous === undefined) {
        delete process.env.KEEPDIR_E2E_WATCH_RENAME_STUB;
      } else {
        process.env.KEEPDIR_E2E_WATCH_RENAME_STUB = previous;
      }
    }

    expect(db.getAllSettings).not.toHaveBeenCalled();
  });
});
