import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { open } from '@tauri-apps/plugin-dialog';
import type { KeepDirAPI, WatchFolder } from './appApi';

function onTauriEvent<T>(eventName: string, callback: (payload: T) => void) {
  let unlisten: (() => void) | null = null;
  void listen<T>(eventName, (event) => callback(event.payload)).then((next) => {
    unlisten = next;
  });
  return () => {
    if (unlisten) {
      unlisten();
    }
  };
}

// Browser-only design preview data. Gated behind ?demo so it can never reach the
// real Tauri app (which always uses tauriApi). Safe to keep; only active in a browser
// tab opened with ?demo.
const DEMO =
  typeof window !== 'undefined' &&
  typeof window.location !== 'undefined' &&
  new URLSearchParams(window.location.search).has('demo');

const demoFolders: WatchFolder[] = [
  { id: 'w1', path: 'C:/Users/omer/Downloads', enabled: true, recursive: false, createdAt: '' },
  { id: 'w2', path: 'C:/Users/omer/Desktop/Inbox', enabled: true, recursive: true, createdAt: '' },
  { id: 'w3', path: 'D:/Scans', enabled: false, recursive: false, createdAt: '' },
];

const demoRules = [
  { id: 'r1', name: 'Invoices to Finance', enabled: true, order: 0, match: { nameContains: 'invoice', extensionIn: ['pdf'] }, action: { targetFolder: 'Finance/Invoices', targetNameTemplate: '{date}-{basename}.{ext}' }, stopOnMatch: true },
  { id: 'r2', name: 'Screenshots to Media', enabled: true, order: 1, match: { extensionIn: ['png', 'jpg'] }, action: { targetFolder: 'Media/Images' }, stopOnMatch: false },
  { id: 'r3', name: 'Installers to Apps', enabled: false, order: 2, match: { extensionIn: ['exe', 'dmg'] }, action: { targetFolder: 'Apps', ask: true }, stopOnMatch: true },
];

const demoActions = [
  { id: 'a1', workspaceId: 'default', folderPath: 'C:/Users/omer/Downloads', filePath: 'C:/Users/omer/Downloads/invoice-acme-0425.pdf', originalName: 'invoice-acme-0425.pdf', targetPath: 'C:/Users/omer/Downloads/Finance/Invoices/2026-06-21-invoice-acme-0425.pdf', targetName: '2026-06-21-invoice-acme-0425.pdf', ruleId: 'r1', ruleName: 'Invoices to Finance', ruleTrace: [{ ruleId: 'r1', ruleName: 'Invoices to Finance', matched: true, uncertain: false, reasons: ['name contains "invoice"', 'ext in [pdf]'] }], status: 'pending', fileSize: 220000, fileMtimeMs: 1, errorMessage: null, createdAt: '', updatedAt: '' },
  { id: 'a2', workspaceId: 'default', folderPath: 'C:/Users/omer/Desktop/Inbox', filePath: 'C:/Users/omer/Desktop/Inbox/Screenshot 2026-06-21.png', originalName: 'Screenshot 2026-06-21.png', targetPath: 'C:/Users/omer/Desktop/Inbox/Media/Images/Screenshot 2026-06-21.png', targetName: 'Screenshot 2026-06-21.png', ruleId: 'r2', ruleName: 'Screenshots to Media', ruleTrace: [{ ruleId: 'r2', ruleName: 'Screenshots to Media', matched: true, uncertain: false, reasons: ['ext in [png]'] }], status: 'pending', fileSize: 1400000, fileMtimeMs: 1, errorMessage: null, createdAt: '', updatedAt: '' },
  { id: 'a3', workspaceId: 'default', folderPath: 'C:/Users/omer/Downloads', filePath: 'C:/Users/omer/Downloads/setup.exe', originalName: 'setup.exe', targetPath: null, targetName: null, ruleId: 'r3', ruleName: 'Installers to Apps', ruleTrace: [{ ruleId: 'r3', ruleName: 'Installers to Apps', matched: true, uncertain: true, reasons: ['ext in [exe]'] }], status: 'needs_review', fileSize: 54000000, fileMtimeMs: 1, errorMessage: null, createdAt: '', updatedAt: '' },
  { id: 'a4', workspaceId: 'default', folderPath: 'C:/Users/omer/Desktop/Inbox', filePath: 'C:/Users/omer/Desktop/Inbox/report-final.pdf', originalName: 'report-final.pdf', targetPath: 'C:/Users/omer/Desktop/Inbox/Finance/Invoices/report-final.pdf', targetName: 'report-final.pdf', ruleId: 'r1', ruleName: 'Invoices to Finance', ruleTrace: [], status: 'conflict', fileSize: 90000, fileMtimeMs: 1, errorMessage: 'Target already exists', createdAt: '', updatedAt: '' },
];

