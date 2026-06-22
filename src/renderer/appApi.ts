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
  | 'error';

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
  createdAt: string;
  updatedAt: string;
}

export interface KeepDirAPI {
  getRuleAssistantKey: (
    provider: string
  ) => Promise<ApiResult & { apiKey?: string | null }>;
  saveRuleAssistantKey: (provider: string, apiKey: string) => Promise<ApiResult>;
  deleteRuleAssistantKey: (provider: string) => Promise<ApiResult>;
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
  getRuleActions: (
    workspaceId: string,
    options?: { includeHistory?: boolean }
  ) => Promise<ApiResult & { actions?: RuleAction[] }>;
  applyRuleActions: (
    workspaceId: string,
    actionIds: string[]
  ) => Promise<ApiResult & { results?: Array<{ id: string; success: boolean; error?: string }> }>;
  skipRuleActions: (workspaceId: string, actionIds: string[]) => Promise<ApiResult>;
  refreshRuleActions: (workspaceId: string, actionIds: string[]) => Promise<ApiResult>;
  selectDirectory: () => Promise<string | null>;
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
