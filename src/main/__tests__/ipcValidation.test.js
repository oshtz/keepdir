const fs = require('fs').promises;
const os = require('os');
const path = require('path');

const {
  assertNotSymbolicLink,
  isAnalyzableDirectoryEntry,
  normalizeCacheAgeHours,
  normalizeOllamaModelName,
  normalizeProviderName,
  normalizeSelectedPaths,
  requireExistingDirectoryPath,
  requireExistingFileOrDirectoryPath
} = require('../ipcValidation');
const { getAllProviders, getProvider } = require('../providers');

describe('main IPC validation', () => {
  let baseDir;
  let rootDir;
  let filePath;

  beforeEach(async () => {
    baseDir = await fs.mkdtemp(path.join(os.tmpdir(), 'keepdir-ipc-validation-'));
    rootDir = path.join(baseDir, 'root');
    filePath = path.join(rootDir, 'file.txt');
    await fs.mkdir(rootDir);
    await fs.writeFile(filePath, 'hello');
  });

  afterEach(async () => {
    await fs.rm(baseDir, { recursive: true, force: true });
  });

  it('requires absolute existing directories for directory-scoped handlers', async () => {
    await expect(requireExistingDirectoryPath(rootDir)).resolves.toBe(path.resolve(rootDir));
    await expect(requireExistingDirectoryPath(filePath)).rejects.toThrow('must be a directory');
    await expect(requireExistingDirectoryPath('relative/path')).rejects.toThrow('absolute path');
    await expect(requireExistingDirectoryPath(path.join(baseDir, 'missing'))).rejects.toThrow('does not exist');
  });

  it('allows existing files or directories for native open/reveal handlers', async () => {
    await expect(requireExistingFileOrDirectoryPath(filePath)).resolves.toBe(path.resolve(filePath));
    await expect(requireExistingFileOrDirectoryPath(rootDir)).resolves.toBe(path.resolve(rootDir));
  });

  it('limits selected analysis paths to direct children of the selected directory', () => {
    const selected = normalizeSelectedPaths([filePath], rootDir);
    expect(selected).toEqual([path.resolve(filePath)]);

    expect(() => normalizeSelectedPaths([path.join(baseDir, 'outside.txt')], rootDir))
      .toThrow('inside the selected directory');

    expect(() => normalizeSelectedPaths([path.join(rootDir, 'nested', 'file.txt')], rootDir))
      .toThrow('direct children');

    expect(() => normalizeSelectedPaths('not-an-array', rootDir))
      .toThrow('must be an array');
  });

  it('normalizes bounded cache cleanup windows', () => {
    expect(normalizeCacheAgeHours(undefined)).toBe(168);
    expect(normalizeCacheAgeHours('12.9')).toBe(12);
    expect(() => normalizeCacheAgeHours(0)).toThrow('at least 1 hour');
    expect(() => normalizeCacheAgeHours(Number.POSITIVE_INFINITY)).toThrow('finite number');
  });

  it('accepts Ollama model references while rejecting option-like or shell-like names', () => {
    expect(normalizeOllamaModelName(' llama3.2:latest ')).toBe('llama3.2:latest');
    expect(normalizeOllamaModelName('hf.co/user/model:Q4_K_M')).toBe('hf.co/user/model:Q4_K_M');
    expect(() => normalizeOllamaModelName('-help')).toThrow('unsupported characters');
    expect(() => normalizeOllamaModelName('llama3; rm -rf /')).toThrow('unsupported characters');
  });

  it('rejects prototype-pollution-shaped provider names before lookup', () => {
    expect(normalizeProviderName('openai')).toBe('openai');
    expect(() => normalizeProviderName('__proto__')).toThrow('invalid');
    expect(() => normalizeProviderName('constructor')).not.toThrow();
  });

  it('does not resolve inherited provider properties', () => {
    expect(getProvider('__proto__')).toBeUndefined();
    expect(getProvider('constructor')).toBeUndefined();
    expect(getProvider('openai')).toBeDefined();

    const providers = getAllProviders();
    providers.openai = undefined;
    expect(getProvider('openai')).toBeDefined();
  });

  it('excludes symbolic links from directory analysis inputs', () => {
    expect(isAnalyzableDirectoryEntry({
      isDirectory: () => false,
      isSymbolicLink: () => false
    })).toBe(true);
    expect(isAnalyzableDirectoryEntry({
      isDirectory: () => true,
      isSymbolicLink: () => false
    })).toBe(false);
    expect(isAnalyzableDirectoryEntry({
      isDirectory: () => false,
      isSymbolicLink: () => true
    })).toBe(false);

    expect(() => assertNotSymbolicLink({
      isSymbolicLink: () => true
    }, 'Selected item link.png')).toThrow('cannot be a symbolic link');
  });
});
