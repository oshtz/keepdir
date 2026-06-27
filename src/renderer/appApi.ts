export interface ApiResult {
  success?: boolean;
  error?: string;
}

export interface WatchFolder {
  id: string;
  path: string;
  enabled: boolean;
  recursive?: boolean;
  createdAt?: string;
}

export interface FileRule {
  id: string;
  name: string;
  enabled: boolean;
  order: number;
  match: {
    nameContains?: string;
    extensionIn?: string[];
    sourceUrlContains?: string;
    downloadedFromContains?: string;
  };
  action: {
    targetFolder?: string;
    targetNameTemplate?: string;
    ask?: boolean;
  };
  stopOnMatch: boolean;
}

export type RuleActionStatus =
  | 'pending'
  | 'needs_review'
  | 'applied'
  | 'skipped'
  | 'stale'
  | 'conflict'
  | 'error'
  | 'undone';

export interface RuleTraceItem {
  ruleId: string;
  ruleName: string;
  matched: boolean;
  uncertain: boolean;
  reasons: string[];
}

export interface RuleAction {
  id: string;
  workspaceId: string;
  folderPath: string;
  filePath: string;
  originalName: string;
  targetPath?: string | null;
  targetName?: string | null;
  ruleId?: string | null;
  ruleName?: string | null;
  ruleTrace: RuleTraceItem[];
  status: RuleActionStatus;
  fileSize: number;
  fileMtimeMs: number;
  errorMessage?: string | null;
  appliedSourcePath?: string | null;
  appliedTargetPath?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface KeepDirAPI {
  getRuleAssistantKey: (
    provider: string
  ) => Promise<ApiResult & { apiKey?: string | null }>;
  saveRuleAssistantKey: (provider: string, apiKey: string) => Promise<ApiResult>;
  deleteRuleAssistantKey: (provider: string) => Promise<ApiResult>;
  fetchAssistantModels: (
    provider: string,
    apiKey: string,
    endpoint: string
  ) => Promise<ApiResult & { models?: string[] }>;
  draftRuleWithAssistant: (
    provider: string,
    apiKey: string,
    endpoint: string,
    model: string,
    description: string
  ) => Promise<ApiResult & { content?: string }>;
  getWorkspaceSetting: (workspaceId: string, key: string) => Promise<unknown>;
  saveWorkspaceSetting: (
    workspaceId: string,
    key: string,
    value: unknown
  ) => Promise<ApiResult>;
  getWatchFolders: (
    workspaceId: string
  ) => Promise<ApiResult & { folders?: WatchFolder[] }>;
  saveWatchFolder: (
    workspaceId: string,
    folder: WatchFolder
  ) => Promise<ApiResult & { folder?: WatchFolder }>;
  removeWatchFolder: (
    workspaceId: string,
    folderId: string
  ) => Promise<ApiResult>;
  setWatchFolderEnabled: (
    workspaceId: string,
    folderId: string,
    enabled: boolean
  ) => Promise<ApiResult>;
  simulateRuleAction: (
    workspaceId: string,
    fileName: string,
    folderPath?: string | null
  ) => Promise<ApiResult & { action?: RuleAction }>;
  getRuleActions: (
    workspaceId: string,
    options?: { includeHistory?: boolean }
  ) => Promise<ApiResult & { actions?: RuleAction[] }>;
  applyRuleActions: (
    workspaceId: string,
    actionIds: string[]
  ) => Promise<ApiResult & { results?: Array<{ id: string; success: boolean; error?: string }> }>;
  undoRuleActions: (
    workspaceId: string,
    actionIds: string[]
  ) => Promise<ApiResult & { results?: Array<{ id: string; success: boolean; error?: string }> }>;
  skipRuleActions: (workspaceId: string, actionIds: string[]) => Promise<ApiResult>;
  refreshRuleActions: (workspaceId: string, actionIds: string[]) => Promise<ApiResult>;
  renameRuleActionTarget: (
    workspaceId: string,
    actionId: string,
    targetName: string
  ) => Promise<ApiResult & { action?: RuleAction }>;
  getAppVersion: () => Promise<string>;
  openLatestRelease: () => Promise<ApiResult>;
  selectDirectory: () => Promise<string | null>;
  onCheckUpdatesRequested: (callback: () => void) => () => void;
  onPendingRenamesDetected: (
    callback: (payload: { pendingCount: number }) => void
  ) => () => void;
  onWatchFoldersChanged: (
    callback: (payload: { workspaceId: string; error?: string }) => void
  ) => () => void;
  onRuleActionsChanged: (
    callback: (payload: { workspaceId: string }) => void
  ) => () => void;
}

declare global {
  interface Window {
    keepdirAPI: KeepDirAPI;
  }
}
