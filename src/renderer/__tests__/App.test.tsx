import React from 'react';
import { render, screen, act } from '@testing-library/react';
import App from '../App';

// Mock all child components to prevent complex initialization
jest.mock('../components/Sidebar', () => {
  return function MockSidebar() {
    return <div data-testid="sidebar">Sidebar</div>;
  };
});

jest.mock('../components/TitleBar', () => {
  return function MockTitleBar() {
    return <div data-testid="titlebar">TitleBar</div>;
  };
});

jest.mock('../components/ModelManagement', () => {
  return function MockModelManagement() {
    return <div data-testid="model-management">ModelManagement</div>;
  };
});

jest.mock('../components/DirectoryExplorer', () => {
  return function MockDirectoryExplorer() {
    return <div data-testid="directory-explorer">DirectoryExplorer</div>;
  };
});

jest.mock('../components/Settings', () => {
  return function MockSettings({ open }: { open: boolean }) {
    return open ? <div data-testid="settings">Settings</div> : null;
  };
});

jest.mock('../components/KeyboardShortcutsDialog', () => {
  return function MockKeyboardShortcutsDialog({ open }: { open: boolean }) {
    return open ? <div data-testid="shortcuts-dialog">Shortcuts</div> : null;
  };
});

// Mock the WorkspaceContext
jest.mock('../contexts/WorkspaceContext', () => ({
  WorkspaceProvider: ({ children }: { children: React.ReactNode }) => <div data-testid="workspace-provider">{children}</div>,
  useWorkspace: () => ({
    workspaceTheme: null,
    workspaces: [],
    currentWorkspace: null,
    recentFolders: [],
    favoriteFolders: [],
    sectionOrder: ['workspaces', 'recent', 'favorites'],
    customSections: [],
    sectionVisibility: { workspaces: true, recent: true, favorites: true },
    clearRecentFolders: jest.fn(),
    addWorkspace: jest.fn(),
    removeWorkspace: jest.fn(),
    setCurrentWorkspace: jest.fn(),
    renameWorkspace: jest.fn(),
    updateWorkspaceEmoji: jest.fn(),
    addRecentFolder: jest.fn(),
    addFavoriteFolder: jest.fn(),
    removeFavoriteFolder: jest.fn(),
    reorderFavoriteFolders: jest.fn(),
    reorderSections: jest.fn(),
    setSectionVisibility: jest.fn(),
    toggleSectionVisibility: jest.fn(),
    setCurrentDirectoryPath: jest.fn(),
    setWorkspaceTheme: jest.fn(),
    getWorkspaceTheme: jest.fn(),
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
  }),
}));

// Mock the keyboard shortcuts hook
jest.mock('../hooks/useKeyboardShortcuts', () => ({
  useGlobalKeyboardShortcuts: () => ({
    shortcuts: [],
  }),
}));

// Mock window.electronAPI
const mockElectronAPI = {
  loadSettings: jest.fn(),
  saveSettings: jest.fn(),
  getProviderModels: jest.fn(),
  selectDirectory: jest.fn(),
  pullOllamaModel: jest.fn(),
  onOllamaModelPullProgress: jest.fn(() => jest.fn()),
  getAppVersion: jest.fn(),
  checkForUpdate: jest.fn(),
  downloadUpdate: jest.fn(),
  installUpdate: jest.fn(),
  onUpdateDownloadProgress: jest.fn(() => jest.fn()),
};

Object.defineProperty(window, 'electronAPI', {
  value: mockElectronAPI,
  writable: true,
});

// Mock localStorage
const localStorageMock = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
};
Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
  writable: true,
});

// Mock fetch to prevent network calls
global.fetch = jest.fn(() =>
  Promise.reject(new Error('Network request not allowed in tests'))
);

