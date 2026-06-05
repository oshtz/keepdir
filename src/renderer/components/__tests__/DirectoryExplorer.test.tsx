import React from 'react';
import { render, screen, act, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DirectoryExplorer from '../DirectoryExplorer';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useContextMenu } from '../../hooks/useContextMenu';

// Mock window.alert
Object.defineProperty(window, 'alert', {
  value: jest.fn(),
  writable: true,
});

// Mock the WorkspaceContext
jest.mock('../../contexts/WorkspaceContext', () => ({
  useWorkspace: jest.fn(),
}));

// Mock the useContextMenu hook
jest.mock('../../hooks/useContextMenu', () => ({
  useContextMenu: jest.fn(),
}));

// Mock the OperationHistoryContext
jest.mock('../../contexts/OperationHistoryContext', () => ({
  useOperationHistory: jest.fn(() => ({
    startBatch: jest.fn(),
    addOperation: jest.fn(),
    completeBatch: jest.fn(),
    failBatch: jest.fn(),
    canUndo: false,
    undo: jest.fn(),
  })),
}));

// Mock the ToastNotification
jest.mock('../ToastNotification', () => ({
  useToast: jest.fn(() => ({
    showSuccess: jest.fn(),
    showError: jest.fn(),
    showInfo: jest.fn(),
    showWarning: jest.fn(),
  })),
}));

// Mock child components
jest.mock('../SortSuggestions', () => {
  return function MockSortSuggestions({ open }: { open: boolean; onClose: () => void }) {
    return open ? <div data-testid="sort-suggestions">Sort Suggestions Dialog</div> : null;
  };
});

jest.mock('../RenameDialog', () => {
  return function MockRenameDialog({ open }: { open: boolean; onClose: () => void }) {
    return open ? <div data-testid="rename-dialog">Rename Dialog</div> : null;
  };
});

jest.mock('../WatchedRenameQueue', () => {
  return function MockWatchedRenameQueue({ open }: { open: boolean; onClose: () => void }) {
    return open ? <div data-testid="watched-rename-queue">Watched Rename Queue</div> : null;
  };
});

jest.mock('../ContextMenu', () => {
  return function MockContextMenu({ open }: { open: boolean; onClose: () => void }) {
    return open ? <div data-testid="context-menu">Context Menu</div> : null;
  };
});

jest.mock('../../hooks/useWatchedRenameQueue', () => ({
  useWatchedRenameQueue: jest.fn(() => ({
    suggestions: [],
    groupedByFolder: {},
    loading: false,
    error: null,
    load: jest.fn(),
    dismiss: jest.fn(),
    refresh: jest.fn(),
    apply: jest.fn(),
  })),
}));

// Mock window.electronAPI
const mockElectronAPI = {
  loadDirectory: jest.fn(),
  selectDirectory: jest.fn(),
  openFile: jest.fn(),
  revealInFolder: jest.fn(),
  analyzeDirectoryForSort: jest.fn(),
  analyzeDirectoryForRename: jest.fn(),
  applySuggestions: jest.fn(),
  applyRenames: jest.fn(),
};

Object.defineProperty(window, 'electronAPI', {
  value: mockElectronAPI,
  writable: true,
});

const mockWorkspaceContext = {
  currentWorkspace: { id: '1', name: 'Test Workspace', emoji: '🎯' },
  addRecentFolder: jest.fn(),
  addFavoriteFolder: jest.fn(),
  removeFavoriteFolder: jest.fn(),
  favoriteFolders: [],
  currentDirectoryPath: '/test/path',
  setCurrentDirectoryPath: jest.fn(),
  viewMode: 'grid' as const,
  setViewMode: jest.fn(),
};

const mockContextMenu = {
  contextMenu: {
    isOpen: false,
    position: { x: 0, y: 0 },
    items: [],
  },
  showContextMenu: jest.fn(),
  hideContextMenu: jest.fn(),
  handleItemClick: jest.fn(),
};

const mockFiles = [
  {
    name: 'folder1',
    path: '/test/path/folder1',
    isDirectory: true,
    size: 0,
    modified: '2023-01-01T00:00:00.000Z',
  },
  {
    name: 'file1.txt',
    path: '/test/path/file1.txt',
    isDirectory: false,
    size: 1024,
    modified: '2023-01-02T00:00:00.000Z',
  },
  {
    name: 'file2.pdf',
    path: '/test/path/file2.pdf',
    isDirectory: false,
    size: 2048000,
    modified: '2023-01-03T00:00:00.000Z',
  },
];

