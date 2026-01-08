const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');
const { spawn } = require('child_process');
const Database = require('./database');

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require('electron-squirrel-startup')) {
  app.quit();
}

const isDev = process.env.NODE_ENV === 'development';

// Enable debug logging only in development
if (isDev) {
  process.env.DEBUG = 'electron*';
  console.log('Development mode:', isDev);
}

// Initialize database
const db = new Database();

// Database optimization handlers - Register at app level
ipcMain.handle('get-cache-stats', async () => {
  try {
    const stats = await db.getCacheStats();
    return { success: true, stats };
  } catch (error) {
    console.error('Failed to get cache stats:', error);
    return { error: error.message };
  }
});

ipcMain.handle('get-database-stats', async () => {
  try {
    const stats = await db.getDatabaseStats();
    return { success: true, stats };
  } catch (error) {
    console.error('Failed to get database stats:', error);
    return { error: error.message };
  }
});

ipcMain.handle('cleanup-cache', async (event, maxAgeHours = 168) => {
  try {
    await db.cleanupCache(maxAgeHours);
    return { success: true };
  } catch (error) {
    console.error('Failed to cleanup cache:', error);
    return { error: error.message };
  }
});

ipcMain.handle('optimize-database', async () => {
  try {
    await db.optimizeDatabase();
    return { success: true };
  } catch (error) {
    console.error('Failed to optimize database:', error);
    return { error: error.message };
  }
});

