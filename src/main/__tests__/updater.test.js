const fs = require('fs');
const fsp = require('fs').promises;
const os = require('os');
const path = require('path');
const { Readable } = require('stream');

const mockApp = {
  isPackaged: true,
  getVersion: jest.fn(() => '1.0.0'),
  getPath: jest.fn(),
  exit: jest.fn()
};

jest.mock('electron', () => ({
  app: mockApp
}));

jest.mock('axios', () => {
  const mockAxios = jest.fn();
  mockAxios.get = jest.fn();
  return mockAxios;
});

const axios = require('axios');
const updater = require('../updater');

const ZIP_SHA256 = '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824';
const UPDATE_URL = 'https://github.com/oshtz/keepdir/releases/download/v2.0.0/keepdir-portable-windows.zip';
const CHECKSUM_URL = 'https://github.com/oshtz/keepdir/releases/download/v2.0.0/keepdir-portable-windows.zip.sha256';

function createRelease(assetOverrides = {}, checksumOverrides = {}) {
  return {
    tag_name: 'v2.0.0',
    assets: [
      {
        name: 'keepdir-portable-windows.zip',
        browser_download_url: UPDATE_URL,
        size: 5,
        ...assetOverrides
      },
      {
        name: 'keepdir-portable-windows.zip.sha256',
        browser_download_url: CHECKSUM_URL,
        size: 99,
        ...checksumOverrides
      }
    ]
  };
}

function mockReleaseAndChecksum(release = createRelease(), checksumText = `${ZIP_SHA256}  keepdir-portable-windows.zip`) {
  axios.get.mockImplementation((url) => {
    if (String(url).includes('/repos/oshtz/keepdir/releases/latest')) {
      return Promise.resolve({ data: release });
    }
    if (String(url).endsWith('.sha256')) {
      return Promise.resolve({ data: checksumText });
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
      configurable: true
    });
  });

  afterAll(() => {
    Object.defineProperty(process, 'platform', {
      value: originalPlatform,
      configurable: true
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
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockReleaseAndChecksum(createRelease(
      {
        name: 'keepdir-portable-windows.zip',
        browser_download_url: 'https://example.com/keepdir-portable-windows.zip',
        size: 5
      }
    ));

    const checkResult = await updater.checkForUpdate();
    expect(checkResult).toEqual({ error: 'Release asset URL is not trusted.' });

    const downloadResult = await updater.downloadUpdate();
    expect(downloadResult.error).toContain('Check for updates before downloading');
    expect(axios).not.toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalledWith(
      'Download failed:',
      'Check for updates before downloading.'
    );
    consoleSpy.mockRestore();
  });

  it('requires a checksum asset for compatible releases', async () => {
    axios.get.mockResolvedValue({
      data: {
        tag_name: 'v2.0.0',
        assets: [{
          name: 'keepdir-portable-windows.zip',
          browser_download_url: UPDATE_URL,
          size: 5
        }]
      }
    });

    const checkResult = await updater.checkForUpdate();
    expect(checkResult).toEqual({
      error: 'No SHA-256 checksum asset found for keepdir-portable-windows.zip.'
    });
  });

  it('downloads only the update returned by the trusted update check', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockReleaseAndChecksum();
    const checkResult = await updater.checkForUpdate();

    expect(checkResult.updateInfo).toMatchObject({
      version: '2.0.0',
      assetName: 'keepdir-portable-windows.zip',
      assetSize: 5,
      checksumAssetName: 'keepdir-portable-windows.zip.sha256',
      checksumUrl: CHECKSUM_URL
    });

    const mismatchResult = await updater.downloadUpdate({
      ...checkResult.updateInfo,
      assetName: 'different.zip'
    });

    expect(mismatchResult.error).toContain('do not match');
    expect(axios).not.toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalledWith(
      'Download failed:',
      'Update details do not match the latest trusted update check.'
    );

    axios.mockResolvedValue({
      headers: {
        'content-length': '5'
      },
      data: Readable.from([Buffer.from('hello')])
    });

    const downloadResult = await updater.downloadUpdate(checkResult.updateInfo);
    expect(downloadResult.updatePath).toBe(path.join(baseDir, 'updates', 'keepdir-portable-windows.zip'));
    expect(await fsp.readFile(downloadResult.updatePath, 'utf8')).toBe('hello');
    consoleSpy.mockRestore();
  });

  it('rejects downloaded updates when the checksum does not match', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockReleaseAndChecksum(createRelease(), `${'0'.repeat(64)}  keepdir-portable-windows.zip`);
    const checkResult = await updater.checkForUpdate();
    axios.mockResolvedValue({
      headers: {
        'content-length': '5'
      },
      data: Readable.from([Buffer.from('hello')])
    });

    const result = await updater.downloadUpdate(checkResult.updateInfo);
    const updatePath = path.join(baseDir, 'updates', 'keepdir-portable-windows.zip');

    expect(result.error).toContain('checksum did not match');
    expect(fs.existsSync(updatePath)).toBe(false);
    expect(consoleSpy).toHaveBeenCalledWith(
      'Download failed:',
      'Downloaded update checksum did not match the release checksum.'
    );
    consoleSpy.mockRestore();
  });

  it('rejects install paths that do not match the downloaded trusted update', async () => {
    mockReleaseAndChecksum();
    const checkResult = await updater.checkForUpdate();
    axios.mockResolvedValue({
      headers: {
        'content-length': '5'
      },
      data: Readable.from([Buffer.from('hello')])
    });
    await updater.downloadUpdate(checkResult.updateInfo);

    const wrongPath = path.join(baseDir, 'updates', '..', 'keepdir-portable-windows.zip');
    fs.writeFileSync(path.join(baseDir, 'keepdir-portable-windows.zip'), 'hello');

    const result = await updater.installUpdate(wrongPath);
    expect(result).toEqual({ error: 'Update file does not match the trusted download.' });
  });

  it('re-verifies the downloaded update before installing', async () => {
    mockReleaseAndChecksum();
    const checkResult = await updater.checkForUpdate();
    axios.mockResolvedValue({
      headers: {
        'content-length': '5'
      },
      data: Readable.from([Buffer.from('hello')])
    });
    const downloadResult = await updater.downloadUpdate(checkResult.updateInfo);

    fs.writeFileSync(downloadResult.updatePath, 'HELLO');

    const result = await updater.installUpdate(downloadResult.updatePath);
    expect(result).toEqual({
      error: 'Update file checksum no longer matches the trusted download.'
    });
    expect(mockApp.exit).not.toHaveBeenCalled();
  });

  it('parses both raw and sha256sum-style checksum files', () => {
    expect(updater.parseChecksumText(ZIP_SHA256, 'keepdir-portable-windows.zip')).toBe(ZIP_SHA256);
    expect(updater.parseChecksumText(
      `${'0'.repeat(64)}  other.zip\n${ZIP_SHA256} *keepdir-portable-windows.zip`,
      'keepdir-portable-windows.zip'
    )).toBe(ZIP_SHA256);
  });
});
