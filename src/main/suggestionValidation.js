const path = require('path');
const {
  ensureSafeFileName,
  resolveSafeCategoryPath,
  sanitizeExtension,
  sanitizeFilename
} = require('./fileOperations');

const MAX_FILENAME_LENGTH = 255;
const MAX_LABEL_LENGTH = 120;
const MAX_DESCRIPTION_LENGTH = 500;

function normalizeText(value, maxLength, fallback = '') {
  if (typeof value !== 'string') {
    return fallback;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return fallback;
  }

  return trimmed.slice(0, maxLength);
}

function createAllowedNameSet(fileNames) {
  return new Set(
    (Array.isArray(fileNames) ? fileNames : [])
      .filter(name => typeof name === 'string' && name)
  );
}

function normalizeKnownFileName(fileName, allowedNames) {
  if (typeof fileName !== 'string' || !allowedNames.has(fileName)) {
    return null;
  }

  try {
    ensureSafeFileName(fileName);
    return fileName;
  } catch {
    return null;
  }
}

function normalizeSuggestedFileName(fileName) {
  try {
    const safeName = ensureSafeFileName(fileName, 'Suggested file');
    const ext = sanitizeExtension(path.extname(safeName));
    const baseName = path.basename(safeName, path.extname(safeName));
    const sanitizedBaseName = sanitizeFilename(baseName);

    if (!sanitizedBaseName) {
      return null;
    }

    const normalizedName = `${sanitizedBaseName}${ext}`;
    if (normalizedName.length > MAX_FILENAME_LENGTH) {
      return null;
    }

    return normalizedName;
  } catch {
    return null;
  }
}

function normalizeSuggestedCategoryPath(rootPath, suggestedPath) {
  try {
    const safePath = resolveSafeCategoryPath(rootPath, suggestedPath || '.');
    const relativePath = path.relative(path.resolve(rootPath), safePath);
    return relativePath ? relativePath.split(path.sep).join('/') : '.';
  } catch {
    return null;
  }
}

function normalizeRenameSuggestions(suggestions, fileNames) {
  const allowedNames = createAllowedNameSet(fileNames);
  const renames = Array.isArray(suggestions?.renames) ? suggestions.renames : [];

  return {
    renames: renames.flatMap((rename) => {
      if (!rename || typeof rename !== 'object') {
        return [];
      }

      const originalName = normalizeKnownFileName(rename.originalName, allowedNames);
      const suggestedName = normalizeSuggestedFileName(rename.suggestedName);

      if (!originalName || !suggestedName) {
        return [];
      }

      return [{
        originalName,
        suggestedName,
        reason: normalizeText(rename.reason, MAX_DESCRIPTION_LENGTH)
      }];
    })
  };
}

function normalizeSortSuggestions(suggestions, fileNames, rootPath) {
  const allowedNames = createAllowedNameSet(fileNames);
  const categories = Array.isArray(suggestions?.categories) ? suggestions.categories : [];

  return {
    categories: categories.flatMap((category) => {
      if (!category || typeof category !== 'object') {
        return [];
      }

      const suggestedPath = normalizeSuggestedCategoryPath(rootPath, category.suggestedPath);
      if (!suggestedPath) {
        return [];
      }

      const files = Array.isArray(category.files)
        ? Array.from(new Set(category.files
          .map(file => normalizeKnownFileName(file, allowedNames))
          .filter(Boolean)))
        : [];

      if (files.length === 0) {
        return [];
      }

      const fallbackName = suggestedPath === '.' ? 'Files' : path.basename(suggestedPath);
      return [{
        name: normalizeText(category.name, MAX_LABEL_LENGTH, fallbackName),
        description: normalizeText(category.description, MAX_DESCRIPTION_LENGTH),
        suggestedPath,
        files
      }];
    })
  };
}

module.exports = {
  normalizeRenameSuggestions,
  normalizeSortSuggestions
};
