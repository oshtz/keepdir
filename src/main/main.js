const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');
const { spawn } = require('child_process');
const Database = require('./database');
const updater = require('./updater');
const {
  applyRenameSuggestions,
  applySortSuggestions
} = require('./fileOperations');
const {
  normalizeRenameSuggestions,
  normalizeSortSuggestions
} = require('./suggestionValidation');
const { parseJsonPayload } = require('./jsonExtraction');
const {
  assertNotSymbolicLink,
  isAnalyzableDirectoryEntry,
  normalizeCacheAgeHours,
  normalizeOllamaModelName,
  normalizeProviderName,
  normalizeSelectedAnalysisEntries,
  requireExistingDirectoryPath,
  requireExistingFileOrDirectoryPath
} = require('./ipcValidation');
const {
  normalizeImportOptions,
  readJsonImportFile,
  validateAllDataImport,
  validateWorkspaceImportData
} = require('./importValidation');
const {
  normalizeCustomSectionData,
  normalizeCustomSectionItem,
  normalizeCustomSectionUpdates,
  normalizeRecordId,
  normalizeSettingsPayload,
  normalizeWorkspace,
  normalizeWorkspaceId,
  normalizeWorkspaceSettingRequest
} = require('./stateValidation');

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require('electron-squirrel-startup')) {
  app.quit();
}

const isDev = process.env.NODE_ENV === 'development';
const isVerboseLogging = isDev || process.env.KEEPDIR_DEBUG === '1';
const debugLog = (...args) => {
  if (isVerboseLogging) {
    console.log(...args);
  }
};

function normalizeAnalysisPath(filePath) {
  return Buffer.from(filePath.replace(/\\/g, '/'), 'utf8')
    .toString()
    .normalize('NFC');
}

// Enable debug logging only in development
if (isDev) {
  process.env.DEBUG = 'electron*';
  debugLog('Development mode:', isDev);
}

// Initialize database
const db = new Database();

function registerHandler(channel, handler) {
  ipcMain.removeHandler(channel);
  ipcMain.handle(channel, handler);
}

function registerListener(channel, listener) {
  ipcMain.removeAllListeners(channel);
  ipcMain.on(channel, listener);
}

// Database optimization handlers - Register at app level
registerHandler('get-cache-stats', async () => {
  try {
    const stats = await db.getCacheStats();
    return { success: true, stats };
  } catch (error) {
    console.error('Failed to get cache stats:', error);
    return { error: error.message };
  }
});

registerHandler('get-database-stats', async () => {
  try {
    const stats = await db.getDatabaseStats();
    return { success: true, stats };
  } catch (error) {
    console.error('Failed to get database stats:', error);
    return { error: error.message };
  }
});

registerHandler('cleanup-cache', async (event, maxAgeHours = 168) => {
  try {
    const normalizedMaxAgeHours = normalizeCacheAgeHours(maxAgeHours);
    await db.cleanupCache(normalizedMaxAgeHours);
    return { success: true };
  } catch (error) {
    console.error('Failed to cleanup cache:', error);
    return { error: error.message };
  }
});

registerHandler('optimize-database', async () => {
  try {
    await db.optimizeDatabase();
    return { success: true };
  } catch (error) {
    console.error('Failed to optimize database:', error);
    return { error: error.message };
  }
});

registerHandler('get-provider-models', async (_event, providerName) => {
  try {
    const normalizedProviderName = normalizeProviderName(providerName);
    const settings = await db.getAllSettings();
    const { getProvider } = require('./providers');
    const provider = getProvider(normalizedProviderName);

    if (!provider) {
      return { error: `Provider ${normalizedProviderName} not found` };
    }

    const defaultModel = provider.defaultModel;
    const apiKey = settings.apiKeys?.[normalizedProviderName];
    const displayNames = {
      openai: 'OpenAI',
      anthropic: 'Anthropic',
      google: 'Google',
      ollama: 'Ollama',
      openrouter: 'OpenRouter',
      lmstudio: 'LM Studio'
    };

    if (!['ollama', 'lmstudio'].includes(normalizedProviderName) && !apiKey) {
      return {
        error: `Please configure your ${displayNames[normalizedProviderName] || normalizedProviderName} API key in settings`,
        defaultModel
      };
    }

    const models = await provider.getAvailableModels({ apiKey });
    return { models, defaultModel };
  } catch (error) {
    console.error('Failed to fetch provider models:', error);
    return { error: error.message };
  }
});

