import React, { createContext, useContext, useState, useEffect } from 'react';
import type {
  AllDataImportSummary,
  CustomSection,
  CustomSectionData,
  CustomSectionItem,
  CustomSectionItemInput,
  CustomSectionUpdates,
  ExportResult,
  FolderItem,
  ImportOptions,
  ImportResult,
  ViewMode,
  Workspace,
  WorkspaceImportSummary,
  WorkspaceTheme,
} from '../electron';

export type { Workspace } from '../electron';

interface WorkspaceContextType {
  workspaces: Workspace[];
  currentWorkspace: Workspace | null;
  currentDirectoryPath: string | null;
  recentFolders: string[];
  favoriteFolders: FolderItem[];
  sectionOrder: string[];
  customSections: CustomSection[];
  workspaceTheme: WorkspaceTheme | null;
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  clearRecentFolders: () => void;
  sectionVisibility: Record<string, boolean>;
  setSectionVisibility: (section: string, visible: boolean) => void;
  toggleSectionVisibility: (section: string) => void;
  addWorkspace: (workspace: Workspace) => void;
  removeWorkspace: (id: string) => void;
  setCurrentWorkspace: (workspace: Workspace) => void;
  renameWorkspace: (id: string, newName: string) => void;
  updateWorkspaceEmoji: (id: string, emoji: string) => void;
  addRecentFolder: (path: string) => void;
  addFavoriteFolder: (folder: FolderItem) => void;
  removeFavoriteFolder: (path: string) => void;
  reorderFavoriteFolders: (startIndex: number, endIndex: number) => void;
  reorderSections: (startIndex: number, endIndex: number) => void;
  setCurrentDirectoryPath: (path: string) => void;
  setWorkspaceTheme: (theme: WorkspaceTheme | null) => void;
  getWorkspaceTheme: (workspaceId: string) => Promise<WorkspaceTheme | null>;
  exportWorkspace: (workspaceId: string) => Promise<ExportResult>;
  importWorkspace: (
    options?: ImportOptions,
  ) => Promise<ImportResult<WorkspaceImportSummary> & { workspaceId?: string }>;
  exportAllData: () => Promise<ExportResult>;
  importAllData: (
    options?: ImportOptions,
  ) => Promise<ImportResult<AllDataImportSummary> & { errors?: string[] }>;
  getCustomSections: (
    workspaceId: string,
  ) => Promise<{ success?: boolean; sections?: CustomSection[]; error?: string }>;
  createCustomSection: (
    workspaceId: string,
    sectionData: CustomSectionData,
  ) => Promise<{ success?: boolean; section?: CustomSection; error?: string }>;
  updateCustomSection: (
    sectionId: string,
    updates: CustomSectionUpdates,
  ) => Promise<{ success?: boolean; error?: string }>;
  deleteCustomSection: (sectionId: string) => Promise<{ success?: boolean; error?: string }>;
  addItemToCustomSection: (
    sectionId: string,
    item: CustomSectionItemInput,
  ) => Promise<{ success?: boolean; items?: CustomSectionItem[]; error?: string }>;
  removeItemFromCustomSection: (
    sectionId: string,
    itemId: string,
  ) => Promise<{ success?: boolean; items?: CustomSectionItem[]; error?: string }>;
}

const WorkspaceContext = createContext<WorkspaceContextType | undefined>(undefined);