ipcMain.handle('get-provider-models', async (_event, providerName) => {
  try {
    const settings = await db.getAllSettings();
    const { getProvider } = require('./providers');
    const provider = getProvider(providerName);

    if (!provider) {
      return { error: `Provider ${providerName} not found` };
    }

    const defaultModel = provider.defaultModel;
    const apiKey = settings.apiKeys?.[providerName];
    const displayNames = {
      openai: 'OpenAI',
      anthropic: 'Anthropic',
      google: 'Google',
      ollama: 'Ollama'
    };

    if (providerName !== 'ollama' && !apiKey) {
      return {
        error: `Please configure your ${displayNames[providerName] || providerName} API key in settings`,
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
  console.log('Creating window...');

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

  console.log('Window created');

  // Load from webpack dev server in development
  if (isDev) {
    const loadUrl = 'http://localhost:8081';
    console.log('Loading from dev server:', loadUrl);
    mainWindow.loadURL(loadUrl).catch(err => {
      console.error('Failed to load URL:', err);
    });
    mainWindow.webContents.openDevTools();
  } else {
    const filePath = path.join(__dirname, '../../dist/index.html');
    console.log('Loading from file:', filePath);
    mainWindow.loadFile(filePath).catch(err => {
      console.error('Failed to load file:', err);
    });
  }

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    console.log('Window ready to show');
    mainWindow.show();
  });

  // Window control handlers
  ipcMain.on('minimize-window', () => {
    mainWindow.minimize();
  });

  ipcMain.on('maximize-window', () => {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  });

  ipcMain.on('close-window', () => {
    mainWindow.close();
  });

  ipcMain.handle('select-directory', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory']
    });
    if (!result.canceled) {
      return result.filePaths[0];
    }
    return null;
  });

  // Handler for opening files with system default application
  ipcMain.handle('open-file', async (event, filePath) => {
    try {
      await require('electron').shell.openPath(filePath);
      return { success: true };
    } catch (error) {
      console.error('Failed to open file:', error);
      return { error: error.message };
    }
  });

  // Reveal item in OS file explorer
  ipcMain.handle('reveal-in-folder', async (_event, filePath) => {
    try {
      shell.showItemInFolder(filePath);
      return { success: true };
    } catch (error) {
      console.error('Failed to reveal in folder:', error);
      return { error: error.message };
    }
  });

  ipcMain.handle('load-directory', async (event, directoryPath) => {
    console.log(`Loading directory: ${directoryPath}`);
    try {
      const items = await fs.readdir(directoryPath, { withFileTypes: true });
      const files = await Promise.all(items.map(async (item) => {
        const fullPath = path.join(directoryPath, item.name);
        const stats = await fs.stat(fullPath);
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
  ipcMain.handle('pull-ollama-model', async (event, modelName) => {
    return new Promise((resolve, reject) => {
      const ollamaProcess = spawn('ollama', ['pull', modelName]);
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

  ipcMain.handle('list-ollama-models', async () => {
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

  ipcMain.handle('delete-ollama-model', async (_event, modelName) => {
    if (!modelName) {
      return { error: 'Model name is required.' };
    }

    return new Promise((resolve) => {
      const ollamaProcess = spawn('ollama', ['rm', modelName]);
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
    console.log('Renderer Console:', message);
  });

  // Workspace handlers
  ipcMain.handle('get-workspaces', async () => {
    try {
      const workspaces = await db.getWorkspaces();
      return workspaces;
    } catch (error) {
      console.error('Failed to get workspaces:', error);
      return { error: error.message };
    }
  });

  ipcMain.handle('save-workspace', async (event, workspace) => {
    try {
      await db.saveWorkspace(workspace);
      return { success: true };
    } catch (error) {
      console.error('Failed to save workspace:', error);
      return { error: error.message };
    }
  });

  ipcMain.handle('delete-workspace', async (event, id) => {
    try {
      await db.deleteWorkspace(id);
      return { success: true };
    } catch (error) {
      console.error('Failed to delete workspace:', error);
      return { error: error.message };
    }
  });

  // Workspace settings handlers
  ipcMain.handle('get-workspace-settings', async (event, workspaceId) => {
    try {
      const settings = await db.getWorkspaceSettings(workspaceId);
      return settings;
    } catch (error) {
      console.error('Failed to get workspace settings:', error);
      return { error: error.message };
    }
  });

  ipcMain.handle('get-workspace-setting', async (event, { workspaceId, key }) => {
    try {
      const value = await db.getWorkspaceSetting(workspaceId, key);
      return value;
    } catch (error) {
      console.error('Failed to get workspace setting:', error);
      return null;
    }
  });

  ipcMain.handle('save-workspace-setting', async (event, { workspaceId, key, value }) => {
    try {
      await db.saveWorkspaceSetting(workspaceId, key, value);
      return { success: true };
    } catch (error) {
      console.error('Failed to save workspace setting:', error);
      return { error: error.message };
    }
  });

  // Settings handlers
  ipcMain.handle('save-settings', async (event, settings) => {
    try {
      await db.saveSettings(settings);
      return { success: true };
    } catch (error) {
      console.error('Failed to save settings:', error);
      return { error: error.message };
    }
  });

  ipcMain.handle('load-settings', async () => {
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
        const jsonSettings = JSON.parse(data);

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
  ipcMain.handle('export-workspace', async (event, workspaceId) => {
    try {
      const exportData = await db.exportWorkspace(workspaceId);

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

  ipcMain.handle('import-workspace', async (event, options = {}) => {
    try {
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
      const fileContent = await fs.readFile(filePath, 'utf8');
      const workspaceData = JSON.parse(fileContent);

      // Validate workspace data structure
      if (!workspaceData.workspace || !workspaceData.version) {
        throw new Error('Invalid workspace file format');
      }

      const importResult = await db.importWorkspace(workspaceData, options);
      return importResult;
    } catch (error) {
      console.error('Failed to import workspace:', error);
      return { error: error.message };
    }
  });

  ipcMain.handle('export-all-data', async (event) => {
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

  ipcMain.handle('import-all-data', async (event, options = {}) => {
    try {
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
      const fileContent = await fs.readFile(filePath, 'utf8');
      const backupData = JSON.parse(fileContent);

      // Validate backup data structure
      if (!backupData.version || !backupData.exportedAt) {
        throw new Error('Invalid backup file format');
      }

      const importResult = await db.importAllData(backupData, options);
      return importResult;
    } catch (error) {
      console.error('Failed to import all data:', error);
      return { error: error.message };
    }
  });

  // Custom sections handlers
  ipcMain.handle('get-custom-sections', async (event, workspaceId) => {
    try {
      const sections = await db.getCustomSections(workspaceId);
      return { success: true, sections };
    } catch (error) {
      console.error('Failed to get custom sections:', error);
      return { error: error.message };
    }
  });

  ipcMain.handle('create-custom-section', async (event, workspaceId, sectionData) => {
    try {
      const section = await db.createCustomSection(workspaceId, sectionData);
      return { success: true, section };
    } catch (error) {
      console.error('Failed to create custom section:', error);
      return { error: error.message };
    }
  });

  ipcMain.handle('update-custom-section', async (event, sectionId, updates) => {
    try {
      await db.updateCustomSection(sectionId, updates);
      return { success: true };
    } catch (error) {
      console.error('Failed to update custom section:', error);
      return { error: error.message };
    }
  });

  ipcMain.handle('delete-custom-section', async (event, sectionId) => {
    try {
      await db.deleteCustomSection(sectionId);
      return { success: true };
    } catch (error) {
      console.error('Failed to delete custom section:', error);
      return { error: error.message };
    }
  });

  ipcMain.handle('add-item-to-custom-section', async (event, sectionId, item) => {
    try {
      const items = await db.addItemToCustomSection(sectionId, item);
      return { success: true, items };
    } catch (error) {
      console.error('Failed to add item to custom section:', error);
      return { error: error.message };
    }
  });

  ipcMain.handle('remove-item-from-custom-section', async (event, sectionId, itemId) => {
    try {
      const items = await db.removeItemFromCustomSection(sectionId, itemId);
      return { success: true, items };
    } catch (error) {
      console.error('Failed to remove item from custom section:', error);
      return { error: error.message };
    }
  });


  // Register IPC handlers for file analysis
  ipcMain.handle('analyze-directory-for-sort', async (event, directoryPath, selectedPaths) => {
    return analyzeDirectory(event.sender, directoryPath, false, selectedPaths);
  });

  ipcMain.handle('analyze-directory-for-rename', async (event, directoryPath, selectedPaths) => {
    return analyzeDirectory(event.sender, directoryPath, true, selectedPaths);
  });

  // Register IPC handlers for fresh analysis (bypassing cache)
  ipcMain.handle('analyze-directory-for-sort-fresh', async (event, directoryPath, selectedPaths) => {
    return analyzeDirectory(event.sender, directoryPath, false, selectedPaths, true);
  });

  ipcMain.handle('analyze-directory-for-rename-fresh', async (event, directoryPath, selectedPaths) => {
    return analyzeDirectory(event.sender, directoryPath, true, selectedPaths, true);
  });

  // AI File Analysis handlers with caching
  async function analyzeDirectory(sender, directoryPath, renameFiles, selectedPaths, forceRefresh = false) {
    try {
      const files = await fs.readdir(directoryPath, { withFileTypes: true });
      let allFiles;

      if (selectedPaths && selectedPaths.length > 0) {
        // If selectedPaths is provided, only process those files
        allFiles = selectedPaths.map(filePath => path.basename(filePath));
      } else {
        // Otherwise process all non-directory files
        allFiles = files
          .filter(file => !file.isDirectory())
          .map(file => file.name);
      }

      // Get list of unprocessed files with proper encoding
      const filePaths = allFiles.map(name => {
        // Ensure proper encoding of Hebrew characters in path
        const encodedName = Buffer.from(name, 'utf8').toString();
        return path.join(directoryPath, encodedName);
      });

      // Use the appropriate unprocessed files method based on operation
      const unprocessedPaths = renameFiles
        ? await db.getUnprocessedRenames(filePaths)
        : await db.getUnprocessedSorts(filePaths);
      const unprocessedFiles = unprocessedPaths.map(p => Buffer.from(path.basename(p), 'utf8').toString());

      // If all files are processed and not forcing refresh, return cached suggestions
      if (unprocessedFiles.length === 0 && !forceRefresh) {
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
      const fileNames = forceRefresh ? allFiles.slice(0, 50) : unprocessedFiles.slice(0, 50);

      // Process files in smaller batches for API calls
      const BATCH_SIZE = 10;
      let allSuggestions = renameFiles ? { renames: [] } : { categories: [] };

      // Get settings from database
      const settings = await db.getAllSettings();
      const provider = settings.selectedProvider || 'openai';
      const apiKey = settings.apiKeys?.[provider];

      // Ollama doesn't require an API key since it runs locally
      if (!apiKey && provider !== 'ollama') {
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
        } catch (error) {
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

      const hasRenameImages = renameFiles && fileNames.some(name => imageFilePattern.test(name));
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
        const batchFiles = fileNames.slice(i, i + BATCH_SIZE);

        // Send analyze progress update
        sender.send('analyze-progress', {
          current: i,
          total: fileNames.length,
          status: 'Analyzing files...',
          currentFile: batchFiles[0]
        });

        // Get file details for the batch
        const fileDetails = await Promise.all(batchFiles.map(async (fileName) => {
          const filePath = path.join(directoryPath, fileName);
          const stats = await fs.stat(filePath);
          let base64Content = '';
          let imageMimeType = '';
          let isImageFile = false;

          // Only process images and optimize image loading
          const imageMimeTypeFromName = renameFiles ? getImageMimeType(fileName) : null;
          isImageFile = !!imageMimeTypeFromName;

          if (isImageFile) {
            try {
              const fileHash = db.getFileHash(filePath);
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
              console.log(`Could not process image file ${fileName}:`, error);
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

            // Remove any markdown formatting or extra text
            const jsonContent = response.replace(/^```json\s*|\s*```$/g, '').trim();
            batchSuggestions = JSON.parse(jsonContent);
            break;
          } catch (error) {
            retries--;
            if (retries === 0) throw error;
            await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2s before retry
          }
        }

        // Merge batch results
        if (renameFiles && batchSuggestions.renames) {
          allSuggestions.renames.push(...batchSuggestions.renames);
        } else if (!renameFiles && batchSuggestions.categories) {
          // Merge categories intelligently
          batchSuggestions.categories.forEach(newCat => {
            const existingCat = allSuggestions.categories.find(c => c.name === newCat.name);
            if (existingCat) {
              existingCat.files.push(...newCat.files);
            } else {
              allSuggestions.categories.push(newCat);
            }
          });
        }

        // Add delay between batches to avoid rate limits
        if (i + BATCH_SIZE < fileNames.length) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      const suggestions = allSuggestions;

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
  ipcMain.handle('apply-suggestions', async (event, { directoryPath, suggestions }) => {
    try {
      // Process files in batches of 100
      const BATCH_SIZE = 100;
      const allMoves = suggestions.categories.flatMap(category => {
        const categoryPath = path.join(directoryPath, category.suggestedPath);
        return category.files.map(file => ({
          oldPath: path.join(directoryPath, file),
          newPath: path.join(categoryPath, file),
          categoryPath
        }));
      });

      let processed = 0;
      // Process moves in batches with progress updates
      for (let i = 0; i < allMoves.length; i += BATCH_SIZE) {
        const batch = allMoves.slice(i, i + BATCH_SIZE);

        event.sender.send('sort-progress', {
          current: processed,
          total: allMoves.length,
          status: 'Moving files...',
          currentFile: path.basename(batch[0].oldPath)
        });

        // Create all required directories first
        const uniqueDirs = new Set(batch.map(move => move.categoryPath));
        await Promise.all(Array.from(uniqueDirs).map(dir =>
          fs.mkdir(dir, { recursive: true })
        ));

        // Process moves in parallel within the batch
        await Promise.all(batch.map(async ({ oldPath, newPath }) => {
          try {
            await fs.rename(oldPath, newPath);
            await db.markFileSorted(oldPath, newPath);
            processed++;
            event.sender.send('sort-progress', {
              current: processed,
              total: allMoves.length,
              status: 'Moving files...',
              currentFile: path.basename(newPath)
            });
          } catch (err) {
            console.error(`Failed to move file ${oldPath}:`, err);
            await db.markSortSkipped(oldPath);
          }
        }));
      }

      return { success: true };
    } catch (error) {
      console.error('Failed to apply suggestions:', error);
      return { error: error.message };
    }
  });

  /**
   * Sanitize filename to remove problematic characters
   */
  function sanitizeFilename(filename) {
    // Replace problematic characters with safe alternatives
    return filename
      .replace(/[<>:"\/\\|?*\x00-\x1F]/g, '-') // Replace invalid Windows filename chars
      .replace(/[\u0591-\u05F4]/g, '') // Remove Hebrew diacritics
      .replace(/\s+/g, '-') // Replace spaces with hyphens
      .replace(/--+/g, '-') // Replace multiple hyphens with single hyphen
      .trim(); // Remove leading/trailing spaces
  }

  // Handler for applying renames with batch processing
  ipcMain.handle('apply-renames', async (event, { directoryPath, suggestions }) => {
    const results = {
      success: true,
      errors: [],
      renamedFiles: []
    };

    try {
      // Process renames in batches of 100
      const BATCH_SIZE = 100;
      const allRenames = suggestions.categories.flatMap(category => category.renames);
      let processed = 0;

      for (let i = 0; i < allRenames.length; i += BATCH_SIZE) {
        const batch = allRenames.slice(i, i + BATCH_SIZE);

        event.sender.send('rename-progress', {
          current: processed,
          total: allRenames.length,
          status: 'Renaming files...',
          currentFile: batch[0].originalName
        });

        // Process batch in parallel
        await Promise.all(batch.map(async (rename) => {
          // Ensure proper encoding of file paths
          const originalName = Buffer.from(rename.originalName, 'utf8').toString();
          const oldPath = path.join(directoryPath, originalName);

          // Sanitize the suggested name while keeping the extension
          const ext = path.extname(rename.suggestedName);
          const baseName = path.basename(rename.suggestedName, ext);
          const sanitizedName = sanitizeFilename(baseName) + ext;
          const newPath = path.join(directoryPath, sanitizedName);

          try {
            // Check if source file exists using readdir to get exact filename
            const dirContents = await fs.readdir(directoryPath);

            // Debug logging
            console.log('Directory contents:', dirContents);
            console.log('Looking for file:', originalName);

            // Debug encoding information
            console.log('Original filename buffer:', Buffer.from(originalName).toString('hex'));
            console.log('Directory contents with encoding info:', dirContents.map(f => ({
              name: f,
              hex: Buffer.from(f).toString('hex')
            })));

            // Try different matching strategies
            let exactFileName = null;

            // 1. Direct match
            exactFileName = dirContents.find(f => f === originalName);
            if (exactFileName) {
              console.log('Found direct match:', exactFileName);
            }

            // 2. Normalized match
            if (!exactFileName) {
              const normalizedOriginal = originalName.normalize('NFC');
              exactFileName = dirContents.find(f => {
                const normalizedCurrent = f.normalize('NFC');
                const match = normalizedCurrent === normalizedOriginal;
                console.log(`Normalized comparison: "${normalizedCurrent}" with "${normalizedOriginal}": ${match}`);
                return match;
              });
              if (exactFileName) {
                console.log('Found normalized match:', exactFileName);
              }
            }

            // 3. Case-insensitive match
            if (!exactFileName) {
              exactFileName = dirContents.find(f =>
                f.toLowerCase() === originalName.toLowerCase()
              );
              if (exactFileName) {
                console.log('Found case-insensitive match:', exactFileName);
              }
            }

            // 4. Partial match for Hebrew filenames
            if (!exactFileName) {
              exactFileName = dirContents.find(f => {
                // Remove common prefixes that might be added by apps
                const cleanF = f.replace(/^תמונה של /, '');
                const cleanOriginal = originalName.replace(/^תמונה של /, '');
                const match = cleanF === cleanOriginal;
                console.log(`Partial match attempt: "${cleanF}" with "${cleanOriginal}": ${match}`);
                return match;
              });
              if (exactFileName) {
                console.log('Found partial match:', exactFileName);
              }
            }

            if (!exactFileName) {
              throw new Error(`Source file not found: ${originalName} (available files: ${dirContents.join(', ')})`);
            }

            const exactPath = path.join(directoryPath, exactFileName);
            console.log('Using exact path:', exactPath);

            // Check if destination already exists
            try {
              await fs.access(newPath);
              // If file exists, append number to filename
              let counter = 1;
              let uniquePath = newPath;
              while (true) {
                try {
                  uniquePath = path.join(
                    directoryPath,
                    `${sanitizeFilename(baseName)}-${counter}${ext}`
                  );
                  await fs.access(uniquePath);
                  counter++;
                } catch {
                  // File doesn't exist, we can use this name
                  break;
                }
              }
              newPath = uniquePath;
            } catch {
              // Destination doesn't exist, we can proceed
            }

            // Perform the rename using exact path
            await fs.rename(exactPath, newPath);

            // Only update database if rename was successful
            await db.markFileRenamed(oldPath, newPath);

            processed++;
            event.sender.send('rename-progress', {
              current: processed,
              total: allRenames.length,
              status: 'Renaming files...',
              currentFile: rename.originalName
            });

            results.renamedFiles.push({
              original: rename.originalName,
              new: path.basename(newPath)
            });
          } catch (err) {
            console.error(`Failed to rename file ${rename.originalName}:`, err);

            // Mark file as skipped if it fails to rename
            try {
              await db.markRenameSkipped(oldPath);
              console.log(`Marked file as skipped: ${rename.originalName}`);
            } catch (skipErr) {
              console.error(`Failed to mark file as skipped: ${skipErr}`);
            }

            results.errors.push({
              file: rename.originalName,
              error: err.message
            });
            results.success = false;
          }
        }));
      }
      return results;
    } catch (error) {
      console.error('Failed to apply renames:', error);
      return {
        success: false,
        error: error.message,
        errors: [{
          file: 'unknown',
          error: error.message
        }]
      };
    }
  });
}

// This method will be called when Electron has finished initialization
if (app) {
  console.log('App exists');
  app.whenReady().then(() => {
    console.log('App ready');
    createWindow();

    app.on('activate', () => {
      console.log('App activated');
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  }).catch(err => {
    console.error('Failed to initialize app:', err);
  });

  // Quit when all windows are closed
  app.on('window-all-closed', () => {
    console.log('All windows closed');
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
