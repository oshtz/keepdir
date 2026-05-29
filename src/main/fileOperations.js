const fs = require('fs').promises;
const path = require('path');

const WINDOWS_RESERVED_NAMES = new Set([
  'CON',
  'PRN',
  'AUX',
  'NUL',
  'COM1',
  'COM2',
  'COM3',
  'COM4',
  'COM5',
  'COM6',
  'COM7',
  'COM8',
  'COM9',
  'LPT1',
  'LPT2',
  'LPT3',
  'LPT4',
  'LPT5',
  'LPT6',
  'LPT7',
  'LPT8',
  'LPT9'
]);

function resolveInsideRoot(rootPath, candidatePath) {
  const resolvedRoot = path.resolve(rootPath);
  const resolvedCandidate = path.resolve(candidatePath);
  const relative = path.relative(resolvedRoot, resolvedCandidate);

  if (relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))) {
    return resolvedCandidate;
  }

  throw new Error(`Path escapes selected directory: ${candidatePath}`);
}

function ensureSafeFileName(fileName, label = 'File') {
  if (typeof fileName !== 'string' || !fileName.trim()) {
    throw new Error(`${label} name is required`);
  }
  if (fileName.includes('\0') || path.isAbsolute(fileName) || path.basename(fileName) !== fileName) {
    throw new Error(`${label} must be a file name, not a path: ${fileName}`);
  }
  return fileName;
}

function isWindowsReservedName(filename) {
  const stem = path.basename(filename, path.extname(filename)).replace(/[ .]+$/g, '').toUpperCase();
  return WINDOWS_RESERVED_NAMES.has(stem);
}

function sanitizeFilename(filename) {
  const sanitized = filename
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '-')
    .replace(/[\u0591-\u05F4]/g, '')
    .replace(/\s+/g, '-')
    .replace(/--+/g, '-')
    .replace(/^[.\s]+|[.\s]+$/g, '')
    .trim();

  if (!sanitized) {
    return '';
  }

  return isWindowsReservedName(sanitized) ? `${sanitized}-file` : sanitized;
}

