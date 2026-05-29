const fs = require('fs').promises;
const os = require('os');
const path = require('path');

const {
  applyRenameSuggestions,
  applySortSuggestions,
  sanitizeFilename
} = require('../fileOperations');

function createDb() {
  return {
    markFileRenamed: jest.fn().mockResolvedValue(undefined),
    markFileSorted: jest.fn().mockResolvedValue(undefined),
    markRenameSkipped: jest.fn().mockResolvedValue(undefined),
    markSortSkipped: jest.fn().mockResolvedValue(undefined)
  };
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

describe('main file operations', () => {
  let baseDir;
  let rootDir;

  beforeEach(async () => {
    baseDir = await fs.mkdtemp(path.join(os.tmpdir(), 'keepdir-file-ops-'));
    rootDir = path.join(baseDir, 'root');
    await fs.mkdir(rootDir);
  });

  afterEach(async () => {
    await fs.rm(baseDir, { recursive: true, force: true });
  });

  it('does not allow rename suggestions to escape the selected directory', async () => {
    await fs.writeFile(path.join(rootDir, 'alpha.txt'), 'alpha');
    const db = createDb();

    const result = await applyRenameSuggestions({
      directoryPath: rootDir,
      suggestions: {
        categories: [{
          name: 'Files to Rename',
          renames: [{
            originalName: 'alpha.txt',
            suggestedName: '../escaped.txt'
          }]
        }]
      },
      db
    });

    expect(result.success).toBe(false);
    expect(result.renamedFiles).toEqual([]);
    expect(result.errors[0].error).toContain('file name, not a path');
    expect(await exists(path.join(rootDir, 'alpha.txt'))).toBe(true);
    expect(await exists(path.join(baseDir, 'escaped.txt'))).toBe(false);
    expect(db.markRenameSkipped).toHaveBeenCalledWith(path.join(rootDir, 'alpha.txt'));
  });

  it('sanitizes reserved rename targets and avoids overwriting existing files', async () => {
    await fs.writeFile(path.join(rootDir, 'source.txt'), 'source');
    await fs.writeFile(path.join(rootDir, 'CON-file.txt'), 'existing');
    const db = createDb();

    const result = await applyRenameSuggestions({
      directoryPath: rootDir,
      suggestions: {
        categories: [{
          name: 'Files to Rename',
          renames: [{
            originalName: 'source.txt',
            suggestedName: 'CON.txt'
          }]
        }]
      },
      db
    });

    expect(result.success).toBe(true);
    expect(result.renamedFiles).toEqual([{
      original: 'source.txt',
      new: 'CON-file-1.txt'
    }]);
    expect(await fs.readFile(path.join(rootDir, 'CON-file.txt'), 'utf8')).toBe('existing');
    expect(await fs.readFile(path.join(rootDir, 'CON-file-1.txt'), 'utf8')).toBe('source');
    expect(db.markFileRenamed).toHaveBeenCalledWith(
      path.join(rootDir, 'source.txt'),
      path.join(rootDir, 'CON-file-1.txt')
    );
  });

  it('moves safe sort suggestions while rejecting traversal categories', async () => {
    await fs.writeFile(path.join(rootDir, 'safe.txt'), 'safe');
    await fs.writeFile(path.join(rootDir, 'bad.txt'), 'bad');
    const db = createDb();

    const result = await applySortSuggestions({
      directoryPath: rootDir,
      suggestions: {
        categories: [
          {
            name: 'Docs',
            suggestedPath: 'Docs',
            files: ['safe.txt']
          },
          {
            name: 'Outside',
            suggestedPath: '../outside',
            files: ['bad.txt']
          }
        ]
      },
      db
    });

    expect(result.success).toBe(false);
    expect(result.partial).toBe(true);
    expect(result.movedFiles).toEqual([{
      original: 'safe.txt',
      category: 'Docs',
      new: path.join('Docs', 'safe.txt')
    }]);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].error).toContain('traversal');
    expect(await fs.readFile(path.join(rootDir, 'Docs', 'safe.txt'), 'utf8')).toBe('safe');
    expect(await fs.readFile(path.join(rootDir, 'bad.txt'), 'utf8')).toBe('bad');
    expect(await exists(path.join(baseDir, 'outside'))).toBe(false);
    expect(db.markSortSkipped).toHaveBeenCalledWith(path.join(rootDir, 'bad.txt'));
  });

  it('refuses symlinked destination directories when the platform permits symlinks', async () => {
    const outsideDir = path.join(baseDir, 'outside');
    const linkDir = path.join(rootDir, 'Linked');
    await fs.mkdir(outsideDir);

    try {
      await fs.symlink(outsideDir, linkDir, process.platform === 'win32' ? 'junction' : 'dir');
    } catch {
      return;
    }

    await fs.writeFile(path.join(rootDir, 'safe.txt'), 'safe');
    const db = createDb();

    const result = await applySortSuggestions({
      directoryPath: rootDir,
      suggestions: {
        categories: [{
          name: 'Linked',
          suggestedPath: 'Linked',
          files: ['safe.txt']
        }]
      },
      db
    });

    expect(result.success).toBe(false);
    expect(result.errors[0].error).toContain('symlinked destination directory');
    expect(await fs.readFile(path.join(rootDir, 'safe.txt'), 'utf8')).toBe('safe');
    expect(await exists(path.join(outsideDir, 'safe.txt'))).toBe(false);
    expect(db.markSortSkipped).toHaveBeenCalledWith(path.join(rootDir, 'safe.txt'));
  });

  it('normalizes unsafe filename characters predictably', () => {
    expect(sanitizeFilename('CON')).toBe('CON-file');
    expect(sanitizeFilename('a  b<>c')).toBe('a-b-c');
    expect(sanitizeFilename('...')).toBe('');
  });
});