function createWindow() {
  debugLog('Creating window...');

  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    frame: false,
    show: false, // Don't show until ready
    icon: path.join(__dirname, '../../assets/icon.png'), // Set window icon
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      webSecurity: true
    },
  });

  debugLog('Window created');

  // Load from webpack dev server in development
  if (isDev) {
    const loadUrl = 'http://localhost:8081';
    debugLog('Loading from dev server:', loadUrl);
    mainWindow.loadURL(loadUrl).catch(err => {
      console.error('Failed to load URL:', err);
    });
    if (process.env.KEEPDIR_E2E !== '1') {
      mainWindow.webContents.openDevTools();
    }
  } else {
    const filePath = path.join(__dirname, '../../dist/index.html');
    debugLog('Loading from file:', filePath);
    mainWindow.loadFile(filePath).catch(err => {
      console.error('Failed to load file:', err);
    });
  }

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    debugLog('Window ready to show');
    mainWindow.show();
  });

  // Window control handlers
  registerListener('minimize-window', () => {
    mainWindow.minimize();
  });

  registerListener('maximize-window', () => {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  });

  registerListener('close-window', () => {
    mainWindow.close();
  });

  registerHandler('select-directory', async () => {
    if (process.env.KEEPDIR_E2E === '1' && process.env.KEEPDIR_E2E_SELECT_DIRECTORY) {
      return requireExistingDirectoryPath(process.env.KEEPDIR_E2E_SELECT_DIRECTORY);
    }

    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory']
    });
    if (!result.canceled) {
      return result.filePaths[0];
    }
    return null;
  });

  // Handler for opening files with system default application
  registerHandler('open-file', async (event, filePath) => {
    try {
      const safeFilePath = await requireExistingFileOrDirectoryPath(filePath, 'File path');
      const openError = await shell.openPath(safeFilePath);
      if (openError) {
        return { error: openError };
      }
      return { success: true };
    } catch (error) {
      console.error('Failed to open file:', error);
      return { error: error.message };
    }
  });

  // Reveal item in OS file explorer
  registerHandler('reveal-in-folder', async (_event, filePath) => {
    try {
      const safeFilePath = await requireExistingFileOrDirectoryPath(filePath, 'File path');
      shell.showItemInFolder(safeFilePath);
      return { success: true };
    } catch (error) {
      console.error('Failed to reveal in folder:', error);
      return { error: error.message };
    }
  });

  registerHandler('load-directory', async (event, directoryPath) => {
    try {
      const safeDirectoryPath = await requireExistingDirectoryPath(directoryPath);
      debugLog(`Loading directory: ${safeDirectoryPath}`);
      const items = await fs.readdir(safeDirectoryPath, { withFileTypes: true });
      const files = await Promise.all(items.map(async (item) => {
        const fullPath = path.join(safeDirectoryPath, item.name);
        const stats = await fs.lstat(fullPath);
        return {
          name: item.name,
          path: fullPath,
          isDirectory: item.isDirectory(),
          size: stats.size,
          modified: stats.mtime
        };
      }));
      return { files };
    } catch (error) {
      console.error('Failed to load directory:', error);
      return { error: error.message };
    }
  });

  // Log any load failures
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.error('Failed to load:', errorCode, errorDescription);
  });

  // Log any crashes
  mainWindow.webContents.on('crashed', () => {
    console.error('Window crashed');
  });

  // Ollama model pull handler
  registerHandler('pull-ollama-model', async (event, modelName) => {
    const safeModelName = normalizeOllamaModelName(modelName);
    return new Promise((resolve, reject) => {
      const ollamaProcess = spawn('ollama', ['pull', safeModelName]);
      let error = '';

      ollamaProcess.stdout.on('data', (data) => {
        const output = data.toString();
        // Parse progress from Ollama output
        const progressMatch = output.match(/(\d+)%/);
        if (progressMatch) {
          const progress = parseInt(progressMatch[1]);
          event.sender.send('ollama-model-pull-progress', {
            progress,
            status: output.trim()
          });
        }
      });

      ollamaProcess.stderr.on('data', (data) => {
        error += data.toString();
      });

      ollamaProcess.on('close', (code) => {
        if (code === 0) {
          resolve({ success: true });
        } else {
          reject(new Error(`Failed to pull model: ${error}`));
        }
      });

      ollamaProcess.on('error', (err) => {
        reject(new Error(`Failed to start Ollama: ${err.message}`));
      });
    });
  });

  registerHandler('list-ollama-models', async () => {
    try {
      const response = await axios.get('http://localhost:11434/api/tags', {
        timeout: 2000
      });
      const models = (response.data?.models || []).map((model) => ({
        name: model.name
      }));
      return { models };
    } catch (error) {
      console.error('Failed to list Ollama models:', error);
      return { error: 'Failed to fetch Ollama models. Is Ollama running?' };
    }
  });

  registerHandler('delete-ollama-model', async (_event, modelName) => {
    let safeModelName;
    try {
      safeModelName = normalizeOllamaModelName(modelName);
    } catch (error) {
      return { error: error.message };
    }

    return new Promise((resolve) => {
      const ollamaProcess = spawn('ollama', ['rm', safeModelName]);
      let error = '';

      ollamaProcess.stderr.on('data', (data) => {
        error += data.toString();
      });

      ollamaProcess.on('close', (code) => {
        if (code === 0) {
          resolve({ success: true });
        } else {
          resolve({
            error: `Failed to delete model: ${error || `exit code ${code}`}`
          });
        }
      });

      ollamaProcess.on('error', (err) => {
        resolve({ error: `Failed to start Ollama: ${err.message}` });
      });
    });
  });

  // Log console messages from renderer
  mainWindow.webContents.on('console-message', (event, level, message) => {
    debugLog('Renderer Console:', message);
  });

  // Workspace handlers
  registerHandler('get-workspaces', async () => {
    try {
      const workspaces = await db.getWorkspaces();
      return workspaces;
    } catch (error) {
      console.error('Failed to get workspaces:', error);
      return { error: error.message };
    }
  });

  registerHandler('save-workspace', async (event, workspace) => {
    try {
      const normalizedWorkspace = normalizeWorkspace(workspace);
      await db.saveWorkspace(normalizedWorkspace);
      return { success: true };
    } catch (error) {
      console.error('Failed to save workspace:', error);
      return { error: error.message };
    }
  });

  registerHandler('delete-workspace', async (event, id) => {
    try {
      const workspaceId = normalizeWorkspaceId(id);
      await db.deleteWorkspace(workspaceId);
      return { success: true };
    } catch (error) {
      console.error('Failed to delete workspace:', error);
      return { error: error.message };
    }
  });

  // Workspace settings handlers
  registerHandler('get-workspace-settings', async (event, workspaceId) => {
    try {
      const normalizedWorkspaceId = normalizeWorkspaceId(workspaceId);
      const settings = await db.getWorkspaceSettings(normalizedWorkspaceId);
      return settings;
    } catch (error) {
      console.error('Failed to get workspace settings:', error);
      return { error: error.message };
    }
  });

  registerHandler('get-workspace-setting', async (event, payload = {}) => {
    try {
      const { workspaceId, key } = normalizeWorkspaceSettingRequest(payload);
      const value = await db.getWorkspaceSetting(workspaceId, key);
      return value;
    } catch (error) {
      console.error('Failed to get workspace setting:', error);
      return null;
    }
  });

  registerHandler('save-workspace-setting', async (event, payload = {}) => {
    try {
      const { workspaceId, key, value } = normalizeWorkspaceSettingRequest(payload, {
        requireValue: true
      });
      await db.saveWorkspaceSetting(workspaceId, key, value);
      return { success: true };
    } catch (error) {
      console.error('Failed to save workspace setting:', error);
      return { error: error.message };
    }
  });

  // Settings handlers
  registerHandler('save-settings', async (event, settings) => {
    try {
      const normalizedSettings = normalizeSettingsPayload(settings);
      await db.saveSettings(normalizedSettings);
      return { success: true };
    } catch (error) {
      console.error('Failed to save settings:', error);
      return { error: error.message };
    }
  });

  registerHandler('load-settings', async () => {
    try {
      // Try to load settings from database
      const settings = await db.getAllSettings();

      // If we have settings in database, use them
      if (Object.keys(settings).length > 0) {
        return { settings };
      }

      // If no settings exist, try to migrate from JSON file
      try {
        const settingsPath = path.join(app.getPath('userData'), 'settings.json');
        const data = await fs.readFile(settingsPath, 'utf8');
        const jsonSettings = normalizeSettingsPayload(JSON.parse(data));

        // Save migrated settings to database
        await db.saveSettings(jsonSettings);

        // Delete the old settings file
        await fs.unlink(settingsPath);

        return { settings: jsonSettings };
      } catch (error) {
        if (error.code !== 'ENOENT') {
          console.error('Failed to migrate settings:', error);
        }

        // Return default settings structure
        return {
          settings: {
            apiKeys: {},
            selectedProvider: null,
            selectedModel: null,
            renameFiles: false
          }
        };
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
      return { settings: {}, error: error.message };
    }
  });

  // Workspace export/import handlers
  registerHandler('export-workspace', async (event, workspaceId) => {
    try {
      const normalizedWorkspaceId = normalizeWorkspaceId(workspaceId);
      const exportData = await db.exportWorkspace(normalizedWorkspaceId);

      // Show save dialog
      const result = await dialog.showSaveDialog(mainWindow, {
        title: 'Export Workspace',
        defaultPath: `${exportData.workspace.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_workspace.json`,
        filters: [
          { name: 'JSON Files', extensions: ['json'] },
          { name: 'All Files', extensions: ['*'] }
        ]
      });

      if (!result.canceled && result.filePath) {
        await fs.writeFile(result.filePath, JSON.stringify(exportData, null, 2), 'utf8');
        return { success: true, filePath: result.filePath };
      }

      return { success: false, cancelled: true };
    } catch (error) {
      console.error('Failed to export workspace:', error);
      return { error: error.message };
    }
  });

  registerHandler('import-workspace', async (event, options = {}) => {
    try {
      const importOptions = normalizeImportOptions(options);

      // Show open dialog
      const result = await dialog.showOpenDialog(mainWindow, {
        title: 'Import Workspace',
        filters: [
          { name: 'JSON Files', extensions: ['json'] },
          { name: 'All Files', extensions: ['*'] }
        ],
        properties: ['openFile']
      });

      if (result.canceled || !result.filePaths.length) {
        return { success: false, cancelled: true };
      }

      const filePath = result.filePaths[0];
      const workspaceData = validateWorkspaceImportData(await readJsonImportFile(filePath));
      const importResult = await db.importWorkspace(workspaceData, importOptions);
      return importResult;
    } catch (error) {
      console.error('Failed to import workspace:', error);
      return { error: error.message };
    }
  });

  registerHandler('export-all-data', async () => {
    try {
      const exportData = await db.exportAllData();

      // Show save dialog
      const result = await dialog.showSaveDialog(mainWindow, {
        title: 'Export All Data (Backup)',
        defaultPath: `keepdir_backup_${new Date().toISOString().split('T')[0]}.json`,
        filters: [
          { name: 'JSON Files', extensions: ['json'] },
          { name: 'All Files', extensions: ['*'] }
        ]
      });

      if (!result.canceled && result.filePath) {
        await fs.writeFile(result.filePath, JSON.stringify(exportData, null, 2), 'utf8');
        return { success: true, filePath: result.filePath };
      }

      return { success: false, cancelled: true };
    } catch (error) {
      console.error('Failed to export all data:', error);
      return { error: error.message };
    }
  });

  registerHandler('import-all-data', async (event, options = {}) => {
    try {
      const importOptions = normalizeImportOptions(options);

      // Show open dialog
      const result = await dialog.showOpenDialog(mainWindow, {
        title: 'Import All Data (Restore Backup)',
        filters: [
          { name: 'JSON Files', extensions: ['json'] },
          { name: 'All Files', extensions: ['*'] }
        ],
        properties: ['openFile']
      });

      if (result.canceled || !result.filePaths.length) {
        return { success: false, cancelled: true };
      }

      const filePath = result.filePaths[0];
      const backupData = validateAllDataImport(await readJsonImportFile(filePath));
      const importResult = await db.importAllData(backupData, importOptions);
      return importResult;
    } catch (error) {
      console.error('Failed to import all data:', error);
      return { error: error.message };
    }
  });

  // Custom sections handlers
  registerHandler('get-custom-sections', async (event, workspaceId) => {
    try {
      const normalizedWorkspaceId = normalizeWorkspaceId(workspaceId);
      const sections = await db.getCustomSections(normalizedWorkspaceId);
      return { success: true, sections };
    } catch (error) {
      console.error('Failed to get custom sections:', error);
      return { error: error.message };
    }
  });

  registerHandler('create-custom-section', async (event, workspaceId, sectionData) => {
    try {
      const normalizedWorkspaceId = normalizeWorkspaceId(workspaceId);
      const normalizedSectionData = normalizeCustomSectionData(sectionData);
      const section = await db.createCustomSection(normalizedWorkspaceId, normalizedSectionData);
      return { success: true, section };
    } catch (error) {
      console.error('Failed to create custom section:', error);
      return { error: error.message };
    }
  });

  registerHandler('update-custom-section', async (event, sectionId, updates) => {
    try {
      const normalizedSectionId = normalizeRecordId(sectionId, 'Custom section id');
      const normalizedUpdates = normalizeCustomSectionUpdates(updates);
      await db.updateCustomSection(normalizedSectionId, normalizedUpdates);
      return { success: true };
    } catch (error) {
      console.error('Failed to update custom section:', error);
      return { error: error.message };
    }
  });

  registerHandler('delete-custom-section', async (event, sectionId) => {
    try {
      const normalizedSectionId = normalizeRecordId(sectionId, 'Custom section id');
      await db.deleteCustomSection(normalizedSectionId);
      return { success: true };
    } catch (error) {
      console.error('Failed to delete custom section:', error);
      return { error: error.message };
    }
  });

  registerHandler('add-item-to-custom-section', async (event, sectionId, item) => {
    try {
      const normalizedSectionId = normalizeRecordId(sectionId, 'Custom section id');
      const normalizedItem = normalizeCustomSectionItem(item);
      const items = await db.addItemToCustomSection(normalizedSectionId, normalizedItem);
      return { success: true, items };
    } catch (error) {
      console.error('Failed to add item to custom section:', error);
      return { error: error.message };
    }
  });

  registerHandler('remove-item-from-custom-section', async (event, sectionId, itemId) => {
    try {
      const normalizedSectionId = normalizeRecordId(sectionId, 'Custom section id');
      const normalizedItemId = normalizeRecordId(itemId, 'Custom section item id');
      const items = await db.removeItemFromCustomSection(normalizedSectionId, normalizedItemId);
      return { success: true, items };
    } catch (error) {
      console.error('Failed to remove item from custom section:', error);
      return { error: error.message };
    }
  });


  // Register IPC handlers for file analysis
  registerHandler('analyze-directory-for-sort', async (event, directoryPath, selectedPaths) => {
    return analyzeDirectory(event.sender, directoryPath, false, selectedPaths);
  });

  registerHandler('analyze-directory-for-rename', async (event, directoryPath, selectedPaths) => {
    return analyzeDirectory(event.sender, directoryPath, true, selectedPaths);
  });

  // Register IPC handlers for fresh analysis (bypassing cache)
  registerHandler('analyze-directory-for-sort-fresh', async (event, directoryPath, selectedPaths) => {
    return analyzeDirectory(event.sender, directoryPath, false, selectedPaths, true);
  });

  registerHandler('analyze-directory-for-rename-fresh', async (event, directoryPath, selectedPaths) => {
    return analyzeDirectory(event.sender, directoryPath, true, selectedPaths, true);
  });

  // AI File Analysis handlers with caching
  async function analyzeDirectory(sender, directoryPath, renameFiles, selectedPaths, forceRefresh = false) {
    try {
      directoryPath = await requireExistingDirectoryPath(directoryPath);
      const selectedFileEntries = await normalizeSelectedAnalysisEntries(selectedPaths, directoryPath);

      let allFileEntries;

      if (selectedFileEntries && selectedFileEntries.length > 0) {
        // If selectedPaths is provided, only process those validated direct-child files.
        allFileEntries = selectedFileEntries;
      } else {
        // Otherwise process all non-directory files
        const files = await fs.readdir(directoryPath, { withFileTypes: true });
        allFileEntries = files
          .filter(isAnalyzableDirectoryEntry)
          .map(file => ({
            name: file.name,
            path: path.join(directoryPath, file.name)
          }));
      }

      const filePaths = allFileEntries.map(entry => entry.path);
      const fileEntryByPath = new Map(
        allFileEntries.map(entry => [normalizeAnalysisPath(entry.path), entry])
      );

      // Use the appropriate unprocessed files method based on operation
      const unprocessedPaths = renameFiles
        ? await db.getUnprocessedRenames(filePaths)
        : await db.getUnprocessedSorts(filePaths);
      const unprocessedEntries = unprocessedPaths
        .map(filePath => fileEntryByPath.get(normalizeAnalysisPath(filePath)))
        .filter(Boolean);

      // If all files are processed and not forcing refresh, return cached suggestions
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
              } else {
                return {
                  originalPath: processed.original_path,
                  suggestedPath: processed.suggested_path,
                  category: processed.category
                };
              }
            }
            return null;
          })
        );

        const validResults = cachedResults.filter(r => r !== null);
        if (validResults.length > 0) {
          if (renameFiles) {
            return {
              suggestions: {
                categories: [{
                  name: "Files to Rename",
                  description: "Files that will be renamed",
                  suggestedPath: ".",
                  files: validResults.map(r => r.originalName),
                  renames: validResults
                }]
              }
            };
          } else {
            return {
              suggestions: {
                categories: validResults.map(r => ({
                  name: r.category,
                  description: "Suggested organization category",
                  suggestedPath: r.suggestedPath,
                  files: [path.basename(r.originalPath)]
                }))
              }
            };
          }
        }
      }

      // If forcing refresh, analyze all files regardless of cache status
      const fileEntries = forceRefresh ? allFileEntries.slice(0, 50) : unprocessedEntries.slice(0, 50);
      const fileNames = fileEntries.map(entry => entry.name);

      // Process files in smaller batches for API calls
      const BATCH_SIZE = 10;
      let allSuggestions = renameFiles ? { renames: [] } : { categories: [] };

      // Get settings from database
      const settings = await db.getAllSettings();
      const provider = normalizeProviderName(settings.selectedProvider || 'openai');
      const apiKey = settings.apiKeys?.[provider];

      // Ollama doesn't require an API key since it runs locally
      if (!apiKey && !['ollama', 'lmstudio'].includes(provider)) {
        return { error: `${provider} API key not configured` };
      }

      const { getProvider } = require('./providers');
      const selectedProvider = getProvider(provider);

      if (!selectedProvider) {
        return { error: `Provider ${provider} not found` };
      }

      const MAX_IMAGE_BYTES = 1024 * 1024;
      const imageFilePattern = /\.(jpg|jpeg|png)$/i;
      const modelName = settings?.selectedModel || selectedProvider.defaultModel;

      const supportsVisionModel = (providerName, modelValue) => {
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
      };

      const getImageMimeType = (fileName) => {
        const ext = path.extname(fileName).toLowerCase();
        if (ext === '.jpg' || ext === '.jpeg') {
          return 'image/jpeg';
        }
        if (ext === '.png') {
          return 'image/png';
        }
        return null;
      };

      const parseCachedImagePayload = (cachedContent) => {
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
      };

      const compressImageBuffer = async (buffer, mimeType) => {
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

        for (let attempt = 0; attempt < 6; attempt++) {
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
      };

      const hasRenameImages = renameFiles && fileEntries.some(entry => imageFilePattern.test(entry.name));
      if (hasRenameImages && !selectedProvider.supportsVision) {
        return { error: `${provider} does not support image inputs for rename suggestions.` };
      }
      if (hasRenameImages && !supportsVisionModel(provider, modelName)) {
        return {
          error: `Selected model does not support image inputs. Please choose a vision-capable model for ${provider}.`
        };
      }

      // Process files in batches with progress updates
      for (let i = 0; i < fileNames.length; i += BATCH_SIZE) {
        const batchFiles = fileEntries.slice(i, i + BATCH_SIZE);

        // Send analyze progress update
        sender.send('analyze-progress', {
          current: i,
          total: fileNames.length,
          status: 'Analyzing files...',
          currentFile: batchFiles[0]?.name || null
        });

        // Get file details for the batch
        const fileDetails = await Promise.all(batchFiles.map(async ({ name: fileName, path: filePath }) => {
          const stats = await fs.lstat(filePath);
          assertNotSymbolicLink(stats, `Selected item ${fileName}`);
          let base64Content = '';
          let imageMimeType = '';
          let isImageFile = false;

          // Only process images and optimize image loading
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
                const imageBuffer = await fs.readFile(filePath);
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
              debugLog(`Could not process image file ${fileName}:`, error);
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
            (file) => file.isImageFile && (!file.base64Content || !file.imageMimeType)
          );
          if (failedImages.length > 0) {
            return {
              error: `Failed to process images for rename: ${failedImages.map(f => f.name).join(', ')}`
            };
          }
        }

        const systemMessage = renameFiles
          ? "You are a file renaming assistant. Analyze files and suggest descriptive filenames. For images, focus on key visual elements. IMPORTANT: Respond with ONLY valid JSON, no explanations or markdown. Your response must be parseable by JSON.parse()."
          : "You are a file organization assistant. Analyze files and suggest logical organization categories. IMPORTANT: Respond with ONLY valid JSON, no explanations or markdown. Your response must be parseable by JSON.parse().";

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
            role: "system",
            content: [{ type: 'text', text: systemMessage }]
          },
          {
            role: "user",
            content: fileContentParts
          },
          {
            role: "user",
            content: [{ type: 'text', text: formatInstruction }]
          }
        ];

        // Make API call with retry logic
        let retries = 3;
        let batchSuggestions;

        while (retries > 0) {
          try {
            const response = await selectedProvider.sendMessage(messages, {
              apiKey,
              model: modelName,
              maxTokens: 1000
            });

            batchSuggestions = parseJsonPayload(response);
            break;
          } catch (error) {
            retries--;
            if (retries === 0) throw error;
            await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2s before retry
          }
        }

        // Merge batch results
        if (renameFiles) {
          const batchRenames = Array.isArray(batchSuggestions?.renames) ? batchSuggestions.renames : [];
          allSuggestions.renames.push(...batchRenames);
        } else {
          // Merge categories intelligently
          const batchCategories = Array.isArray(batchSuggestions?.categories) ? batchSuggestions.categories : [];
          batchCategories.forEach(newCat => {
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
            const existingCat = allSuggestions.categories.find(c => c.name === categoryName);
            if (existingCat) {
              existingCat.files.push(...categoryFiles);
            } else {
              allSuggestions.categories.push(normalizedCategory);
            }
          });
        }

        // Add delay between batches to avoid rate limits
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

        // Cache rename suggestions in bulk
        const renameSuggestions = suggestions.renames.map(rename => ({
          filePath: path.join(directoryPath, rename.originalName),
          originalName: rename.originalName,
          suggestedName: rename.suggestedName,
          reason: rename.reason
        }));
        await db.bulkCacheRenameSuggestions(renameSuggestions);

        return {
          suggestions: {
            categories: [{
              name: "Files to Rename",
              description: "Files that will be renamed",
              suggestedPath: ".",
              files: suggestions.renames.map(r => r.originalName),
              renames: suggestions.renames
            }]
          }
        };
      } else {
        if (!suggestions.categories?.length) {
          return { error: 'No valid categories received' };
        }

        // Cache sort suggestions in bulk
        const sortSuggestions = suggestions.categories.flatMap(category =>
          category.files.map(file => ({
            filePath: path.join(directoryPath, file),
            originalPath: path.join(directoryPath, file),
            suggestedPath: path.join(category.suggestedPath, file),
            category: category.name
          }))
        );
        await db.bulkCacheSortSuggestions(sortSuggestions);

        return { suggestions };
      }
    } catch (error) {
      console.error('Failed to analyze directory:', error);
      return { error: error.message };
    }
  }

  // Handler for applying suggestions with batch processing
  registerHandler('apply-suggestions', async (event, payload = {}) => {
    try {
      const directoryPath = await requireExistingDirectoryPath(payload.directoryPath);
      return applySortSuggestions({
        directoryPath,
        suggestions: payload.suggestions,
        db,
        onProgress: (channel, progressPayload) => event.sender.send(channel, progressPayload)
      });
    } catch (error) {
      return {
        success: false,
        partial: false,
        movedFiles: [],
        errors: [{ file: 'unknown', error: error.message }],
        error: error.message
      };
    }
  });

  // Handler for applying renames with batch processing
  registerHandler('apply-renames', async (event, payload = {}) => {
    try {
      const directoryPath = await requireExistingDirectoryPath(payload.directoryPath);
      return applyRenameSuggestions({
        directoryPath,
        suggestions: payload.suggestions,
        db,
        onProgress: (channel, progressPayload) => event.sender.send(channel, progressPayload)
      });
    } catch (error) {
      return {
        success: false,
        partial: false,
        error: error.message,
        renamedFiles: [],
        errors: [{
          file: 'unknown',
          error: error.message
        }]
      };
    }
  });

  // Auto-update handlers
  registerHandler('get-app-version', () => {
    return app.getVersion();
  });

  registerHandler('check-for-update', async () => {
    return await updater.checkForUpdate(mainWindow);
  });

  registerHandler('download-update', async (event, updateInfo) => {
    return await updater.downloadUpdate(updateInfo, mainWindow);
  });

  registerHandler('install-update', async (event, updatePath) => {
    return await updater.installUpdate(updatePath);
  });

  // Cleanup old updates on startup
  updater.cleanupUpdates();
}

// This method will be called when Electron has finished initialization
if (app) {
  debugLog('App exists');
  app.whenReady().then(() => {
    debugLog('App ready');
    createWindow();

    app.on('activate', () => {
      debugLog('App activated');
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  }).catch(err => {
    console.error('Failed to initialize app:', err);
  });

  // Quit when all windows are closed
  app.on('window-all-closed', () => {
    debugLog('All windows closed');
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });

  // Close database when app quits
  app.on('before-quit', () => {
    db.close();
  });

  // Log any app errors
  app.on('render-process-gone', (event, webContents, details) => {
    console.error('Render process gone:', details);
  });

  app.on('child-process-gone', (event, details) => {
    console.error('Child process gone:', details);
  });
} else {
  console.error('Electron app not found');
}
