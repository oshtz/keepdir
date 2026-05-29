export interface FileInfo {
  name: string;
  path: string;
  isDirectory: boolean;
  size: number;
  modified: Date;
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
  apiKeys: {
    openai?: string;
    anthropic?: string;
    google?: string;
    openrouter?: string;
  };
  renameFiles: boolean;
  [key: string]: any;
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

export interface Workspace {
  id: string;
  name: string;
  emoji: string;
}

export interface ElectronAPI {
  // Workspace operations
  getWorkspaces: () => Promise<Workspace[]>;
  saveWorkspace: (workspace: Workspace) => Promise<{ success?: boolean, error?: string }>;
  deleteWorkspace: (id: string) => Promise<{ success?: boolean, error?: string }>;
  exportWorkspace: (workspaceId: string) => Promise<{ success?: boolean, filePath?: string, cancelled?: boolean, error?: string }>;
  importWorkspace: (options?: any) => Promise<{ success?: boolean, workspaceId?: string, imported?: any, cancelled?: boolean, error?: string }>;
  exportAllData: () => Promise<{ success?: boolean, filePath?: string, cancelled?: boolean, error?: string }>;
  importAllData: (options?: any) => Promise<{ success?: boolean, imported?: any, errors?: string[], cancelled?: boolean, error?: string }>;

  // Custom sections operations
  getCustomSections: (workspaceId: string) => Promise<{ success?: boolean, sections?: any[], error?: string }>;
  createCustomSection: (workspaceId: string, sectionData: any) => Promise<{ success?: boolean, section?: any, error?: string }>;
  updateCustomSection: (sectionId: string, updates: any) => Promise<{ success?: boolean, error?: string }>;
  deleteCustomSection: (sectionId: string) => Promise<{ success?: boolean, error?: string }>;
  addItemToCustomSection: (sectionId: string, item: any) => Promise<{ success?: boolean, items?: any[], error?: string }>;
  removeItemFromCustomSection: (sectionId: string, itemId: string) => Promise<{ success?: boolean, items?: any[], error?: string }>;

  // Workspace settings
  getWorkspaceSettings: (workspaceId: string) => Promise<{ recentFolders?: string[], favoriteFolders?: FolderItem[], workspaceTheme?: any, error?: string }>;
  getWorkspaceSetting: (workspaceId: string, key: string) => Promise<any>;
  saveWorkspaceSetting: (workspaceId: string, key: string, value: any) => Promise<{ success?: boolean, error?: string }>;

  // Window controls
  minimizeWindow: () => void;
  maximizeWindow: () => void;
  closeWindow: () => void;

  // Directory operations
  loadDirectory: (path: string) => Promise<{ files?: FileInfo[], error?: string }>;
  selectDirectory: () => Promise<string | null>;
  saveSettings: (settings: Record<string, any>) => Promise<{ success?: boolean, error?: string }>;
  loadSettings: () => Promise<{ settings?: Settings, error?: string }>;
  getProviderModels: (provider: string) => Promise<{ models?: string[], defaultModel?: string, error?: string }>;
  analyzeDirectory: (path: string, renameFiles: boolean) => Promise<{ suggestions?: SortSuggestions, error?: string }>;
  analyzeDirectoryForSort: (path: string, selectedPaths?: string[]) => Promise<{ suggestions?: SortSuggestions, error?: string }>;
  analyzeDirectoryForRename: (path: string, selectedPaths?: string[]) => Promise<{ suggestions?: SortSuggestions, error?: string }>;
  analyzeDirectoryForSortFresh: (path: string, selectedPaths?: string[]) => Promise<{ suggestions?: SortSuggestions, error?: string }>;
  analyzeDirectoryForRenameFresh: (path: string, selectedPaths?: string[]) => Promise<{ suggestions?: SortSuggestions, error?: string }>;
  applySuggestions: (path: string, suggestions: SortSuggestions) => Promise<SortApplyResult>;
  applyRenames: (path: string, suggestions: RenameSuggestions) => Promise<RenameApplyResult>;
  openFile: (path: string) => Promise<{ success?: boolean, error?: string }>;
  
  // Database optimization operations
  getCacheStats: () => Promise<{ success?: boolean, stats?: any, error?: string }>;
  getDatabaseStats: () => Promise<{ success?: boolean, stats?: any, error?: string }>;
  cleanupCache: (maxAgeHours?: number) => Promise<{ success?: boolean, error?: string }>;
  optimizeDatabase: () => Promise<{ success?: boolean, error?: string }>;
  
  // Progress event handlers
  onAnalyzeProgress: (callback: (progress: ProgressInfo) => void) => () => void;
  onRenameProgress: (callback: (progress: ProgressInfo) => void) => () => void;
  onSortProgress: (callback: (progress: ProgressInfo) => void) => () => void;
  
  // Ollama operations
  pullOllamaModel: (modelName: string) => Promise<{ success?: boolean, error?: string }>;
  listOllamaModels: () => Promise<{ models?: OllamaModelInfo[], error?: string }>;
  deleteOllamaModel: (modelName: string) => Promise<{ success?: boolean, error?: string }>;
  onOllamaModelPullProgress: (callback: (progress: OllamaProgressInfo) => void) => () => void;

  // Auto-update operations
  getAppVersion: () => Promise<string>;
  checkForUpdate: () => Promise<{ updateInfo?: UpdateInfo | null, error?: string }>;
  downloadUpdate: (updateInfo: UpdateInfo) => Promise<{ updatePath?: string, error?: string }>;
  installUpdate: (updatePath: string) => Promise<{ success?: boolean, error?: string }>;
  onUpdateDownloadProgress: (callback: (progress: UpdateDownloadProgress) => void) => () => void;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
