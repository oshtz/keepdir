import '@testing-library/jest-dom';

// Mock electron API
const mockElectronAPI = {
  // Window controls
  minimizeWindow: jest.fn(),
  maximizeWindow: jest.fn(),
  closeWindow: jest.fn(),
  
  // Directory operations
  loadDirectory: jest.fn(),
  selectDirectory: jest.fn(),
  openFile: jest.fn(),
  revealInFolder: jest.fn(),
  
  // Settings
  saveSettings: jest.fn(),
  loadSettings: jest.fn(),
  
  // Workspace operations
  getWorkspaces: jest.fn(),
  saveWorkspace: jest.fn(),
  deleteWorkspace: jest.fn(),
  exportWorkspace: jest.fn(),
  importWorkspace: jest.fn(),
  exportAllData: jest.fn(),
  importAllData: jest.fn(),
  
  // Workspace settings
  getWorkspaceSettings: jest.fn(),
  getWorkspaceSetting: jest.fn(),
  saveWorkspaceSetting: jest.fn(),
  
  // Custom sections
  getCustomSections: jest.fn(),
  createCustomSection: jest.fn(),
  updateCustomSection: jest.fn(),
  deleteCustomSection: jest.fn(),
  addItemToCustomSection: jest.fn(),
  removeItemFromCustomSection: jest.fn(),
  
  // Database operations
  getCacheStats: jest.fn(),
  getDatabaseStats: jest.fn(),
  cleanupCache: jest.fn(),
  optimizeDatabase: jest.fn(),
  
  // User auth
  saveUserAuth: jest.fn(),
  loadUserAuth: jest.fn(),
  clearUserAuth: jest.fn(),
  
  // File analysis
  analyzeDirectoryForSort: jest.fn(),
  analyzeDirectoryForRename: jest.fn(),
  applySuggestions: jest.fn(),
  applyRenames: jest.fn(),
  
  // Ollama
  pullOllamaModel: jest.fn(),
  listOllamaModels: jest.fn(),
  deleteOllamaModel: jest.fn(),
  
  // Event handlers
  onAnalyzeProgress: jest.fn(() => jest.fn()),
  onRenameProgress: jest.fn(() => jest.fn()),
  onSortProgress: jest.fn(() => jest.fn()),
  onOllamaModelPullProgress: jest.fn(() => jest.fn()),
  
  // Workspace sharing
  generateWorkspaceShareCode: jest.fn(),
  importWorkspaceFromShareCode: jest.fn(),
  cleanupExpiredShares: jest.fn(),
};

// Mock window.electronAPI
Object.defineProperty(window, 'electronAPI', {
  value: mockElectronAPI,
  writable: true,
});

// Mock IntersectionObserver
global.IntersectionObserver = class IntersectionObserver {
  root = null;
  rootMargin = '';
  thresholds = [];
  
  constructor() {}
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() { return []; }
} as any;

// Mock ResizeObserver
global.ResizeObserver = class ResizeObserver {
  constructor() {}
  observe() {}
  unobserve() {}
  disconnect() {}
} as any;

// Mock matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(), // deprecated
    removeListener: jest.fn(), // deprecated
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});
