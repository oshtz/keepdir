const path = require('path');
const fs = require('fs').promises;
const { watch } = require('fs');
const {
  isIgnoredWatchedFileName,
  requireDirectChildFilePath
} = require('./watchFolderValidation');

function defaultCreateId() {
  return `watch-suggestion-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function createWatchFolderManager({
  db,
  analysisService,
  fsModule = fs,
  nativeWatch,
  notify,
  createId = defaultCreateId,
  delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  scanDebounceMs = 300,
  stableDelayMs = 1500
}) {
  let activeWorkspaceId = null;
  let analysisQueue = Promise.resolve();
  const watchers = new Map();
  const pendingScans = new Map();
  const watchImpl = nativeWatch || fsModule.watch || watch;

  function emit(channel, payload) {
    if (typeof notify === 'function') {
      notify(channel, payload);
    }
  }

  function clearPendingScans() {
    for (const timeoutId of pendingScans.values()) {
      clearTimeout(timeoutId);
    }
    pendingScans.clear();
  }

  function stopAll() {
    for (const watcher of watchers.values()) {
      if (typeof watcher?.close === 'function') {
        watcher.close();
      }
    }
    watchers.clear();
    clearPendingScans();
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
    try {
      const watcher = watchImpl(folderPath, () => {
        scheduleFolderScan(folderPath);
      });
      watchers.set(folder.id, watcher);
      scheduleFolderScan(folderPath);
    } catch (error) {
      emit('watch-folders-changed', {
        workspaceId: activeWorkspaceId,
        folderPath,
        error: error.message
      });
    }
  }

  function scheduleFolderScan(folderPath) {
    if (!activeWorkspaceId) {
      return;
    }

    const resolvedFolderPath = path.resolve(folderPath);
    const workspaceId = activeWorkspaceId;
    const key = `${workspaceId}:${resolvedFolderPath}`;
    if (pendingScans.has(key)) {
      clearTimeout(pendingScans.get(key));
    }

    const timeoutId = setTimeout(() => {
      pendingScans.delete(key);
      scanFolder(workspaceId, resolvedFolderPath).catch((error) => {
        emit('watch-folders-changed', {
          workspaceId,
          folderPath: resolvedFolderPath,
          error: error.message
        });
      });
    }, scanDebounceMs);
    pendingScans.set(key, timeoutId);
  }

  async function scanFolder(workspaceId, folderPath) {
    let entries;
    try {
      entries = await fsModule.readdir(folderPath, { withFileTypes: true });
    } catch (error) {
      if (error.code === 'ENOENT' || error.code === 'ENOTDIR' || error.code === 'EACCES' || error.code === 'EPERM') {
        emit('watch-folders-changed', {
          workspaceId,
          folderPath,
          error: error.message
        });
        return;
      }
      throw error;
    }

    for (const entry of entries) {
      if (typeof entry.isFile !== 'function' || !entry.isFile() || isIgnoredWatchedFileName(entry.name)) {
        continue;
      }
      await handleDetectedPath({
        workspaceId,
        folderPath,
        filePath: path.join(folderPath, entry.name)
      });
    }
  }

  function handleDetectedPath(candidate) {
    const run = analysisQueue
      .catch(() => undefined)
      .then(() => processDetectedPath(candidate));
    analysisQueue = run.catch(() => undefined);
    return run;
  }

  async function safeLstat(filePath) {
    try {
      return await fsModule.lstat(filePath);
    } catch (error) {
      if (error.code === 'ENOENT' || error.code === 'ENOTDIR') {
        return null;
      }
      throw error;
    }
  }

  function isStableStats(firstStats, secondStats) {
    return firstStats.size === secondStats.size && firstStats.mtimeMs === secondStats.mtimeMs;
  }

  function findRename(result, originalName) {
    const categories = Array.isArray(result?.suggestions?.categories)
      ? result.suggestions.categories
      : [];

    for (const category of categories) {
      const renames = Array.isArray(category?.renames) ? category.renames : [];
      const match = renames.find((item) => item?.originalName === originalName);
      if (match) {
        return match;
      }
    }
    return null;
  }

  async function upsertQueueEntry({
    suggestionId,
    workspaceId,
    folderPath,
    filePath,
    originalName,
    status,
    stats,
    suggestedName = null,
    reason = null,
    errorMessage = null
  }) {
    await db.upsertWatchedRenameSuggestion({
      id: suggestionId,
      workspaceId,
      folderPath,
      filePath,
      originalName,
      suggestedName,
      reason,
      status,
      fileSize: stats.size,
      fileMtimeMs: stats.mtimeMs,
      errorMessage
    });
    emit('watched-rename-suggestions-changed', { workspaceId });
  }

  async function processDetectedPath({ workspaceId, folderPath, filePath }) {
    const resolvedFolderPath = path.resolve(folderPath);
    const safeFilePath = requireDirectChildFilePath(resolvedFolderPath, filePath);
    const originalName = path.basename(safeFilePath);
    if (isIgnoredWatchedFileName(originalName)) {
      return;
    }

    const firstStats = await safeLstat(safeFilePath);
    if (!firstStats || !firstStats.isFile() || firstStats.isSymbolicLink()) {
      return;
    }

    await delay(stableDelayMs);
    const secondStats = await safeLstat(safeFilePath);
    if (!secondStats || !secondStats.isFile() || secondStats.isSymbolicLink()) {
      return;
    }
    if (!isStableStats(firstStats, secondStats)) {
      return;
    }

    const suggestionId = createId();
    await upsertQueueEntry({
      suggestionId,
      workspaceId,
      folderPath: resolvedFolderPath,
      filePath: safeFilePath,
      originalName,
      status: 'analyzing',
      stats: secondStats
    });

    const result = await analysisService.analyzeEntries({
      sender: { send: () => {} },
      directoryPath: resolvedFolderPath,
      renameFiles: true,
      fileEntries: [{ name: originalName, path: safeFilePath }],
      forceRefresh: true
    });

    if (result?.error) {
      await upsertQueueEntry({
        suggestionId,
        workspaceId,
        folderPath: resolvedFolderPath,
        filePath: safeFilePath,
        originalName,
        status: 'error',
        stats: secondStats,
        errorMessage: result.error
      });
      return;
    }

    const rename = findRename(result, originalName);
    if (!rename?.suggestedName) {
      await upsertQueueEntry({
        suggestionId,
        workspaceId,
        folderPath: resolvedFolderPath,
        filePath: safeFilePath,
        originalName,
        status: 'error',
        stats: secondStats,
        errorMessage: 'No rename suggestion returned'
      });
      return;
    }

    await upsertQueueEntry({
      suggestionId,
      workspaceId,
      folderPath: resolvedFolderPath,
      filePath: safeFilePath,
      originalName,
      suggestedName: rename.suggestedName,
      reason: rename.reason,
      status: 'suggested',
      stats: secondStats
    });
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
