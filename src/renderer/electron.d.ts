export interface FileInfo {
  name: string;
  path: string;
  isDirectory: boolean;
  size: number;
  modified: Date;
}

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue =
  | JsonPrimitive
  | JsonValue[]
  | { [key: string]: JsonValue };

export type ViewMode =
  | 'grid'
  | 'list'
  | 'table'
  | 'tiles'
  | 'compact'
  | 'details';

export interface ApiResult {
  success?: boolean;
  error?: string;
}

export interface FileRename {
  originalName: string;
  suggestedName: string;
  reason: string;
}

export interface Category {
  name: string;
  description: string;
  suggestedPath: string;
  files: string[];
  renames?: FileRename[];
}

export interface SortSuggestions {
  categories: Category[];
}

export interface RenameSuggestions {
  categories: {
    name: string;
    description: string;
    suggestedPath: string;
    files: string[];
    renames: FileRename[];
  }[];
}

export interface Settings {
  selectedProvider?: string;
  selectedModel?: string;
  apiKeys?: {
    openai?: string;
    anthropic?: string;
    google?: string;
    openrouter?: string;
  };
  renameFiles?: boolean;
  [key: string]: unknown;
}

export interface ProgressInfo {
  current: number;
  total: number;
  currentFile?: string;
  status?: string;
}

export interface OllamaProgressInfo {
  progress: number;
  status: string;
}

export interface OllamaModelInfo {
  name: string;
}

export interface UpdateInfo {
  version: string;
  notes: string | null;
  publishedAt: string | null;
  downloadUrl: string;
  assetName?: string;
  assetSize?: number;
}

export interface UpdateDownloadProgress {
  percent: number;
  downloaded: number;
  total: number;
}

export interface FileOperationError {
  file: string;
  error: string;
}

export interface RenameApplyResult {
  success?: boolean;
  partial?: boolean;
  renamedFiles?: Array<{ original: string; new: string }>;
  errors?: FileOperationError[];
  error?: string;
}

export interface SortApplyResult {
  success?: boolean;
  partial?: boolean;
  movedFiles?: Array<{ original: string; new: string; category?: string }>;
  errors?: FileOperationError[];
  error?: string;
}

export interface FolderItem {
  name: string;
  path: string;
}

export interface WorkspaceTheme {
  name: string;
  accentColor: string;
  darkMode: boolean;
  backgroundGradient?: string;
  customColors?: {
    primary?: string;
    secondary?: string;
    background?: string;
    surface?: string;
  };
}

export interface Workspace {
  id: string;
  name: string;
  emoji: string;
}

export interface CustomSectionItem {
  id: string;
  name?: string;
  path?: string;
  type?: string;
}

export interface CustomSectionItemInput {
  id?: string;
  name?: string;
  path?: string;
  type?: string;
}

export interface CustomSection {
  id: string;
  workspace_id?: string;
  name: string;
  icon?: string | null;
  color?: string | null;
  items: CustomSectionItem[];
  created_at?: string;
  updated_at?: string;
}

export interface CustomSectionData {
  name: string;
  icon?: string;
  color?: string;
  items?: CustomSectionItemInput[];
}

export interface CustomSectionUpdates {
  name?: string;
  icon?: string;
  color?: string;
  items?: CustomSectionItem[];
}

export interface WorkspaceSettings {
  recentFolders?: string[];
  favoriteFolders?: FolderItem[];
  sectionOrder?: string[];
  sectionVisibility?: Record<string, boolean>;
  workspaceTheme?: WorkspaceTheme | null;
  viewMode?: ViewMode;
  error?: string;
}

export interface WatchFolder {
  id: string;
  path: string;
  enabled: boolean;
  createdAt?: string;
}

export type WatchedRenameSuggestionStatus =
  | 'detected'
  | 'stabilizing'
  | 'queued'
  | 'analyzing'
  | 'suggested'
  | 'error'
  | 'dismissed'
  | 'applied'
  | 'stale';

export interface WatchedRenameSuggestion {
  id: string;
  workspaceId: string;
  folderPath: string;
  filePath: string;
  originalName: string;
  suggestedName?: string | null;
  reason?: string | null;
  status: WatchedRenameSuggestionStatus;
  fileSize: number;
  fileMtimeMs: number;
  errorMessage?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ImportOptions {
  generateNewId?: boolean;
  overwriteExisting?: boolean;
}

export interface WorkspaceImportSummary {
  workspace: string;
  settings: number;
  customSections: number;
}

export interface AllDataImportSummary {
  workspaces: number;
  settings: number;
  customSections: number;
}

export interface ImportResult<TSummary> extends ApiResult {
  imported?: TSummary;
  cancelled?: boolean;
}

export interface ExportResult extends ApiResult {
  filePath?: string;
  cancelled?: boolean;
}

export interface CacheStats {
  totalEntries: number;
  totalSizeBytes: number;
  totalSizeMB: number;
  oldestEntry: string | null;
  newestEntry: string | null;
}

export interface DatabaseStats {
  sizeBytes: number;
  sizeMB: number;
  pageCount: number;
  pageSize: number;
  freelistCount: number;
}

export interface ElectronAPI {
  // Workspace operations
  getWorkspaces: () => Promise<Workspace[]>;
  saveWorkspace: (workspace: Workspace) => Promise<ApiResult>;
  deleteWorkspace: (id: string) => Promise<ApiResult>;
  exportWorkspace: (workspaceId: string) => Promise<ExportResult>;
  importWorkspace: (
    options?: ImportOptions
  ) => Promise<ImportResult<WorkspaceImportSummary> & { workspaceId?: string }>;
  exportAllData: () => Promise<ExportResult>;
  importAllData: (
    options?: ImportOptions
  ) => Promise<ImportResult<AllDataImportSummary> & { errors?: string[] }>;