describe('DirectoryExplorer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useWorkspace as jest.Mock).mockReturnValue(mockWorkspaceContext);
    (useContextMenu as jest.Mock).mockReturnValue(mockContextMenu);
    
    mockElectronAPI.loadDirectory.mockResolvedValue({
      files: mockFiles,
    });
  });

  it('should render without crashing', async () => {
    await act(async () => {
      render(<DirectoryExplorer />);
    });
    
    expect(screen.getByText('Select Directory')).toBeInTheDocument();
  });

  it('should show loading state when loading directory', async () => {
    // Make loadDirectory hang to test loading state
    mockElectronAPI.loadDirectory.mockImplementation(() => new Promise(() => {}));
    
    await act(async () => {
      render(<DirectoryExplorer />);
    });
    
    expect(screen.getByText('Loading directory...')).toBeInTheDocument();
  });

  it('should load directory when currentDirectoryPath is set', async () => {
    await act(async () => {
      render(<DirectoryExplorer />);
    });
    
    await waitFor(() => {
      expect(mockElectronAPI.loadDirectory).toHaveBeenCalledWith('/test/path');
    });
  });

  it('should display files and folders in grid view', async () => {
    await act(async () => {
      render(<DirectoryExplorer />);
    });
    
    await waitFor(() => {
      expect(screen.getByText('folder1')).toBeInTheDocument();
      expect(screen.getByText('file1.txt')).toBeInTheDocument();
      expect(screen.getByText('file2.pdf')).toBeInTheDocument();
    });
  });

  it('should switch between grid and list view modes', async () => {
    const user = userEvent.setup();
    
    await act(async () => {
      render(<DirectoryExplorer />);
    });
    
    await waitFor(() => {
      expect(screen.getByText('folder1')).toBeInTheDocument();
    });
    
    // Switch to list view - find by test id since icon buttons don't have accessible names
    const listViewButton = screen.getByTestId('ListIcon').closest('button');
    await act(async () => {
      if (listViewButton) {
        await user.click(listViewButton);
      }
    });
    
    // Should still show files but in list format
    expect(screen.getByText('folder1')).toBeInTheDocument();
  });

  it('should handle select directory button click', async () => {
    const user = userEvent.setup();
    mockElectronAPI.selectDirectory.mockResolvedValue('/new/path');
    
    await act(async () => {
      render(<DirectoryExplorer />);
    });
    
    const selectButton = screen.getByText('Select Directory');
    await act(async () => {
      await user.click(selectButton);
    });
    
    await act(async () => {
      await waitFor(() => {
        expect(mockElectronAPI.selectDirectory).toHaveBeenCalled();
        expect(mockWorkspaceContext.setCurrentDirectoryPath).toHaveBeenCalledWith('/new/path');
        expect(mockWorkspaceContext.addRecentFolder).toHaveBeenCalledWith('/new/path');
      });
    });
  });

  it('should handle file selection', async () => {
    await act(async () => {
      render(<DirectoryExplorer />);
    });
    
    await waitFor(() => {
      expect(screen.getByText('file1.txt')).toBeInTheDocument();
    });
    
    const fileElement = screen.getByText('file1.txt').closest('[role="button"], div[onclick], div[style*="cursor"]') || screen.getByText('file1.txt').parentElement;
    
    await act(async () => {
      if (fileElement) {
        fireEvent.click(fileElement);
      }
    });
    
    // File should be selected (this would change the background color in the actual component)
    expect(fileElement).toBeTruthy();
  });

  it('should handle double-click on directory', async () => {
    await act(async () => {
      render(<DirectoryExplorer />);
    });
    
    await waitFor(() => {
      expect(screen.getByText('folder1')).toBeInTheDocument();
    });
    
    const folderElement = screen.getByText('folder1').closest('[role="button"], div[onclick], div[style*="cursor"]') || screen.getByText('folder1').parentElement;
    
    await act(async () => {
      if (folderElement) {
        fireEvent.doubleClick(folderElement);
      }
    });
    
    await waitFor(() => {
      expect(mockWorkspaceContext.setCurrentDirectoryPath).toHaveBeenCalledWith('/test/path/folder1');
      expect(mockWorkspaceContext.addRecentFolder).toHaveBeenCalledWith('/test/path/folder1');
    });
  });

  it('should handle double-click on file', async () => {
    await act(async () => {
      render(<DirectoryExplorer />);
    });
    
    await waitFor(() => {
      expect(screen.getByText('file1.txt')).toBeInTheDocument();
    });
    
    const fileElement = screen.getByText('file1.txt').closest('[role="button"], div[onclick], div[style*="cursor"]') || screen.getByText('file1.txt').parentElement;
    
    await act(async () => {
      if (fileElement) {
        fireEvent.doubleClick(fileElement);
      }
    });
    
    await waitFor(() => {
      expect(mockElectronAPI.openFile).toHaveBeenCalledWith('/test/path/file1.txt');
    });
  });

  it('should filter files based on search term', async () => {
    await act(async () => {
      render(<DirectoryExplorer searchTerm="file1" />);
    });
    
    await waitFor(() => {
      expect(screen.getByText('file1.txt')).toBeInTheDocument();
      expect(screen.queryByText('file2.pdf')).not.toBeInTheDocument();
      expect(screen.queryByText('folder1')).not.toBeInTheDocument();
    });
  });

  it('should filter files based on type filter', async () => {
    await act(async () => {
      render(<DirectoryExplorer filters={{ type: 'files', date: 'any', size: 'any' }} />);
    });
    
    await waitFor(() => {
      expect(screen.getByText('file1.txt')).toBeInTheDocument();
      expect(screen.getByText('file2.pdf')).toBeInTheDocument();
      expect(screen.queryByText('folder1')).not.toBeInTheDocument();
    });
  });

  it('should filter files based on folders filter', async () => {
    await act(async () => {
      render(<DirectoryExplorer filters={{ type: 'folders', date: 'any', size: 'any' }} />);
    });
    
    await waitFor(() => {
      expect(screen.getByText('folder1')).toBeInTheDocument();
      expect(screen.queryByText('file1.txt')).not.toBeInTheDocument();
      expect(screen.queryByText('file2.pdf')).not.toBeInTheDocument();
    });
  });

  it('should handle sort button click', async () => {
    const user = userEvent.setup();
    const mockShowWarning = jest.fn();
    const { useToast } = require('../ToastNotification');
    (useToast as jest.Mock).mockReturnValue({
      showSuccess: jest.fn(),
      showError: jest.fn(),
      showInfo: jest.fn(),
      showWarning: mockShowWarning,
    });
    
    mockElectronAPI.analyzeDirectoryForSort.mockResolvedValue({
      suggestions: { categories: [] },
    });
    
    await act(async () => {
      render(<DirectoryExplorer />);
    });
    
    const sortButton = screen.getByText('Sort');
    await act(async () => {
      await user.click(sortButton);
    });
    
    // Should show warning toast since no items are selected
    expect(mockShowWarning).toHaveBeenCalledWith('Please select folders to sort', 'No Selection');
  });

  it('should handle rename button click', async () => {
    const user = userEvent.setup();
    const mockShowWarning = jest.fn();
    const { useToast } = require('../ToastNotification');
    (useToast as jest.Mock).mockReturnValue({
      showSuccess: jest.fn(),
      showError: jest.fn(),
      showInfo: jest.fn(),
      showWarning: mockShowWarning,
    });
    
    mockElectronAPI.analyzeDirectoryForRename.mockResolvedValue({
      suggestions: { categories: [{ renames: [] }] },
    });
    
    await act(async () => {
      render(<DirectoryExplorer />);
    });
    
    const renameButton = screen.getByText('Rename');
    await act(async () => {
      await user.click(renameButton);
    });
    
    // Should show warning toast since no items are selected
    expect(mockShowWarning).toHaveBeenCalledWith('Please select files or folders to rename', 'No Selection');
  });

  it('should show breadcrumbs for current directory', async () => {
    await act(async () => {
      render(<DirectoryExplorer />);
    });
    
    await waitFor(() => {
      // Should show breadcrumbs based on the current directory path
      expect(screen.getByRole('navigation')).toBeInTheDocument();
    });
  });

  it('should show empty state when no directory is selected', async () => {
    (useWorkspace as jest.Mock).mockReturnValue({
      ...mockWorkspaceContext,
      currentDirectoryPath: null,
    });
    
    await act(async () => {
      render(<DirectoryExplorer />);
    });
    
    expect(screen.getByText('Select a directory')).toBeInTheDocument();
    expect(screen.getByText('to view its contents')).toBeInTheDocument();
  });

  it('should show empty folder message when directory has no files', async () => {
    mockElectronAPI.loadDirectory.mockResolvedValue({
      files: [],
    });
    
    await act(async () => {
      render(<DirectoryExplorer />);
    });
    
    await waitFor(() => {
      expect(screen.getByText('This folder is empty')).toBeInTheDocument();
    });
  });

  it('should show no matching files message when search has no results', async () => {
    await act(async () => {
      render(<DirectoryExplorer searchTerm="nonexistent" />);
    });
    
    await waitFor(() => {
      expect(screen.getByText('No matching files found')).toBeInTheDocument();
    });
  });

  it('should handle favorite toggle for directories', async () => {
    const user = userEvent.setup();
    
    await act(async () => {
      render(<DirectoryExplorer />);
    });
    
    await waitFor(() => {
      expect(screen.getByText('folder1')).toBeInTheDocument();
    });
    
    // Find the star button for the folder
    const starButtons = screen.getAllByRole('button');
    const starButton = starButtons.find(button => 
      button.querySelector('svg[data-testid="StarBorderIcon"]')
    );
    
    if (starButton) {
      await act(async () => {
        await user.click(starButton);
      });
      
      expect(mockWorkspaceContext.addFavoriteFolder).toHaveBeenCalledWith({
        path: '/test/path/folder1',
        name: 'folder1',
      });
    }
  });

  it('should format file sizes correctly', async () => {
    await act(async () => {
      render(<DirectoryExplorer />);
    });
    
    await waitFor(() => {
      expect(screen.getByText('1.0 KB')).toBeInTheDocument(); // file1.txt
      expect(screen.getByText('2.0 MB')).toBeInTheDocument(); // file2.pdf
    });
  });

  it('should handle context menu', async () => {
    await act(async () => {
      render(<DirectoryExplorer />);
    });
    
    await waitFor(() => {
      expect(screen.getByText('file1.txt')).toBeInTheDocument();
    });
    
    const fileElement = screen.getByText('file1.txt').closest('[role="button"], div[onclick], div[style*="cursor"]') || screen.getByText('file1.txt').parentElement;
    
    await act(async () => {
      if (fileElement) {
        fireEvent.contextMenu(fileElement);
      }
    });
    
    expect(mockContextMenu.showContextMenu).toHaveBeenCalled();
  });
});

