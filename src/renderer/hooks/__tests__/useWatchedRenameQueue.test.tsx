import { act, renderHook, waitFor } from '@testing-library/react';
import { useWatchedRenameQueue } from '../useWatchedRenameQueue';

const mockElectronAPI = {
  getWatchedRenameSuggestions: jest.fn(),
  dismissWatchedRenameSuggestions: jest.fn(),
  refreshWatchedRenameSuggestions: jest.fn(),
  applyWatchedRenameSuggestions: jest.fn(),
  onWatchedRenameSuggestionsChanged: jest.fn(),
};

Object.defineProperty(window, 'electronAPI', {
  value: mockElectronAPI,
  writable: true,
});

describe('useWatchedRenameQueue', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockElectronAPI.getWatchedRenameSuggestions.mockResolvedValue({
      success: true,
      suggestions: [{
        id: 'suggestion-1',
        workspaceId: 'workspace-1',
        folderPath: 'C:/Downloads',
        filePath: 'C:/Downloads/scan.txt',
        originalName: 'scan.txt',
        suggestedName: 'invoice-2026.txt',
        reason: 'Invoice',
        status: 'suggested',
        fileSize: 12,
        fileMtimeMs: 1000,
        createdAt: '2026-06-03T00:00:00.000Z',
        updatedAt: '2026-06-03T00:00:01.000Z'
      }]
    });
    mockElectronAPI.dismissWatchedRenameSuggestions.mockResolvedValue({ success: true });
    mockElectronAPI.refreshWatchedRenameSuggestions.mockResolvedValue({ success: true });
    mockElectronAPI.applyWatchedRenameSuggestions.mockResolvedValue({ success: true, results: [] });
    mockElectronAPI.onWatchedRenameSuggestionsChanged.mockReturnValue(jest.fn());
  });

  it('loads suggestions for the current workspace', async () => {
    const { result } = renderHook(() => useWatchedRenameQueue('workspace-1'));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(mockElectronAPI.getWatchedRenameSuggestions).toHaveBeenCalledWith('workspace-1');
    expect(result.current.suggestions).toHaveLength(1);
    expect(result.current.groupedByFolder['C:/Downloads']).toHaveLength(1);
    expect(result.current.error).toBeNull();
  });

  it('reloads after queue actions', async () => {
    const { result } = renderHook(() => useWatchedRenameQueue('workspace-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.dismiss(['suggestion-1']);
    });

    expect(mockElectronAPI.dismissWatchedRenameSuggestions).toHaveBeenCalledWith('workspace-1', ['suggestion-1']);
    expect(mockElectronAPI.getWatchedRenameSuggestions).toHaveBeenCalledTimes(2);
  });

  it('subscribes to watched suggestion change events', async () => {
    let callback: (payload: { workspaceId: string }) => void = () => {};
    mockElectronAPI.onWatchedRenameSuggestionsChanged.mockImplementation((handler) => {
      callback = handler;
      return jest.fn();
    });

    renderHook(() => useWatchedRenameQueue('workspace-1'));
    await waitFor(() => expect(mockElectronAPI.getWatchedRenameSuggestions).toHaveBeenCalledTimes(1));

    await act(async () => {
      callback({ workspaceId: 'workspace-1' });
    });

    expect(mockElectronAPI.getWatchedRenameSuggestions).toHaveBeenCalledTimes(2);
  });
});