  // Custom sections operations
  getCustomSections: (
    workspaceId: string
  ) => Promise<ApiResult & { sections?: CustomSection[] }>;
  createCustomSection: (
    workspaceId: string,
    sectionData: CustomSectionData
  ) => Promise<ApiResult & { section?: CustomSection }>;
  updateCustomSection: (
    sectionId: string,
    updates: CustomSectionUpdates
  ) => Promise<ApiResult>;
  deleteCustomSection: (sectionId: string) => Promise<ApiResult>;
  addItemToCustomSection: (
    sectionId: string,
    item: CustomSectionItemInput
  ) => Promise<ApiResult & { items?: CustomSectionItem[] }>;
  removeItemFromCustomSection: (
    sectionId: string,
    itemId: string
  ) => Promise<ApiResult & { items?: CustomSectionItem[] }>;

  // Workspace settings
  getWorkspaceSettings: (workspaceId: string) => Promise<WorkspaceSettings>;
  getWorkspaceSetting: (workspaceId: string, key: string) => Promise<unknown>;
  saveWorkspaceSetting: (
    workspaceId: string,
    key: string,
    value: unknown
  ) => Promise<ApiResult>;
  setActiveWatchWorkspace: (workspaceId: string | null) => Promise<ApiResult>;
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
  getWatchedRenameSuggestions: (
    workspaceId: string
  ) => Promise<ApiResult & { suggestions?: WatchedRenameSuggestion[] }>;
  dismissWatchedRenameSuggestions: (
    workspaceId: string,
    suggestionIds: string[]
  ) => Promise<ApiResult>;
  refreshWatchedRenameSuggestions: (
    workspaceId: string,
    suggestionIds: string[]
  ) => Promise<ApiResult>;
  applyWatchedRenameSuggestions: (
    workspaceId: string,
    suggestionIds: string[]
  ) => Promise<ApiResult & { results?: RenameApplyResult[] }>;

  // Window controls
  minimizeWindow: () => void;
  maximizeWindow: () => void;
  closeWindow: () => void;

  // Directory operations
  loadDirectory: (
    path: string
  ) => Promise<{ files?: FileInfo[]; error?: string }>;
  selectDirectory: () => Promise<string | null>;
  saveSettings: (settings: Record<string, unknown>) => Promise<ApiResult>;
  loadSettings: () => Promise<{ settings?: Settings; error?: string }>;
  getProviderModels: (
    provider: string
  ) => Promise<{ models?: string[]; defaultModel?: string; error?: string }>;
  analyzeDirectory: (
    path: string,
    renameFiles: boolean
  ) => Promise<{ suggestions?: SortSuggestions; error?: string }>;
  analyzeDirectoryForSort: (
    path: string,
    selectedPaths?: string[]
  ) => Promise<{ suggestions?: SortSuggestions; error?: string }>;
  analyzeDirectoryForRename: (
    path: string,
    selectedPaths?: string[]
  ) => Promise<{ suggestions?: SortSuggestions; error?: string }>;
  analyzeDirectoryForSortFresh: (
    path: string,
    selectedPaths?: string[]
  ) => Promise<{ suggestions?: SortSuggestions; error?: string }>;
  analyzeDirectoryForRenameFresh: (
    path: string,
    selectedPaths?: string[]
  ) => Promise<{ suggestions?: SortSuggestions; error?: string }>;
  applySuggestions: (
    path: string,
    suggestions: SortSuggestions
  ) => Promise<SortApplyResult>;
  applyRenames: (
    path: string,
    suggestions: RenameSuggestions
  ) => Promise<RenameApplyResult>;
  openFile: (path: string) => Promise<{ success?: boolean; error?: string }>;
  revealInFolder: (
    path: string
  ) => Promise<{ success?: boolean; error?: string }>;

  // Database optimization operations
  getCacheStats: () => Promise<ApiResult & { stats?: CacheStats }>;
  getDatabaseStats: () => Promise<ApiResult & { stats?: DatabaseStats }>;
  cleanupCache: (maxAgeHours?: number) => Promise<ApiResult>;
  optimizeDatabase: () => Promise<ApiResult>;

  // Progress event handlers
  onAnalyzeProgress: (callback: (progress: ProgressInfo) => void) => () => void;
  onRenameProgress: (callback: (progress: ProgressInfo) => void) => () => void;
  onSortProgress: (callback: (progress: ProgressInfo) => void) => () => void;
  onWatchFoldersChanged: (
    callback: (payload: { workspaceId: string; error?: string }) => void
  ) => () => void;
  onWatchedRenameSuggestionsChanged: (
    callback: (payload: { workspaceId: string }) => void
  ) => () => void;

  // Ollama operations
  pullOllamaModel: (modelName: string) => Promise<ApiResult>;
  listOllamaModels: () => Promise<{
    models?: OllamaModelInfo[];
    error?: string;
  }>;
  deleteOllamaModel: (modelName: string) => Promise<ApiResult>;
  onOllamaModelPullProgress: (
    callback: (progress: OllamaProgressInfo) => void
  ) => () => void;

  // Auto-update operations
  getAppVersion: () => Promise<string>;
  checkForUpdate: () => Promise<{
    updateInfo?: UpdateInfo | null;
    error?: string;
  }>;
  downloadUpdate: (
    updateInfo: UpdateInfo
  ) => Promise<{ updatePath?: string; error?: string }>;
  installUpdate: (updatePath?: string) => Promise<ApiResult>;
  onUpdateDownloadProgress: (
    callback: (progress: UpdateDownloadProgress) => void
  ) => () => void;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
