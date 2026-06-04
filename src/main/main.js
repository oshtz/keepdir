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
const { createAnalysisService } = require('./analysisService');
const { getProvider } = require('./providers');
const {
  normalizeCacheAgeHours,
  normalizeOllamaModelName,
  normalizeProviderName,
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


  const analysisService = createAnalysisService({
    db,
    getProvider,
    logger: {
      debug: debugLog,
      error: console.error
    }
  });

  // Register IPC handlers for file analysis
  registerHandler('analyze-directory-for-sort', async (event, directoryPath, selectedPaths) => {
    return analysisService.analyzeDirectory({
      sender: event.sender,
      directoryPath,
      renameFiles: false,
      selectedPaths
    });
  });

  registerHandler('analyze-directory-for-rename', async (event, directoryPath, selectedPaths) => {
    return analysisService.analyzeDirectory({
      sender: event.sender,
      directoryPath,
      renameFiles: true,
      selectedPaths
    });
  });

  // Register IPC handlers for fresh analysis (bypassing cache)
  registerHandler('analyze-directory-for-sort-fresh', async (event, directoryPath, selectedPaths) => {
    return analysisService.analyzeDirectory({
      sender: event.sender,
      directoryPath,
      renameFiles: false,
      selectedPaths,
      forceRefresh: true
    });
  });

  registerHandler('analyze-directory-for-rename-fresh', async (event, directoryPath, selectedPaths) => {
    return analysisService.analyzeDirectory({
      sender: event.sender,
      directoryPath,
      renameFiles: true,
      selectedPaths,
      forceRefresh: true
    });
  });
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
