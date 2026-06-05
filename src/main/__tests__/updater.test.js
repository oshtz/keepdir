const fs = require('fs');
const fsp = require('fs').promises;
const os = require('os');
const path = require('path');
const { Readable } = require('stream');

const mockApp = {
  isPackaged: true,
  getVersion: jest.fn(() => '1.0.0'),
  getPath: jest.fn(),
  exit: jest.fn(),
};

const mockSpawn = jest.fn(() => ({ unref: jest.fn() }));

jest.mock('electron', () => ({
  app: mockApp,
}));

jest.mock('child_process', () => ({
  spawn: (...args) => mockSpawn(...args),
}));

jest.mock('axios', () => {
  const mockAxios = jest.fn();
  mockAxios.get = jest.fn();
  return mockAxios;
});

const axios = require('axios');
const updater = require('../updater');

const ZIP_SHA256 =
  '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824';
const WINDOWS_UPDATE_URL =
  'https://github.com/oshtz/keepdir/releases/download/v2.0.0/KeepDir-Setup-2.0.0.exe';
const MAC_UPDATE_URL =
  'https://github.com/oshtz/keepdir/releases/download/v2.0.0/KeepDir-2.0.0-arm64.dmg';

function createRelease(assetOverrides = {}) {
  return {
    tag_name: 'v2.0.0',
    assets: [
      {
        name: 'KeepDir-Setup-2.0.0.exe',
        browser_download_url: WINDOWS_UPDATE_URL,
        size: 5,
        digest: `sha256:${ZIP_SHA256}`,
        ...assetOverrides,
      },
    ],
  };
}

function createMacRelease(assetOverrides = {}) {
  return {
    tag_name: 'v2.0.0',
    assets: [
      {
        name: 'KeepDir-2.0.0-arm64.dmg',
        browser_download_url: MAC_UPDATE_URL,
        size: 5,
        digest: `sha256:${ZIP_SHA256}`,
        ...assetOverrides,
      },
    ],
  };
}

function mockRelease(release = createRelease()) {
  axios.get.mockImplementation((url) => {
    if (String(url).includes('/repos/oshtz/keepdir/releases/latest')) {
      return Promise.resolve({ data: release });
    }
    return Promise.reject(new Error(`Unexpected GET ${url}`));
  });
}

