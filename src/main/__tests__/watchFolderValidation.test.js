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
