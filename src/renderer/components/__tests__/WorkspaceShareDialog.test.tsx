import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import WorkspaceShareDialog from '../WorkspaceShareDialog';

describe('WorkspaceShareDialog', () => {
  const defaultProps = {
    open: true,
    onClose: jest.fn()
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the export/import sharing guidance when open', () => {
    render(<WorkspaceShareDialog {...defaultProps} />);

    expect(screen.getByText('Share Workspace')).toBeInTheDocument();
    expect(screen.getByText('Online workspace sharing has been removed from this version.')).toBeInTheDocument();
    expect(screen.getByText('Export Workspace')).toBeInTheDocument();
    expect(screen.getByText('Import Workspace')).toBeInTheDocument();
  });

  it('does not render when closed', () => {
    render(<WorkspaceShareDialog {...defaultProps} open={false} />);

    expect(screen.queryByText('Share Workspace')).not.toBeInTheDocument();
  });

  it('calls onClose from the close action', async () => {
    const user = userEvent.setup();
    const onClose = jest.fn();
    render(<WorkspaceShareDialog {...defaultProps} onClose={onClose} />);

    await user.click(screen.getByRole('button', { name: /close/i }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders share and close icons', () => {
    render(<WorkspaceShareDialog {...defaultProps} />);

    expect(document.querySelector('[data-testid="ShareIcon"]')).toBeInTheDocument();
    expect(document.querySelector('[data-testid="CloseIcon"]')).toBeInTheDocument();
  });
});
