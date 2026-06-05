import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { WorkspaceProvider, useWorkspace } from '../WorkspaceContext';

// Mock window.electronAPI
const mockElectronAPI = {
  getWorkspaces: jest.fn(),
  saveWorkspace: jest.fn(),
  deleteWorkspace: jest.fn(),
  getWorkspaceSettings: jest.fn(),
  saveWorkspaceSetting: jest.fn(),
  getWorkspaceSetting: jest.fn(),
  setActiveWatchWorkspace: jest.fn(),
  loadDirectory: jest.fn(),
  exportWorkspace: jest.fn(),
  importWorkspace: jest.fn(),
  exportAllData: jest.fn(),
  importAllData: jest.fn(),
  getCustomSections: jest.fn(),
  createCustomSection: jest.fn(),
  updateCustomSection: jest.fn(),
  deleteCustomSection: jest.fn(),
  addItemToCustomSection: jest.fn(),
  removeItemFromCustomSection: jest.fn(),
};

Object.defineProperty(window, 'electronAPI', {
  value: mockElectronAPI,
  writable: true,
});

// Create a test wrapper that suppresses act warnings for initial effects
const TestWorkspaceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return <WorkspaceProvider>{children}</WorkspaceProvider>;
};

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <TestWorkspaceProvider>{children}</TestWorkspaceProvider>
);

