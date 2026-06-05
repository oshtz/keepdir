const fs = require('fs').promises;
const path = require('path');
const {
  normalizeRenameSuggestions,
  normalizeSortSuggestions
} = require('./suggestionValidation');
const { parseJsonPayload } = require('./jsonExtraction');
const {
  assertNotSymbolicLink,
  isAnalyzableDirectoryEntry,
  normalizeProviderName,
  normalizeSelectedAnalysisEntries,
  requireExistingDirectoryPath
} = require('./ipcValidation');

function normalizeAnalysisPath(filePath) {
  return Buffer.from(filePath.replace(/\\/g, '/'), 'utf8')
    .toString()
    .normalize('NFC');
}

function supportsVisionModel(providerName, modelValue) {
  const normalized = (modelValue || '').toLowerCase();
  if (!normalized) {
    return true;
  }
  if (providerName === 'openai') {
    return (
      normalized.includes('gpt-4o') ||
      normalized.includes('gpt-4.1') ||
      normalized.includes('gpt-4-turbo') ||
      normalized.includes('gpt-4')
    );
  }
  if (providerName === 'anthropic') {
    return normalized.startsWith('claude-3');
  }
  if (providerName === 'google') {
    return normalized.startsWith('gemini');
  }
  if (providerName === 'openrouter' || providerName === 'lmstudio') {
    return true;
  }
  return false;
}