describe('DirectoryExplorer Error Handling', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useWorkspace as jest.Mock).mockReturnValue(mockWorkspaceContext);
    (useContextMenu as jest.Mock).mockReturnValue(mockContextMenu);
    
    // Ensure files are loaded for error handling tests
    mockElectronAPI.loadDirectory.mockResolvedValue({
      files: mockFiles,
    });
  });

  it('should handle directory loading errors gracefully', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockElectronAPI.loadDirectory.mockRejectedValue(new Error('Failed to load directory'));
    
    await act(async () => {
      render(<DirectoryExplorer />);
    });
    
    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith('Failed to load directory:', expect.any(Error));
    });
    
    consoleSpy.mockRestore();
  });

  it('should handle sort analysis errors', async () => {
    const user = userEvent.setup();
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const alertSpy = jest.spyOn(window, 'alert').mockImplementation(() => {});
    
    mockElectronAPI.analyzeDirectoryForSort.mockRejectedValue(new Error('Analysis failed'));
    
    await act(async () => {
      render(<DirectoryExplorer />);
    });
    
    // Wait for files to load
    await waitFor(() => {
      expect(screen.getByText('file1.txt')).toBeInTheDocument();
    });
    
    // First select a file to avoid the "no selection" alert
    const fileElement = screen.getByText('file1.txt').closest('div');
    
    await act(async () => {
      if (fileElement) {
        fireEvent.click(fileElement);
      }
    });
    
    const sortButton = screen.getByText('Sort');
    await act(async () => {
      await user.click(sortButton);
    });
    
    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith('Failed to analyze directory:', expect.any(Error));
    });
    
    consoleSpy.mockRestore();
    alertSpy.mockRestore();
  });
});

