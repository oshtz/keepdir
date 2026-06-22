import '@testing-library/jest-dom';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
(global as any).IS_REACT_ACT_ENVIRONMENT = true;
(window as any).IS_REACT_ACT_ENVIRONMENT = true;

const mockKeepDirAPI = {
  getRuleAssistantKey: jest.fn(),
  saveRuleAssistantKey: jest.fn(),
  deleteRuleAssistantKey: jest.fn(),
  getWorkspaceSetting: jest.fn(),
  saveWorkspaceSetting: jest.fn(),
  getWatchFolders: jest.fn(),
  saveWatchFolder: jest.fn(),
  removeWatchFolder: jest.fn(),
  setWatchFolderEnabled: jest.fn(),
  getRuleActions: jest.fn(),
  applyRuleActions: jest.fn(),
  skipRuleActions: jest.fn(),
  refreshRuleActions: jest.fn(),
  selectDirectory: jest.fn(),
  onWatchFoldersChanged: jest.fn(() => jest.fn()),
  onRuleActionsChanged: jest.fn(() => jest.fn()),
};

Object.defineProperty(window, 'keepdirAPI', {
  value: mockKeepDirAPI,
  writable: true,
});

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});
