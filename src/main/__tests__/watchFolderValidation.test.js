const path = require('path');

const {
  WATCH_FOLDER_SETTING_KEY,
  WATCHED_RENAME_STATUSES,
  isIgnoredWatchedFileName,
  normalizeWatchFolderId,
  normalizeWatchFolder,
  normalizeWatchFoldersSetting,
  normalizeWatchedRenameStatus,
  normalizeWatchedRenameSuggestion,
  normalizeWatchedSuggestionIds,
  requireDirectChildFilePath,
  toWatchedRenameSuggestionPayload,
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

    expect(normalizeWatchFolder({
      id: 'watch-2',
      path: 'C:/Users/Ada/Desktop',
      enabled: 'true'
    }).enabled).toBe(false);
  });

  it('normalizes a bounded watch folder setting array', () => {
    const folders = normalizeWatchFoldersSetting([
      { id: 'watch-1', path: 'C:/One', enabled: true },
      { id: 'watch-2', path: 'C:/Two', enabled: false }
    ]);

    expect(folders).toHaveLength(2);
    expect(folders[0].enabled).toBe(true);
    expect(folders[1].enabled).toBe(false);
    expect(normalizeWatchFoldersSetting(null)).toEqual([]);
    expect(normalizeWatchFoldersSetting(undefined)).toEqual([]);
    expect(() => normalizeWatchFoldersSetting('bad')).toThrow('Watch folders must be an array');
    expect(() => normalizeWatchFoldersSetting(Array.from({ length: 101 }, (_, index) => ({
      id: `watch-${index + 1}`,
      path: `C:/Folder-${index + 1}`
    })))).toThrow('100');
  });

  it('rejects unsafe ids and paths', () => {
    expect(normalizeWatchFolderId('watch-1')).toBe('watch-1');
    expect(() => normalizeWatchFolder({ id: '../bad', path: 'C:/Safe' })).toThrow('Watch folder id is invalid');
    expect(() => normalizeWatchFolderId('../bad')).toThrow('Watch folder id is invalid');
    expect(() => normalizeWatchFolder({ id: 'watch-1', path: '' })).toThrow('Watch folder path is required');
    expect(() => normalizeWatchedSuggestionIds(['suggestion-1', '../bad'])).toThrow('Watched suggestion id is invalid');
  });

  it('normalizes watched rename statuses from the exported status set', () => {
    const expectedStatuses = [
      'detected',
      'stabilizing',
      'queued',
      'analyzing',
      'suggested',
      'error',
      'dismissed',
      'applied',
      'stale'
    ];

    expect(Array.from(WATCHED_RENAME_STATUSES)).toEqual(expectedStatuses);
    expectedStatuses.forEach((status) => {
      expect(normalizeWatchedRenameStatus(status)).toBe(status);
    });
    expect(() => normalizeWatchedRenameStatus('unknown')).toThrow(
      'Watched rename status is invalid: unknown'
    );
  });

  it('requires bounded watched suggestion ids', () => {
    expect(normalizeWatchedSuggestionIds(['suggestion-1', 'suggestion-2'])).toEqual([
      'suggestion-1',
      'suggestion-2'
    ]);

    expect(() => normalizeWatchedSuggestionIds([])).toThrow('non-empty array');
    expect(() => normalizeWatchedSuggestionIds(Array.from({ length: 501 }, (_, index) => (
      `suggestion-${index + 1}`
    )))).toThrow('500');
  });

  it('detects ignored temporary and hidden filenames', () => {
    expect(isIgnoredWatchedFileName('')).toBe(true);
    expect(isIgnoredWatchedFileName('   ')).toBe(true);
    expect(isIgnoredWatchedFileName('.DS_Store')).toBe(true);
    expect(isIgnoredWatchedFileName('draft.txt~')).toBe(true);
    expect(isIgnoredWatchedFileName('sync.tmp')).toBe(true);
    expect(isIgnoredWatchedFileName('sync.temp')).toBe(true);
    expect(isIgnoredWatchedFileName('download.crdownload')).toBe(true);
    expect(isIgnoredWatchedFileName('partial.part')).toBe(true);
    expect(isIgnoredWatchedFileName('download.download')).toBe(true);
    expect(isIgnoredWatchedFileName('DOWNLOAD.TMP')).toBe(true);
    expect(isIgnoredWatchedFileName('DOWNLOAD.DOWNLOAD')).toBe(true);
    expect(isIgnoredWatchedFileName('notes.txt')).toBe(false);
  });

  it('requires direct child file paths', () => {
    const root = path.resolve('C:/Users/Ada/Downloads');
    expect(requireDirectChildFilePath(root, path.join(root, 'receipt.pdf'))).toBe(path.join(root, 'receipt.pdf'));
    expect(requireDirectChildFilePath(root, path.join(root, '..file.txt'))).toBe(path.join(root, '..file.txt'));
    expect(() => requireDirectChildFilePath(root, path.join(root, 'nested', 'receipt.pdf'))).toThrow('direct child');
    expect(() => requireDirectChildFilePath(root, path.resolve('C:/Users/Ada/Other/file.txt'))).toThrow('inside watched folder');
  });

  it('normalizes watched rename suggestions for persistence', () => {
    const folderPath = path.resolve('C:/Users/Ada/Downloads');
    const filePath = path.join(folderPath, 'scan.pdf');

    expect(normalizeWatchedRenameSuggestion({
      id: 'suggestion-1',
      workspaceId: 'workspace-1',
      folderPath,
      filePath,
      originalName: ' scan.pdf ',
      suggestedName: ' invoice-2026.pdf ',
      reason: ' Looks like an invoice ',
      status: 'suggested',
      fileSize: '12',
      fileMtimeMs: '1000'
    })).toEqual({
      id: 'suggestion-1',
      workspaceId: 'workspace-1',
      folderPath,
      filePath,
      originalName: 'scan.pdf',
      suggestedName: 'invoice-2026.pdf',
      reason: 'Looks like an invoice',
      status: 'suggested',
      fileSize: 12,
      fileMtimeMs: 1000,
      errorMessage: null
    });
  });

  it('rejects malformed watched rename suggestions', () => {
    const folderPath = path.resolve('C:/Users/Ada/Downloads');
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

    [
      [{ id: undefined }, 'Watched suggestion id must be a string'],
      [{ workspaceId: '../bad' }, 'Workspace id is invalid'],
      [{ filePath: path.join(folderPath, 'nested', 'scan.pdf') }, 'direct child'],
      [{ filePath: path.resolve('C:/Users/Ada/Other/scan.pdf') }, 'inside watched folder'],
      [{ originalName: 'nested/scan.pdf' }, 'Original file name must be a file name'],
      [{ suggestedName: 'nested/invoice.pdf' }, 'Suggested file name must be a file name'],
      [{ fileSize: undefined }, 'File size is required'],
      [{ fileSize: false }, 'File size must be a finite number'],
      [{ fileSize: -1 }, 'File size cannot be negative'],
      [{ fileSize: Number.POSITIVE_INFINITY }, 'File size must be a finite number'],
      [{ fileMtimeMs: undefined }, 'File mtime is required'],
      [{ fileMtimeMs: true }, 'File mtime must be a finite number'],
      [{ fileMtimeMs: -1 }, 'File mtime cannot be negative'],
      [{ status: 'dismissed' }, 'Watched rename suggestion status must be updated explicitly']
    ].forEach(([override, message]) => {
      expect(() => normalizeWatchedRenameSuggestion({
        ...validSuggestion,
        ...override
      })).toThrow(message);
    });
  });

  it('maps database rows to renderer payloads', () => {
    const row = {
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
    };
    const payload = {
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
    };

    expect(toWatchedRenameSuggestionPayload(row)).toEqual(payload);
    expect(toWatchedRenameSuggestionsPayload([row])).toEqual([payload]);
  });
});