const fallbackApi: KeepDirAPI = {
  getRuleAssistantKey: async () => ({ success: true, apiKey: null }),
  saveRuleAssistantKey: async () => ({ success: true }),
  deleteRuleAssistantKey: async () => ({ success: true }),
  getWorkspaceSetting: async (_workspaceId, key) =>
    DEMO && key === 'automationRules' ? (demoRules as unknown) : null,
  saveWorkspaceSetting: async () => ({ success: true }),
  getWatchFolders: async () => ({ success: true, folders: DEMO ? demoFolders : [] }),
  saveWatchFolder: async (_workspaceId, folder) => ({ success: true, folder }),
  removeWatchFolder: async () => ({ success: true }),
  setWatchFolderEnabled: async () => ({ success: true }),
  getRuleActions: async () => ({ success: true, actions: DEMO ? (demoActions as unknown as never) : [] }),
  applyRuleActions: async () => ({ success: true, results: [] }),
  skipRuleActions: async () => ({ success: true }),
  refreshRuleActions: async () => ({ success: true }),
  selectDirectory: async () => null,
  onWatchFoldersChanged: () => () => {},
  onRuleActionsChanged: () => () => {},
};

const tauriApi: KeepDirAPI = {
  getRuleAssistantKey: (provider) =>
    invoke('get_rule_assistant_key', { provider }),
  saveRuleAssistantKey: (provider, apiKey) =>
    invoke('save_rule_assistant_key', { provider, apiKey }),
  deleteRuleAssistantKey: (provider) =>
    invoke('delete_rule_assistant_key', { provider }),
  getWorkspaceSetting: (workspaceId, key) =>
    invoke('get_workspace_setting', { workspaceId, key }),
  saveWorkspaceSetting: (workspaceId, key, value) =>
    invoke('save_workspace_setting', { workspaceId, key, value }),
  getWatchFolders: (workspaceId) =>
    invoke('get_watch_folders', { workspaceId }),
  saveWatchFolder: (workspaceId, folder: WatchFolder) =>
    invoke('save_watch_folder', { workspaceId, folder }),
  removeWatchFolder: (workspaceId, folderId) =>
    invoke('remove_watch_folder', { workspaceId, folderId }),
  setWatchFolderEnabled: (workspaceId, folderId, enabled) =>
    invoke('set_watch_folder_enabled', { workspaceId, folderId, enabled }),
  getRuleActions: (workspaceId, options) =>
    invoke('get_rule_actions', {
      workspaceId,
      includeHistory: options?.includeHistory === true,
    }),
  applyRuleActions: (workspaceId, actionIds) =>
    invoke('apply_rule_actions', { workspaceId, actionIds }),
  skipRuleActions: (workspaceId, actionIds) =>
    invoke('skip_rule_actions', { workspaceId, actionIds }),
  refreshRuleActions: (workspaceId, actionIds) =>
    invoke('refresh_rule_actions', { workspaceId, actionIds }),
  selectDirectory: async () => {
    const selected = await open({ directory: true, multiple: false });
    return typeof selected === 'string' ? selected : null;
  },
  onWatchFoldersChanged: (callback) =>
    onTauriEvent('watch-folders-changed', callback),
  onRuleActionsChanged: (callback) =>
    onTauriEvent('rule-actions-changed', callback),
};

window.keepdirAPI = (window as any).__TAURI_INTERNALS__ ? tauriApi : fallbackApi;