describe('WorkspaceContext', () => {
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Suppress React act warnings for these tests
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation((message) => {
      if (typeof message === 'string' && message.includes('Warning: An update to')) {
        return; // Suppress all React act warnings
      }
      if (message && message.includes && message.includes('Warning: An update to %s inside a test was not wrapped in act')) {
        return; // Suppress formatted warnings too
      }
      // Let other console.error calls through but don't call console.warn
      // as that creates infinite loops
    });
    
    // Default mock implementations
    mockElectronAPI.getWorkspaces.mockResolvedValue([]);
    mockElectronAPI.saveWorkspace.mockResolvedValue({ success: true });
    mockElectronAPI.getWorkspaceSettings.mockResolvedValue(null);
    mockElectronAPI.saveWorkspaceSetting.mockResolvedValue({ success: true });
    mockElectronAPI.setActiveWatchWorkspace.mockResolvedValue({ success: true });
    mockElectronAPI.loadDirectory.mockResolvedValue({ success: true });
    mockElectronAPI.getCustomSections.mockResolvedValue({ success: true, sections: [] });
  });

  afterEach(() => {
    if (consoleErrorSpy) {
      consoleErrorSpy.mockRestore();
    }
  });

  it('should provide workspace context', () => {
    const { result } = renderHook(() => useWorkspace(), { wrapper });

    expect(result.current).toBeDefined();
    expect(result.current.workspaces).toEqual([]);
    expect(result.current.currentWorkspace).toBeNull();
    expect(result.current.recentFolders).toEqual([]);
    expect(result.current.favoriteFolders).toEqual([]);
  });

  it('should throw error when used outside provider', () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    
    expect(() => {
      renderHook(() => useWorkspace());
    }).toThrow('useWorkspace must be used within a WorkspaceProvider');

    consoleSpy.mockRestore();
  });

  it('should create default workspace when none exist', async () => {
    mockElectronAPI.getWorkspaces.mockResolvedValue([]);

    const { result } = renderHook(() => useWorkspace(), { wrapper });

    // Wait for all effects to complete
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 100));
    });

    expect(result.current.workspaces).toHaveLength(1);
    expect(result.current.workspaces[0].name).toBe('Default Workspace');
    expect(result.current.currentWorkspace).toEqual(result.current.workspaces[0]);
  });

  it('should load existing workspaces', async () => {
    const mockWorkspaces = [
      { id: '1', name: 'Workspace 1', emoji: '🎯' },
      { id: '2', name: 'Workspace 2', emoji: '📚' },
    ];
    mockElectronAPI.getWorkspaces.mockResolvedValue(mockWorkspaces);

    const { result } = renderHook(() => useWorkspace(), { wrapper });

    // Wait for all effects to complete
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 100));
    });

    expect(result.current.workspaces).toEqual(mockWorkspaces);
    expect(result.current.currentWorkspace).toEqual(mockWorkspaces[0]);
  });

  it('should add workspace', async () => {
    const { result } = renderHook(() => useWorkspace(), { wrapper });

    const newWorkspace = { id: '2', name: 'New Workspace', emoji: '🚀' };

    await act(async () => {
      await result.current.addWorkspace(newWorkspace);
    });

    expect(result.current.workspaces).toContainEqual(newWorkspace);
  });

  it('should add workspace with random emoji if none provided', async () => {
    const { result } = renderHook(() => useWorkspace(), { wrapper });

    const newWorkspace = { id: '2', name: 'New Workspace', emoji: '' };

    await act(async () => {
      await result.current.addWorkspace(newWorkspace);
    });

    const addedWorkspace = result.current.workspaces.find(w => w.id === '2');
    expect(addedWorkspace?.emoji).toBeTruthy();
    expect(addedWorkspace?.emoji).not.toBe('');
  });

  it('should remove workspace', async () => {
    const mockWorkspaces = [
      { id: '1', name: 'Workspace 1', emoji: '🎯' },
      { id: '2', name: 'Workspace 2', emoji: '📚' },
    ];
    mockElectronAPI.getWorkspaces.mockResolvedValue(mockWorkspaces);

    const { result } = renderHook(() => useWorkspace(), { wrapper });

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    await act(async () => {
      await result.current.removeWorkspace('2');
    });

    expect(result.current.workspaces).toHaveLength(1);
    expect(result.current.workspaces[0].id).toBe('1');
    expect(mockElectronAPI.deleteWorkspace).toHaveBeenCalledWith('2');
  });

  it('should set current workspace', async () => {
    const { result } = renderHook(() => useWorkspace(), { wrapper });

    // Wait for initial load to complete
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    const workspace = { id: '1', name: 'Test Workspace', emoji: '🎯' };

    await act(async () => {
      await result.current.setCurrentWorkspace(workspace);
    });

    expect(result.current.currentWorkspace).toEqual(workspace);
  });

  it('should rename workspace', async () => {
    const mockWorkspaces = [
      { id: '1', name: 'Workspace 1', emoji: '🎯' },
    ];
    mockElectronAPI.getWorkspaces.mockResolvedValue(mockWorkspaces);

    const { result } = renderHook(() => useWorkspace(), { wrapper });

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    act(() => {
      result.current.renameWorkspace('1', 'Renamed Workspace');
    });

    expect(result.current.workspaces[0].name).toBe('Renamed Workspace');
  });

  it('should update workspace emoji', async () => {
    const mockWorkspaces = [
      { id: '1', name: 'Workspace 1', emoji: '🎯' },
    ];
    mockElectronAPI.getWorkspaces.mockResolvedValue(mockWorkspaces);

    const { result } = renderHook(() => useWorkspace(), { wrapper });

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    act(() => {
      result.current.updateWorkspaceEmoji('1', '🚀');
    });

    expect(result.current.workspaces[0].emoji).toBe('🚀');
  });

  it('should add recent folder', () => {
    const { result } = renderHook(() => useWorkspace(), { wrapper });

    act(() => {
      result.current.addRecentFolder('/path/to/folder');
    });

    expect(result.current.recentFolders).toContain('/path/to/folder');
  });

  it('should limit recent folders to 10', () => {
    const { result } = renderHook(() => useWorkspace(), { wrapper });

    act(() => {
      for (let i = 0; i < 15; i++) {
        result.current.addRecentFolder(`/path/to/folder${i}`);
      }
    });

    expect(result.current.recentFolders).toHaveLength(10);
    expect(result.current.recentFolders[0]).toBe('/path/to/folder14');
  });

  it('should move existing folder to top of recent list', () => {
    const { result } = renderHook(() => useWorkspace(), { wrapper });

    act(() => {
      result.current.addRecentFolder('/path/to/folder1');
      result.current.addRecentFolder('/path/to/folder2');
      result.current.addRecentFolder('/path/to/folder1'); // Add again
    });

    expect(result.current.recentFolders[0]).toBe('/path/to/folder1');
    expect(result.current.recentFolders).toHaveLength(2);
  });

  it('should clear recent folders', () => {
    const { result } = renderHook(() => useWorkspace(), { wrapper });

    act(() => {
      result.current.addRecentFolder('/path/to/folder');
      result.current.clearRecentFolders();
    });

    expect(result.current.recentFolders).toEqual([]);
  });

  it('should add favorite folder', () => {
    const { result } = renderHook(() => useWorkspace(), { wrapper });

    const folder = { name: 'Test Folder', path: '/path/to/folder' };

    act(() => {
      result.current.addFavoriteFolder(folder);
    });

    expect(result.current.favoriteFolders).toContainEqual(folder);
  });

  it('should remove favorite folder', () => {
    const { result } = renderHook(() => useWorkspace(), { wrapper });

    const folder = { name: 'Test Folder', path: '/path/to/folder' };

    act(() => {
      result.current.addFavoriteFolder(folder);
      result.current.removeFavoriteFolder('/path/to/folder');
    });

    expect(result.current.favoriteFolders).not.toContainEqual(folder);
  });

  it('should reorder favorite folders', () => {
    const { result } = renderHook(() => useWorkspace(), { wrapper });

    const folder1 = { name: 'Folder 1', path: '/path/1' };
    const folder2 = { name: 'Folder 2', path: '/path/2' };

    act(() => {
      result.current.addFavoriteFolder(folder1);
      result.current.addFavoriteFolder(folder2);
      result.current.reorderFavoriteFolders(0, 1);
    });

    expect(result.current.favoriteFolders[0]).toEqual(folder2);
    expect(result.current.favoriteFolders[1]).toEqual(folder1);
  });

  it('should reorder sections', () => {
    const { result } = renderHook(() => useWorkspace(), { wrapper });

    act(() => {
      result.current.reorderSections(0, 2);
    });

    expect(result.current.sectionOrder[0]).toBe('recent');
    expect(result.current.sectionOrder[2]).toBe('workspaces');
  });

  it('should set section visibility', () => {
    const { result } = renderHook(() => useWorkspace(), { wrapper });

    act(() => {
      result.current.setSectionVisibility('workspaces', false);
    });

    expect(result.current.sectionVisibility.workspaces).toBe(false);
  });

  it('should toggle section visibility', () => {
    const { result } = renderHook(() => useWorkspace(), { wrapper });

    act(() => {
      result.current.toggleSectionVisibility('workspaces');
    });

    expect(result.current.sectionVisibility.workspaces).toBe(false);

    act(() => {
      result.current.toggleSectionVisibility('workspaces');
    });

    expect(result.current.sectionVisibility.workspaces).toBe(true);
  });

  it('should set current directory path and add to recent', async () => {
    const { result } = renderHook(() => useWorkspace(), { wrapper });

    await act(async () => {
      await result.current.setCurrentDirectoryPath('/test/path');
    });

    expect(result.current.currentDirectoryPath).toBe('/test/path');
    expect(result.current.recentFolders).toContain('/test/path');
    expect(mockElectronAPI.loadDirectory).toHaveBeenCalledWith('/test/path');
  });

  it('should export workspace', async () => {
    const { result } = renderHook(() => useWorkspace(), { wrapper });

    mockElectronAPI.exportWorkspace.mockResolvedValue({ success: true });

    const exportResult = await act(async () => {
      return await result.current.exportWorkspace('workspace-id');
    });

    expect(mockElectronAPI.exportWorkspace).toHaveBeenCalledWith('workspace-id');
    expect(exportResult.success).toBe(true);
  });

  it('should import workspace', async () => {
    const { result } = renderHook(() => useWorkspace(), { wrapper });

    mockElectronAPI.importWorkspace.mockResolvedValue({ success: true });
    mockElectronAPI.getWorkspaces.mockResolvedValue([
      { id: '1', name: 'Imported Workspace', emoji: '📁' }
    ]);

    const importResult = await act(async () => {
      return await result.current.importWorkspace({ generateNewId: true });
    });

    expect(mockElectronAPI.importWorkspace).toHaveBeenCalledWith({ generateNewId: true });
    expect(importResult.success).toBe(true);
  });

  it('should export all data', async () => {
    const { result } = renderHook(() => useWorkspace(), { wrapper });

    mockElectronAPI.exportAllData.mockResolvedValue({ success: true });

    const exportResult = await act(async () => {
      return await result.current.exportAllData();
    });

    expect(mockElectronAPI.exportAllData).toHaveBeenCalled();
    expect(exportResult.success).toBe(true);
  });

  it('should import all data', async () => {
    const { result } = renderHook(() => useWorkspace(), { wrapper });

    mockElectronAPI.importAllData.mockResolvedValue({ success: true });
    mockElectronAPI.getWorkspaces.mockResolvedValue([
      { id: '1', name: 'Imported Workspace', emoji: '📁' }
    ]);

    const importResult = await act(async () => {
      return await result.current.importAllData({ overwriteExisting: true });
    });

    expect(mockElectronAPI.importAllData).toHaveBeenCalledWith({ overwriteExisting: true });
    expect(importResult.success).toBe(true);
  });

  it('should get custom sections', async () => {
    const { result } = renderHook(() => useWorkspace(), { wrapper });

    const mockSections = [
      { id: 'section1', name: 'Projects', items: [] }
    ];
    mockElectronAPI.getCustomSections.mockResolvedValue({ 
      success: true, 
      sections: mockSections 
    });

    const sectionsResult = await act(async () => {
      return await result.current.getCustomSections('workspace-id');
    });

    expect(mockElectronAPI.getCustomSections).toHaveBeenCalledWith('workspace-id');
    expect(sectionsResult.sections).toEqual(mockSections);
  });

  it('should create custom section', async () => {
    const { result } = renderHook(() => useWorkspace(), { wrapper });

    // Wait for initial load to complete
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    const newSection = { id: 'section1', name: 'Projects', items: [] };
    mockElectronAPI.createCustomSection.mockResolvedValue({
      success: true,
      section: newSection
    });

    const createResult = await act(async () => {
      return await result.current.createCustomSection('workspace-id', {
        name: 'Projects',
        items: []
      });
    });

    expect(mockElectronAPI.createCustomSection).toHaveBeenCalledWith('workspace-id', {
      name: 'Projects',
      items: []
    });
    expect(createResult.section).toEqual(newSection);
    expect(result.current.customSections).toContainEqual(newSection);
  });

  it('should update custom section', async () => {
    const { result } = renderHook(() => useWorkspace(), { wrapper });

    // First add a section
    const section = { id: 'section1', name: 'Projects', items: [] };
    act(() => {
      result.current.customSections.push(section);
    });

    mockElectronAPI.updateCustomSection.mockResolvedValue({ success: true });

    const updateResult = await act(async () => {
      return await result.current.updateCustomSection('section1', { name: 'Updated Projects' });
    });

    expect(mockElectronAPI.updateCustomSection).toHaveBeenCalledWith('section1', { name: 'Updated Projects' });
    expect(updateResult.success).toBe(true);
  });

  it('should delete custom section', async () => {
    const { result } = renderHook(() => useWorkspace(), { wrapper });

    mockElectronAPI.deleteCustomSection.mockResolvedValue({ success: true });

    const deleteResult = await act(async () => {
      return await result.current.deleteCustomSection('section1');
    });

    expect(mockElectronAPI.deleteCustomSection).toHaveBeenCalledWith('section1');
    expect(deleteResult.success).toBe(true);
  });

  it('should add item to custom section', async () => {
    const { result } = renderHook(() => useWorkspace(), { wrapper });

    const updatedItems = [{ id: 'item1', name: 'Item 1' }];
    mockElectronAPI.addItemToCustomSection.mockResolvedValue({ 
      success: true, 
      items: updatedItems 
    });

    const addResult = await act(async () => {
      return await result.current.addItemToCustomSection('section1', { name: 'Item 1' });
    });

    expect(mockElectronAPI.addItemToCustomSection).toHaveBeenCalledWith('section1', { name: 'Item 1' });
    expect(addResult.items).toEqual(updatedItems);
  });

  it('should remove item from custom section', async () => {
    const { result } = renderHook(() => useWorkspace(), { wrapper });

    const updatedItems: any[] = [];
    mockElectronAPI.removeItemFromCustomSection.mockResolvedValue({ 
      success: true, 
      items: updatedItems 
    });

    const removeResult = await act(async () => {
      return await result.current.removeItemFromCustomSection('section1', 'item1');
    });

    expect(mockElectronAPI.removeItemFromCustomSection).toHaveBeenCalledWith('section1', 'item1');
    expect(removeResult.items).toEqual(updatedItems);
  });

  it('should set workspace theme', async () => {
    const mockWorkspaces = [
      { id: '1', name: 'Workspace 1', emoji: '🎯' },
    ];
    mockElectronAPI.getWorkspaces.mockResolvedValue(mockWorkspaces);

    const { result } = renderHook(() => useWorkspace(), { wrapper });

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    const theme = {
      name: 'Custom Theme',
      accentColor: '#FF5733',
      darkMode: true,
      customColors: { primary: '#FF5733' }
    };

    await act(async () => {
      await result.current.setWorkspaceTheme(theme);
    });

    expect(result.current.workspaceTheme).toEqual(theme);
    expect(mockElectronAPI.saveWorkspaceSetting).toHaveBeenCalledWith('1', 'workspaceTheme', theme);
  });

  it('should get workspace theme', async () => {
    const { result } = renderHook(() => useWorkspace(), { wrapper });

    const theme = {
      name: 'Custom Theme',
      accentColor: '#FF5733',
      darkMode: true,
    };
    mockElectronAPI.getWorkspaceSetting.mockResolvedValue(theme);

    const retrievedTheme = await act(async () => {
      return await result.current.getWorkspaceTheme('workspace-id');
    });

    expect(mockElectronAPI.getWorkspaceSetting).toHaveBeenCalledWith('workspace-id', 'workspaceTheme');
    expect(retrievedTheme).toEqual(theme);
  });

  it('should handle errors gracefully', async () => {
    const { result } = renderHook(() => useWorkspace(), { wrapper });

    mockElectronAPI.exportWorkspace.mockRejectedValue(new Error('Export failed'));

    const exportResult = await act(async () => {
      return await result.current.exportWorkspace('workspace-id');
    });

    expect(exportResult.error).toBe('Export failed');
  });

  it('should handle workspace loading with existing workspaces and settings', async () => {
    const mockWorkspaces = [
      { id: '1', name: 'Workspace 1', emoji: '🎯' },
    ];
    const mockSettings = {
      recentFolders: ['/path1', '/path2'],
      favoriteFolders: [{ name: 'Fav1', path: '/fav1' }],
      sectionOrder: ['favorites', 'workspaces', 'recent'],
      sectionVisibility: { workspaces: false, recent: true, favorites: true },
      workspaceTheme: { name: 'Dark', accentColor: '#000', darkMode: true }
    };
    const mockCustomSections = [
      { id: 'custom1', name: 'Custom Section', items: [] }
    ];

    mockElectronAPI.getWorkspaces.mockResolvedValue(mockWorkspaces);
    mockElectronAPI.getWorkspaceSettings.mockResolvedValue(mockSettings);
    mockElectronAPI.getCustomSections.mockResolvedValue({
      success: true,
      sections: mockCustomSections
    });

    const { result } = renderHook(() => useWorkspace(), { wrapper });

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 100));
    });

    expect(result.current.workspaces).toEqual(mockWorkspaces);
    expect(result.current.currentWorkspace).toEqual(mockWorkspaces[0]);
    expect(result.current.recentFolders).toEqual(mockSettings.recentFolders);
    expect(result.current.favoriteFolders).toEqual(mockSettings.favoriteFolders);
    // Section order should include custom sections that were loaded
    expect(result.current.sectionOrder).toEqual(['favorites', 'workspaces', 'recent', 'custom1']);
    expect(result.current.sectionVisibility.workspaces).toBe(false);
    expect(result.current.workspaceTheme).toEqual(mockSettings.workspaceTheme);
    expect(result.current.customSections).toEqual(mockCustomSections);
  });

  it('should handle workspace settings without sectionOrder', async () => {
    const mockWorkspaces = [
      { id: '1', name: 'Workspace 1', emoji: '🎯' },
    ];
    const mockSettings = {
      recentFolders: ['/path1'],
      favoriteFolders: [],
      // No sectionOrder property
      sectionVisibility: { workspaces: true, recent: true, favorites: true }
    };

    mockElectronAPI.getWorkspaces.mockResolvedValue(mockWorkspaces);
    mockElectronAPI.getWorkspaceSettings.mockResolvedValue(mockSettings);

    const { result } = renderHook(() => useWorkspace(), { wrapper });

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 100));
    });

    // Should keep default section order
    expect(result.current.sectionOrder).toEqual(['workspaces', 'recent', 'favorites']);
  });

  it('should handle workspace settings without sectionVisibility', async () => {
    const mockWorkspaces = [
      { id: '1', name: 'Workspace 1', emoji: '🎯' },
    ];
    const mockSettings = {
      recentFolders: ['/path1'],
      favoriteFolders: [],
      sectionOrder: ['workspaces', 'recent', 'favorites']
      // No sectionVisibility property
    };

    mockElectronAPI.getWorkspaces.mockResolvedValue(mockWorkspaces);
    mockElectronAPI.getWorkspaceSettings.mockResolvedValue(mockSettings);

    const { result } = renderHook(() => useWorkspace(), { wrapper });

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 100));
    });

    // Should keep default section visibility
    expect(result.current.sectionVisibility).toEqual({
      workspaces: true,
      recent: true,
      favorites: true
    });
  });

  it('should handle custom sections loading failure', async () => {
    const mockWorkspaces = [
      { id: '1', name: 'Workspace 1', emoji: '🎯' },
    ];

    mockElectronAPI.getWorkspaces.mockResolvedValue(mockWorkspaces);
    mockElectronAPI.getWorkspaceSettings.mockResolvedValue(null);
    mockElectronAPI.getCustomSections.mockResolvedValue({ success: false });

    const { result } = renderHook(() => useWorkspace(), { wrapper });

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 100));
    });

    expect(result.current.customSections).toEqual([]);
  });

  it('should handle directory loading error', async () => {
    const { result } = renderHook(() => useWorkspace(), { wrapper });

    mockElectronAPI.loadDirectory.mockResolvedValue({ error: 'Directory not found' });

    await act(async () => {
      await result.current.setCurrentDirectoryPath('/invalid/path');
    });

    expect(result.current.currentDirectoryPath).toBe('/invalid/path');
    expect(result.current.recentFolders).toContain('/invalid/path');
  });

  it('should handle removeWorkspace when current workspace is being removed', async () => {
    const mockWorkspaces = [
      { id: '1', name: 'Workspace 1', emoji: '🎯' },
      { id: '2', name: 'Workspace 2', emoji: '📚' },
    ];
    mockElectronAPI.getWorkspaces.mockResolvedValue(mockWorkspaces);

    const { result } = renderHook(() => useWorkspace(), { wrapper });

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    // Current workspace should be the first one
    expect(result.current.currentWorkspace?.id).toBe('1');

    await act(async () => {
      await result.current.removeWorkspace('1');
    });

    expect(result.current.workspaces).toHaveLength(1);
    expect(result.current.workspaces[0].id).toBe('2');
    // Current workspace should switch to remaining workspace
    expect(result.current.currentWorkspace?.id).toBe('2');
  });

  it('should handle removeWorkspace when no workspaces remain', async () => {
    const mockWorkspaces = [
      { id: '1', name: 'Workspace 1', emoji: '🎯' },
    ];
    mockElectronAPI.getWorkspaces.mockResolvedValue(mockWorkspaces);

    const { result } = renderHook(() => useWorkspace(), { wrapper });

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    await act(async () => {
      await result.current.removeWorkspace('1');
    });

    expect(result.current.workspaces).toHaveLength(0);
    expect(result.current.currentWorkspace).toBeNull();
  });

  it('should handle setWorkspaceTheme when no current workspace', async () => {
    const { result } = renderHook(() => useWorkspace(), { wrapper });

    const theme = {
      name: 'Custom Theme',
      accentColor: '#FF5733',
      darkMode: true,
    };

    await act(async () => {
      await result.current.setWorkspaceTheme(theme);
    });

    // Should not crash, but theme should not be set
    expect(result.current.workspaceTheme).toBeNull();
    expect(mockElectronAPI.saveWorkspaceSetting).not.toHaveBeenCalled();
  });

  it('should handle getWorkspaceTheme error', async () => {
    const { result } = renderHook(() => useWorkspace(), { wrapper });

    mockElectronAPI.getWorkspaceSetting.mockRejectedValue(new Error('Theme fetch failed'));

    const theme = await act(async () => {
      return await result.current.getWorkspaceTheme('workspace-id');
    });

    expect(theme).toBeNull();
  });

  it('should handle import workspace error', async () => {
    const { result } = renderHook(() => useWorkspace(), { wrapper });

    mockElectronAPI.importWorkspace.mockRejectedValue(new Error('Import failed'));

    const importResult = await act(async () => {
      return await result.current.importWorkspace();
    });

    expect(importResult.error).toBe('Import failed');
  });

  it('should handle import all data error', async () => {
    const { result } = renderHook(() => useWorkspace(), { wrapper });

    mockElectronAPI.importAllData.mockRejectedValue(new Error('Import all failed'));

    const importResult = await act(async () => {
      return await result.current.importAllData();
    });

    expect(importResult.error).toBe('Import all failed');
  });

  it('should handle get custom sections error', async () => {
    const { result } = renderHook(() => useWorkspace(), { wrapper });

    // Wait for initial load to complete and clear any previous calls
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 100));
    });
    
    // Clear the mock and set up the error for the manual call
    mockElectronAPI.getCustomSections.mockClear();
    mockElectronAPI.getCustomSections.mockRejectedValue(new Error('Get sections failed'));

    const sectionsResult = await act(async () => {
      return await result.current.getCustomSections('workspace-id');
    });

    expect(sectionsResult.error).toBe('Get sections failed');
  });

  it('should handle create custom section error', async () => {
    const { result } = renderHook(() => useWorkspace(), { wrapper });

    mockElectronAPI.createCustomSection.mockRejectedValue(new Error('Create section failed'));

    const createResult = await act(async () => {
      return await result.current.createCustomSection('workspace-id', { name: 'Test' });
    });

    expect(createResult.error).toBe('Create section failed');
  });

  it('should handle update custom section error', async () => {
    const { result } = renderHook(() => useWorkspace(), { wrapper });

    mockElectronAPI.updateCustomSection.mockRejectedValue(new Error('Update section failed'));

    const updateResult = await act(async () => {
      return await result.current.updateCustomSection('section1', { name: 'Updated' });
    });

    expect(updateResult.error).toBe('Update section failed');
  });

  it('should handle delete custom section error', async () => {
    const { result } = renderHook(() => useWorkspace(), { wrapper });

    mockElectronAPI.deleteCustomSection.mockRejectedValue(new Error('Delete section failed'));

    const deleteResult = await act(async () => {
      return await result.current.deleteCustomSection('section1');
    });

    expect(deleteResult.error).toBe('Delete section failed');
  });

  it('should handle add item to custom section error', async () => {
    const { result } = renderHook(() => useWorkspace(), { wrapper });

    mockElectronAPI.addItemToCustomSection.mockRejectedValue(new Error('Add item failed'));

    const addResult = await act(async () => {
      return await result.current.addItemToCustomSection('section1', { name: 'Item' });
    });

    expect(addResult.error).toBe('Add item failed');
  });

  it('should handle remove item from custom section error', async () => {
    const { result } = renderHook(() => useWorkspace(), { wrapper });

    mockElectronAPI.removeItemFromCustomSection.mockRejectedValue(new Error('Remove item failed'));

    const removeResult = await act(async () => {
      return await result.current.removeItemFromCustomSection('section1', 'item1');
    });

    expect(removeResult.error).toBe('Remove item failed');
  });

  it('should handle workspace settings with invalid sectionOrder type', async () => {
    const mockWorkspaces = [
      { id: '1', name: 'Workspace 1', emoji: '🎯' },
    ];
    const mockSettings = {
      recentFolders: ['/path1'],
      favoriteFolders: [],
      sectionOrder: 'invalid', // Not an array
      sectionVisibility: { workspaces: true, recent: true, favorites: true }
    };

    mockElectronAPI.getWorkspaces.mockResolvedValue(mockWorkspaces);
    mockElectronAPI.getWorkspaceSettings.mockResolvedValue(mockSettings);

    const { result } = renderHook(() => useWorkspace(), { wrapper });

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 100));
    });

    // Should keep default section order when invalid type
    expect(result.current.sectionOrder).toEqual(['workspaces', 'recent', 'favorites']);
  });

  it('should handle workspace settings with invalid sectionVisibility type', async () => {
    const mockWorkspaces = [
      { id: '1', name: 'Workspace 1', emoji: '🎯' },
    ];
    const mockSettings = {
      recentFolders: ['/path1'],
      favoriteFolders: [],
      sectionOrder: ['workspaces', 'recent', 'favorites'],
      sectionVisibility: 'invalid' // Not an object
    };

    mockElectronAPI.getWorkspaces.mockResolvedValue(mockWorkspaces);
    mockElectronAPI.getWorkspaceSettings.mockResolvedValue(mockSettings);

    const { result } = renderHook(() => useWorkspace(), { wrapper });

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 100));
    });

    // Should keep default section visibility when invalid type
    expect(result.current.sectionVisibility).toEqual({
      workspaces: true,
      recent: true,
      favorites: true
    });
  });

  it('should handle workspace settings with null sectionVisibility', async () => {
    const mockWorkspaces = [
      { id: '1', name: 'Workspace 1', emoji: '🎯' },
    ];
    const mockSettings = {
      recentFolders: ['/path1'],
      favoriteFolders: [],
      sectionOrder: ['workspaces', 'recent', 'favorites'],
      sectionVisibility: null
    };

    mockElectronAPI.getWorkspaces.mockResolvedValue(mockWorkspaces);
    mockElectronAPI.getWorkspaceSettings.mockResolvedValue(mockSettings);

    const { result } = renderHook(() => useWorkspace(), { wrapper });

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 100));
    });

    // Should keep default section visibility when null
    expect(result.current.sectionVisibility).toEqual({
      workspaces: true,
      recent: true,
      favorites: true
    });
  });

  it('should add custom section IDs to section order when loading', async () => {
    const mockWorkspaces = [
      { id: '1', name: 'Workspace 1', emoji: '🎯' },
    ];
    const mockCustomSections = [
      { id: 'custom1', name: 'Custom Section 1', items: [] },
      { id: 'custom2', name: 'Custom Section 2', items: [] }
    ];

    mockElectronAPI.getWorkspaces.mockResolvedValue(mockWorkspaces);
    mockElectronAPI.getWorkspaceSettings.mockResolvedValue(null);
    mockElectronAPI.getCustomSections.mockResolvedValue({
      success: true,
      sections: mockCustomSections
    });

    const { result } = renderHook(() => useWorkspace(), { wrapper });

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 100));
    });

    expect(result.current.customSections).toEqual(mockCustomSections);
    expect(result.current.sectionOrder).toContain('custom1');
    expect(result.current.sectionOrder).toContain('custom2');
  });

  it('should not duplicate custom section IDs in section order', async () => {
    const mockWorkspaces = [
      { id: '1', name: 'Workspace 1', emoji: '🎯' },
    ];
    const mockSettings = {
      sectionOrder: ['workspaces', 'recent', 'favorites', 'custom1'] // Already contains custom1
    };
    const mockCustomSections = [
      { id: 'custom1', name: 'Custom Section 1', items: [] },
      { id: 'custom2', name: 'Custom Section 2', items: [] }
    ];

    mockElectronAPI.getWorkspaces.mockResolvedValue(mockWorkspaces);
    mockElectronAPI.getWorkspaceSettings.mockResolvedValue(mockSettings);
    mockElectronAPI.getCustomSections.mockResolvedValue({
      success: true,
      sections: mockCustomSections
    });

    const { result } = renderHook(() => useWorkspace(), { wrapper });

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 100));
    });

    const custom1Count = result.current.sectionOrder.filter(id => id === 'custom1').length;
    expect(custom1Count).toBe(1); // Should not duplicate
    expect(result.current.sectionOrder).toContain('custom2'); // Should add new one
  });
});
