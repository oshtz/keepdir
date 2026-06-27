import '@testing-library/jest-dom';

jest.mock('@tauri-apps/plugin-notification', () => ({
  isPermissionGranted: jest.fn(async () => false),
  requestPermission: jest.fn(async () => 'denied'),
  sendNotification: jest.fn(),
}));

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
(global as any).IS_REACT_ACT_ENVIRONMENT = true;
(window as any).IS_REACT_ACT_ENVIRONMENT = true;

const mockKeepDirAPI = {
  getRuleAssistantKey: jest.fn(),
  saveRuleAssistantKey: jest.fn(),
  deleteRuleAssistantKey: jest.fn(),
  fetchAssistantModels: jest.fn(),
  draftRuleWithAssistant: jest.fn(),
  getWorkspaceSetting: jest.fn(),
  saveWorkspaceSetting: jest.fn(),
  getWatchFolders: jest.fn(),
  saveWatchFolder: jest.fn(),
  removeWatchFolder: jest.fn(),
  setWatchFolderEnabled: jest.fn(),
  simulateRuleAction: jest.fn(),
  getRuleActions: jest.fn(),
  applyRuleActions: jest.fn(),
  undoRuleActions: jest.fn(),
  skipRuleActions: jest.fn(),
  refreshRuleActions: jest.fn(),
  renameRuleActionTarget: jest.fn(),
  getAppVersion: jest.fn(),
  openLatestRelease: jest.fn(),
  selectDirectory: jest.fn(),
  onCheckUpdatesRequested: jest.fn(() => jest.fn()),
  onPendingRenamesDetected: jest.fn(() => jest.fn()),
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
