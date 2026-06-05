import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import WatchFoldersSettings from '../WatchFoldersSettings';

const mockElectronAPI = {
  selectDirectory: jest.fn(),
  getWatchFolders: jest.fn(),
  saveWatchFolder: jest.fn(),
  removeWatchFolder: jest.fn(),
  setWatchFolderEnabled: jest.fn(),
  onWatchFoldersChanged: jest.fn(),
};

Object.defineProperty(window, 'electronAPI', {
  value: mockElectronAPI,
  writable: true,
});

describe('WatchFoldersSettings', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockElectronAPI.getWatchFolders.mockResolvedValue({
      success: true,
      folders: [{ id: 'watch-1', path: 'C:/Downloads', enabled: true, createdAt: '2026-06-03T00:00:00.000Z' }]
    });
    mockElectronAPI.saveWatchFolder.mockResolvedValue({ success: true });
    mockElectronAPI.removeWatchFolder.mockResolvedValue({ success: true });
    mockElectronAPI.setWatchFolderEnabled.mockResolvedValue({ success: true });
    mockElectronAPI.selectDirectory.mockResolvedValue('C:/Desktop');
    mockElectronAPI.onWatchFoldersChanged.mockReturnValue(jest.fn());
  });

  it('renders current watched folders', async () => {
    render(<WatchFoldersSettings workspaceId="workspace-1" />);

    await waitFor(() => expect(screen.getByText('C:/Downloads')).toBeInTheDocument());
    expect(screen.getByRole('checkbox', { name: /watch C:\/Downloads/i })).toBeChecked();
  });

  it('adds a selected folder', async () => {
    const user = userEvent.setup();
    render(<WatchFoldersSettings workspaceId="workspace-1" />);
    const addButton = screen.getByRole('button', { name: /add watched folder/i });

    await waitFor(() => expect(addButton).toBeEnabled());
    await user.click(addButton);

    await waitFor(() => expect(mockElectronAPI.selectDirectory).toHaveBeenCalled());
    expect(mockElectronAPI.saveWatchFolder).toHaveBeenCalledWith(
      'workspace-1',
      expect.objectContaining({ path: 'C:/Desktop', enabled: true })
    );
  });

  it('toggles and removes a folder', async () => {
    const user = userEvent.setup();
    render(<WatchFoldersSettings workspaceId="workspace-1" />);

    await waitFor(() => expect(screen.getByText('C:/Downloads')).toBeInTheDocument());
    await user.click(screen.getByRole('checkbox', { name: /watch C:\/Downloads/i }));
    await user.click(screen.getByRole('button', { name: /remove C:\/Downloads/i }));

    expect(mockElectronAPI.setWatchFolderEnabled).toHaveBeenCalledWith('workspace-1', 'watch-1', false);
    expect(mockElectronAPI.removeWatchFolder).toHaveBeenCalledWith('workspace-1', 'watch-1');
  });
});
