const path = require('path');

const { requireString } = require('./ipcValidation');
const { normalizeRecordId } = require('./stateValidation');

const WATCH_FOLDER_SETTING_KEY = 'watchFolders';
const MAX_WATCH_FOLDERS = 100;
const MAX_WATCHED_SUGGESTION_IDS = 500;
const MAX_PATH_LENGTH = process.platform === 'win32' ? 32767 : 4096;
const TEMPORARY_FILE_SUFFIXES = [
  '.tmp',
  '.temp',
  '.part',
  '.crdownload',
  '.download'
];

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

function isPlainObject(value) {
  return Object.prototype.toString.call(value) === '[object Object]';
}

function requirePlainObject(value, label) {
  if (!isPlainObject(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value;
}

function normalizeIsoDate(value) {
  const date = value == null || value === ''
    ? new Date()
    : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return new Date().toISOString();
  }

  return date.toISOString();
}

function isIgnoredWatchedFileName(fileName) {
  if (typeof fileName !== 'string') {
    return true;
  }

  const name = fileName.trim();
  if (!name || name.startsWith('.') || name.endsWith('~')) {
    return true;
  }

  const lowerName = name.toLowerCase();
  return TEMPORARY_FILE_SUFFIXES.some(suffix => lowerName.endsWith(suffix));
}

function normalizeWatchFolder(folder) {
  const folderObject = requirePlainObject(folder, 'Watch folder');
  const folderPath = requireString(folderObject.path, 'Watch folder path', {
    maxLength: MAX_PATH_LENGTH,
    trim: true
  });

  return {
    id: normalizeRecordId(folderObject.id, 'Watch folder id'),
    path: path.resolve(folderPath),
    enabled: folderObject.enabled === true,
    createdAt: normalizeIsoDate(folderObject.createdAt)
  };
}

function normalizeWatchFoldersSetting(value) {
  if (value == null) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw new Error('Watch folders must be an array');
  }

  if (value.length > MAX_WATCH_FOLDERS) {
    throw new Error(`Watch folders cannot contain more than ${MAX_WATCH_FOLDERS} entries`);
  }

  return value.map(normalizeWatchFolder);
}

function normalizeWatchedSuggestionIds(ids) {
  if (!Array.isArray(ids) || ids.length === 0) {
    throw new Error('Watched suggestion ids must be a non-empty array');
  }

  if (ids.length > MAX_WATCHED_SUGGESTION_IDS) {
    throw new Error(`Watched suggestion ids cannot contain more than ${MAX_WATCHED_SUGGESTION_IDS} entries`);
  }

  return ids.map(id => normalizeRecordId(id, 'Watched suggestion id'));
}

function normalizeWatchedRenameStatus(status) {
  if (!WATCHED_RENAME_STATUSES.has(status)) {
    throw new Error(`Watched rename status is invalid: ${status}`);
  }

  return status;
}

function requireDirectChildFilePath(folderPath, filePath) {
  const resolvedFolderPath = path.resolve(requireString(folderPath, 'Watch folder path', {
    maxLength: MAX_PATH_LENGTH,
    trim: true
  }));
  const resolvedFilePath = path.resolve(requireString(filePath, 'Watched file path', {
    maxLength: MAX_PATH_LENGTH,
    trim: true
  }));
  const relativePath = path.relative(resolvedFolderPath, resolvedFilePath);

  if (!relativePath || relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    throw new Error('Watched file path must be inside watched folder');
  }

  if (relativePath.split(path.sep).length !== 1) {
    throw new Error('Watched file path must be a direct child of watched folder');
  }

  return resolvedFilePath;
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