export const WorkspaceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [currentWorkspace, setCurrentWorkspaceState] = useState<Workspace | null>(null);
  const [currentDirectoryPath, setCurrentDirectoryPath] = useState<string | null>(null);
  const [recentFolders, setRecentFolders] = useState<string[]>([]);
  const [favoriteFolders, setFavoriteFolders] = useState<FolderItem[]>([]);
  const [sectionOrder, setSectionOrder] = useState<string[]>(['workspaces', 'recent', 'favorites']);
  const [customSections, setCustomSections] = useState<CustomSection[]>([]);
  const [workspaceTheme, setWorkspaceThemeState] = useState<WorkspaceTheme | null>(null);
  const [viewMode, setViewModeState] = useState<ViewMode>('grid');

  const [sectionVisibility, setSectionVisibilityState] = useState<Record<string, boolean>>({
    workspaces: true,
    recent: true,
    favorites: true,
  });

  // Load workspaces from database on mount
  useEffect(() => {
    const loadWorkspaces = async () => {
      const loadedWorkspaces = await window.electronAPI.getWorkspaces();
      if (loadedWorkspaces.length > 0) {
        setWorkspaces(loadedWorkspaces);
        setCurrentWorkspaceState(loadedWorkspaces[0]);
      } else {
        // Create default workspace if none exist
        const id = Date.now().toString();
        addWorkspace({ id, name: 'Default Workspace', emoji: '' });
      }
    };
    loadWorkspaces();
  }, []);

  // Save workspaces when they change
  useEffect(() => {
    const saveWorkspaces = async () => {
      await Promise.all(workspaces.map(workspace => 
        window.electronAPI.saveWorkspace(workspace)
      ));
    };
    saveWorkspaces();
  }, [workspaces]);

  // Load workspace settings on workspace change
  useEffect(() => {
    const loadWorkspaceSettings = async () => {
      if (currentWorkspace) {
        const settings = await window.electronAPI.getWorkspaceSettings(currentWorkspace.id);
        if (settings) {
          setRecentFolders(settings.recentFolders || []);
          setFavoriteFolders(settings.favoriteFolders || []);
          if (settings && 'sectionOrder' in settings && Array.isArray(settings.sectionOrder)) {
            setSectionOrder(settings.sectionOrder);
          }
          if (settings && 'sectionVisibility' in settings && typeof settings.sectionVisibility === 'object' && settings.sectionVisibility) {
            const visibility = settings.sectionVisibility as any;
            setSectionVisibilityState({
              workspaces: visibility.workspaces !== false,
              recent: visibility.recent !== false,
              favorites: visibility.favorites !== false,
            });
          }
          // Load workspace theme
          if (settings.workspaceTheme) {
            setWorkspaceThemeState(settings.workspaceTheme);
          } else {
            setWorkspaceThemeState(null);
          }
          // Load view mode
          if (settings && 'viewMode' in settings && settings.viewMode) {
            setViewModeState(settings.viewMode);
          } else {
            setViewModeState('grid');
          }
        }
        
        // Load custom sections for this workspace
        const customSectionsResult = await window.electronAPI.getCustomSections(currentWorkspace.id);
        if (customSectionsResult.success && customSectionsResult.sections) {
          setCustomSections(customSectionsResult.sections);
          // Add custom section IDs to section order if not already present
          const customSectionIds = customSectionsResult.sections.map((s) => s.id);
          setSectionOrder(prev => {
            const newOrder = [...prev];
            customSectionIds.forEach((id: string) => {
              if (!newOrder.includes(id)) {
                newOrder.push(id);
              }
            });
            return newOrder;
          });
        }
      }
    };
    loadWorkspaceSettings();
  }, [currentWorkspace]);

  // Save workspace settings when they change (debounced to prevent excessive saves)
  useEffect(() => {
    const timeoutId = setTimeout(async () => {
      if (currentWorkspace) {
        await window.electronAPI.saveWorkspaceSetting(currentWorkspace.id, 'recentFolders', recentFolders);
      }
    }, 500);
    return () => clearTimeout(timeoutId);
  }, [currentWorkspace, recentFolders]);

  useEffect(() => {
    const timeoutId = setTimeout(async () => {
      if (currentWorkspace) {
        await window.electronAPI.saveWorkspaceSetting(currentWorkspace.id, 'favoriteFolders', favoriteFolders);
      }
    }, 500);
    return () => clearTimeout(timeoutId);
  }, [currentWorkspace, favoriteFolders]);

  useEffect(() => {
    const timeoutId = setTimeout(async () => {
      if (currentWorkspace) {
        await window.electronAPI.saveWorkspaceSetting(currentWorkspace.id, 'sectionOrder', sectionOrder);
      }
    }, 500);
    return () => clearTimeout(timeoutId);
  }, [currentWorkspace, sectionOrder]);

  useEffect(() => {
    const timeoutId = setTimeout(async () => {
      if (currentWorkspace) {
        await window.electronAPI.saveWorkspaceSetting(currentWorkspace.id, 'sectionVisibility', sectionVisibility);
      }
    }, 500);
    return () => clearTimeout(timeoutId);
  }, [currentWorkspace, sectionVisibility]);

  useEffect(() => {
    const timeoutId = setTimeout(async () => {
      if (currentWorkspace) {
        await window.electronAPI.saveWorkspaceSetting(currentWorkspace.id, 'viewMode', viewMode);
      }
    }, 500);
    return () => clearTimeout(timeoutId);
  }, [currentWorkspace, viewMode]);

  // Array of emojis to randomly choose from when creating a new workspace
  const workspaceEmojis = ['🌟', '🎯', '🎨', '📚', '💡', '🔧', '🎮', '🎵', '📝', '🗂️', '📊', '🌈', '🚀', '💻', '📱'];

  const getRandomEmoji = () => {
    const randomIndex = Math.floor(Math.random() * workspaceEmojis.length);
    return workspaceEmojis[randomIndex];
  };

  const addWorkspace = async (workspace: Workspace) => {
    const workspaceWithEmoji = {
      ...workspace,
      emoji: workspace.emoji || getRandomEmoji()
    };
    setWorkspaces(prev => {
      const newWorkspaces = [...prev, workspaceWithEmoji];
      if (prev.length === 0) {
        setCurrentWorkspaceState(workspaceWithEmoji);
      }
      return newWorkspaces;
    });
  };

  const removeWorkspace = async (id: string) => {
    await window.electronAPI.deleteWorkspace(id);
    setWorkspaces(prev => {
      const filtered = prev.filter(w => w.id !== id);
      // If we're removing the current workspace, switch to the first remaining one
      if (currentWorkspace?.id === id) {
        setCurrentWorkspaceState(filtered.length > 0 ? filtered[0] : null);
      }
      return filtered;
    });
  };

  const addFavoriteFolder = (folder: FolderItem) => {
    setFavoriteFolders(prev => [...prev, folder]);
  };

  const setCurrentWorkspace = async (workspace: Workspace) => {
    setCurrentWorkspaceState(workspace);
  };

  const renameWorkspace = (id: string, newName: string) => {
    setWorkspaces(prev => prev.map(w => 
      w.id === id ? { ...w, name: newName } : w
    ));
  };

  const updateWorkspaceEmoji = (id: string, emoji: string) => {
    setWorkspaces(prev => prev.map(w => 
      w.id === id ? { ...w, emoji } : w
    ));
  };

  const addRecentFolder = (path: string) => {
    setRecentFolders(prev => {
      const newRecent = [path, ...prev.filter(p => p !== path)].slice(0, 10);
      return newRecent;
    });
  };

  const clearRecentFolders = () => {
    setRecentFolders([]);
  };

  const removeFavoriteFolder = (path: string) => {
    setFavoriteFolders(prev => prev.filter(f => f.path !== path));
  };

  const reorderFavoriteFolders = (startIndex: number, endIndex: number) => {
    setFavoriteFolders(prev => {
      const result = Array.from(prev);
      const [removed] = result.splice(startIndex, 1);
      result.splice(endIndex, 0, removed);
      return result;
    });
  };

  const reorderSections = (startIndex: number, endIndex: number) => {
    setSectionOrder(prev => {
      const result = Array.from(prev);
      const [removed] = result.splice(startIndex, 1);
      result.splice(endIndex, 0, removed);
      return result;
    });
  };

  const setSectionVisibility = (section: string, visible: boolean) => {
    setSectionVisibilityState(prev => ({ ...prev, [section]: visible }));
  };

  const toggleSectionVisibility = (section: string) => {
    setSectionVisibilityState(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const handleSetCurrentDirectoryPath = async (path: string) => {
    setCurrentDirectoryPath(path);
    addRecentFolder(path);
    const result = await window.electronAPI.loadDirectory(path);
    if (result.error) {
      console.error('Failed to load directory:', result.error);
    }
  };

  const exportWorkspace = async (workspaceId: string) => {
    try {
      const result = await window.electronAPI.exportWorkspace(workspaceId);
      return result;
    } catch (error) {
      console.error('Failed to export workspace:', error);
      return { error: error instanceof Error ? error.message : 'Unknown error' };
    }
  };

  const importWorkspace = async (options: ImportOptions = {}) => {
    try {
      const result = await window.electronAPI.importWorkspace(options);
      if (result.success) {
        // Reload workspaces to show the imported one
        const loadedWorkspaces = await window.electronAPI.getWorkspaces();
        setWorkspaces(loadedWorkspaces);
      }
      return result;
    } catch (error) {
      console.error('Failed to import workspace:', error);
      return { error: error instanceof Error ? error.message : 'Unknown error' };
    }
  };

  const exportAllData = async () => {
    try {
      const result = await window.electronAPI.exportAllData();
      return result;
    } catch (error) {
      console.error('Failed to export all data:', error);
      return { error: error instanceof Error ? error.message : 'Unknown error' };
    }
  };

  const importAllData = async (options: ImportOptions = {}) => {
    try {
      const result = await window.electronAPI.importAllData(options);
      if (result.success) {
        // Reload all data
        const loadedWorkspaces = await window.electronAPI.getWorkspaces();
        setWorkspaces(loadedWorkspaces);
        if (loadedWorkspaces.length > 0) {
          setCurrentWorkspaceState(loadedWorkspaces[0]);
        }
      }
      return result;
    } catch (error) {
      console.error('Failed to import all data:', error);
      return { error: error instanceof Error ? error.message : 'Unknown error' };
    }
  };

  const getCustomSections = async (workspaceId: string) => {
    try {
      const result = await window.electronAPI.getCustomSections(workspaceId);
      if (result.success && result.sections) {
        setCustomSections(result.sections);
      }
      return result;
    } catch (error) {
      console.error('Failed to get custom sections:', error);
      return { error: error instanceof Error ? error.message : 'Unknown error' };
    }
  };

  const createCustomSection = async (workspaceId: string, sectionData: CustomSectionData) => {
    try {
      const result = await window.electronAPI.createCustomSection(workspaceId, sectionData);
      if (result.success && result.section) {
        const createdSection = result.section;
        setCustomSections(prev => [...prev, createdSection]);
        // Add to section order
        setSectionOrder(prev => [...prev, createdSection.id]);
      }
      return result;
    } catch (error) {
      console.error('Failed to create custom section:', error);
      return { error: error instanceof Error ? error.message : 'Unknown error' };
    }
  };

  const updateCustomSection = async (sectionId: string, updates: CustomSectionUpdates) => {
    try {
      const result = await window.electronAPI.updateCustomSection(sectionId, updates);
      if (result.success) {
        setCustomSections(prev => prev.map(section =>
          section.id === sectionId ? { ...section, ...updates } : section
        ));
      }
      return result;
    } catch (error) {
      console.error('Failed to update custom section:', error);
      return { error: error instanceof Error ? error.message : 'Unknown error' };
    }
  };

  const deleteCustomSection = async (sectionId: string) => {
    try {
      const result = await window.electronAPI.deleteCustomSection(sectionId);
      if (result.success) {
        setCustomSections(prev => prev.filter(section => section.id !== sectionId));
        // Remove from section order
        setSectionOrder(prev => prev.filter(id => id !== sectionId));
      }
      return result;
    } catch (error) {
      console.error('Failed to delete custom section:', error);
      return { error: error instanceof Error ? error.message : 'Unknown error' };
    }
  };

  const addItemToCustomSection = async (sectionId: string, item: CustomSectionItemInput) => {
    try {
      const result = await window.electronAPI.addItemToCustomSection(sectionId, item);
      if (result.success && result.items) {
        const items = result.items;
        setCustomSections(prev => prev.map(section =>
          section.id === sectionId ? { ...section, items } : section
        ));
      }
      return result;
    } catch (error) {
      console.error('Failed to add item to custom section:', error);
      return { error: error instanceof Error ? error.message : 'Unknown error' };
    }
  };

  const removeItemFromCustomSection = async (sectionId: string, itemId: string) => {
    try {
      const result = await window.electronAPI.removeItemFromCustomSection(sectionId, itemId);
      if (result.success && result.items) {
        const items = result.items;
        setCustomSections(prev => prev.map(section =>
          section.id === sectionId ? { ...section, items } : section
        ));
      }
      return result;
    } catch (error) {
      console.error('Failed to remove item from custom section:', error);
      return { error: error instanceof Error ? error.message : 'Unknown error' };
    }
  };

  const setWorkspaceTheme = async (theme: WorkspaceTheme | null) => {
    if (currentWorkspace) {
      setWorkspaceThemeState(theme);
      await window.electronAPI.saveWorkspaceSetting(currentWorkspace.id, 'workspaceTheme', theme);
    }
  };

  const getWorkspaceTheme = async (workspaceId: string): Promise<WorkspaceTheme | null> => {
    try {
      const theme = await window.electronAPI.getWorkspaceSetting(workspaceId, 'workspaceTheme');
      return theme && typeof theme === 'object' && !Array.isArray(theme)
        ? (theme as unknown as WorkspaceTheme)
        : null;
    } catch (error) {
      console.error('Failed to get workspace theme:', error);
      return null;
    }
  };
  
  const setViewMode = (mode: ViewMode) => {
    setViewModeState(mode);
  };
  
  return (
    <WorkspaceContext.Provider
      value={{
        currentDirectoryPath,
        workspaces,
        currentWorkspace,
        recentFolders,
        favoriteFolders,
        sectionOrder,
        customSections,
        workspaceTheme,
        viewMode,
        setViewMode,
        sectionVisibility,
        clearRecentFolders,
        addWorkspace,
        removeWorkspace,
        setCurrentWorkspace,
        renameWorkspace,
        updateWorkspaceEmoji,
        addRecentFolder,
        addFavoriteFolder,
        removeFavoriteFolder,
        reorderFavoriteFolders,
        reorderSections,
        setSectionVisibility,
        toggleSectionVisibility,
        setCurrentDirectoryPath: handleSetCurrentDirectoryPath,
        setWorkspaceTheme,
        getWorkspaceTheme,
        exportWorkspace,
        importWorkspace,
        exportAllData,
        importAllData,
        getCustomSections,
        createCustomSection,
        updateCustomSection,
        deleteCustomSection,
        addItemToCustomSection,
        removeItemFromCustomSection,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
};

export const useWorkspace = () => {
  const context = useContext(WorkspaceContext);
  if (context === undefined) {
    throw new Error('useWorkspace must be used within a WorkspaceProvider');
  }
  return context;
};
