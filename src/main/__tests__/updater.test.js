const mockApp = {
  isPackaged: true,
  getVersion: jest.fn(() => '1.0.0'),
};

const updaterListeners = new Map();
const mockAutoUpdater = {
  autoDownload: true,
  autoInstallOnAppQuit: true,
  allowPrerelease: true,
  setFeedURL: jest.fn(),
  checkForUpdates: jest.fn(),
  downloadUpdate: jest.fn(),
  quitAndInstall: jest.fn(),
  on: jest.fn((eventName, listener) => {
    updaterListeners.set(eventName, listener);
    return mockAutoUpdater;
  }),
};

jest.mock('electron', () => ({
  app: mockApp,
}));

jest.mock(
  'electron-updater',
  () => ({
    autoUpdater: mockAutoUpdater,
  }),
  { virtual: true }
);

const updater = require('../updater');

function createMainWindow() {
  return {
    isDestroyed: jest.fn(() => false),
    webContents: {
      send: jest.fn(),
    },
  };
}

function createUpdateInfo(overrides = {}) {
  return {
    version: '2.0.0',
    releaseName: 'Release 2.0.0',
    releaseDate: '2026-06-06T12:00:00.000Z',
    releaseNotes: 'One-click updater release notes',
    files: [
      {
        url: 'KeepDir-Setup-2.0.0.exe',
        size: 174000000,
      },
    ],
    ...overrides,
  };
}

describe('electron-updater integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    updaterListeners.clear();
    mockApp.isPackaged = true;
    mockApp.getVersion.mockReturnValue('1.0.0');
    mockAutoUpdater.autoDownload = true;
    mockAutoUpdater.autoInstallOnAppQuit = true;
    mockAutoUpdater.allowPrerelease = true;
    if (typeof updater._resetForTests === 'function') {
      updater._resetForTests();
    }
  });

  it('configures electron-updater for GitHub releases without automatic background install', async () => {
    mockAutoUpdater.checkForUpdates.mockResolvedValue({
      updateInfo: createUpdateInfo(),
    });

    const result = await updater.checkForUpdate();

    expect(mockAutoUpdater.autoDownload).toBe(false);
    expect(mockAutoUpdater.autoInstallOnAppQuit).toBe(false);
    expect(mockAutoUpdater.allowPrerelease).toBe(false);
    expect(mockAutoUpdater.setFeedURL).toHaveBeenCalledWith({
      provider: 'github',
      owner: 'oshtz',
      repo: 'keepdir',
    });
    expect(mockAutoUpdater.checkForUpdates).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      updateInfo: {
        version: '2.0.0',
        notes: 'One-click updater release notes',
        publishedAt: '2026-06-06T12:00:00.000Z',
        assetName: 'KeepDir-Setup-2.0.0.exe',
        assetSize: 174000000,
        downloadUrl: 'KeepDir-Setup-2.0.0.exe',
      },
    });
  });

  it('returns up to date when electron-updater finds no newer version', async () => {
    mockApp.getVersion.mockReturnValue('2.0.0');
    mockAutoUpdater.checkForUpdates.mockResolvedValue({
      updateInfo: createUpdateInfo({ version: '2.0.0' }),
    });

    const result = await updater.checkForUpdate();

    expect(result).toEqual({ updateInfo: null });
  });

  it('downloads the checked update and forwards progress events to the renderer', async () => {
    const mainWindow = createMainWindow();
    mockAutoUpdater.checkForUpdates.mockResolvedValue({
      updateInfo: createUpdateInfo(),
    });
    mockAutoUpdater.downloadUpdate.mockResolvedValue([
      'C:\\Users\\USER\\AppData\\Local\\keepdir-updater\\pending\\KeepDir-Setup-2.0.0.exe',
    ]);

    const checkResult = await updater.checkForUpdate(mainWindow);
    updaterListeners.get('download-progress')({
      percent: 42.4,
      transferred: 424,
      total: 1000,
    });
    const result = await updater.downloadUpdate(checkResult.updateInfo);

    expect(mainWindow.webContents.send).toHaveBeenCalledWith(
      'update-download-progress',
      {
        percent: 42,
        downloaded: 424,
        total: 1000,
      }
    );
    expect(mockAutoUpdater.downloadUpdate).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      updatePath:
        'C:\\Users\\USER\\AppData\\Local\\keepdir-updater\\pending\\KeepDir-Setup-2.0.0.exe',
    });
  });

  it('requires a trusted update check before downloading or installing', async () => {
    const consoleSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    const downloadResult = await updater.downloadUpdate();
    const installResult = await updater.installUpdate();

    expect(downloadResult).toEqual({
      error: 'Check for updates before downloading.',
    });
    expect(installResult).toEqual({
      error: 'Download the update before installing.',
    });
    expect(mockAutoUpdater.downloadUpdate).not.toHaveBeenCalled();
    expect(mockAutoUpdater.quitAndInstall).not.toHaveBeenCalled();

    consoleSpy.mockRestore();
  });

  it('calls quitAndInstall after a downloaded update is ready', async () => {
    mockAutoUpdater.checkForUpdates.mockResolvedValue({
      updateInfo: createUpdateInfo(),
    });
    mockAutoUpdater.downloadUpdate.mockResolvedValue(['pending-update']);

    const checkResult = await updater.checkForUpdate();
    await updater.downloadUpdate(checkResult.updateInfo);
    const result = await updater.installUpdate('ignored-renderer-token');

    expect(result).toEqual({ success: true });
    expect(mockAutoUpdater.quitAndInstall).toHaveBeenCalledWith(false, true);
  });

  it('surfaces electron-updater errors without starting an install', async () => {
    const consoleSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    mockAutoUpdater.checkForUpdates.mockRejectedValue(
      new Error('feed unavailable')
    );

    const result = await updater.checkForUpdate();

    expect(result).toEqual({
      error: 'Failed to check for updates: feed unavailable',
    });
    expect(mockAutoUpdater.downloadUpdate).not.toHaveBeenCalled();
    expect(mockAutoUpdater.quitAndInstall).not.toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalledWith(
      'Update check failed:',
      'feed unavailable'
    );
    consoleSpy.mockRestore();
  });

  it('keeps updates disabled in development mode', async () => {
    mockApp.isPackaged = false;

    await expect(updater.checkForUpdate()).resolves.toEqual({
      error: 'Updates are disabled in development mode.',
    });
    await expect(updater.downloadUpdate()).resolves.toEqual({
      error: 'Updates are disabled in development mode.',
    });
    await expect(updater.installUpdate()).resolves.toEqual({
      error: 'Updates are disabled in development mode.',
    });
    expect(mockAutoUpdater.checkForUpdates).not.toHaveBeenCalled();
    expect(mockAutoUpdater.downloadUpdate).not.toHaveBeenCalled();
    expect(mockAutoUpdater.quitAndInstall).not.toHaveBeenCalled();
  });
});
