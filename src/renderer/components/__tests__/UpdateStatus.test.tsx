import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import UpdateStatus from '../UpdateStatus';
import { useUpdate } from '../../contexts/UpdateContext';

jest.mock('../../contexts/UpdateContext', () => ({
  useUpdate: jest.fn(),
}));

const mockUseUpdate = useUpdate as jest.MockedFunction<typeof useUpdate>;

function renderUpdateStatus(overrides = {}) {
  const downloadNow = jest.fn().mockResolvedValue('pending-update');
  const installNow = jest.fn().mockResolvedValue(undefined);

  mockUseUpdate.mockReturnValue({
    currentVersion: '1.0.0',
    status: 'available',
    updateInfo: {
      version: '2.0.0',
      notes: null,
      publishedAt: null,
      downloadUrl: 'KeepDir-Setup-2.0.0.exe',
      assetName: 'KeepDir-Setup-2.0.0.exe',
      assetSize: 174000000,
    },
    updatePath: null,
    downloadProgress: 0,
    error: null,
    lastCheckedAt: null,
    checkNow: jest.fn(),
    downloadNow,
    installNow,
    clearError: jest.fn(),
    ...overrides,
  });

  render(<UpdateStatus />);
  return { downloadNow, installNow };
}

describe('UpdateStatus', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('downloads and restarts from one action when an update is available', async () => {
    const { downloadNow, installNow } = renderUpdateStatus();

    fireEvent.click(screen.getByRole('button', { name: /update & restart/i }));

    await waitFor(() => {
      expect(downloadNow).toHaveBeenCalledTimes(1);
      expect(installNow).toHaveBeenCalledWith('pending-update');
    });
  });

  it('restarts immediately when an update is already downloaded', async () => {
    const installNow = jest.fn().mockResolvedValue(undefined);
    renderUpdateStatus({
      status: 'ready',
      updatePath: 'pending-update',
      installNow,
    });

    fireEvent.click(screen.getByRole('button', { name: /restart & update/i }));

    await waitFor(() => {
      expect(installNow).toHaveBeenCalledWith('pending-update');
    });
  });
});
