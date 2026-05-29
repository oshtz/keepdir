import '@testing-library/jest-dom';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
(global as any).IS_REACT_ACT_ENVIRONMENT = true;
(window as any).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('react-transition-group', () => {
  const React = require('react');

  const renderTransitionChildren = (children: any, inProp: boolean) => {
    const state = inProp ? 'entered' : 'exited';
    return typeof children === 'function' ? children(state, {}) : children;
  };

  const Transition = ({ children, in: inProp = true, unmountOnExit }: any) => {
    if (!inProp && unmountOnExit) {
      return null;
    }
    return renderTransitionChildren(children, inProp);
  };

  const TransitionGroup = ({ children }: any) => React.createElement(React.Fragment, null, children);

  return {
    __esModule: true,
    Transition,
    CSSTransition: Transition,
    SwitchTransition: TransitionGroup,
    TransitionGroup,
    config: { disabled: true },
  };
});

const originalConsoleError = console.error.bind(console);
console.error = (...args: unknown[]) => {
  const message = String(args[0] ?? '');
  if (message.includes('MUI: The modal content node does not accept focus.')) {
    return;
  }
  originalConsoleError(...args);
};

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
  getProviderModels: jest.fn(),
  
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

  // Auto-update
  getAppVersion: jest.fn(),
  checkForUpdate: jest.fn(),
  downloadUpdate: jest.fn(),
  installUpdate: jest.fn(),
  
  // Event handlers
  onAnalyzeProgress: jest.fn(() => jest.fn()),
  onRenameProgress: jest.fn(() => jest.fn()),
  onSortProgress: jest.fn(() => jest.fn()),
  onOllamaModelPullProgress: jest.fn(() => jest.fn()),
  onUpdateDownloadProgress: jest.fn(() => jest.fn()),
  
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