function sanitizeExtension(extension) {
  if (!extension) {
    return '';
  }

  const sanitized = extension
    .replace(/[<>:"/\\|?*\x00-\x1F\s]/g, '-')
    .replace(/--+/g, '-')
    .replace(/^[.\s]+/, '.')
    .replace(/[.\s]+$/g, '');

  if (!sanitized || sanitized === '.') {
    return '';
  }

  return sanitized.startsWith('.') ? sanitized : `.${sanitized}`;
}

function sanitizePathSegment(segment) {
  const sanitized = sanitizeFilename(segment);
  if (!sanitized || sanitized === '.' || sanitized === '..') {
    throw new Error(`Invalid folder name: ${segment}`);
  }
  return sanitized;
}

function resolveSafeCategoryPath(rootPath, suggestedPath) {
  if (!suggestedPath || suggestedPath === '.') {
    return path.resolve(rootPath);
  }
  if (typeof suggestedPath !== 'string' || suggestedPath.includes('\0') || path.isAbsolute(suggestedPath)) {
    throw new Error(`Invalid category path: ${suggestedPath}`);
  }

  const segments = suggestedPath
    .split(/[\\/]+/)
    .filter(Boolean);

  if (segments.some(segment => segment === '.' || segment === '..')) {
    throw new Error(`Category path cannot contain traversal segments: ${suggestedPath}`);
  }

  const safePath = path.join(path.resolve(rootPath), ...segments.map(sanitizePathSegment));
  return resolveInsideRoot(rootPath, safePath);
}

async function assertRealPathInsideRoot(rootPath, candidatePath) {
  const [realRoot, realCandidate] = await Promise.all([
    fs.realpath(rootPath),
    fs.realpath(candidatePath)
  ]);
  return resolveInsideRoot(realRoot, realCandidate);
}

async function ensureDirectoryInsideRoot(rootPath, directoryPath) {
  const resolvedRoot = path.resolve(rootPath);
  const targetPath = resolveInsideRoot(resolvedRoot, directoryPath);
  const relative = path.relative(resolvedRoot, targetPath);

  await assertRealPathInsideRoot(resolvedRoot, resolvedRoot);

  if (!relative) {
    return targetPath;
  }

  const segments = relative.split(path.sep).filter(Boolean);
  let currentPath = resolvedRoot;

  for (const segment of segments) {
    currentPath = path.join(currentPath, segment);

    let stats;
    try {
      stats = await fs.lstat(currentPath);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
      try {
        await fs.mkdir(currentPath);
      } catch (mkdirError) {
        if (mkdirError.code !== 'EEXIST') {
          throw mkdirError;
        }
      }
      stats = await fs.lstat(currentPath);
    }

    if (stats.isSymbolicLink()) {
      const relativePath = path.relative(resolvedRoot, currentPath) || currentPath;
      throw new Error(`Refusing to use symlinked destination directory: ${relativePath}`);
    }

    if (!stats.isDirectory()) {
      const relativePath = path.relative(resolvedRoot, currentPath) || currentPath;
      throw new Error(`Destination path is not a directory: ${relativePath}`);
    }

    await assertRealPathInsideRoot(resolvedRoot, currentPath);
  }

  return targetPath;
}

function findDirectoryEntry(dirContents, requestedName) {
  const normalizedRequested = requestedName.normalize('NFC');
  return (
    dirContents.find(name => name === requestedName) ||
    dirContents.find(name => name.normalize('NFC') === normalizedRequested) ||
    dirContents.find(name => name.toLowerCase() === requestedName.toLowerCase())
  );
}

async function pathExists(candidatePath) {
  try {
    await fs.access(candidatePath);
    return true;
  } catch {
    return false;
  }
}

async function uniquePathInDirectory(directoryPath, requestedName) {
  const ext = path.extname(requestedName);
  const baseName = path.basename(requestedName, ext);
  let candidatePath = resolveInsideRoot(directoryPath, path.join(directoryPath, requestedName));

  if (!(await pathExists(candidatePath))) {
    return candidatePath;
  }

  for (let counter = 1; counter < 10000; counter++) {
    const nextName = `${baseName}-${counter}${ext}`;
    candidatePath = resolveInsideRoot(directoryPath, path.join(directoryPath, nextName));
    if (!(await pathExists(candidatePath))) {
      return candidatePath;
    }
  }

  throw new Error(`Could not find an available filename for ${requestedName}`);
}

function sendProgress(onProgress, channel, payload) {
  if (typeof onProgress === 'function') {
    onProgress(channel, payload);
  }
}

function getSortMoves(suggestions) {
  const categories = Array.isArray(suggestions?.categories) ? suggestions.categories : [];
  return categories.flatMap(category => {
    const files = Array.isArray(category.files) ? category.files : [];
    return files.map(file => ({
      file,
      category: category.name,
      suggestedPath: category.suggestedPath
    }));
  });
}

function getRenameMoves(suggestions) {
  const categories = Array.isArray(suggestions?.categories) ? suggestions.categories : [];
  return categories.flatMap(category => Array.isArray(category.renames) ? category.renames : []);
}

async function applySortSuggestions({ directoryPath, suggestions, db, onProgress }) {
  const results = {
    success: true,
    partial: false,
    movedFiles: [],
    errors: []
  };

  try {
    const BATCH_SIZE = 100;
    const rootPath = path.resolve(directoryPath);
    const allMoves = getSortMoves(suggestions);
    let processed = 0;

    for (let i = 0; i < allMoves.length; i += BATCH_SIZE) {
      const batch = allMoves.slice(i, i + BATCH_SIZE);

      sendProgress(onProgress, 'sort-progress', {
        current: processed,
        total: allMoves.length,
        status: 'Moving files...',
        currentFile: batch[0]?.file || null
      });

      await Promise.all(batch.map(async ({ file, category, suggestedPath }) => {
        let oldPath = '';

        try {
          const safeFileName = ensureSafeFileName(file);
          oldPath = resolveInsideRoot(rootPath, path.join(rootPath, safeFileName));
          const dirContents = await fs.readdir(rootPath);
          const exactFileName = findDirectoryEntry(dirContents, safeFileName);
          if (!exactFileName) {
            throw new Error(`Source file not found: ${safeFileName}`);
          }

          const categoryPath = resolveSafeCategoryPath(rootPath, suggestedPath);
          await ensureDirectoryInsideRoot(rootPath, categoryPath);

          const exactPath = resolveInsideRoot(rootPath, path.join(rootPath, exactFileName));
          const newPath = categoryPath === rootPath
            ? exactPath
            : await uniquePathInDirectory(categoryPath, exactFileName);

          if (newPath !== exactPath) {
            await fs.rename(exactPath, newPath);
          }

          await db.markFileSorted(exactPath, newPath);
          results.movedFiles.push({
            original: exactFileName,
            category: categoryPath === rootPath ? '.' : path.relative(rootPath, categoryPath),
            new: path.relative(rootPath, newPath)
          });
          processed++;
          sendProgress(onProgress, 'sort-progress', {
            current: processed,
            total: allMoves.length,
            status: 'Moving files...',
            currentFile: path.basename(newPath)
          });
        } catch (err) {
          try {
            if (oldPath) {
              await db.markSortSkipped(oldPath);
            }
          } catch (skipErr) {
            console.error(`Failed to mark sort as skipped for ${file}:`, skipErr);
          }

          results.errors.push({
            file,
            category,
            error: err.message
          });
          results.success = false;
        }
      }));
    }

    results.partial = results.movedFiles.length > 0 && results.errors.length > 0;
    if (results.errors.length > 0 && results.movedFiles.length === 0) {
      results.error = 'No files were moved.';
    }
    return results;
  } catch (error) {
    return {
      success: false,
      partial: false,
      movedFiles: results.movedFiles,
      errors: results.errors.length > 0 ? results.errors : [{ file: 'unknown', error: error.message }],
      error: error.message
    };
  }
}

async function applyRenameSuggestions({ directoryPath, suggestions, db, onProgress }) {
  const results = {
    success: true,
    partial: false,
    errors: [],
    renamedFiles: []
  };

  try {
    const BATCH_SIZE = 100;
    const rootPath = path.resolve(directoryPath);
    const allRenames = getRenameMoves(suggestions);
    let processed = 0;

    for (let i = 0; i < allRenames.length; i += BATCH_SIZE) {
      const batch = allRenames.slice(i, i + BATCH_SIZE);

      sendProgress(onProgress, 'rename-progress', {
        current: processed,
        total: allRenames.length,
        status: 'Renaming files...',
        currentFile: batch[0]?.originalName || null
      });

      await Promise.all(batch.map(async (rename) => {
        const originalName = Buffer.from(String(rename.originalName || ''), 'utf8').toString();
        let oldPath = '';
        let newPath = '';

        try {
          oldPath = resolveInsideRoot(rootPath, path.join(rootPath, ensureSafeFileName(originalName, 'Original file')));
          const suggestedName = ensureSafeFileName(rename.suggestedName, 'Suggested file');
          const ext = sanitizeExtension(path.extname(suggestedName));
          const baseName = path.basename(suggestedName, path.extname(suggestedName));
          const sanitizedBaseName = sanitizeFilename(baseName);
          if (!sanitizedBaseName) {
            throw new Error(`Suggested filename is empty after sanitizing: ${rename.suggestedName}`);
          }

          const sanitizedName = `${sanitizedBaseName}${ext}`;
          newPath = resolveInsideRoot(rootPath, path.join(rootPath, sanitizedName));
          const dirContents = await fs.readdir(rootPath);
          const exactFileName = findDirectoryEntry(dirContents, originalName);

          if (!exactFileName) {
            throw new Error(`Source file not found: ${originalName} (available files: ${dirContents.join(', ')})`);
          }

          const exactPath = resolveInsideRoot(rootPath, path.join(rootPath, exactFileName));
          const sameTarget = process.platform === 'win32'
            ? newPath.toLowerCase() === exactPath.toLowerCase()
            : newPath === exactPath;

          if (!sameTarget) {
            newPath = await uniquePathInDirectory(rootPath, path.basename(newPath));
            await fs.rename(exactPath, newPath);
          }

          await db.markFileRenamed(exactPath, newPath);
          processed++;
          sendProgress(onProgress, 'rename-progress', {
            current: processed,
            total: allRenames.length,
            status: 'Renaming files...',
            currentFile: originalName
          });

          results.renamedFiles.push({
            original: originalName,
            new: path.basename(newPath)
          });
        } catch (err) {
          try {
            if (oldPath) {
              await db.markRenameSkipped(oldPath);
            }
          } catch (skipErr) {
            console.error(`Failed to mark rename as skipped for ${rename.originalName}:`, skipErr);
          }

          results.errors.push({
            file: rename.originalName,
            error: err.message
          });
          results.success = false;
        }
      }));
    }

    results.partial = results.renamedFiles.length > 0 && results.errors.length > 0;
    if (results.errors.length > 0 && results.renamedFiles.length === 0) {
      results.error = 'No files were renamed.';
    }
    return results;
  } catch (error) {
    return {
      success: false,
      partial: false,
      error: error.message,
      renamedFiles: results.renamedFiles,
      errors: [{
        file: 'unknown',
        error: error.message
      }]
    };
  }
}

module.exports = {
  applyRenameSuggestions,
  applySortSuggestions,
  ensureDirectoryInsideRoot,
  ensureSafeFileName,
  findDirectoryEntry,
  resolveInsideRoot,
  resolveSafeCategoryPath,
  sanitizeExtension,
  sanitizeFilename,
  sanitizePathSegment,
  uniquePathInDirectory
};