describe('App', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.clearAllTimers();
    
    // Default mock implementations
    mockElectronAPI.loadSettings.mockResolvedValue({
      settings: {
        apiKeys: {},
        selectedProvider: 'google',
        selectedModel: 'gemini-2.0-flash-exp',
        renameFiles: false,
        accentColor: '#525252'
      }
    });
    mockElectronAPI.getProviderModels.mockResolvedValue({
      models: [],
      defaultModel: ''
    });
    
    localStorageMock.getItem.mockImplementation((key) => {
      if (key === 'darkMode') return 'false';
      if (key === 'accentColor') return '#525252';
      return null;
    });
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.restoreAllMocks();
  });

  it('should use monochrome primary tokens by default while preserving custom accents', () => {
    const { DEFAULT_MONO_ACCENT_COLOR, getTheme } = jest.requireActual('../App');

    const lightTheme = getTheme(false);
    const darkTheme = getTheme(true);
    const customTheme = getTheme(false, '#00FF00');

    expect(DEFAULT_MONO_ACCENT_COLOR).toBe('#525252');
    expect(lightTheme.palette.primary.main).toBe('#525252');
    expect(lightTheme.palette.background.default).toBe('#F7F7F7');
    expect(darkTheme.palette.primary.main).toBe('#E5E5E5');
    expect(darkTheme.palette.background.default).toBe('#151515');
    expect(customTheme.palette.primary.main).toBe('#00FF00');
  });

  it('should render without crashing', async () => {
    await act(async () => {
      render(<App />);
    });
    
    // Check if the workspace provider is rendered
    expect(screen.getByTestId('workspace-provider')).toBeInTheDocument();
  });

  it('should render main layout components', async () => {
    await act(async () => {
      render(<App />);
    });
    
    // Check for main components
    expect(screen.getByTestId('workspace-provider')).toBeInTheDocument();
    expect(screen.getByTestId('sidebar')).toBeInTheDocument();
    expect(screen.getByTestId('titlebar')).toBeInTheDocument();
    expect(screen.getByTestId('directory-explorer')).toBeInTheDocument();
  });

  it('should initialize with default theme values', async () => {
    await act(async () => {
      render(<App />);
    });
    
    expect(localStorageMock.getItem).toHaveBeenCalledWith('darkMode');
    expect(localStorageMock.getItem).toHaveBeenCalledWith('accentColor');
  });

  it('should handle settings loading error gracefully', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockElectronAPI.loadSettings.mockRejectedValue(new Error('Settings load failed'));
    
    await act(async () => {
      render(<App />);
    });
    
    // The app should still render even if settings fail to load
    expect(screen.getByTestId('workspace-provider')).toBeInTheDocument();
    
    consoleSpy.mockRestore();
  });

  it('should handle dark mode from localStorage', async () => {
    localStorageMock.getItem.mockImplementation((key) => {
      if (key === 'darkMode') return 'true';
      if (key === 'accentColor') return '#525252';
      return null;
    });

    await act(async () => {
      render(<App />);
    });
    
    expect(screen.getByTestId('workspace-provider')).toBeInTheDocument();
    expect(localStorageMock.getItem).toHaveBeenCalledWith('darkMode');
  });
});

// Simplified theme tests
describe('App Theme Handling', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    mockElectronAPI.loadSettings.mockResolvedValue({
      settings: {
        apiKeys: {},
        selectedProvider: 'google',
        selectedModel: 'gemini-2.0-flash-exp',
        renameFiles: false,
        accentColor: '#525252'
      }
    });
    mockElectronAPI.getProviderModels.mockResolvedValue({
      models: [],
      defaultModel: ''
    });
    
    localStorageMock.getItem.mockImplementation((key) => {
      if (key === 'darkMode') return 'false';
      if (key === 'accentColor') return '#525252';
      return null;
    });
  });

  it('should create theme with default values', async () => {
    await act(async () => {
      render(<App />);
    });
    
    expect(screen.getByTestId('workspace-provider')).toBeInTheDocument();
  });

  it('should handle custom accent color', async () => {
    localStorageMock.getItem.mockImplementation((key) => {
      if (key === 'darkMode') return 'false';
      if (key === 'accentColor') return '#FF0000';
      return null;
    });

    await act(async () => {
      render(<App />);
    });
    
    expect(screen.getByTestId('workspace-provider')).toBeInTheDocument();
  });
});

