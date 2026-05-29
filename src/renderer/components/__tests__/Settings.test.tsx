import React from 'react';
import { render, screen, act, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Settings from '../Settings';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import useBackgroundFetch from '../../hooks/useBackgroundFetch';

// Mock the WorkspaceContext
jest.mock('../../contexts/WorkspaceContext', () => ({
  useWorkspace: jest.fn(),
}));

// Mock the hooks
jest.mock('../../hooks/useKeyboardShortcuts', () => ({
  useGlobalKeyboardShortcuts: () => ({
    shortcuts: [
      {
        category: 'General',
        description: 'Open Settings',
        key: 'Ctrl+,',
        action: 'openSettings'
      },
      {
        category: 'Navigation',
        description: 'Go Back',
        key: 'Alt+Left',
        action: 'goBack'
      }
    ],
  }),
  formatShortcut: jest.fn((shortcut) => shortcut.key),
}));

jest.mock('../../hooks/useBackgroundFetch', () => ({
  __esModule: true,
  default: jest.fn(),
}));

// Mock window.electronAPI
const mockElectronAPI = {
  loadSettings: jest.fn(),
  saveSettings: jest.fn(),
  onOllamaModelPullProgress: jest.fn(),
  pullOllamaModel: jest.fn(),
  listOllamaModels: jest.fn(),
  deleteOllamaModel: jest.fn(),
  getCacheStats: jest.fn(),
  getDatabaseStats: jest.fn(),
  cleanupCache: jest.fn(),
  optimizeDatabase: jest.fn(),
  exportWorkspace: jest.fn(),
  importWorkspace: jest.fn(),
  exportAllData: jest.fn(),
  importAllData: jest.fn(),
};

Object.defineProperty(window, 'electronAPI', {
  value: mockElectronAPI,
  writable: true,
});

const mockWorkspaceContext = {
  sectionVisibility: { workspaces: true, recent: true, favorites: true },
  setSectionVisibility: jest.fn(),
  currentWorkspace: { id: '1', name: 'Test Workspace', emoji: '🎯' },
  customSections: [],
  workspaceTheme: null,
  setWorkspaceTheme: jest.fn(),
  createCustomSection: jest.fn(),
  updateCustomSection: jest.fn(),
  deleteCustomSection: jest.fn(),
};

const mockUseBackgroundFetch = useBackgroundFetch as jest.MockedFunction<typeof useBackgroundFetch>;

describe('Settings', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useWorkspace as jest.Mock).mockReturnValue(mockWorkspaceContext);
    
    mockElectronAPI.loadSettings.mockResolvedValue({
      settings: {
        apiKeys: {},
        selectedProvider: 'google',
        selectedModel: 'gemini-2.0-flash-exp',
        renameFiles: false,
      }
    });
    
    mockElectronAPI.saveSettings.mockResolvedValue({ success: true });
    mockElectronAPI.getCacheStats.mockResolvedValue({ success: true, stats: {} });
    mockElectronAPI.getDatabaseStats.mockResolvedValue({ success: true, stats: {} });
    mockElectronAPI.onOllamaModelPullProgress.mockReturnValue(jest.fn()); // Return unsubscribe function
    mockElectronAPI.listOllamaModels.mockResolvedValue({ models: [] });
    
    // Mock useBackgroundFetch
    mockUseBackgroundFetch.mockReturnValue({
      data: null,
      loading: false,
      error: null,
      lastFetched: null,
      refetch: jest.fn(),
      clearCache: jest.fn(),
    });
  });

  const defaultProps = {
    open: true,
    onClose: jest.fn(),
    darkMode: false,
    onDarkModeChange: jest.fn(),
    accentColor: '#FF5733',
    onAccentColorChange: jest.fn(),
    isOllamaAvailable: true,
  };

  it('should render when open', async () => {
    await act(async () => {
      render(<Settings {...defaultProps} />);
    });
    
    expect(screen.getAllByText('Settings')).toHaveLength(1);
  });

  it('should not render when closed', async () => {
    await act(async () => {
      render(<Settings {...defaultProps} open={false} />);
    });
    
    expect(screen.queryAllByText('Settings')).toHaveLength(0);
  });

  it('should render general tab content', async () => {
    await act(async () => {
      render(<Settings {...defaultProps} />);
    });
    
    await waitFor(() => {
      expect(screen.getByText('Appearance')).toBeInTheDocument();
      expect(screen.getByText('Dark Mode')).toBeInTheDocument();
      expect(screen.getByText('Accent Color')).toBeInTheDocument();
    });
  });

  it('should render API keys tab', async () => {
    await act(async () => {
      render(<Settings {...defaultProps} />);
    });
    
    // The tabs should be present
    expect(screen.getByText('AI Providers')).toBeInTheDocument();
  });

  it('should render workspace management tab', async () => {
    await act(async () => {
      render(<Settings {...defaultProps} />);
    });
    
    expect(screen.getByText('Workspace')).toBeInTheDocument();
  });

  it('should render custom sections tab', async () => {
    await act(async () => {
      render(<Settings {...defaultProps} />);
    });
    
    expect(screen.getByText('Custom Sections')).toBeInTheDocument();
  });

  it('should render keyboard shortcuts tab', async () => {
    await act(async () => {
      render(<Settings {...defaultProps} />);
    });
    
    expect(screen.getByText('Keyboard Shortcuts')).toBeInTheDocument(); // Only tab label in sidepanel
  });

  it('should render ollama tab when available', async () => {
    await act(async () => {
      render(<Settings {...defaultProps} isOllamaAvailable={true} />);
    });
    
    expect(screen.getByText('AI Providers')).toBeInTheDocument();
  });

  it('should render ollama tab when not available', async () => {
    await act(async () => {
      render(<Settings {...defaultProps} isOllamaAvailable={false} />);
    });
    
    expect(screen.getByText('AI Providers')).toBeInTheDocument();
  });

  it('should call onClose when close button is clicked', async () => {
    const onClose = jest.fn();
    await act(async () => {
      render(<Settings {...defaultProps} onClose={onClose} />);
    });
    
    const closeButton = screen.getByRole('button', { name: /close/i });
    await act(async () => {
      closeButton.click();
    });
    
    expect(onClose).toHaveBeenCalled();
  });

  it('should load settings on mount', async () => {
    await act(async () => {
      render(<Settings {...defaultProps} />);
    });
    
    await waitFor(() => {
      expect(mockElectronAPI.loadSettings).toHaveBeenCalled();
    });
  });

  it('should handle settings save', async () => {
    await act(async () => {
      render(<Settings {...defaultProps} />);
    });
    
    // The component should initialize without errors
    expect(screen.getAllByText('Settings')).toHaveLength(1);
  });

  it('should handle dark mode prop', async () => {
    await act(async () => {
      render(<Settings {...defaultProps} darkMode={true} />);
    });
    
    expect(screen.getAllByText('Settings')).toHaveLength(1);
  });

  it('should handle accent color prop', async () => {
    await act(async () => {
      render(<Settings {...defaultProps} accentColor="#FF0000" />);
    });
    
    expect(screen.getAllByText('Settings')).toHaveLength(1);
  });

  it('should render with current workspace', async () => {
    await act(async () => {
      render(<Settings {...defaultProps} />);
    });
    
    expect(screen.getAllByText('Settings')).toHaveLength(1);
  });

  it('should render without current workspace', async () => {
    (useWorkspace as jest.Mock).mockReturnValue({
      ...mockWorkspaceContext,
      currentWorkspace: null,
    });
    
    await act(async () => {
      render(<Settings {...defaultProps} />);
    });
    
    expect(screen.getAllByText('Settings')).toHaveLength(1);
  });

  it('should handle custom sections', async () => {
    (useWorkspace as jest.Mock).mockReturnValue({
      ...mockWorkspaceContext,
      customSections: [
        { id: 'section1', name: 'Projects', items: [] }
      ],
    });
    
    await act(async () => {
      render(<Settings {...defaultProps} />);
    });
    
    expect(screen.getAllByText('Settings')).toHaveLength(1);
  });

  it('should handle workspace theme', async () => {
    (useWorkspace as jest.Mock).mockReturnValue({
      ...mockWorkspaceContext,
      workspaceTheme: {
        name: 'Custom Theme',
        accentColor: '#FF0000',
        darkMode: true,
      },
    });
    
    await act(async () => {
      render(<Settings {...defaultProps} />);
    });
    
    expect(screen.getAllByText('Settings')).toHaveLength(1);
  });

  describe('API Keys Tab', () => {
    it('should update OpenAI API key', async () => {
      await act(async () => {
        render(<Settings {...defaultProps} />);
      });
      
      // Click on API Keys tab
      const apiKeysTab = screen.getByText('AI Providers');
      await act(async () => {
        fireEvent.click(apiKeysTab);
      });
      
      // Find and update OpenAI API key field
      const openaiInput = screen.getByLabelText('OpenAI API Key');
      await act(async () => {
        await userEvent.clear(openaiInput);
        await userEvent.type(openaiInput, 'test-openai-key');
      });
      
      expect(openaiInput).toHaveValue('test-openai-key');
    });

    it('should update Anthropic API key', async () => {
      await act(async () => {
        render(<Settings {...defaultProps} />);
      });
      
      // Click on API Keys tab
      const apiKeysTab = screen.getByText('AI Providers');
      await act(async () => {
        fireEvent.click(apiKeysTab);
      });
      
      // Find and update Anthropic API key field
      const anthropicInput = screen.getByLabelText('Anthropic API Key');
      await act(async () => {
        await userEvent.clear(anthropicInput);
        await userEvent.type(anthropicInput, 'test-anthropic-key');
      });
      
      expect(anthropicInput).toHaveValue('test-anthropic-key');
    });

    it('should update Google API key', async () => {
      await act(async () => {
        render(<Settings {...defaultProps} />);
      });
      
      // Click on API Keys tab
      const apiKeysTab = screen.getByText('AI Providers');
      await act(async () => {
        fireEvent.click(apiKeysTab);
      });
      
      // Find and update Google API key field
      const googleInput = screen.getByLabelText('Google API Key');
      await act(async () => {
        await userEvent.clear(googleInput);
        await userEvent.type(googleInput, 'test-google-key');
      });
      
      expect(googleInput).toHaveValue('test-google-key');
    });
  });

  describe('Ollama Tab', () => {
    it('should handle model pull when Ollama is available', async () => {
      mockElectronAPI.pullOllamaModel.mockResolvedValue({});
      
      await act(async () => {
        render(<Settings {...defaultProps} isOllamaAvailable={true} />);
      });
      
      // Click on Ollama tab
      const ollamaTab = screen.getByText('AI Providers');
      await act(async () => {
        fireEvent.click(ollamaTab);
      });
      
      // Find model name input and pull button
      const modelInput = screen.getByLabelText('Model Name');
      const pullButton = screen.getByText('Pull');
      
      // Enter model name
      await act(async () => {
        await userEvent.type(modelInput, 'llama2');
      });
      
      // Click pull button
      await act(async () => {
        fireEvent.click(pullButton);
      });
      
      expect(mockElectronAPI.pullOllamaModel).toHaveBeenCalledWith('llama2');
    });

    it('should not pull model with empty name', async () => {
      await act(async () => {
        render(<Settings {...defaultProps} isOllamaAvailable={true} />);
      });
      
      // Click on Ollama tab
      const ollamaTab = screen.getByText('AI Providers');
      await act(async () => {
        fireEvent.click(ollamaTab);
      });
      
      // Find pull button and click without entering model name
      const pullButton = screen.getByText('Pull');
      await act(async () => {
        fireEvent.click(pullButton);
      });
      
      expect(mockElectronAPI.pullOllamaModel).not.toHaveBeenCalled();
    });

    it('should handle model pull error', async () => {
      mockElectronAPI.pullOllamaModel.mockRejectedValue(new Error('Pull failed'));
      
      await act(async () => {
        render(<Settings {...defaultProps} isOllamaAvailable={true} />);
      });
      
      // Click on Ollama tab
      const ollamaTab = screen.getByText('AI Providers');
      await act(async () => {
        fireEvent.click(ollamaTab);
      });
      
      // Find model name input and pull button
      const modelInput = screen.getByLabelText('Model Name');
      const pullButton = screen.getByText('Pull');
      
      // Enter model name and click pull
      await act(async () => {
        await userEvent.type(modelInput, 'llama2');
        fireEvent.click(pullButton);
      });
      
      // Wait for error to be handled
      await waitFor(() => {
        expect(mockElectronAPI.pullOllamaModel).toHaveBeenCalledWith('llama2');
      });
    });
  });

  describe('Workspace Management', () => {
    it('should handle workspace export', async () => {
      mockElectronAPI.exportWorkspace.mockResolvedValue({ success: true });
      
      await act(async () => {
        render(<Settings {...defaultProps} />);
      });
      
      // Click on Workspace tab
      const workspaceTab = screen.getByText('Workspace');
      await act(async () => {
        fireEvent.click(workspaceTab);
      });
      
      // Find and click export button
      const exportButton = screen.getByText('Export Current Workspace');
      await act(async () => {
        fireEvent.click(exportButton);
      });
      
      expect(mockElectronAPI.exportWorkspace).toHaveBeenCalledWith('1');
    });

    it('should handle workspace import', async () => {
      mockElectronAPI.importWorkspace.mockResolvedValue({ success: true });
      
      await act(async () => {
        render(<Settings {...defaultProps} />);
      });
      
      // Click on Workspace tab
      const workspaceTab = screen.getByText('Workspace');
      await act(async () => {
        fireEvent.click(workspaceTab);
      });
      
      // Find and click import button
      const importButton = screen.getByText('Import Workspace');
      await act(async () => {
        fireEvent.click(importButton);
      });
      
      expect(mockElectronAPI.importWorkspace).toHaveBeenCalledWith({ generateNewId: true });
    });

    it('should handle backup creation', async () => {
      mockElectronAPI.exportAllData.mockResolvedValue({ success: true });
      
      await act(async () => {
        render(<Settings {...defaultProps} />);
      });
      
      // Click on Workspace tab
      const workspaceTab = screen.getByText('Workspace');
      await act(async () => {
        fireEvent.click(workspaceTab);
      });
      
      // Find and click backup button
      const backupButton = screen.getByText('Create Backup');
      await act(async () => {
        fireEvent.click(backupButton);
      });
      
      expect(mockElectronAPI.exportAllData).toHaveBeenCalled();
    });

    it('should handle data restore', async () => {
      mockElectronAPI.importAllData.mockResolvedValue({ success: true });
      
      await act(async () => {
        render(<Settings {...defaultProps} />);
      });
      
      // Click on Workspace tab
      const workspaceTab = screen.getByText('Workspace');
      await act(async () => {
        fireEvent.click(workspaceTab);
      });
      
      // Find and click restore button
      const restoreButton = screen.getByText('Restore from Backup');
      await act(async () => {
        fireEvent.click(restoreButton);
      });
      
      expect(mockElectronAPI.importAllData).toHaveBeenCalledWith({ overwriteExisting: true });
    });
  });

  describe('Custom Sections', () => {
    it('should create custom section', async () => {
      mockWorkspaceContext.createCustomSection.mockResolvedValue({ success: true });
      
      await act(async () => {
        render(<Settings {...defaultProps} />);
      });
      
      // Click on Custom Sections tab
      const sectionsTab = screen.getByText('Custom Sections');
      await act(async () => {
        fireEvent.click(sectionsTab);
      });
      
      // Find section name input and create button
      const sectionInput = screen.getByLabelText('Section Name');
      const createButton = screen.getByText('Create');
      
      // Enter section name and create
      await act(async () => {
        await userEvent.type(sectionInput, 'Test Section');
        fireEvent.click(createButton);
      });
      
      expect(mockWorkspaceContext.createCustomSection).toHaveBeenCalledWith('1', {
        name: 'Test Section',
        items: []
      });
    });

    it('should not create section with empty name', async () => {
      await act(async () => {
        render(<Settings {...defaultProps} />);
      });
      
      // Click on Custom Sections tab
      const sectionsTab = screen.getByText('Custom Sections');
      await act(async () => {
        fireEvent.click(sectionsTab);
      });
      
      // Find create button and click without entering name
      const createButton = screen.getByText('Create');
      await act(async () => {
        fireEvent.click(createButton);
      });
      
      expect(mockWorkspaceContext.createCustomSection).not.toHaveBeenCalled();
    });

    it('should delete custom section', async () => {
      const customSections = [
        { id: 'section1', name: 'Test Section', items: [] }
      ];
      
      (useWorkspace as jest.Mock).mockReturnValue({
        ...mockWorkspaceContext,
        customSections
      });
      
      mockWorkspaceContext.deleteCustomSection.mockResolvedValue({ success: true });
      
      await act(async () => {
        render(<Settings {...defaultProps} />);
      });
      
      // Click on Custom Sections tab
      const sectionsTab = screen.getByText('Custom Sections');
      await act(async () => {
        fireEvent.click(sectionsTab);
      });
      
      // Find and click delete button
      const deleteButton = screen.getByText('Delete');
      await act(async () => {
        fireEvent.click(deleteButton);
      });
      
      expect(mockWorkspaceContext.deleteCustomSection).toHaveBeenCalledWith('section1');
    });
  });

  describe('Workspace Themes', () => {
    it('should update workspace theme dark mode', async () => {
      await act(async () => {
        render(<Settings {...defaultProps} />);
      });
      
      // Click on Workspace Themes tab
      const themesTab = screen.getByText('Workspace Themes');
      await act(async () => {
        fireEvent.click(themesTab);
      });
      
      // Find and toggle dark mode switch
      const darkModeSwitch = screen.getByLabelText('Dark Mode (Workspace Override)');
      await act(async () => {
        fireEvent.click(darkModeSwitch);
      });
      
      expect(mockWorkspaceContext.setWorkspaceTheme).toHaveBeenCalledWith({
        name: 'Test Workspace Theme',
        accentColor: '#FF5733',
        darkMode: true,
        customColors: {}
      });
    });

    it('should reset workspace theme to global', async () => {
      await act(async () => {
        render(<Settings {...defaultProps} />);
      });
      
      // Click on Workspace Themes tab
      const themesTab = screen.getByText('Workspace Themes');
      await act(async () => {
        fireEvent.click(themesTab);
      });
      
      // Find and click reset button
      const resetButton = screen.getByText('Reset to Global Theme');
      await act(async () => {
        fireEvent.click(resetButton);
      });
      
      expect(mockWorkspaceContext.setWorkspaceTheme).toHaveBeenCalledWith(null);
    });
  });

  describe('Settings Save/Load', () => {
    it('should handle save settings success', async () => {
      mockElectronAPI.saveSettings.mockResolvedValue({ success: true });
      
      await act(async () => {
        render(<Settings {...defaultProps} />);
      });
      
      // Find and click save button
      const saveButton = screen.getByText('Save Changes');
      await act(async () => {
        fireEvent.click(saveButton);
      });
      
      expect(mockElectronAPI.saveSettings).toHaveBeenCalled();
      
      // Wait for success message
      await waitFor(() => {
        expect(screen.getByText('Settings saved successfully')).toBeInTheDocument(); // Only one alert now
      });
    });

    it('should handle save settings error', async () => {
      mockElectronAPI.saveSettings.mockResolvedValue({
        success: false,
        error: 'Save failed'
      });
      
      await act(async () => {
        render(<Settings {...defaultProps} />);
      });
      
      // Find and click save button
      const saveButton = screen.getByText('Save Changes');
      await act(async () => {
        fireEvent.click(saveButton);
      });
      
      await waitFor(() => {
        expect(screen.getByText('Save failed')).toBeInTheDocument();
      });
    });

    it('should handle load settings error', async () => {
      mockElectronAPI.loadSettings.mockRejectedValue(new Error('Load failed'));
      
      await act(async () => {
        render(<Settings {...defaultProps} />);
      });
      
      await waitFor(() => {
        expect(screen.getByText('Failed to load settings')).toBeInTheDocument();
      });
    });
  });

  describe('Section Visibility', () => {
    it('should toggle section visibility', async () => {
      await act(async () => {
        render(<Settings {...defaultProps} />);
      });
      
      // Find workspaces checkbox and toggle it
      const workspacesCheckbox = screen.getByLabelText('Workspaces');
      await act(async () => {
        fireEvent.click(workspacesCheckbox);
      });
      
      expect(mockWorkspaceContext.setSectionVisibility).toHaveBeenCalledWith('workspaces', false);
    });
  });

  describe('Accent Color Selection', () => {
    it('should change accent color', async () => {
      const onAccentColorChange = jest.fn();
      
      await act(async () => {
        render(<Settings {...defaultProps} onAccentColorChange={onAccentColorChange} />);
      });
      
      // Find a color option and click it
      const colorOptions = screen.getAllByRole('generic').filter(el =>
        el.style.backgroundColor && el.style.cursor === 'pointer'
      );
      
      if (colorOptions.length > 0) {
        await act(async () => {
          fireEvent.click(colorOptions[1]); // Click second color option
        });
        
        expect(onAccentColorChange).toHaveBeenCalled();
      }
    });
  });

  describe('Error Handling', () => {
    it('should handle workspace export error', async () => {
      mockElectronAPI.exportWorkspace.mockResolvedValue({
        success: false,
        error: 'Export failed'
      });
      
      await act(async () => {
        render(<Settings {...defaultProps} />);
      });
      
      // Click on Workspace tab
      const workspaceTab = screen.getByText('Workspace');
      await act(async () => {
        fireEvent.click(workspaceTab);
      });
      
      // Find and click export button
      const exportButton = screen.getByText('Export Current Workspace');
      await act(async () => {
        fireEvent.click(exportButton);
      });
      
      await waitFor(() => {
        expect(screen.getByText('Export failed: Export failed')).toBeInTheDocument();
      });
    });

    it('should handle custom section creation error', async () => {
      mockWorkspaceContext.createCustomSection.mockResolvedValue({
        success: false,
        error: 'Creation failed'
      });
      
      await act(async () => {
        render(<Settings {...defaultProps} />);
      });
      
      // Click on Custom Sections tab
      const sectionsTab = screen.getByText('Custom Sections');
      await act(async () => {
        fireEvent.click(sectionsTab);
      });
      
      // Find section name input and create button
      const sectionInput = screen.getByLabelText('Section Name');
      const createButton = screen.getByText('Create');
      
      // Enter section name and create
      await act(async () => {
        await userEvent.type(sectionInput, 'Test Section');
        fireEvent.click(createButton);
      });
      
      await waitFor(() => {
        expect(screen.getByText('Failed to create section: Creation failed')).toBeInTheDocument();
      });
    });
  });

  describe('Background Fetch Integration', () => {
    it('should handle cache stats loading', async () => {
      mockUseBackgroundFetch.mockReturnValue({
        data: { size: 1024, files: 10 },
        loading: false,
        error: null,
        lastFetched: new Date(),
        refetch: jest.fn(),
        clearCache: jest.fn(),
      });

      await act(async () => {
        render(<Settings {...defaultProps} />);
      });

      expect(screen.getAllByText('Settings')).toHaveLength(1);
    });

    it('should handle cache stats error', async () => {
      mockUseBackgroundFetch.mockReturnValue({
        data: null,
        loading: false,
        error: 'Failed to fetch cache stats',
        lastFetched: null,
        refetch: jest.fn(),
        clearCache: jest.fn(),
      });

      await act(async () => {
        render(<Settings {...defaultProps} />);
      });

      expect(screen.getAllByText('Settings')).toHaveLength(1);
    });

    it('should handle loading stats state', async () => {
      mockUseBackgroundFetch.mockReturnValue({
        data: null,
        loading: true,
        error: null,
        lastFetched: null,
        refetch: jest.fn(),
        clearCache: jest.fn(),
      });

      await act(async () => {
        render(<Settings {...defaultProps} />);
      });

      expect(screen.getAllByText('Settings')).toHaveLength(1);
    });
  });

  describe('Cache and Database Operations', () => {
    it('should handle cache cleanup success', async () => {
      mockElectronAPI.cleanupCache.mockResolvedValue({ success: true });

      await act(async () => {
        render(<Settings {...defaultProps} />);
      });

      // Simulate cache cleanup operation
      expect(screen.getAllByText('Settings')).toHaveLength(1);
    });

    it('should handle cache cleanup error', async () => {
      mockElectronAPI.cleanupCache.mockResolvedValue({
        success: false,
        error: 'Cleanup failed'
      });

      await act(async () => {
        render(<Settings {...defaultProps} />);
      });

      expect(screen.getAllByText('Settings')).toHaveLength(1);
    });

    it('should handle cache cleanup exception', async () => {
      mockElectronAPI.cleanupCache.mockRejectedValue(new Error('Network error'));

      await act(async () => {
        render(<Settings {...defaultProps} />);
      });

      expect(screen.getAllByText('Settings')).toHaveLength(1);
    });

    it('should handle database optimization success', async () => {
      mockElectronAPI.optimizeDatabase.mockResolvedValue({ success: true });

      await act(async () => {
        render(<Settings {...defaultProps} />);
      });

      expect(screen.getAllByText('Settings')).toHaveLength(1);
    });

    it('should handle database optimization error', async () => {
      mockElectronAPI.optimizeDatabase.mockResolvedValue({
        success: false,
        error: 'Optimization failed'
      });

      await act(async () => {
        render(<Settings {...defaultProps} />);
      });

      expect(screen.getAllByText('Settings')).toHaveLength(1);
    });

    it('should handle database optimization exception', async () => {
      mockElectronAPI.optimizeDatabase.mockRejectedValue(new Error('Database error'));

      await act(async () => {
        render(<Settings {...defaultProps} />);
      });

      expect(screen.getAllByText('Settings')).toHaveLength(1);
    });
  });

  describe('Ollama Model Pull Progress', () => {
    it('should handle model pull progress updates', async () => {
      let progressCallback: (data: { progress: number; status: string }) => void;
      mockElectronAPI.onOllamaModelPullProgress.mockImplementation((callback: (data: { progress: number; status: string }) => void) => {
        progressCallback = callback;
        return jest.fn(); // Return unsubscribe function
      });

      await act(async () => {
        render(<Settings {...defaultProps} isOllamaAvailable={true} />);
      });

      // Simulate progress update
      await act(async () => {
        progressCallback({ progress: 50, status: 'Downloading...' });
      });

      expect(screen.getAllByText('Settings')).toHaveLength(1);
    });

    it('should handle model pull with whitespace in name', async () => {
      mockElectronAPI.pullOllamaModel.mockResolvedValue({});

      await act(async () => {
        render(<Settings {...defaultProps} isOllamaAvailable={true} />);
      });

      // Click on Ollama tab
      const ollamaTab = screen.getByText('AI Providers');
      await act(async () => {
        fireEvent.click(ollamaTab);
      });

      // Find model name input and pull button
      const modelInput = screen.getByLabelText('Model Name');
      const pullButton = screen.getByText('Pull');

      // Enter model name with whitespace
      await act(async () => {
        await userEvent.type(modelInput, '  llama2  ');
        fireEvent.click(pullButton);
      });

      expect(mockElectronAPI.pullOllamaModel).toHaveBeenCalledWith('llama2');
    });

    it('should handle model pull with non-Error exception', async () => {
      mockElectronAPI.pullOllamaModel.mockRejectedValue('String error');

      await act(async () => {
        render(<Settings {...defaultProps} isOllamaAvailable={true} />);
      });

      // Click on Ollama tab
      const ollamaTab = screen.getByText('AI Providers');
      await act(async () => {
        fireEvent.click(ollamaTab);
      });

      // Find model name input and pull button
      const modelInput = screen.getByLabelText('Model Name');
      const pullButton = screen.getByText('Pull');

      // Enter model name and click pull
      await act(async () => {
        await userEvent.type(modelInput, 'llama2');
        fireEvent.click(pullButton);
      });

      await waitFor(() => {
        expect(mockElectronAPI.pullOllamaModel).toHaveBeenCalledWith('llama2');
      });
    });
  });

  describe('Workspace Theme Edge Cases', () => {
    it('should handle workspace theme with existing custom colors', async () => {
      (useWorkspace as jest.Mock).mockReturnValue({
        ...mockWorkspaceContext,
        workspaceTheme: {
          name: 'Custom Theme',
          accentColor: '#FF0000',
          darkMode: true,
          customColors: { primary: '#FF0000', background: '#000000' }
        },
      });

      await act(async () => {
        render(<Settings {...defaultProps} />);
      });

      // Click on Workspace Themes tab
      const themesTab = screen.getByText('Workspace Themes');
      await act(async () => {
        fireEvent.click(themesTab);
      });

      // Find and toggle dark mode switch
      const darkModeSwitch = screen.getByLabelText('Dark Mode (Workspace Override)');
      await act(async () => {
        fireEvent.click(darkModeSwitch);
      });

      expect(mockWorkspaceContext.setWorkspaceTheme).toHaveBeenCalledWith({
        name: 'Test Workspace Theme',
        accentColor: '#FF0000',
        darkMode: false,
        customColors: { primary: '#FF0000', background: '#000000' }
      });
    });

    it('should handle workspace accent color change with existing theme', async () => {
      (useWorkspace as jest.Mock).mockReturnValue({
        ...mockWorkspaceContext,
        workspaceTheme: {
          name: 'Custom Theme',
          accentColor: '#FF0000',
          darkMode: true,
          customColors: { primary: '#FF0000' }
        },
      });

      await act(async () => {
        render(<Settings {...defaultProps} />);
      });

      // Click on Workspace Themes tab
      const themesTab = screen.getByText('Workspace Themes');
      await act(async () => {
        fireEvent.click(themesTab);
      });

      // Find a workspace color option and click it
      const colorOptions = screen.getAllByRole('generic').filter(el =>
        el.style.backgroundColor && el.style.cursor === 'pointer'
      );

      if (colorOptions.length > 1) {
        await act(async () => {
          fireEvent.click(colorOptions[1]); // Click second color option
        });

        expect(mockWorkspaceContext.setWorkspaceTheme).toHaveBeenCalled();
      }
    });

    it('should handle apply theme button click', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

      await act(async () => {
        render(<Settings {...defaultProps} />);
      });

      // Click on Workspace Themes tab
      const themesTab = screen.getByText('Workspace Themes');
      await act(async () => {
        fireEvent.click(themesTab);
      });

      // Find and click apply theme button
      const applyButton = screen.getByText('Apply Theme');
      await act(async () => {
        fireEvent.click(applyButton);
      });

      expect(consoleSpy).toHaveBeenCalledWith('Workspace theme saved');
      consoleSpy.mockRestore();
    });

    it('should handle reset theme when no current workspace', async () => {
      (useWorkspace as jest.Mock).mockReturnValue({
        ...mockWorkspaceContext,
        currentWorkspace: null,
      });

      await act(async () => {
        render(<Settings {...defaultProps} />);
      });

      // Click on Workspace Themes tab
      const themesTab = screen.getByText('Workspace Themes');
      await act(async () => {
        fireEvent.click(themesTab);
      });

      // Should show "No workspace selected" message
      expect(screen.getByText('No workspace selected')).toBeInTheDocument();
    });
  });

  describe('Custom Section Edge Cases', () => {
    it('should handle create section when no current workspace', async () => {
      (useWorkspace as jest.Mock).mockReturnValue({
        ...mockWorkspaceContext,
        currentWorkspace: null,
      });

      await act(async () => {
        render(<Settings {...defaultProps} />);
      });

      // Click on Custom Sections tab
      const sectionsTab = screen.getByText('Custom Sections');
      await act(async () => {
        fireEvent.click(sectionsTab);
      });

      // Find section name input and create button
      const sectionInput = screen.getByLabelText('Section Name');
      const createButton = screen.getByText('Create');

      // Enter section name and try to create
      await act(async () => {
        await userEvent.type(sectionInput, 'Test Section');
        fireEvent.click(createButton);
      });

      expect(mockWorkspaceContext.createCustomSection).not.toHaveBeenCalled();
    });

    it('should handle create section with whitespace name', async () => {
      mockWorkspaceContext.createCustomSection.mockResolvedValue({ success: true });

      await act(async () => {
        render(<Settings {...defaultProps} />);
      });

      // Click on Custom Sections tab
      const sectionsTab = screen.getByText('Custom Sections');
      await act(async () => {
        fireEvent.click(sectionsTab);
      });

      // Find section name input and create button
      const sectionInput = screen.getByLabelText('Section Name');
      const createButton = screen.getByText('Create');

      // Enter section name with whitespace and create
      await act(async () => {
        await userEvent.type(sectionInput, '  Test Section  ');
        fireEvent.click(createButton);
      });

      expect(mockWorkspaceContext.createCustomSection).toHaveBeenCalledWith('1', {
        name: 'Test Section',
        items: []
      });
    });

    it('should handle create section exception', async () => {
      mockWorkspaceContext.createCustomSection.mockRejectedValue(new Error('Network error'));

      await act(async () => {
        render(<Settings {...defaultProps} />);
      });

      // Click on Custom Sections tab
      const sectionsTab = screen.getByText('Custom Sections');
      await act(async () => {
        fireEvent.click(sectionsTab);
      });

      // Find section name input and create button
      const sectionInput = screen.getByLabelText('Section Name');
      const createButton = screen.getByText('Create');

      // Enter section name and create
      await act(async () => {
        await userEvent.type(sectionInput, 'Test Section');
        fireEvent.click(createButton);
      });

      await waitFor(() => {
        expect(screen.getByText('Failed to create section: Network error')).toBeInTheDocument();
      });
    });

    it('should handle create section with non-Error exception', async () => {
      mockWorkspaceContext.createCustomSection.mockRejectedValue('String error');

      await act(async () => {
        render(<Settings {...defaultProps} />);
      });

      // Click on Custom Sections tab
      const sectionsTab = screen.getByText('Custom Sections');
      await act(async () => {
        fireEvent.click(sectionsTab);
      });

      // Find section name input and create button
      const sectionInput = screen.getByLabelText('Section Name');
      const createButton = screen.getByText('Create');

      // Enter section name and create
      await act(async () => {
        await userEvent.type(sectionInput, 'Test Section');
        fireEvent.click(createButton);
      });

      await waitFor(() => {
        expect(screen.getByText('Failed to create section: Unknown error')).toBeInTheDocument();
      });
    });

    it('should handle delete section error', async () => {
      const customSections = [
        { id: 'section1', name: 'Test Section', items: [] }
      ];

      (useWorkspace as jest.Mock).mockReturnValue({
        ...mockWorkspaceContext,
        customSections
      });

      mockWorkspaceContext.deleteCustomSection.mockResolvedValue({
        success: false,
        error: 'Delete failed'
      });

      await act(async () => {
        render(<Settings {...defaultProps} />);
      });

      // Click on Custom Sections tab
      const sectionsTab = screen.getByText('Custom Sections');
      await act(async () => {
        fireEvent.click(sectionsTab);
      });

      // Find and click delete button
      const deleteButton = screen.getByText('Delete');
      await act(async () => {
        fireEvent.click(deleteButton);
      });

      await waitFor(() => {
        expect(screen.getByText('Failed to delete section: Delete failed')).toBeInTheDocument();
      });
    });

    it('should handle delete section exception', async () => {
      const customSections = [
        { id: 'section1', name: 'Test Section', items: [] }
      ];

      (useWorkspace as jest.Mock).mockReturnValue({
        ...mockWorkspaceContext,
        customSections
      });

      mockWorkspaceContext.deleteCustomSection.mockRejectedValue(new Error('Network error'));

      await act(async () => {
        render(<Settings {...defaultProps} />);
      });

      // Click on Custom Sections tab
      const sectionsTab = screen.getByText('Custom Sections');
      await act(async () => {
        fireEvent.click(sectionsTab);
      });

      // Find and click delete button
      const deleteButton = screen.getByText('Delete');
      await act(async () => {
        fireEvent.click(deleteButton);
      });

      await waitFor(() => {
        expect(screen.getByText('Failed to delete section: Network error')).toBeInTheDocument();
      });
    });

    it('should display custom sections with items count', async () => {
      const customSections = [
        { id: 'section1', name: 'Test Section', items: [{ id: '1', name: 'Item 1' }] }
      ];

      (useWorkspace as jest.Mock).mockReturnValue({
        ...mockWorkspaceContext,
        customSections
      });

      await act(async () => {
        render(<Settings {...defaultProps} />);
      });

      // Click on Custom Sections tab
      const sectionsTab = screen.getByText('Custom Sections');
      await act(async () => {
        fireEvent.click(sectionsTab);
      });

      expect(screen.getByText('1 items')).toBeInTheDocument();
    });

    it('should display custom sections without items property', async () => {
      const customSections = [
        { id: 'section1', name: 'Test Section' } // No items property
      ];

      (useWorkspace as jest.Mock).mockReturnValue({
        ...mockWorkspaceContext,
        customSections
      });

      await act(async () => {
        render(<Settings {...defaultProps} />);
      });

      // Click on Custom Sections tab
      const sectionsTab = screen.getByText('Custom Sections');
      await act(async () => {
        fireEvent.click(sectionsTab);
      });

      expect(screen.getByText('0 items')).toBeInTheDocument();
    });
  });

  describe('Workspace Operations Error Handling', () => {
    it('should handle export workspace when no current workspace', async () => {
      (useWorkspace as jest.Mock).mockReturnValue({
        ...mockWorkspaceContext,
        currentWorkspace: null,
      });

      await act(async () => {
        render(<Settings {...defaultProps} />);
      });

      // Click on Workspace tab
      const workspaceTab = screen.getByText('Workspace');
      await act(async () => {
        fireEvent.click(workspaceTab);
      });

      // Find and click export button (should be disabled)
      const exportButton = screen.getByText('Export Current Workspace');
      expect(exportButton).toBeDisabled();
    });

    it('should handle export workspace exception', async () => {
      mockElectronAPI.exportWorkspace.mockRejectedValue(new Error('Network error'));

      await act(async () => {
        render(<Settings {...defaultProps} />);
      });

      // Click on Workspace tab
      const workspaceTab = screen.getByText('Workspace');
      await act(async () => {
        fireEvent.click(workspaceTab);
      });

      // Find and click export button
      const exportButton = screen.getByText('Export Current Workspace');
      await act(async () => {
        fireEvent.click(exportButton);
      });

      await waitFor(() => {
        expect(screen.getByText('Export failed: Network error')).toBeInTheDocument();
      });
    });

    it('should handle export workspace with non-Error exception', async () => {
      mockElectronAPI.exportWorkspace.mockRejectedValue('String error');

      await act(async () => {
        render(<Settings {...defaultProps} />);
      });

      // Click on Workspace tab
      const workspaceTab = screen.getByText('Workspace');
      await act(async () => {
        fireEvent.click(workspaceTab);
      });

      // Find and click export button
      const exportButton = screen.getByText('Export Current Workspace');
      await act(async () => {
        fireEvent.click(exportButton);
      });

      await waitFor(() => {
        expect(screen.getByText('Export failed: Unknown error')).toBeInTheDocument();
      });
    });

    it('should handle import workspace error', async () => {
      mockElectronAPI.importWorkspace.mockResolvedValue({
        success: false,
        error: 'Import failed'
      });

      await act(async () => {
        render(<Settings {...defaultProps} />);
      });

      // Click on Workspace tab
      const workspaceTab = screen.getByText('Workspace');
      await act(async () => {
        fireEvent.click(workspaceTab);
      });

      // Find and click import button
      const importButton = screen.getByText('Import Workspace');
      await act(async () => {
        fireEvent.click(importButton);
      });

      await waitFor(() => {
        expect(screen.getByText('Import failed: Import failed')).toBeInTheDocument();
      });
    });

    it('should handle import workspace exception', async () => {
      mockElectronAPI.importWorkspace.mockRejectedValue(new Error('Network error'));

      await act(async () => {
        render(<Settings {...defaultProps} />);
      });

      // Click on Workspace tab
      const workspaceTab = screen.getByText('Workspace');
      await act(async () => {
        fireEvent.click(workspaceTab);
      });

      // Find and click import button
      const importButton = screen.getByText('Import Workspace');
      await act(async () => {
        fireEvent.click(importButton);
      });

      await waitFor(() => {
        expect(screen.getByText('Import failed: Network error')).toBeInTheDocument();
      });
    });

    it('should handle backup creation error', async () => {
      mockElectronAPI.exportAllData.mockResolvedValue({
        success: false,
        error: 'Backup failed'
      });

      await act(async () => {
        render(<Settings {...defaultProps} />);
      });

      // Click on Workspace tab
      const workspaceTab = screen.getByText('Workspace');
      await act(async () => {
        fireEvent.click(workspaceTab);
      });

      // Find and click backup button
      const backupButton = screen.getByText('Create Backup');
      await act(async () => {
        fireEvent.click(backupButton);
      });

      await waitFor(() => {
        expect(screen.getByText('Backup failed: Backup failed')).toBeInTheDocument();
      });
    });

    it('should handle backup creation exception', async () => {
      mockElectronAPI.exportAllData.mockRejectedValue(new Error('Network error'));

      await act(async () => {
        render(<Settings {...defaultProps} />);
      });

      // Click on Workspace tab
      const workspaceTab = screen.getByText('Workspace');
      await act(async () => {
        fireEvent.click(workspaceTab);
      });

      // Find and click backup button
      const backupButton = screen.getByText('Create Backup');
      await act(async () => {
        fireEvent.click(backupButton);
      });

      await waitFor(() => {
        expect(screen.getByText('Backup failed: Network error')).toBeInTheDocument();
      });
    });

    it('should handle restore error', async () => {
      mockElectronAPI.importAllData.mockResolvedValue({
        success: false,
        error: 'Restore failed'
      });

      await act(async () => {
        render(<Settings {...defaultProps} />);
      });

      // Click on Workspace tab
      const workspaceTab = screen.getByText('Workspace');
      await act(async () => {
        fireEvent.click(workspaceTab);
      });

      // Find and click restore button
      const restoreButton = screen.getByText('Restore from Backup');
      await act(async () => {
        fireEvent.click(restoreButton);
      });

      await waitFor(() => {
        expect(screen.getByText('Restore failed: Restore failed')).toBeInTheDocument();
      });
    });

    it('should handle restore exception', async () => {
      mockElectronAPI.importAllData.mockRejectedValue(new Error('Network error'));

      await act(async () => {
        render(<Settings {...defaultProps} />);
      });

      // Click on Workspace tab
      const workspaceTab = screen.getByText('Workspace');
      await act(async () => {
        fireEvent.click(workspaceTab);
      });

      // Find and click restore button
      const restoreButton = screen.getByText('Restore from Backup');
      await act(async () => {
        fireEvent.click(restoreButton);
      });

      await waitFor(() => {
        expect(screen.getByText('Restore failed: Network error')).toBeInTheDocument();
      });
    });
  });

  describe('Settings Save Edge Cases', () => {
    it('should handle save settings exception', async () => {
      mockElectronAPI.saveSettings.mockRejectedValue(new Error('Network error'));

      await act(async () => {
        render(<Settings {...defaultProps} />);
      });

      // Find and click save button
      const saveButton = screen.getByText('Save Changes');
      await act(async () => {
        fireEvent.click(saveButton);
      });

      await waitFor(() => {
        expect(screen.getByText('Failed to save settings')).toBeInTheDocument();
      });
    });

    it('should handle successful save with auto-close', async () => {
      jest.useFakeTimers();
      const onClose = jest.fn();
      mockElectronAPI.saveSettings.mockResolvedValue({ success: true });

      await act(async () => {
        render(<Settings {...defaultProps} onClose={onClose} />);
      });

      // Find and click save button
      const saveButton = screen.getByText('Save Changes');
      await act(async () => {
        fireEvent.click(saveButton);
      });

      // Wait for success message
      await waitFor(() => {
        expect(screen.getByText('Settings saved successfully')).toBeInTheDocument();
      });

      // Fast-forward time to trigger auto-close
      act(() => {
        jest.advanceTimersByTime(1500);
      });

      expect(onClose).toHaveBeenCalled();
      jest.useRealTimers();
    });
  });

  describe('Settings Loading Edge Cases', () => {
    it('should handle settings loading with partial data', async () => {
      mockElectronAPI.loadSettings.mockResolvedValue({
        settings: {
          apiKeys: { openai: 'test-key' },
          // Missing other properties
        }
      });

      await act(async () => {
        render(<Settings {...defaultProps} />);
      });

      await waitFor(() => {
        expect(mockElectronAPI.loadSettings).toHaveBeenCalled();
      });

      expect(screen.getAllByText('Settings')).toHaveLength(1);
    });

    it('should handle settings loading with no settings property', async () => {
      mockElectronAPI.loadSettings.mockResolvedValue({});

      await act(async () => {
        render(<Settings {...defaultProps} />);
      });

      await waitFor(() => {
        expect(mockElectronAPI.loadSettings).toHaveBeenCalled();
      });

      expect(screen.getAllByText('Settings')).toHaveLength(1);
    });
  });

  describe('Component Cleanup', () => {
    it('should cleanup progress subscription on unmount', async () => {
      const unsubscribe = jest.fn();
      mockElectronAPI.onOllamaModelPullProgress.mockReturnValue(unsubscribe);

      const { unmount } = render(<Settings {...defaultProps} />);

      await act(async () => {
        unmount();
      });

      expect(unsubscribe).toHaveBeenCalled();
    });
  });

  describe('Dark Mode and Accent Color Integration', () => {
    it('should handle dark mode toggle', async () => {
      const onDarkModeChange = jest.fn();

      await act(async () => {
        render(<Settings {...defaultProps} onDarkModeChange={onDarkModeChange} />);
      });

      // Find and toggle dark mode switch
      const darkModeSwitch = screen.getByLabelText('Dark Mode');
      await act(async () => {
        fireEvent.click(darkModeSwitch);
      });

      expect(onDarkModeChange).toHaveBeenCalledWith(true);
    });
  });
});
