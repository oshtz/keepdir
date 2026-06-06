const path = require('path');
const { app } = require('electron');
const { autoUpdater } = require('electron-updater');

const GITHUB_OWNER = 'oshtz';
const GITHUB_REPO = 'keepdir';
const PENDING_UPDATE_TOKEN = 'electron-updater-pending-update';

let configured = false;
let updateWindow = null;
let lastUpdateInfo = null;
let downloadedUpdateInfo = null;
let downloadedUpdatePath = null;

function normalizeVersion(version) {
  if (!version) return '';
  return String(version).trim().replace(/^v/i, '').split('-')[0];
}

function compareVersions(left, right) {
  const leftParts = normalizeVersion(left).split('.').map(Number);
  const rightParts = normalizeVersion(right).split('.').map(Number);

  for (let i = 0; i < Math.max(leftParts.length, rightParts.length); i++) {
    const leftPart = leftParts[i] || 0;
    const rightPart = rightParts[i] || 0;

    if (leftPart > rightPart) return 1;
    if (leftPart < rightPart) return -1;
  }

  return 0;
}

function normalizeReleaseNotes(releaseNotes) {
  if (typeof releaseNotes === 'string') {
    return releaseNotes;
  }

  if (!Array.isArray(releaseNotes)) {
    return null;
  }

  const notes = releaseNotes
    .map((entry) => {
      if (typeof entry === 'string') {
        return entry;
      }
      if (!entry || typeof entry !== 'object') {
        return null;
      }
      if (typeof entry.note === 'string') {
        return entry.note;
      }
      if (typeof entry.notes === 'string') {
        return entry.notes;
      }
      return null;
    })
    .filter(Boolean);

  return notes.length > 0 ? notes.join('\n\n') : null;
}

function getAssetName(fileUrl) {
  if (typeof fileUrl !== 'string' || !fileUrl) {
    return undefined;
  }

  try {
    const parsed = new URL(fileUrl);
    return path.basename(parsed.pathname) || fileUrl;
  } catch {
    return path.basename(fileUrl.replace(/\\/g, '/')) || fileUrl;
  }
}

function toRendererUpdateInfo(updateInfo) {
  if (!updateInfo) {
    return null;
  }

  const firstFile =
    Array.isArray(updateInfo.files) && updateInfo.files.length > 0
      ? updateInfo.files[0]
      : null;
  const downloadUrl = firstFile && firstFile.url ? String(firstFile.url) : '';

  return {
    version: normalizeVersion(updateInfo.version),
    notes: normalizeReleaseNotes(updateInfo.releaseNotes),
    publishedAt: updateInfo.releaseDate || null,
    downloadUrl,
    assetName: getAssetName(downloadUrl),
    assetSize:
      firstFile && typeof firstFile.size === 'number' ? firstFile.size : null,
  };
}

function sendDownloadProgress(progress) {
  if (!updateWindow || updateWindow.isDestroyed()) {
    return;
  }

  updateWindow.webContents.send('update-download-progress', {
    percent: Math.round(progress.percent || 0),
    downloaded: progress.transferred || 0,
    total: progress.total || 0,
  });
}

function configureAutoUpdater(mainWindow) {
  if (mainWindow) {
    updateWindow = mainWindow;
  }

  if (configured) {
    return;
  }

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.allowPrerelease = false;
  autoUpdater.setFeedURL({
    provider: 'github',
    owner: GITHUB_OWNER,
    repo: GITHUB_REPO,
  });

  autoUpdater.on('download-progress', sendDownloadProgress);
  autoUpdater.on('update-downloaded', (updateInfo) => {
    downloadedUpdateInfo = toRendererUpdateInfo(updateInfo) || lastUpdateInfo;
    downloadedUpdatePath = downloadedUpdatePath || PENDING_UPDATE_TOKEN;
  });
  autoUpdater.on('error', (error) => {
    console.error('Auto-updater error:', error.message);
  });

  configured = true;
}

function assertMatchesLastUpdate(updateInfo) {
  if (!lastUpdateInfo) {
    throw new Error('Check for updates before downloading.');
  }

  if (!updateInfo) {
    return lastUpdateInfo;
  }

  for (const key of ['version', 'downloadUrl', 'assetName']) {
    if (updateInfo[key] && updateInfo[key] !== lastUpdateInfo[key]) {
      throw new Error(
        'Update details do not match the latest trusted update check.'
      );
    }
  }

  return lastUpdateInfo;
}

async function checkForUpdate(mainWindow) {
  if (!app.isPackaged) {
    return { error: 'Updates are disabled in development mode.' };
  }

  try {
    configureAutoUpdater(mainWindow);
    lastUpdateInfo = null;
    downloadedUpdateInfo = null;
    downloadedUpdatePath = null;

    const result = await autoUpdater.checkForUpdates();
    const updateInfo = toRendererUpdateInfo(result && result.updateInfo);

    if (
      !updateInfo ||
      !updateInfo.version ||
      compareVersions(updateInfo.version, app.getVersion()) <= 0
    ) {
      return { updateInfo: null };
    }

    lastUpdateInfo = updateInfo;
    return { updateInfo };
  } catch (error) {
    console.error('Update check failed:', error.message);
    return { error: `Failed to check for updates: ${error.message}` };
  }
}

async function downloadUpdate(updateInfo, mainWindow) {
  if (!app.isPackaged) {
    return { error: 'Updates are disabled in development mode.' };
  }

  try {
    configureAutoUpdater(mainWindow);
    const trustedUpdateInfo = assertMatchesLastUpdate(updateInfo);
    const downloadedFiles = await autoUpdater.downloadUpdate();
    const updatePath =
      Array.isArray(downloadedFiles) && downloadedFiles[0]
        ? downloadedFiles[0]
        : PENDING_UPDATE_TOKEN;

    downloadedUpdateInfo = trustedUpdateInfo;
    downloadedUpdatePath = updatePath;
    return { updatePath };
  } catch (error) {
    console.error('Download failed:', error.message);
    return { error: error.message };
  }
}

async function installUpdate(_updatePath) {
  if (!app.isPackaged) {
    return { error: 'Updates are disabled in development mode.' };
  }

  try {
    if (!downloadedUpdateInfo && !downloadedUpdatePath) {
      return { error: 'Download the update before installing.' };
    }

    autoUpdater.quitAndInstall(false, true);
    return { success: true };
  } catch (error) {
    console.error('Install failed:', error.message);
    return { error: `Failed to install update: ${error.message}` };
  }
}

function cleanupUpdates() {
  // electron-updater owns its update cache and cleans pending updates itself.
}

function _resetForTests() {
  configured = false;
  updateWindow = null;
  lastUpdateInfo = null;
  downloadedUpdateInfo = null;
  downloadedUpdatePath = null;
}

module.exports = {
  checkForUpdate,
  downloadUpdate,
  installUpdate,
  cleanupUpdates,
  compareVersions,
  normalizeVersion,
  _resetForTests,
};
