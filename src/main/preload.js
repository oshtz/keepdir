const { contextBridge, ipcRenderer } = require('electron');

// Helper to create event subscription handlers
const createEventHandler = (channel) => {
  return (callback) => {
    const subscription = (_event, value) => callback(value);
    ipcRenderer.on(channel, subscription);
    return () => {
      ipcRenderer.removeListener(channel, subscription);
    };
  };
};

contextBridge.exposeInMainWorld('electronAPI', {
  // Workspace operations
  getWorkspaces: () => ipcRenderer.invoke('get-workspaces'),
  saveWorkspace: (workspace) => ipcRenderer.invoke('save-workspace', workspace),
  deleteWorkspace: (id) => ipcRenderer.invoke('delete-workspace', id),
  exportWorkspace: (workspaceId) => ipcRenderer.invoke('export-workspace', workspaceId),
  importWorkspace: (options) => ipcRenderer.invoke('import-workspace', options),
  exportAllData: () => ipcRenderer.invoke('export-all-data'),
  importAllData: (options) => ipcRenderer.invoke('import-all-data', options),

  // Custom sections operations
  getCustomSections: (workspaceId) => ipcRenderer.invoke('get-custom-sections', workspaceId),
  createCustomSection: (workspaceId, sectionData) => ipcRenderer.invoke('create-custom-section', workspaceId, sectionData),
  updateCustomSection: (sectionId, updates) => ipcRenderer.invoke('update-custom-section', sectionId, updates),
  deleteCustomSection: (sectionId) => ipcRenderer.invoke('delete-custom-section', sectionId),
  addItemToCustomSection: (sectionId, item) => ipcRenderer.invoke('add-item-to-custom-section', sectionId, item),
  removeItemFromCustomSection: (sectionId, itemId) => ipcRenderer.invoke('remove-item-from-custom-section', sectionId, itemId),

  // Window controls
  minimizeWindow: () => ipcRenderer.send('minimize-window'),
  maximizeWindow: () => ipcRenderer.send('maximize-window'),
  closeWindow: () => ipcRenderer.send('close-window'),
  
  // Workspace settings
  getWorkspaceSettings: (workspaceId) => ipcRenderer.invoke('get-workspace-settings', workspaceId),
  getWorkspaceSetting: (workspaceId, key) => ipcRenderer.invoke('get-workspace-setting', { workspaceId, key }),
  saveWorkspaceSetting: (workspaceId, key, value) => ipcRenderer.invoke('save-workspace-setting', { workspaceId, key, value }),
  setActiveWatchWorkspace: (workspaceId) => ipcRenderer.invoke('set-active-watch-workspace', workspaceId),
  getWatchFolders: (workspaceId) => ipcRenderer.invoke('get-watch-folders', workspaceId),
  saveWatchFolder: (workspaceId, folder) => ipcRenderer.invoke('save-watch-folder', workspaceId, folder),
  removeWatchFolder: (workspaceId, folderId) => ipcRenderer.invoke('remove-watch-folder', workspaceId, folderId),
  setWatchFolderEnabled: (workspaceId, folderId, enabled) => ipcRenderer.invoke('set-watch-folder-enabled', workspaceId, folderId, enabled),
  getWatchedRenameSuggestions: (workspaceId) => ipcRenderer.invoke('get-watched-rename-suggestions', workspaceId),
  dismissWatchedRenameSuggestions: (workspaceId, suggestionIds) => ipcRenderer.invoke('dismiss-watched-rename-suggestions', workspaceId, suggestionIds),
  refreshWatchedRenameSuggestions: (workspaceId, suggestionIds) => ipcRenderer.invoke('refresh-watched-rename-suggestions', workspaceId, suggestionIds),
  applyWatchedRenameSuggestions: (workspaceId, suggestionIds) => ipcRenderer.invoke('apply-watched-rename-suggestions', workspaceId, suggestionIds),
  
  // Directory operations
  loadDirectory: (path) => ipcRenderer.invoke('load-directory', path),
  selectDirectory: () => ipcRenderer.invoke('select-directory'),
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
  loadSettings: () => ipcRenderer.invoke('load-settings'),
  getProviderModels: (provider) => ipcRenderer.invoke('get-provider-models', provider),
  analyzeDirectoryForSort: (path, selectedPaths) => ipcRenderer.invoke('analyze-directory-for-sort', path, selectedPaths),
  analyzeDirectoryForRename: (path, selectedPaths) => ipcRenderer.invoke('analyze-directory-for-rename', path, selectedPaths),
  analyzeDirectoryForSortFresh: (path, selectedPaths) => ipcRenderer.invoke('analyze-directory-for-sort-fresh', path, selectedPaths),
  analyzeDirectoryForRenameFresh: (path, selectedPaths) => ipcRenderer.invoke('analyze-directory-for-rename-fresh', path, selectedPaths),
  applySuggestions: (path, suggestions) => ipcRenderer.invoke('apply-suggestions', { directoryPath: path, suggestions }),
  applyRenames: (path, suggestions) => ipcRenderer.invoke('apply-renames', { directoryPath: path, suggestions }),
  openFile: (path) => ipcRenderer.invoke('open-file', path),
  revealInFolder: (path) => ipcRenderer.invoke('reveal-in-folder', path),
  
  // Ollama model management
  pullOllamaModel: (modelName) => ipcRenderer.invoke('pull-ollama-model', modelName),
  listOllamaModels: () => ipcRenderer.invoke('list-ollama-models'),
  deleteOllamaModel: (modelName) => ipcRenderer.invoke('delete-ollama-model', modelName),
  
  // Database optimization operations
  getCacheStats: () => ipcRenderer.invoke('get-cache-stats'),
  getDatabaseStats: () => ipcRenderer.invoke('get-database-stats'),
  cleanupCache: (maxAgeHours) => ipcRenderer.invoke('cleanup-cache', maxAgeHours),
  optimizeDatabase: () => ipcRenderer.invoke('optimize-database'),
  
  // Progress event subscriptions
  onAnalyzeProgress: createEventHandler('analyze-progress'),
  onRenameProgress: createEventHandler('rename-progress'),
  onSortProgress: createEventHandler('sort-progress'),
  onOllamaModelPullProgress: createEventHandler('ollama-model-pull-progress'),
  onWatchFoldersChanged: createEventHandler('watch-folders-changed'),
  onWatchedRenameSuggestionsChanged: createEventHandler('watched-rename-suggestions-changed'),

  // Auto-update operations
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  checkForUpdate: () => ipcRenderer.invoke('check-for-update'),
  downloadUpdate: (updateInfo) => ipcRenderer.invoke('download-update', updateInfo),
  installUpdate: (updatePath) => ipcRenderer.invoke('install-update', updatePath),
  onUpdateDownloadProgress: createEventHandler('update-download-progress')
});