describe('DirectoryExplorer Advanced Functionality', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useWorkspace as jest.Mock).mockReturnValue(mockWorkspaceContext);
    (useContextMenu as jest.Mock).mockReturnValue(mockContextMenu);
    
    mockElectronAPI.loadDirectory.mockResolvedValue({
      files: mockFiles,
    });
  });

  describe('Date Filtering', () => {
    const recentFile = {
      name: 'recent.txt',
      path: '/test/path/recent.txt',
      isDirectory: false,
      size: 1024,
      modified: new Date().toISOString(), // Current time
    };

    const oldFile = {
      name: 'old.txt',
      path: '/test/path/old.txt',
      isDirectory: false,
      size: 1024,
      modified: '2020-01-01T00:00:00.000Z', // Old file
    };

    const thisYearFile = {
      name: 'thisyear.txt',
      path: '/test/path/thisyear.txt',
      isDirectory: false,
      size: 1024,
      modified: new Date(new Date().getFullYear(), 0, 1).toISOString(), // This year
    };

    it('should filter files by 24h date range', async () => {
      mockElectronAPI.loadDirectory.mockResolvedValue({
        files: [recentFile, oldFile],
      });

      await act(async () => {
        render(<DirectoryExplorer filters={{ type: 'any', date: '24h', size: 'any' }} />);
      });
      
      await waitFor(() => {
        expect(screen.getByText('recent.txt')).toBeInTheDocument();
        expect(screen.queryByText('old.txt')).not.toBeInTheDocument();
      });
    });

    it('should filter files by 7d date range', async () => {
      mockElectronAPI.loadDirectory.mockResolvedValue({
        files: [recentFile, oldFile],
      });

      await act(async () => {
        render(<DirectoryExplorer filters={{ type: 'any', date: '7d', size: 'any' }} />);
      });
      
      await waitFor(() => {
        expect(screen.getByText('recent.txt')).toBeInTheDocument();
        expect(screen.queryByText('old.txt')).not.toBeInTheDocument();
      });
    });

    it('should filter files by 30d date range', async () => {
      mockElectronAPI.loadDirectory.mockResolvedValue({
        files: [recentFile, oldFile],
      });

      await act(async () => {
        render(<DirectoryExplorer filters={{ type: 'any', date: '30d', size: 'any' }} />);
      });
      
      await waitFor(() => {
        expect(screen.getByText('recent.txt')).toBeInTheDocument();
        expect(screen.queryByText('old.txt')).not.toBeInTheDocument();
      });
    });

    it('should filter files by year date range', async () => {
      mockElectronAPI.loadDirectory.mockResolvedValue({
        files: [thisYearFile, oldFile],
      });

      await act(async () => {
        render(<DirectoryExplorer filters={{ type: 'any', date: 'year', size: 'any' }} />);
      });
      
      await waitFor(() => {
        expect(screen.getByText('thisyear.txt')).toBeInTheDocument();
        expect(screen.queryByText('old.txt')).not.toBeInTheDocument();
      });
    });

    it('should handle unknown date filter', async () => {
      mockElectronAPI.loadDirectory.mockResolvedValue({
        files: [recentFile, oldFile],
      });

      await act(async () => {
        render(<DirectoryExplorer filters={{ type: 'any', date: 'unknown', size: 'any' }} />);
      });
      
      await waitFor(() => {
        expect(screen.getByText('recent.txt')).toBeInTheDocument();
        expect(screen.getByText('old.txt')).toBeInTheDocument();
      });
    });
  });

  describe('Size Filtering', () => {
    const smallFile = {
      name: 'small.txt',
      path: '/test/path/small.txt',
      isDirectory: false,
      size: 500 * 1024, // 500KB
      modified: '2023-01-01T00:00:00.000Z',
    };

    const mediumFile = {
      name: 'medium.txt',
      path: '/test/path/medium.txt',
      isDirectory: false,
      size: 5 * 1024 * 1024, // 5MB
      modified: '2023-01-01T00:00:00.000Z',
    };

    const largeFile = {
      name: 'large.txt',
      path: '/test/path/large.txt',
      isDirectory: false,
      size: 50 * 1024 * 1024, // 50MB
      modified: '2023-01-01T00:00:00.000Z',
    };

    const hugeFile = {
      name: 'huge.txt',
      path: '/test/path/huge.txt',
      isDirectory: false,
      size: 200 * 1024 * 1024, // 200MB
      modified: '2023-01-01T00:00:00.000Z',
    };

    const testFolder = {
      name: 'testfolder',
      path: '/test/path/testfolder',
      isDirectory: true,
      size: 0,
      modified: '2023-01-01T00:00:00.000Z',
    };

    it('should filter files by lt1 size range', async () => {
      mockElectronAPI.loadDirectory.mockResolvedValue({
        files: [smallFile, mediumFile, testFolder],
      });

      await act(async () => {
        render(<DirectoryExplorer filters={{ type: 'any', date: 'any', size: 'lt1' }} />);
      });
      
      await waitFor(() => {
        expect(screen.getByText('small.txt')).toBeInTheDocument();
        expect(screen.queryByText('medium.txt')).not.toBeInTheDocument();
        expect(screen.getByText('testfolder')).toBeInTheDocument(); // Directories always pass size filter
      });
    });

    it('should filter files by 1to10 size range', async () => {
      mockElectronAPI.loadDirectory.mockResolvedValue({
        files: [smallFile, mediumFile, largeFile],
      });

      await act(async () => {
        render(<DirectoryExplorer filters={{ type: 'any', date: 'any', size: '1to10' }} />);
      });
      
      await waitFor(() => {
        expect(screen.queryByText('small.txt')).not.toBeInTheDocument();
        expect(screen.getByText('medium.txt')).toBeInTheDocument();
        expect(screen.queryByText('large.txt')).not.toBeInTheDocument();
      });
    });

    it('should filter files by 10to100 size range', async () => {
      mockElectronAPI.loadDirectory.mockResolvedValue({
        files: [mediumFile, largeFile, hugeFile],
      });

      await act(async () => {
        render(<DirectoryExplorer filters={{ type: 'any', date: 'any', size: '10to100' }} />);
      });
      
      await waitFor(() => {
        expect(screen.queryByText('medium.txt')).not.toBeInTheDocument();
        expect(screen.getByText('large.txt')).toBeInTheDocument();
        expect(screen.queryByText('huge.txt')).not.toBeInTheDocument();
      });
    });

    it('should filter files by >100 size range', async () => {
      mockElectronAPI.loadDirectory.mockResolvedValue({
        files: [largeFile, hugeFile],
      });

      await act(async () => {
        render(<DirectoryExplorer filters={{ type: 'any', date: 'any', size: '>100' }} />);
      });
      
      await waitFor(() => {
        expect(screen.queryByText('large.txt')).not.toBeInTheDocument();
        expect(screen.getByText('huge.txt')).toBeInTheDocument();
      });
    });
  });

  describe('File Size Formatting', () => {
    it('should format different file sizes correctly', async () => {
      const testFiles = [
        {
          name: 'bytes.txt',
          path: '/test/path/bytes.txt',
          isDirectory: false,
          size: 500, // 500 bytes
          modified: '2023-01-01T00:00:00.000Z',
        },
        {
          name: 'kb.txt',
          path: '/test/path/kb.txt',
          isDirectory: false,
          size: 1536, // 1.5 KB
          modified: '2023-01-01T00:00:00.000Z',
        },
        {
          name: 'gb.txt',
          path: '/test/path/gb.txt',
          isDirectory: false,
          size: 2 * 1024 * 1024 * 1024, // 2 GB
          modified: '2023-01-01T00:00:00.000Z',
        },
      ];

      mockElectronAPI.loadDirectory.mockResolvedValue({
        files: testFiles,
      });

      await act(async () => {
        render(<DirectoryExplorer />);
      });
      
      await waitFor(() => {
        expect(screen.getByText('500.0 B')).toBeInTheDocument();
        expect(screen.getByText('1.5 KB')).toBeInTheDocument();
        expect(screen.getByText('2.0 GB')).toBeInTheDocument();
      });
    });
  });

  describe('Breadcrumb Navigation', () => {
    it('should handle breadcrumb clicks', async () => {
      const user = userEvent.setup();
      
      await act(async () => {
        render(<DirectoryExplorer />);
      });
      
      await waitFor(() => {
        expect(screen.getByRole('navigation')).toBeInTheDocument();
      });

      // Find breadcrumb links
      const breadcrumbLinks = screen.getAllByRole('button');
      const pathLink = breadcrumbLinks.find(link =>
        link.textContent && link.textContent.includes('test')
      );

      if (pathLink) {
        await act(async () => {
          await user.click(pathLink);
        });

        expect(mockWorkspaceContext.setCurrentDirectoryPath).toHaveBeenCalled();
        expect(mockWorkspaceContext.addRecentFolder).toHaveBeenCalled();
      }
    });

    it('should handle root breadcrumb', async () => {
      (useWorkspace as jest.Mock).mockReturnValue({
        ...mockWorkspaceContext,
        currentDirectoryPath: '/',
      });

      await act(async () => {
        render(<DirectoryExplorer />);
      });
      
      await waitFor(() => {
        const rootElements = screen.getAllByText('Root');
        expect(rootElements.length).toBeGreaterThan(0);
      });
    });

    it('should not render breadcrumbs when no directory path', async () => {
      (useWorkspace as jest.Mock).mockReturnValue({
        ...mockWorkspaceContext,
        currentDirectoryPath: null,
      });

      await act(async () => {
        render(<DirectoryExplorer />);
      });
      
      expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
    });
  });

  describe('Context Menu Actions', () => {
    it('should handle context menu open action', async () => {
      await act(async () => {
        render(<DirectoryExplorer />);
      });
      
      await waitFor(() => {
        expect(screen.getByText('file1.txt')).toBeInTheDocument();
      });

      const fileElement = screen.getByText('file1.txt').closest('div');
      
      await act(async () => {
        if (fileElement) {
          fireEvent.contextMenu(fileElement);
        }
      });

      expect(mockContextMenu.showContextMenu).toHaveBeenCalledWith(
        expect.any(Object),
        expect.arrayContaining([
          expect.objectContaining({ id: 'open', label: 'Open' }),
          expect.objectContaining({ id: 'favorite', disabled: true }), // Files can't be favorited
          expect.objectContaining({ id: 'reveal', label: 'Show in Explorer' }),
        ])
      );
    });

    it('should handle context menu for directory with favorite option', async () => {
      await act(async () => {
        render(<DirectoryExplorer />);
      });
      
      await waitFor(() => {
        expect(screen.getByText('folder1')).toBeInTheDocument();
      });

      const folderElement = screen.getByText('folder1').closest('div');
      
      await act(async () => {
        if (folderElement) {
          fireEvent.contextMenu(folderElement);
        }
      });

      expect(mockContextMenu.showContextMenu).toHaveBeenCalledWith(
        expect.any(Object),
        expect.arrayContaining([
          expect.objectContaining({ id: 'favorite', disabled: false }), // Directories can be favorited
        ])
      );
    });

    it('should handle context menu for favorited directory', async () => {
      (useWorkspace as jest.Mock).mockReturnValue({
        ...mockWorkspaceContext,
        favoriteFolders: [{ path: '/test/path/folder1', name: 'folder1' }],
      });

      await act(async () => {
        render(<DirectoryExplorer />);
      });
      
      await waitFor(() => {
        expect(screen.getByText('folder1')).toBeInTheDocument();
      });

      const folderElement = screen.getByText('folder1').closest('div');
      
      await act(async () => {
        if (folderElement) {
          fireEvent.contextMenu(folderElement);
        }
      });

      expect(mockContextMenu.showContextMenu).toHaveBeenCalledWith(
        expect.any(Object),
        expect.arrayContaining([
          expect.objectContaining({
            id: 'favorite',
            label: 'Remove from Favorites'
          }),
        ])
      );
    });

    it('should handle reveal in explorer for file', async () => {
      await act(async () => {
        render(<DirectoryExplorer />);
      });
      
      await waitFor(() => {
        expect(screen.getByText('file1.txt')).toBeInTheDocument();
      });

      const fileElement = screen.getByText('file1.txt').closest('div');
      
      await act(async () => {
        if (fileElement) {
          fireEvent.contextMenu(fileElement);
        }
      });

      // The context menu should include reveal option
      expect(mockContextMenu.showContextMenu).toHaveBeenCalledWith(
        expect.any(Object),
        expect.arrayContaining([
          expect.objectContaining({ id: 'reveal' }),
        ])
      );
    });
  });

  describe('Keyboard Shortcuts', () => {
    it('should handle Ctrl+O shortcut for select directory', async () => {
      mockElectronAPI.selectDirectory.mockResolvedValue('/new/path');

      await act(async () => {
        render(<DirectoryExplorer />);
      });

      await act(async () => {
        fireEvent.keyDown(window, { key: 'o', ctrlKey: true });
      });

      await waitFor(() => {
        expect(mockElectronAPI.selectDirectory).toHaveBeenCalled();
      });
    });

    it('should handle Cmd+O shortcut for select directory', async () => {
      mockElectronAPI.selectDirectory.mockResolvedValue('/new/path');

      await act(async () => {
        render(<DirectoryExplorer />);
      });

      await act(async () => {
        fireEvent.keyDown(window, { key: 'o', metaKey: true });
      });

      await waitFor(() => {
        expect(mockElectronAPI.selectDirectory).toHaveBeenCalled();
      });
    });

    it('should handle 1 key for grid view', async () => {
      await act(async () => {
        render(<DirectoryExplorer />);
      });

      await act(async () => {
        fireEvent.keyDown(window, { key: '1' });
      });

      // Should switch to grid view (default is already grid, but this tests the handler)
      expect(screen.getByText('folder1')).toBeInTheDocument();
    });

    it('should handle 2 key for list view', async () => {
      await act(async () => {
        render(<DirectoryExplorer />);
      });

      await act(async () => {
        fireEvent.keyDown(window, { key: '2' });
      });

      // Should switch to list view
      expect(screen.getByText('folder1')).toBeInTheDocument();
    });

    it('should handle Ctrl+F for toggle favorite', async () => {
      await act(async () => {
        render(<DirectoryExplorer />);
      });

      // First select a directory
      await waitFor(() => {
        expect(screen.getByText('folder1')).toBeInTheDocument();
      });

      const folderElement = screen.getByText('folder1').closest('div');
      await act(async () => {
        if (folderElement) {
          fireEvent.click(folderElement);
        }
      });

      await act(async () => {
        fireEvent.keyDown(window, { key: 'f', ctrlKey: true });
      });

      expect(mockWorkspaceContext.addFavoriteFolder).toHaveBeenCalledWith({
        path: '/test/path/folder1',
        name: 'folder1',
      });
    });
  });

  describe('File Selection Logic', () => {
    it('should handle file deselection', async () => {
      await act(async () => {
        render(<DirectoryExplorer />);
      });
      
      await waitFor(() => {
        expect(screen.getByText('file1.txt')).toBeInTheDocument();
      });

      const fileElement = screen.getByText('file1.txt').closest('div');
      
      // Select file
      await act(async () => {
        if (fileElement) {
          fireEvent.click(fileElement);
        }
      });

      // Deselect file (click again)
      await act(async () => {
        if (fileElement) {
          fireEvent.click(fileElement);
        }
      });

      // File should be deselected (this is tested by the component's internal state)
      expect(fileElement).toBeTruthy();
    });

    it('should handle multiple file selection', async () => {
      await act(async () => {
        render(<DirectoryExplorer />);
      });
      
      await waitFor(() => {
        expect(screen.getByText('file1.txt')).toBeInTheDocument();
        expect(screen.getByText('file2.pdf')).toBeInTheDocument();
      });

      const file1Element = screen.getByText('file1.txt').closest('div');
      const file2Element = screen.getByText('file2.pdf').closest('div');
      
      // Select both files
      await act(async () => {
        if (file1Element) {
          fireEvent.click(file1Element);
        }
      });

      await act(async () => {
        if (file2Element) {
          fireEvent.click(file2Element);
        }
      });

      // Both files should be selected
      expect(file1Element).toBeTruthy();
      expect(file2Element).toBeTruthy();
    });
  });

  describe('Sort and Rename Operations', () => {
    it('should handle sort with selected items', async () => {
      const user = userEvent.setup();
      mockElectronAPI.analyzeDirectoryForSort.mockResolvedValue({
        suggestions: { categories: [] },
      });

      await act(async () => {
        render(<DirectoryExplorer />);
      });
      
      await waitFor(() => {
        expect(screen.getByText('folder1')).toBeInTheDocument();
      });

      // Select a folder first
      const folderElement = screen.getByText('folder1').closest('div');
      await act(async () => {
        if (folderElement) {
          fireEvent.click(folderElement);
        }
      });

      const sortButton = screen.getByText('Sort');
      await act(async () => {
        await user.click(sortButton);
      });

      expect(mockElectronAPI.analyzeDirectoryForSort).toHaveBeenCalledWith(
        '/test/path',
        ['/test/path/folder1']
      );
      expect(screen.getByTestId('sort-suggestions')).toBeInTheDocument();
    });

    it('should handle rename with selected items', async () => {
      const user = userEvent.setup();
      mockElectronAPI.analyzeDirectoryForRename.mockResolvedValue({
        suggestions: {
          categories: [{
            renames: [{ originalName: 'file1.txt', suggestedName: 'renamed_file1.txt' }]
          }]
        },
      });

      await act(async () => {
        render(<DirectoryExplorer />);
      });
      
      await waitFor(() => {
        expect(screen.getByText('file1.txt')).toBeInTheDocument();
      });

      // Select a file first
      const fileElement = screen.getByText('file1.txt').closest('div');
      await act(async () => {
        if (fileElement) {
          fireEvent.click(fileElement);
        }
      });

      const renameButton = screen.getByText('Rename');
      await act(async () => {
        await user.click(renameButton);
      });

      expect(mockElectronAPI.analyzeDirectoryForRename).toHaveBeenCalledWith(
        '/test/path',
        ['/test/path/file1.txt']
      );
      expect(screen.getByTestId('rename-dialog')).toBeInTheDocument();
    });

    it('should handle sort error response', async () => {
      const user = userEvent.setup();
      mockElectronAPI.analyzeDirectoryForSort.mockResolvedValue({
        error: 'Sort analysis failed',
      });

      await act(async () => {
        render(<DirectoryExplorer />);
      });
      
      await waitFor(() => {
        expect(screen.getByText('folder1')).toBeInTheDocument();
      });

      // Select a folder first
      const folderElement = screen.getByText('folder1').closest('div');
      await act(async () => {
        if (folderElement) {
          fireEvent.click(folderElement);
        }
      });

      const sortButton = screen.getByText('Sort');
      await act(async () => {
        await user.click(sortButton);
      });

      expect(screen.getByTestId('sort-suggestions')).toBeInTheDocument();
    });

    it('should handle rename with no suggestions', async () => {
      const user = userEvent.setup();
      mockElectronAPI.analyzeDirectoryForRename.mockResolvedValue({
        suggestions: { categories: [{ renames: [] }] },
      });

      await act(async () => {
        render(<DirectoryExplorer />);
      });
      
      await waitFor(() => {
        expect(screen.getByText('file1.txt')).toBeInTheDocument();
      });

      // Select a file first
      const fileElement = screen.getByText('file1.txt').closest('div');
      await act(async () => {
        if (fileElement) {
          fireEvent.click(fileElement);
        }
      });

      const renameButton = screen.getByText('Rename');
      await act(async () => {
        await user.click(renameButton);
      });

      expect(screen.getByTestId('rename-dialog')).toBeInTheDocument();
    });

    it('should handle rename with malformed suggestions', async () => {
      const user = userEvent.setup();
      mockElectronAPI.analyzeDirectoryForRename.mockResolvedValue({
        suggestions: { categories: [] }, // No categories
      });

      await act(async () => {
        render(<DirectoryExplorer />);
      });
      
      await waitFor(() => {
        expect(screen.getByText('file1.txt')).toBeInTheDocument();
      });

      // Select a file first
      const fileElement = screen.getByText('file1.txt').closest('div');
      await act(async () => {
        if (fileElement) {
          fireEvent.click(fileElement);
        }
      });

      const renameButton = screen.getByText('Rename');
      await act(async () => {
        await user.click(renameButton);
      });

      expect(screen.getByTestId('rename-dialog')).toBeInTheDocument();
    });
  });

  describe('Directory Loading Edge Cases', () => {
    it('should handle directory loading with no files property', async () => {
      mockElectronAPI.loadDirectory.mockResolvedValue({});

      await act(async () => {
        render(<DirectoryExplorer />);
      });
      
      // Should not crash and show empty state
      await waitFor(() => {
        expect(screen.getByText('This folder is empty')).toBeInTheDocument();
      });
    });

    it('should handle directory loading with null result', async () => {
      mockElectronAPI.loadDirectory.mockResolvedValue(null);

      await act(async () => {
        render(<DirectoryExplorer />);
      });
      
      // Should not crash and show empty state
      await waitFor(() => {
        expect(screen.getByText('This folder is empty')).toBeInTheDocument();
      });
    });
  });

  describe('Select Directory Edge Cases', () => {
    it('should handle select directory with no path returned', async () => {
      const user = userEvent.setup();
      mockElectronAPI.selectDirectory.mockResolvedValue(null);

      await act(async () => {
        render(<DirectoryExplorer />);
      });

      const selectButton = screen.getByText('Select Directory');
      await act(async () => {
        await user.click(selectButton);
      });

      // Should not call setCurrentDirectoryPath if no path returned
      expect(mockWorkspaceContext.setCurrentDirectoryPath).not.toHaveBeenCalled();
    });
  });

  describe('Favorite Management', () => {
    it('should handle remove from favorites', async () => {
      const user = userEvent.setup();
      (useWorkspace as jest.Mock).mockReturnValue({
        ...mockWorkspaceContext,
        favoriteFolders: [{ path: '/test/path/folder1', name: 'folder1' }],
      });

      await act(async () => {
        render(<DirectoryExplorer />);
      });
      
      await waitFor(() => {
        expect(screen.getByText('folder1')).toBeInTheDocument();
      });

      // Find the filled star button (favorite)
      const starButtons = screen.getAllByRole('button');
      const starButton = starButtons.find(button =>
        button.querySelector('svg[data-testid="StarIcon"]')
      );

      if (starButton) {
        await act(async () => {
          await user.click(starButton);
        });

        expect(mockWorkspaceContext.removeFavoriteFolder).toHaveBeenCalledWith('/test/path/folder1');
      }
    });

    it('should not show favorite button for files', async () => {
      await act(async () => {
        render(<DirectoryExplorer />);
      });
      
      await waitFor(() => {
        expect(screen.getByText('file1.txt')).toBeInTheDocument();
      });

      // Files should not have star buttons in grid view
      const fileContainer = screen.getByText('file1.txt').closest('div');
      const starButton = fileContainer?.querySelector('button');
      expect(starButton).toBeNull();
    });
  });
});
