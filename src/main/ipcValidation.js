const fs = require('fs').promises;
const path = require('path');

const MAX_PATH_LENGTH = process.platform === 'win32' ? 32767 : 4096;
const MAX_SELECTED_PATHS = 500;
const MAX_CACHE_AGE_HOURS = 24 * 365 * 10;
const MAX_OLLAMA_MODEL_NAME_LENGTH = 255;

function requireString(value, label, { maxLength = 512, trim = false } = {}) {
  if (typeof value !== 'string') {
    throw new Error(`${label} must be a string.`);
  }

  const stringValue = trim ? value.trim() : value;
  if (!stringValue.trim()) {
    throw new Error(`${label} is required.`);
  }

  if (stringValue.length > maxLength) {
    throw new Error(`${label} is too long.`);
  }

  if (stringValue.includes('\0')) {
    throw new Error(`${label} cannot contain null bytes.`);
  }

  return stringValue;
}

function normalizeAbsolutePath(value, label = 'Path') {
  const filePath = requireString(value, label, { maxLength: MAX_PATH_LENGTH });

  if (!path.isAbsolute(filePath)) {
    throw new Error(`${label} must be an absolute path.`);
  }

  return path.resolve(filePath);
}

async function requireExistingPath(value, label = 'Path') {
  const filePath = normalizeAbsolutePath(value, label);

  try {
    const stats = await fs.stat(filePath);
    return { filePath, stats };
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') {
      throw new Error(`${label} does not exist.`);
    }
    throw error;
  }
}

async function requireExistingDirectoryPath(value, label = 'Directory path') {
  const result = await requireExistingPath(value, label);
  if (!result.stats.isDirectory()) {
    throw new Error(`${label} must be a directory.`);
  }
  return result.filePath;
}

async function requireExistingFileOrDirectoryPath(value, label = 'Path') {
  const result = await requireExistingPath(value, label);
  if (!result.stats.isFile() && !result.stats.isDirectory()) {
    throw new Error(`${label} must be a file or directory.`);
  }
  return result.filePath;
}

function isSamePath(left, right) {
  const normalizedLeft = path.resolve(left);
  const normalizedRight = path.resolve(right);

  if (process.platform === 'win32') {
    return normalizedLeft.toLowerCase() === normalizedRight.toLowerCase();
  }

  return normalizedLeft === normalizedRight;
}

function isPathInsideRoot(rootPath, candidatePath) {
  const relative = path.relative(path.resolve(rootPath), path.resolve(candidatePath));
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

function normalizeSelectedPaths(selectedPaths, directoryPath) {
  if (selectedPaths == null) {
    return undefined;
  }

  if (!Array.isArray(selectedPaths)) {
    throw new Error('Selected paths must be an array.');
  }

  if (selectedPaths.length > MAX_SELECTED_PATHS) {
    throw new Error(`Selected paths cannot exceed ${MAX_SELECTED_PATHS} items.`);
  }

  const rootPath = path.resolve(directoryPath);

  return selectedPaths.map((selectedPath, index) => {
    const filePath = normalizeAbsolutePath(selectedPath, `Selected path ${index + 1}`);

    if (!isPathInsideRoot(rootPath, filePath)) {
      throw new Error('Selected paths must be inside the selected directory.');
    }

    if (!isSamePath(path.dirname(filePath), rootPath)) {
      throw new Error('Selected paths must be direct children of the selected directory.');
    }

    return filePath;
  });
}

function normalizeCacheAgeHours(maxAgeHours, defaultHours = 168) {
  if (maxAgeHours == null || maxAgeHours === '') {
    return defaultHours;
  }

  const hours = Number(maxAgeHours);
  if (!Number.isFinite(hours)) {
    throw new Error('Cache age must be a finite number of hours.');
  }

  const normalizedHours = Math.floor(hours);
  if (normalizedHours < 1) {
    throw new Error('Cache age must be at least 1 hour.');
  }

  if (normalizedHours > MAX_CACHE_AGE_HOURS) {
    throw new Error(`Cache age cannot exceed ${MAX_CACHE_AGE_HOURS} hours.`);
  }

  return normalizedHours;
}

function normalizeProviderName(providerName) {
  const name = requireString(providerName, 'Provider name', {
    maxLength: 64,
    trim: true
  });

  if (!/^[a-z][a-z0-9-]*$/.test(name)) {
    throw new Error('Provider name is invalid.');
  }

  return name;
}

function normalizeOllamaModelName(modelName) {
  const name = requireString(modelName, 'Model name', {
    maxLength: MAX_OLLAMA_MODEL_NAME_LENGTH,
    trim: true
  });

  if (!/^[A-Za-z0-9][A-Za-z0-9._:/@-]*$/.test(name)) {
    throw new Error('Model name contains unsupported characters.');
  }

  return name;
}

module.exports = {
  normalizeAbsolutePath,
  normalizeCacheAgeHours,
  normalizeOllamaModelName,
  normalizeProviderName,
  normalizeSelectedPaths,
  requireExistingDirectoryPath,
  requireExistingFileOrDirectoryPath,
  requireExistingPath,
  requireString
};
