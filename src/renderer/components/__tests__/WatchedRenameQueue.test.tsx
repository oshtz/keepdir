import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import WatchedRenameQueue from '../WatchedRenameQueue';
import { useWatchedRenameQueue } from '../../hooks/useWatchedRenameQueue';

jest.mock('../../hooks/useWatchedRenameQueue', () => ({
  useWatchedRenameQueue: jest.fn(),
}));

const mockUseWatchedRenameQueue = useWatchedRenameQueue as jest.MockedFunction<typeof useWatchedRenameQueue>;

Object.defineProperty(window, 'electronAPI', {
  value: {
    openFile: jest.fn(),
    revealInFolder: jest.fn(),
  },
  writable: true,
});

describe('WatchedRenameQueue', () => {
  beforeEach(() => {
    mockUseWatchedRenameQueue.mockReturnValue({
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
      }],
      groupedByFolder: {
        'C:/Downloads': [{
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
      },
      loading: false,
      error: null,
      load: jest.fn(),
      dismiss: jest.fn(async () => ({ success: true })),
      refresh: jest.fn(async () => ({ success: true })),
      apply: jest.fn(async () => ({ success: true }))
    });
  });

  it('renders grouped suggestions and actions', () => {
    render(<WatchedRenameQueue workspaceId="workspace-1" open onClose={jest.fn()} />);

    expect(screen.getByText('C:/Downloads')).toBeInTheDocument();
    expect(screen.getByText('scan.txt')).toBeInTheDocument();
    expect(screen.getByText('invoice-2026.txt')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /apply selected/i })).toBeInTheDocument();
  });

  it('applies selected suggestions', async () => {
    const user = userEvent.setup();
    const queue = mockUseWatchedRenameQueue();
    render(<WatchedRenameQueue workspaceId="workspace-1" open onClose={jest.fn()} />);

    await user.click(screen.getByRole('checkbox', { name: /select scan.txt/i }));
    await user.click(screen.getByRole('button', { name: /apply selected/i }));

    expect(queue.apply).toHaveBeenCalledWith(['suggestion-1']);
  });
});