describe('updater trust boundary', () => {
  let baseDir;
  let originalPlatform;

  beforeAll(() => {
    originalPlatform = process.platform;
    Object.defineProperty(process, 'platform', {
      value: 'win32',
      configurable: true,
    });
  });

  afterAll(() => {
    Object.defineProperty(process, 'platform', {
      value: originalPlatform,
      configurable: true,
    });
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    baseDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'keepdir-updater-'));
    mockApp.getPath.mockReturnValue(baseDir);
    mockApp.getVersion.mockReturnValue('1.0.0');
  });

  afterEach(async () => {
    await fsp.rm(baseDir, { recursive: true, force: true });
  });

  it('does not trust release assets outside the configured GitHub repository', async () => {
    const consoleSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    mockRelease(
      createRelease({
        name: 'KeepDir-Setup-2.0.0.exe',
        browser_download_url: 'https://example.com/KeepDir-Setup-2.0.0.exe',
        size: 5,
      })
    );

    const checkResult = await updater.checkForUpdate();
    expect(checkResult).toEqual({ error: 'Release asset URL is not trusted.' });

    const downloadResult = await updater.downloadUpdate();
    expect(downloadResult.error).toContain(
      'Check for updates before downloading'
    );
    expect(axios).not.toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalledWith(
      'Download failed:',
      'Check for updates before downloading.'
    );
    consoleSpy.mockRestore();
  });

  it('requires a GitHub asset digest for compatible releases', async () => {
    axios.get.mockResolvedValue({
      data: {
        tag_name: 'v2.0.0',
        assets: [
          {
            name: 'KeepDir-Setup-2.0.0.exe',
            browser_download_url: WINDOWS_UPDATE_URL,
            size: 5,
          },
        ],
      },
    });

    const checkResult = await updater.checkForUpdate();
    expect(checkResult).toEqual({
      error:
        'Release asset SHA-256 digest is missing for KeepDir-Setup-2.0.0.exe.',
    });
  });

  it('downloads only the update returned by the trusted update check', async () => {
    const consoleSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    mockRelease();
    const checkResult = await updater.checkForUpdate();

    expect(checkResult.updateInfo).toMatchObject({
      version: '2.0.0',
      assetName: 'KeepDir-Setup-2.0.0.exe',
      assetSize: 5,
      sha256: ZIP_SHA256,
    });

    const mismatchResult = await updater.downloadUpdate({
      ...checkResult.updateInfo,
      assetName: 'different.exe',
    });

    expect(mismatchResult.error).toContain('do not match');
    expect(axios).not.toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalledWith(
      'Download failed:',
      'Update details do not match the latest trusted update check.'
    );

    axios.mockResolvedValue({
      headers: {
        'content-length': '5',
      },
      data: Readable.from([Buffer.from('hello')]),
    });

    const downloadResult = await updater.downloadUpdate(checkResult.updateInfo);
    expect(downloadResult.updatePath).toBe(
      path.join(baseDir, 'updates', 'KeepDir-Setup-2.0.0.exe')
    );
    expect(await fsp.readFile(downloadResult.updatePath, 'utf8')).toBe('hello');
    consoleSpy.mockRestore();
  });

  it('rejects downloaded updates when the checksum does not match', async () => {
    const consoleSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    mockRelease(createRelease({ digest: `sha256:${'0'.repeat(64)}` }));
    const checkResult = await updater.checkForUpdate();
    axios.mockResolvedValue({
      headers: {
        'content-length': '5',
      },
      data: Readable.from([Buffer.from('hello')]),
    });

    const result = await updater.downloadUpdate(checkResult.updateInfo);
    const updatePath = path.join(baseDir, 'updates', 'KeepDir-Setup-2.0.0.exe');

    expect(result.error).toContain('checksum did not match');
    expect(fs.existsSync(updatePath)).toBe(false);
    expect(consoleSpy).toHaveBeenCalledWith(
      'Download failed:',
      'Downloaded update checksum did not match the release checksum.'
    );
    consoleSpy.mockRestore();
  });

  it('rejects install paths that do not match the downloaded trusted update', async () => {
    mockRelease();
    const checkResult = await updater.checkForUpdate();
    axios.mockResolvedValue({
      headers: {
        'content-length': '5',
      },
      data: Readable.from([Buffer.from('hello')]),
    });
    await updater.downloadUpdate(checkResult.updateInfo);

    const wrongPath = path.join(
      baseDir,
      'updates',
      '..',
      'KeepDir-Setup-2.0.0.exe'
    );
    fs.writeFileSync(path.join(baseDir, 'KeepDir-Setup-2.0.0.exe'), 'hello');

    const result = await updater.installUpdate(wrongPath);
    expect(result).toEqual({
      error: 'Update file does not match the trusted download.',
    });
  });

  it('re-verifies the downloaded update before installing', async () => {
    mockRelease();
    const checkResult = await updater.checkForUpdate();
    axios.mockResolvedValue({
      headers: {
        'content-length': '5',
      },
      data: Readable.from([Buffer.from('hello')]),
    });
    const downloadResult = await updater.downloadUpdate(checkResult.updateInfo);

    fs.writeFileSync(downloadResult.updatePath, 'HELLO');

    const result = await updater.installUpdate(downloadResult.updatePath);
    expect(result).toEqual({
      error: 'Update file checksum no longer matches the trusted download.',
    });
    expect(mockApp.exit).not.toHaveBeenCalled();
  });

  it('opens the verified Windows installer after the app exits', async () => {
    mockRelease();
    const checkResult = await updater.checkForUpdate();
    axios.mockResolvedValue({
      headers: {
        'content-length': '5',
      },
      data: Readable.from([Buffer.from('hello')]),
    });
    const downloadResult = await updater.downloadUpdate(checkResult.updateInfo);

    jest.useFakeTimers();
    try {
      const result = await updater.installUpdate(downloadResult.updatePath);

      expect(result).toEqual({ success: true });
      expect(mockSpawn).toHaveBeenCalledWith(
        'powershell',
        expect.arrayContaining([
          '-NoProfile',
          '-ExecutionPolicy',
          'Bypass',
          '-Command',
          expect.any(String),
        ]),
        expect.objectContaining({
          detached: true,
          stdio: 'ignore',
          windowsHide: true,
        })
      );

      const installScript = mockSpawn.mock.calls[0][1][4];
      expect(installScript).toContain('$installerPath =');
      expect(installScript).toContain('Start-Process -FilePath $installerPath');
      expect(installScript).not.toContain('Expand-Archive');

      jest.runOnlyPendingTimers();
      expect(mockApp.exit).toHaveBeenCalledWith(0);
    } finally {
      jest.useRealTimers();
    }
  });

  it('selects a verified macOS DMG asset', async () => {
    Object.defineProperty(process, 'platform', {
      value: 'darwin',
      configurable: true,
    });
    mockRelease(createMacRelease());

    const checkResult = await updater.checkForUpdate();

    expect(checkResult.updateInfo).toMatchObject({
      version: '2.0.0',
      assetName: 'KeepDir-2.0.0-arm64.dmg',
      assetSize: 5,
      downloadUrl: MAC_UPDATE_URL,
      sha256: ZIP_SHA256,
    });
  });

  it('parses GitHub asset SHA-256 digests', () => {
    expect(updater.parseAssetDigest(`sha256:${ZIP_SHA256}`)).toBe(ZIP_SHA256);
    expect(updater.parseAssetDigest(ZIP_SHA256)).toBeNull();
    expect(updater.parseAssetDigest(`sha512:${ZIP_SHA256}`)).toBeNull();
  });
});
