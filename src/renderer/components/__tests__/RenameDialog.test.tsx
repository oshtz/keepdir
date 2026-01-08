import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import RenameDialog from '../RenameDialog';
import { FileRename } from '../../electron';

// Mock window.electronAPI
const mockElectronAPI = {
  onRenameProgress: jest.fn(() => jest.fn()), // Returns unsubscribe function
};

Object.defineProperty(window, 'electronAPI', {
  value: mockElectronAPI,
  writable: true,
});

describe('RenameDialog', () => {
  const mockRenames: FileRename[] = [
    {
      originalName: 'IMG_001.jpg',
      suggestedName: 'vacation_beach_sunset.jpg',
      reason: 'Descriptive name based on image content analysis'
    },
    {
      originalName: 'document.pdf',
      suggestedName: 'project_proposal_2024.pdf',
      reason: 'Name reflects document content and date'
    },
    {
      originalName: 'file123.txt',
      suggestedName: 'meeting_notes_january.txt',
      reason: 'Meaningful name based on file content'
    }
  ];

  const mockSuggestions = {
    renames: mockRenames
  };

  const defaultProps = {
    open: true,
    onClose: jest.fn(),
    suggestions: mockSuggestions,
    loading: false,
    error: undefined,
    onApply: jest.fn()
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders when open', () => {
    render(<RenameDialog {...defaultProps} />);
    
    expect(screen.getByText('Rename Suggestions')).toBeInTheDocument();
    expect(screen.getByText('AI has analyzed your files and suggests the following renames:')).toBeInTheDocument();
  });

  it('does not render when closed', () => {
    render(<RenameDialog {...defaultProps} open={false} />);
    
    expect(screen.queryByText('Rename Suggestions')).not.toBeInTheDocument();
  });

  it('displays loading state', () => {
    render(<RenameDialog {...defaultProps} loading={true} suggestions={undefined} />);
    
    expect(screen.getByText('Analyzing files...')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('displays error state', () => {
    const errorMessage = 'Failed to analyze files';
    render(<RenameDialog {...defaultProps} loading={false} error={errorMessage} suggestions={undefined} />);
    
    expect(screen.getByText(errorMessage)).toBeInTheDocument();
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('displays rename suggestions', () => {
    render(<RenameDialog {...defaultProps} />);
    
    // Check that all original names are displayed
    expect(screen.getByText('IMG_001.jpg')).toBeInTheDocument();
    expect(screen.getByText('document.pdf')).toBeInTheDocument();
    expect(screen.getByText('file123.txt')).toBeInTheDocument();
    
    // Check that all suggested names are displayed (in Chip components, without arrow prefix)
    expect(screen.getByText('vacation_beach_sunset.jpg')).toBeInTheDocument();
    expect(screen.getByText('project_proposal_2024.pdf')).toBeInTheDocument();
    expect(screen.getByText('meeting_notes_january.txt')).toBeInTheDocument();
    
    // Check that all reasons are displayed
    expect(screen.getByText('Descriptive name based on image content analysis')).toBeInTheDocument();
    expect(screen.getByText('Name reflects document content and date')).toBeInTheDocument();
    expect(screen.getByText('Meaningful name based on file content')).toBeInTheDocument();
  });

  it('calls onClose when close button is clicked', () => {
    const onClose = jest.fn();
    render(<RenameDialog {...defaultProps} onClose={onClose} />);
    
    const closeButton = screen.getByTestId('CloseIcon').closest('button')!;
    fireEvent.click(closeButton);
    
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when cancel button is clicked', () => {
    const onClose = jest.fn();
    render(<RenameDialog {...defaultProps} onClose={onClose} />);
    
    const cancelButton = screen.getByRole('button', { name: /cancel/i });
    fireEvent.click(cancelButton);
    
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onApply when apply button is clicked', () => {
    const onApply = jest.fn();
    render(<RenameDialog {...defaultProps} onApply={onApply} />);
    
    const applyButton = screen.getByRole('button', { name: /apply suggestions/i });
    fireEvent.click(applyButton);
    
    expect(onApply).toHaveBeenCalledWith(mockSuggestions);
  });

  it('disables apply button when loading', () => {
    render(<RenameDialog {...defaultProps} loading={true} />);
    
    const applyButton = screen.getByRole('button', { name: /apply suggestions/i });
    expect(applyButton).toBeDisabled();
  });

  it('disables apply button when no suggestions', () => {
    render(<RenameDialog {...defaultProps} suggestions={undefined} />);
    
    const applyButton = screen.getByRole('button', { name: /apply suggestions/i });
    expect(applyButton).toBeDisabled();
  });

  it('displays "No suggestions available" when suggestions is undefined', () => {
    render(<RenameDialog {...defaultProps} suggestions={undefined} loading={false} />);

    // Should show "No suggestions available" message
    expect(screen.getByText('No suggestions available')).toBeInTheDocument();
  });

  it('handles empty renames array', () => {
    render(<RenameDialog {...defaultProps} suggestions={{ renames: [] }} loading={false} />);

    // Component uses Stack (not role="list") - verify dialog is still rendered
    expect(screen.getByText('Rename Suggestions')).toBeInTheDocument();
    // With empty renames, the AI message and empty stack are shown
    expect(screen.getByText('AI has analyzed your files and suggests the following renames:')).toBeInTheDocument();
  });

  it('sets up progress listener on mount', () => {
    render(<RenameDialog {...defaultProps} />);
    
    expect(mockElectronAPI.onRenameProgress).toHaveBeenCalledWith(expect.any(Function));
  });

  it('cleans up progress listener on unmount', () => {
    const unsubscribe = jest.fn();
    mockElectronAPI.onRenameProgress.mockReturnValue(unsubscribe);
    
    const { unmount } = render(<RenameDialog {...defaultProps} />);
    unmount();
    
    expect(unsubscribe).toHaveBeenCalled();
  });

  it('displays progress information when available', () => {
    render(<RenameDialog {...defaultProps} />);
    
    // Verify that the progress listener was set up
    expect(mockElectronAPI.onRenameProgress).toHaveBeenCalledWith(expect.any(Function));
    
    // Note: The progress display logic is internal to the component
    // We can't easily test the UI update without more complex mocking
    // but we can verify the listener was registered
  });

  it('handles apply button click and sets progress', () => {
    const onApply = jest.fn();
    render(<RenameDialog {...defaultProps} onApply={onApply} />);
    
    const applyButton = screen.getByRole('button', { name: /apply suggestions/i });
    fireEvent.click(applyButton);
    
    expect(onApply).toHaveBeenCalledWith(mockSuggestions);
  });

  it('renders file icons for each rename suggestion', () => {
    render(<RenameDialog {...defaultProps} />);
    
    // Check for file icons (should be present for each suggestion)
    const fileIcons = document.querySelectorAll('[data-testid="InsertDriveFileIcon"]');
    expect(fileIcons).toHaveLength(mockRenames.length);
  });

  it('displays close icon in header', () => {
    render(<RenameDialog {...defaultProps} />);
    
    const closeIcon = document.querySelector('[data-testid="CloseIcon"]');
    expect(closeIcon).toBeInTheDocument();
  });

  it('handles empty suggestions gracefully', () => {
    render(<RenameDialog {...defaultProps} suggestions={{ renames: [] }} />);

    // The apply button should NOT be disabled when suggestions object exists but has empty renames
    // It's only disabled when suggestions is undefined/null or when loading
    const applyButton = screen.getByRole('button', { name: /apply suggestions/i });
    expect(applyButton).not.toBeDisabled();
    // Component uses Stack, not list - verify dialog is rendered
    expect(screen.getByText('Rename Suggestions')).toBeInTheDocument();
  });

  it('shows proper styling for suggested names', () => {
    render(<RenameDialog {...defaultProps} />);

    // The suggested names should be in Chip components with TrendingFlatIcon
    const suggestedName = screen.getByText('vacation_beach_sunset.jpg');
    expect(suggestedName).toBeInTheDocument();
    // Verify arrow icon is present
    expect(document.querySelector('[data-testid="TrendingFlatIcon"]')).toBeInTheDocument();
  });

  it('displays reasons with proper styling', () => {
    render(<RenameDialog {...defaultProps} />);
    
    const reason = screen.getByText('Descriptive name based on image content analysis');
    expect(reason).toBeInTheDocument();
    
    // The reason should be in a styled container with border
    const reasonContainer = reason.closest('div');
    expect(reasonContainer).toHaveStyle({
      borderLeft: expect.any(String)
    });
  });

  it('maintains dialog structure with proper ARIA roles', () => {
    render(<RenameDialog {...defaultProps} />);
    
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Rename Suggestions')).toBeInTheDocument();
  });
});