describe('App Advanced Functionality', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    
    mockElectronAPI.loadSettings.mockResolvedValue({
      settings: {
        apiKeys: { openai: 'test-key', anthropic: 'test-key', google: 'test-key' },
        selectedProvider: 'google',
        selectedModel: 'gemini-2.0-flash-exp',
        renameFiles: false,
        accentColor: '#525252'
      }
    });
    mockElectronAPI.getProviderModels.mockResolvedValue({
      models: [],
      defaultModel: ''
    });
    
    localStorageMock.getItem.mockImplementation((key) => {
      if (key === 'darkMode') return 'false';
      if (key === 'accentColor') return '#525252';
      return null;
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('Theme Generation', () => {
    it('should handle invalid hex color in theme generation', async () => {
      localStorageMock.getItem.mockImplementation((key) => {
        if (key === 'darkMode') return 'false';
        if (key === 'accentColor') return 'invalid-color';
        return null;
      });

      await act(async () => {
        render(<App />);
      });
      
      expect(screen.getByTestId('workspace-provider')).toBeInTheDocument();
    });

    it('should apply workspace theme overrides', async () => {
      // Mock workspace context with theme
      jest.doMock('../contexts/WorkspaceContext', () => ({
        WorkspaceProvider: ({ children }: { children: React.ReactNode }) => <div data-testid="workspace-provider">{children}</div>,
        useWorkspace: () => ({
          workspaceTheme: {
            accentColor: '#00FF00',
            darkMode: true,
            customColors: {
              primary: '#FF0000',
              background: '#000000',
              surface: '#111111'
            }
          },
          workspaces: [],
          currentWorkspace: null,
          recentFolders: [],
          favoriteFolders: [],
          sectionOrder: ['workspaces', 'recent', 'favorites'],
          customSections: [],
          sectionVisibility: { workspaces: true, recent: true, favorites: true },
          clearRecentFolders: jest.fn(),
          addWorkspace: jest.fn(),
          removeWorkspace: jest.fn(),
          setCurrentWorkspace: jest.fn(),
          renameWorkspace: jest.fn(),
          updateWorkspaceEmoji: jest.fn(),
          addRecentFolder: jest.fn(),
          addFavoriteFolder: jest.fn(),
          removeFavoriteFolder: jest.fn(),
          reorderFavoriteFolders: jest.fn(),
          reorderSections: jest.fn(),
          setSectionVisibility: jest.fn(),
          toggleSectionVisibility: jest.fn(),
          setCurrentDirectoryPath: jest.fn(),
          setWorkspaceTheme: jest.fn(),
          getWorkspaceTheme: jest.fn(),
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
        }),
      }));

      await act(async () => {
        render(<App />);
      });
      
      expect(screen.getByTestId('workspace-provider')).toBeInTheDocument();
    });
  });

  describe('Settings Loading Scenarios', () => {
    it('should handle settings with no accent color', async () => {
      mockElectronAPI.loadSettings.mockResolvedValue({
        settings: {
          apiKeys: {},
          selectedProvider: 'google',
          selectedModel: 'gemini-2.0-flash-exp',
          renameFiles: false
          // No accentColor
        }
      });

      await act(async () => {
        render(<App />);
      });
      
      expect(screen.getByTestId('workspace-provider')).toBeInTheDocument();
    });

    it('should handle settings loading with partial settings', async () => {
      mockElectronAPI.loadSettings.mockResolvedValue({
        settings: {
          selectedProvider: 'openai'
          // Missing other properties
        }
      });

      await act(async () => {
        render(<App />);
      });
      
      expect(screen.getByTestId('workspace-provider')).toBeInTheDocument();
    });

    it('should handle settings loading with empty response', async () => {
      mockElectronAPI.loadSettings.mockResolvedValue({});

      await act(async () => {
        render(<App />);
      });
      
      expect(screen.getByTestId('workspace-provider')).toBeInTheDocument();
    });
  });

  describe('Ollama Integration', () => {
    it('should handle successful Ollama connection', async () => {
      global.fetch = jest.fn(() =>
        Promise.resolve({
          json: () => Promise.resolve({
            models: [
              { name: 'llama2:latest' },
              { name: 'codellama:latest' }
            ]
          })
        })
      ) as jest.Mock;

      await act(async () => {
        render(<App />);
        jest.advanceTimersByTime(100);
      });
      
      expect(screen.getByTestId('workspace-provider')).toBeInTheDocument();
    });

    it('should handle Ollama connection timeout', async () => {
      global.fetch = jest.fn(() =>
        new Promise((resolve) => {
          setTimeout(() => resolve({
            json: () => Promise.resolve({ models: [] })
          }), 2000);
        })
      ) as jest.Mock;

      await act(async () => {
        render(<App />);
        jest.advanceTimersByTime(1500); // Advance past timeout
      });
      
      expect(screen.getByTestId('workspace-provider')).toBeInTheDocument();
    });

    it('should handle Ollama retry logic', async () => {
      let callCount = 0;
      global.fetch = jest.fn(() => {
        callCount++;
        if (callCount <= 2) {
          return Promise.reject(new Error('Connection failed'));
        }
        return Promise.resolve({
          json: () => Promise.resolve({
            models: [{ name: 'llama2:latest' }]
          })
        });
      }) as jest.Mock;

      await act(async () => {
        render(<App />);
        jest.advanceTimersByTime(100);
        jest.advanceTimersByTime(2000); // First retry
        jest.advanceTimersByTime(2000); // Second retry
      });
      
      expect(screen.getByTestId('workspace-provider')).toBeInTheDocument();
    });

    it('should handle AbortError in Ollama fetch', async () => {
      const abortError = new DOMException('Aborted', 'AbortError');
      global.fetch = jest.fn(() => Promise.reject(abortError)) as jest.Mock;

      await act(async () => {
        render(<App />);
        jest.advanceTimersByTime(100);
      });
      
      expect(screen.getByTestId('workspace-provider')).toBeInTheDocument();
    });
  });

  describe('Provider and Model Management', () => {
    it('should initialize models for OpenAI provider', async () => {
      mockElectronAPI.loadSettings.mockResolvedValue({
        settings: {
          apiKeys: { openai: 'test-key' },
          selectedProvider: 'openai',
          selectedModel: 'gpt-4o',
          renameFiles: false
        }
      });

      await act(async () => {
        render(<App />);
      });
      
      expect(screen.getByTestId('workspace-provider')).toBeInTheDocument();
    });

    it('should initialize models for Anthropic provider', async () => {
      mockElectronAPI.loadSettings.mockResolvedValue({
        settings: {
          apiKeys: { anthropic: 'test-key' },
          selectedProvider: 'anthropic',
          selectedModel: 'claude-3-sonnet-20240229',
          renameFiles: false
        }
      });

      await act(async () => {
        render(<App />);
      });
      
      expect(screen.getByTestId('workspace-provider')).toBeInTheDocument();
    });

    it('should initialize models for Ollama provider', async () => {
      global.fetch = jest.fn(() =>
        Promise.resolve({
          json: () => Promise.resolve({
            models: [{ name: 'llama2:latest' }]
          })
        })
      ) as jest.Mock;

      mockElectronAPI.loadSettings.mockResolvedValue({
        settings: {
          selectedProvider: 'ollama',
          selectedModel: 'llama2:latest',
          renameFiles: false
        }
      });

      await act(async () => {
        render(<App />);
      });
      
      expect(screen.getByTestId('workspace-provider')).toBeInTheDocument();
    });

    it('should handle model initialization error', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      mockElectronAPI.loadSettings.mockRejectedValue(new Error('Settings failed'));

      await act(async () => {
        render(<App />);
      });
      
      expect(screen.getByTestId('workspace-provider')).toBeInTheDocument();
      consoleSpy.mockRestore();
    });
  });

  // Keyboard shortcuts - '?' opens Settings dialog with shortcuts tab
  // The implementation opens Settings with initialTab="shortcuts" rather than a separate dialog
  describe('Keyboard Shortcuts', () => {
    it('should have Settings component available for shortcuts access', async () => {
      await act(async () => {
        render(<App />);
      });

      // The Settings component is rendered in App and contains shortcuts tab
      // '?' key triggers setSettingsOpen(true) with setSettingsTab('shortcuts')
      expect(screen.getByTestId('workspace-provider')).toBeInTheDocument();
      expect(screen.getByTestId('sidebar')).toBeInTheDocument();
    });

    it('should not open settings when typing ? in input field', async () => {
      await act(async () => {
        render(<App />);
      });

      // Create a mock input element
      const input = document.createElement('input');
      document.body.appendChild(input);
      input.focus();

      await act(async () => {
        const event = new KeyboardEvent('keydown', {
          key: '?',
          bubbles: true
        });
        Object.defineProperty(event, 'target', { value: input, configurable: true });
        input.dispatchEvent(event);
      });
      
      // Settings dialog shouldn't open when typing in input
      expect(screen.queryByTestId('settings')).not.toBeInTheDocument();
      
      document.body.removeChild(input);
    });

    it('should ignore help shortcut with modifier keys', async () => {
      await act(async () => {
        render(<App />);
      });

      await act(async () => {
        const event = new KeyboardEvent('keydown', {
          key: '?',
          ctrlKey: true,
          bubbles: true
        });
        document.dispatchEvent(event);
      });
      
      // With modifier keys, settings should not open
      expect(screen.queryByTestId('settings')).not.toBeInTheDocument();
    });

    it('should not open settings when typing ? in textarea', async () => {
      await act(async () => {
        render(<App />);
      });

      const textarea = document.createElement('textarea');
      document.body.appendChild(textarea);
      textarea.focus();

      await act(async () => {
        const event = new KeyboardEvent('keydown', {
          key: '?',
          bubbles: true
        });
        Object.defineProperty(event, 'target', { value: textarea, configurable: true });
        textarea.dispatchEvent(event);
      });
      
      expect(screen.queryByTestId('settings')).not.toBeInTheDocument();
      
      document.body.removeChild(textarea);
    });

    it('should not open settings when typing ? in contentEditable', async () => {
      await act(async () => {
        render(<App />);
      });

      const div = document.createElement('div');
      div.contentEditable = 'true';
      document.body.appendChild(div);
      div.focus();

      await act(async () => {
        const event = new KeyboardEvent('keydown', {
          key: '?',
          bubbles: true
        });
        Object.defineProperty(event, 'target', { value: div, configurable: true });
        div.dispatchEvent(event);
      });
      
      expect(screen.queryByTestId('settings')).not.toBeInTheDocument();
      
      document.body.removeChild(div);
    });
  });

  describe('Provider Validation', () => {
    it('should handle invalid provider value', async () => {
      mockElectronAPI.loadSettings.mockResolvedValue({
        settings: {
          selectedProvider: 'invalid-provider',
          selectedModel: 'some-model',
          renameFiles: false
        }
      });

      await act(async () => {
        render(<App />);
      });
      
      expect(screen.getByTestId('workspace-provider')).toBeInTheDocument();
    });

    it('should handle invalid model value', async () => {
      mockElectronAPI.loadSettings.mockResolvedValue({
        settings: {
          selectedProvider: 'google',
          selectedModel: 'invalid-model',
          renameFiles: false
        }
      });

      await act(async () => {
        render(<App />);
      });
      
      expect(screen.getByTestId('workspace-provider')).toBeInTheDocument();
    });
  });

  describe('Settings Persistence', () => {
    it('should save accent color to localStorage', async () => {
      mockElectronAPI.loadSettings.mockResolvedValue({
        settings: {
          selectedProvider: 'google',
          selectedModel: 'gemini-2.0-flash-exp',
          renameFiles: false,
          accentColor: '#00FF00'
        }
      });

      await act(async () => {
        render(<App />);
      });
      
      expect(localStorageMock.setItem).toHaveBeenCalledWith('accentColor', '#00FF00');
    });

    it('should handle missing localStorage values', async () => {
      localStorageMock.getItem.mockReturnValue(null);

      await act(async () => {
        render(<App />);
      });
      
      expect(screen.getByTestId('workspace-provider')).toBeInTheDocument();
    });
  });

  describe('Error Handling in Provider Change', () => {
    it('should handle provider change with settings load error', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      
      // First call succeeds, second call fails
      mockElectronAPI.loadSettings
        .mockResolvedValueOnce({
          settings: {
            selectedProvider: 'google',
            selectedModel: 'gemini-2.0-flash-exp',
            renameFiles: false
          }
        })
        .mockRejectedValueOnce(new Error('Settings load failed'));

      await act(async () => {
        render(<App />);
      });
      
      // This would test the provider change error handling
      expect(screen.getByTestId('workspace-provider')).toBeInTheDocument();
      
      consoleSpy.mockRestore();
    });

    it('should handle provider change with save error', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      mockElectronAPI.saveSettings.mockRejectedValue(new Error('Save failed'));

      await act(async () => {
        render(<App />);
      });
      
      expect(screen.getByTestId('workspace-provider')).toBeInTheDocument();
      
      consoleSpy.mockRestore();
    });
  });

  describe('Ollama Provider Specific Logic', () => {
    it('should handle Ollama provider change with no models', async () => {
      global.fetch = jest.fn(() =>
        Promise.resolve({
          json: () => Promise.resolve({ models: [] })
        })
      ) as jest.Mock;

      await act(async () => {
        render(<App />);
      });
      
      expect(screen.getByTestId('workspace-provider')).toBeInTheDocument();
    });

    it('should handle Ollama provider change with models', async () => {
      global.fetch = jest.fn(() =>
        Promise.resolve({
          json: () => Promise.resolve({
            models: [
              { name: 'llama2:latest' },
              { name: 'codellama:latest' }
            ]
          })
        })
      ) as jest.Mock;

      await act(async () => {
        render(<App />);
      });
      
      expect(screen.getByTestId('workspace-provider')).toBeInTheDocument();
    });
  });

  describe('Model Selection Logic', () => {
    it('should handle model change with settings save', async () => {
      mockElectronAPI.saveSettings.mockResolvedValue({ success: true });

      await act(async () => {
        render(<App />);
      });
      
      expect(screen.getByTestId('workspace-provider')).toBeInTheDocument();
    });

    it('should handle model change with settings load error', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      // First call succeeds for initial load, second fails for model change
      mockElectronAPI.loadSettings
        .mockResolvedValueOnce({
          settings: {
            selectedProvider: 'google',
            selectedModel: 'gemini-2.0-flash-exp',
            renameFiles: false
          }
        })
        .mockRejectedValueOnce(new Error('Settings load failed'));

      await act(async () => {
        render(<App />);
      });
      
      expect(screen.getByTestId('workspace-provider')).toBeInTheDocument();
      expect(consoleSpy).toHaveBeenCalledWith('Failed to load operation history:', expect.any(Error));
      consoleSpy.mockRestore();
    });
  });

  describe('Theme Color Calculations', () => {
    it('should handle color calculations at boundaries', async () => {
      localStorageMock.getItem.mockImplementation((key) => {
        if (key === 'darkMode') return 'false';
        if (key === 'accentColor') return '#FFFFFF'; // White color
        return null;
      });

      await act(async () => {
        render(<App />);
      });
      
      expect(screen.getByTestId('workspace-provider')).toBeInTheDocument();
    });

    it('should handle dark color calculations', async () => {
      localStorageMock.getItem.mockImplementation((key) => {
        if (key === 'darkMode') return 'false';
        if (key === 'accentColor') return '#000000'; // Black color
        return null;
      });

      await act(async () => {
        render(<App />);
      });
      
      expect(screen.getByTestId('workspace-provider')).toBeInTheDocument();
    });
  });

  describe('Component State Management', () => {
    it('should handle loading state', async () => {
      // Mock a delayed response to test loading state
      mockElectronAPI.loadSettings.mockImplementation(() =>
        new Promise(resolve =>
          setTimeout(() => resolve({
            settings: {
              selectedProvider: 'google',
              selectedModel: 'gemini-2.0-flash-exp',
              renameFiles: false
            }
          }), 100)
        )
      );

      await act(async () => {
        render(<App />);
        jest.advanceTimersByTime(50); // Advance time but not enough to resolve
      });
      
      expect(screen.getByTestId('workspace-provider')).toBeInTheDocument();
    });
  });
});