function createAnalysisService({
  db,
  getProvider,
  fsModule = fs,
  pathModule = path,
  parseJson = parseJsonPayload,
  logger = console
}) {
  const BATCH_SIZE = 10;
  const MAX_IMAGE_BYTES = 1024 * 1024;
  const imageFilePattern = /\.(jpg|jpeg|png)$/i;
  const loadProvider = getProvider || require('./providers').getProvider;
  const logDebug = (...args) => {
    if (typeof logger?.debug === 'function') {
      logger.debug(...args);
    }
  };
  const logError = (...args) => {
    if (typeof logger?.error === 'function') {
      logger.error(...args);
    }
  };

  function getImageMimeType(fileName) {
    const ext = pathModule.extname(fileName).toLowerCase();
    if (ext === '.jpg' || ext === '.jpeg') {
      return 'image/jpeg';
    }
    if (ext === '.png') {
      return 'image/png';
    }
    return null;
  }

  function parseCachedImagePayload(cachedContent) {
    if (!cachedContent) {
      return null;
    }
    try {
      const parsed = JSON.parse(cachedContent);
      if (parsed && typeof parsed.base64 === 'string' && typeof parsed.mimeType === 'string') {
        return parsed;
      }
    } catch {
      return null;
    }
    return null;
  }

  async function compressImageBuffer(buffer, mimeType) {
    if (buffer.length <= MAX_IMAGE_BYTES) {
      return { buffer, mimeType };
    }

    const sharp = require('sharp');
    const metadata = await sharp(buffer).metadata();
    const width = metadata.width || undefined;
    const height = metadata.height || undefined;
    let scale = 1;
    let quality = 80;
    let output = buffer;

    for (let attempt = 0; attempt < 6; attempt += 1) {
      let transformer = sharp(buffer).rotate();

      if (width || height) {
        transformer = transformer.resize(
          width ? Math.max(1, Math.round(width * scale)) : undefined,
          height ? Math.max(1, Math.round(height * scale)) : undefined,
          { fit: 'inside', withoutEnlargement: true }
        );
      }

      if (mimeType === 'image/jpeg') {
        transformer = transformer.jpeg({ quality });
      } else {
        transformer = transformer.png({ compressionLevel: 9, palette: true });
      }

      output = await transformer.toBuffer();
      if (output.length <= MAX_IMAGE_BYTES) {
        return { buffer: output, mimeType };
      }

      if (mimeType === 'image/jpeg' && quality > 50) {
        quality -= 10;
      } else {
        scale *= 0.85;
      }
    }

    if (mimeType !== 'image/jpeg') {
      let transformer = sharp(buffer).rotate();
      if (width || height) {
        transformer = transformer.resize(
          width ? Math.max(1, Math.round(width * scale)) : undefined,
          height ? Math.max(1, Math.round(height * scale)) : undefined,
          { fit: 'inside', withoutEnlargement: true }
        );
      }
      const fallback = await transformer.jpeg({ quality: 70 }).toBuffer();
      if (fallback.length <= MAX_IMAGE_BYTES) {
        return { buffer: fallback, mimeType: 'image/jpeg' };
      }
    }

    return { buffer: output, mimeType };
  }

  function createDeterministicRenameSuggestions(fileEntries) {
    const renames = fileEntries.map((entry) => ({
      originalName: entry.name,
      suggestedName: `organized-${entry.name}`,
      reason: 'Deterministic E2E rename suggestion'
    }));

    return {
      suggestions: {
        categories: [{
          name: 'Files to Rename',
          description: 'Files that will be renamed',
          suggestedPath: '.',
          files: renames.map((rename) => rename.originalName),
          renames
        }]
      }
    };
  }

  async function analyzeDirectory({
    sender,
    directoryPath,
    renameFiles,
    selectedPaths,
    forceRefresh = false
  }) {
    try {
      const resolvedDirectoryPath = await requireExistingDirectoryPath(directoryPath);
      const selectedFileEntries = await normalizeSelectedAnalysisEntries(selectedPaths, resolvedDirectoryPath);

      let allFileEntries;
      if (selectedFileEntries && selectedFileEntries.length > 0) {
        allFileEntries = selectedFileEntries;
      } else {
        const files = await fsModule.readdir(resolvedDirectoryPath, { withFileTypes: true });
        allFileEntries = files
          .filter(isAnalyzableDirectoryEntry)
          .map(file => ({
            name: file.name,
            path: pathModule.join(resolvedDirectoryPath, file.name)
          }));
      }

      return analyzeEntries({
        sender,
        directoryPath: resolvedDirectoryPath,
        renameFiles,
        fileEntries: allFileEntries,
        forceRefresh
      });
    } catch (error) {
      logError('Failed to analyze directory:', error);
      return { error: error.message };
    }
  }

  async function analyzeEntries({
    sender,
    directoryPath,
    renameFiles,
    fileEntries,
    forceRefresh = false
  }) {
    try {
      const allFileEntries = Array.isArray(fileEntries) ? fileEntries : [];
      if (process.env.KEEPDIR_E2E_WATCH_RENAME_STUB === '1' && renameFiles) {
        return createDeterministicRenameSuggestions(allFileEntries);
      }

      const filePaths = allFileEntries.map(entry => entry.path);
      const fileEntryByPath = new Map(
        allFileEntries.map(entry => [normalizeAnalysisPath(entry.path), entry])
      );

      const unprocessedPaths = renameFiles
        ? await db.getUnprocessedRenames(filePaths)
        : await db.getUnprocessedSorts(filePaths);
      const unprocessedEntries = unprocessedPaths
        .map(filePath => fileEntryByPath.get(normalizeAnalysisPath(filePath)))
        .filter(Boolean);

      if (unprocessedEntries.length === 0 && !forceRefresh) {
        const cachedResults = await Promise.all(
          filePaths.map(async (filePath) => {
            const processed = renameFiles
              ? await db.getProcessedRename(filePath)
              : await db.getProcessedSort(filePath);
            if (processed && processed.status === 'suggested') {
              if (renameFiles) {
                return {
                  originalName: processed.original_name,
                  suggestedName: processed.suggested_name,
                  reason: processed.reason
                };
              }

              return {
                originalPath: processed.original_path,
                suggestedPath: processed.suggested_path,
                category: processed.category
              };
            }
            return null;
          })
        );

        const validResults = cachedResults.filter(result => result !== null);
        if (validResults.length > 0) {
          if (renameFiles) {
            return {
              suggestions: {
                categories: [{
                  name: 'Files to Rename',
                  description: 'Files that will be renamed',
                  suggestedPath: '.',
                  files: validResults.map(result => result.originalName),
                  renames: validResults
                }]
              }
            };
          }

          return {
            suggestions: {
              categories: validResults.map(result => ({
                name: result.category,
                description: 'Suggested organization category',
                suggestedPath: result.suggestedPath,
                files: [pathModule.basename(result.originalPath)]
              }))
            }
          };
        }
      }

      const entriesToAnalyze = forceRefresh ? allFileEntries.slice(0, 50) : unprocessedEntries.slice(0, 50);
      const fileNames = entriesToAnalyze.map(entry => entry.name);
      const allSuggestions = renameFiles ? { renames: [] } : { categories: [] };

      const settings = await db.getAllSettings();
      const provider = normalizeProviderName(settings.selectedProvider || 'openai');
      const apiKey = settings.apiKeys?.[provider];

      if (!apiKey && !['ollama', 'lmstudio'].includes(provider)) {
        return { error: `${provider} API key not configured` };
      }

      const selectedProvider = loadProvider(provider);
      if (!selectedProvider) {
        return { error: `Provider ${provider} not found` };
      }

      const modelName = settings?.selectedModel || selectedProvider.defaultModel;
      const hasRenameImages = renameFiles && entriesToAnalyze.some(entry => imageFilePattern.test(entry.name));
      if (hasRenameImages && !selectedProvider.supportsVision) {
        return { error: `${provider} does not support image inputs for rename suggestions.` };
      }
      if (hasRenameImages && !supportsVisionModel(provider, modelName)) {
        return {
          error: `Selected model does not support image inputs. Please choose a vision-capable model for ${provider}.`
        };
      }

      for (let i = 0; i < fileNames.length; i += BATCH_SIZE) {
        const batchFiles = entriesToAnalyze.slice(i, i + BATCH_SIZE);
        sender.send('analyze-progress', {
          current: i,
          total: fileNames.length,
          status: 'Analyzing files...',
          currentFile: batchFiles[0]?.name || null
        });

        const fileDetails = await Promise.all(batchFiles.map(async ({ name: fileName, path: filePath }) => {
          const stats = await fsModule.lstat(filePath);
          assertNotSymbolicLink(stats, `Selected item ${fileName}`);
          let base64Content = '';
          let imageMimeType = '';
          let isImageFile = false;

          const imageMimeTypeFromName = renameFiles ? getImageMimeType(fileName) : null;
          isImageFile = stats.isFile() && !!imageMimeTypeFromName;

          if (isImageFile) {
            try {
              const fileHash = await db.getFileHash(filePath);
              const isCached = await db.isFileCached(filePath, fileHash);

              if (isCached) {
                const cachedContent = await db.getCachedContent(filePath);
                const cachedPayload = parseCachedImagePayload(cachedContent);
                if (cachedPayload) {
                  base64Content = cachedPayload.base64;
                  imageMimeType = cachedPayload.mimeType;
                }
              }

              if (!base64Content) {
                const imageBuffer = await fsModule.readFile(filePath);
                const processed = await compressImageBuffer(imageBuffer, imageMimeTypeFromName);
                base64Content = processed.buffer.toString('base64');
                imageMimeType = processed.mimeType;
                await db.cacheFile(
                  filePath,
                  fileHash,
                  JSON.stringify({ base64: base64Content, mimeType: imageMimeType })
                );
              }
            } catch (error) {
              logDebug(`Could not process image file ${fileName}:`, error);
            }
          }

          return {
            name: fileName,
            size: stats.size,
            modified: stats.mtime,
            base64Content,
            imageMimeType,
            isImageFile
          };
        }));

        if (renameFiles) {
          const failedImages = fileDetails.filter(
            file => file.isImageFile && (!file.base64Content || !file.imageMimeType)
          );
          if (failedImages.length > 0) {
            return {
              error: `Failed to process images for rename: ${failedImages.map(file => file.name).join(', ')}`
            };
          }
        }

        const systemMessage = renameFiles
          ? 'You are a file renaming assistant. Analyze files and suggest descriptive filenames. For images, focus on key visual elements. IMPORTANT: Respond with ONLY valid JSON, no explanations or markdown. Your response must be parseable by JSON.parse().'
          : 'You are a file organization assistant. Analyze files and suggest logical organization categories. IMPORTANT: Respond with ONLY valid JSON, no explanations or markdown. Your response must be parseable by JSON.parse().';

        const formatInstruction = renameFiles
          ? 'Suggest descriptive filenames in this JSON format: {"renames":[{"originalName":"file.ext","suggestedName":"descriptive.ext","reason":"brief reason"}]}'
          : 'Suggest organization in this JSON format: {"categories":[{"name":"category","description":"brief reason","suggestedPath":"path","files":["file.ext"]}]}';

        const fileContentParts = [];
        fileDetails.forEach((file) => {
          const hasImage = renameFiles && file.base64Content && file.imageMimeType;
          fileContentParts.push({
            type: 'text',
            text: hasImage ? `File: ${file.name} (image attached)` : `File: ${file.name}`
          });
          if (hasImage) {
            fileContentParts.push({
              type: 'image',
              source: {
                type: 'base64',
                media_type: file.imageMimeType,
                data: file.base64Content
              }
            });
          }
        });

        const messages = [
          {
            role: 'system',
            content: [{ type: 'text', text: systemMessage }]
          },
          {
            role: 'user',
            content: fileContentParts
          },
          {
            role: 'user',
            content: [{ type: 'text', text: formatInstruction }]
          }
        ];

        let retries = 3;
        let batchSuggestions;

        while (retries > 0) {
          try {
            const response = await selectedProvider.sendMessage(messages, {
              apiKey,
              model: modelName,
              maxTokens: 1000
            });

            batchSuggestions = parseJson(response);
            break;
          } catch (error) {
            retries -= 1;
            if (retries === 0) {
              throw error;
            }
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
        }

        if (renameFiles) {
          const batchRenames = Array.isArray(batchSuggestions?.renames) ? batchSuggestions.renames : [];
          allSuggestions.renames.push(...batchRenames);
        } else {
          const batchCategories = Array.isArray(batchSuggestions?.categories) ? batchSuggestions.categories : [];
          batchCategories.forEach((newCat) => {
            if (!newCat || typeof newCat !== 'object') {
              return;
            }

            const categoryName = typeof newCat.name === 'string' ? newCat.name : '';
            const categoryFiles = Array.isArray(newCat.files) ? newCat.files : [];
            const normalizedCategory = {
              ...newCat,
              name: categoryName,
              files: categoryFiles
            };
            const existingCat = allSuggestions.categories.find(category => category.name === categoryName);
            if (existingCat) {
              existingCat.files.push(...categoryFiles);
            } else {
              allSuggestions.categories.push(normalizedCategory);
            }
          });
        }

        if (i + BATCH_SIZE < fileNames.length) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      const suggestions = renameFiles
        ? normalizeRenameSuggestions(allSuggestions, fileNames)
        : normalizeSortSuggestions(allSuggestions, fileNames, directoryPath);

      if (renameFiles) {
        if (!suggestions.renames?.length) {
          return { error: 'No valid rename suggestions received' };
        }

        const renameSuggestions = suggestions.renames.map(rename => ({
          filePath: pathModule.join(directoryPath, rename.originalName),
          originalName: rename.originalName,
          suggestedName: rename.suggestedName,
          reason: rename.reason
        }));
        await db.bulkCacheRenameSuggestions(renameSuggestions);

        return {
          suggestions: {
            categories: [{
              name: 'Files to Rename',
              description: 'Files that will be renamed',
              suggestedPath: '.',
              files: suggestions.renames.map(rename => rename.originalName),
              renames: suggestions.renames
            }]
          }
        };
      }

      if (!suggestions.categories?.length) {
        return { error: 'No valid categories received' };
      }

      const sortSuggestions = suggestions.categories.flatMap(category =>
        category.files.map(file => ({
          filePath: pathModule.join(directoryPath, file),
          originalPath: pathModule.join(directoryPath, file),
          suggestedPath: pathModule.join(category.suggestedPath, file),
          category: category.name
        }))
      );
      await db.bulkCacheSortSuggestions(sortSuggestions);

      return { suggestions };
    } catch (error) {
      logError('Failed to analyze directory:', error);
      return { error: error.message };
    }
  }

  return {
    analyzeDirectory,
    analyzeEntries
  };
}

module.exports = {
  createAnalysisService
};
