import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import KeyboardShortcutsDialog from '../KeyboardShortcutsDialog';
import { KeyboardShortcut } from '../../hooks/useKeyboardShortcuts';

// Mock the formatShortcut function
jest.mock('../../hooks/useKeyboardShortcuts', () => ({
  formatShortcut: jest.fn((shortcut: KeyboardShortcut) => {
    const parts = [];
    if (shortcut.ctrlKey) parts.push('Ctrl');
    if (shortcut.altKey) parts.push('Alt');
    if (shortcut.shiftKey) parts.push('Shift');
    if (shortcut.metaKey) parts.push('Cmd');
    parts.push(shortcut.key.toUpperCase());
    return parts.join(' + ');
  })
}));

const mockShortcuts: KeyboardShortcut[] = [
  {
    key: 's',
    ctrlKey: true,
    description: 'Save current file',
    category: 'File Operations',
    action: jest.fn()
  },
  {
    key: 'c',
    ctrlKey: true,
    description: 'Copy selected text',
    category: 'Edit Operations',
    action: jest.fn()
  },
  {
    key: 'f',
    ctrlKey: true,
    description: 'Find in file',
    category: 'Search',
    action: jest.fn()
  },
  {
    key: '?',
    description: 'Show keyboard shortcuts',
    category: 'Help',
    action: jest.fn()
  }
];

describe('KeyboardShortcutsDialog', () => {
  const defaultProps = {
    open: true,
    onClose: jest.fn(),
    shortcuts: mockShortcuts
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders when open', () => {
    render(<KeyboardShortcutsDialog {...defaultProps} />);
    
    expect(screen.getByText('Keyboard Shortcuts')).toBeInTheDocument();
    expect(screen.getByText('Use these keyboard shortcuts to navigate and perform actions quickly')).toBeInTheDocument();
  });

  it('does not render when closed', () => {
    render(<KeyboardShortcutsDialog {...defaultProps} open={false} />);
    
    expect(screen.queryByText('Keyboard Shortcuts')).not.toBeInTheDocument();
  });

  it('displays shortcuts grouped by category', () => {
    render(<KeyboardShortcutsDialog {...defaultProps} />);
    
    // Check categories are displayed
    expect(screen.getByText('File Operations')).toBeInTheDocument();
    expect(screen.getByText('Edit Operations')).toBeInTheDocument();
    expect(screen.getByText('Search')).toBeInTheDocument();
    expect(screen.getByText('Help')).toBeInTheDocument();
    
    // Check shortcuts are displayed
    expect(screen.getByText('Save current file')).toBeInTheDocument();
    expect(screen.getByText('Copy selected text')).toBeInTheDocument();
    expect(screen.getByText('Find in file')).toBeInTheDocument();
    expect(screen.getByText('Show keyboard shortcuts')).toBeInTheDocument();
  });

  it('displays formatted shortcut keys', () => {
    render(<KeyboardShortcutsDialog {...defaultProps} />);
    
    // Check that shortcut chips are displayed with formatted keys
    expect(screen.getByText('Ctrl + S')).toBeInTheDocument();
    expect(screen.getByText('Ctrl + C')).toBeInTheDocument();
    expect(screen.getByText('Ctrl + F')).toBeInTheDocument();
    // Use getAllByText for the "?" since it appears multiple times (in shortcut and tip)
    expect(screen.getAllByText('?').length).toBeGreaterThan(0);
  });

  it('calls onClose when close button is clicked', () => {
    const onClose = jest.fn();
    render(<KeyboardShortcutsDialog {...defaultProps} onClose={onClose} />);
    
    const closeButton = screen.getByTestId('CloseIcon').closest('button');
    if (closeButton) {
      fireEvent.click(closeButton);
      expect(onClose).toHaveBeenCalledTimes(1);
    }
  });

  it('calls onClose when Got it button is clicked', () => {
    const onClose = jest.fn();
    render(<KeyboardShortcutsDialog {...defaultProps} onClose={onClose} />);
    
    const gotItButton = screen.getByRole('button', { name: /got it/i });
    fireEvent.click(gotItButton);
    
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('displays tip section with help information', () => {
    render(<KeyboardShortcutsDialog {...defaultProps} />);
    
    expect(screen.getByText(/Keyboard shortcuts are disabled when typing in input fields/)).toBeInTheDocument();
    expect(screen.getByText(/to show this dialog anytime/)).toBeInTheDocument();
  });

  it('handles empty shortcuts array', () => {
    render(<KeyboardShortcutsDialog {...defaultProps} shortcuts={[]} />);
    
    expect(screen.getByText('Keyboard Shortcuts')).toBeInTheDocument();
    expect(screen.getByText('Use these keyboard shortcuts to navigate and perform actions quickly')).toBeInTheDocument();
    // Should still show the tip section
    expect(screen.getByText(/Keyboard shortcuts are disabled when typing in input fields/)).toBeInTheDocument();
  });

  it('groups shortcuts correctly when multiple shortcuts have same category', () => {
    const shortcutsWithSameCategory: KeyboardShortcut[] = [
      {
        key: 's',
        ctrlKey: true,
        description: 'Save current file',
        category: 'File Operations',
        action: jest.fn()
      },
      {
        key: 'o',
        ctrlKey: true,
        description: 'Open file',
        category: 'File Operations',
        action: jest.fn()
      }
    ];

    render(<KeyboardShortcutsDialog {...defaultProps} shortcuts={shortcutsWithSameCategory} />);
    
    // Should only show one "File Operations" category header
    const categoryHeaders = screen.getAllByText('File Operations');
    expect(categoryHeaders).toHaveLength(1);
    
    // But should show both shortcuts
    expect(screen.getByText('Save current file')).toBeInTheDocument();
    expect(screen.getByText('Open file')).toBeInTheDocument();
  });

  it('renders with proper styling classes and structure', () => {
    render(<KeyboardShortcutsDialog {...defaultProps} />);
    
    // Check for keyboard icon
    const keyboardIcon = document.querySelector('[data-testid="KeyboardIcon"]');
    expect(keyboardIcon).toBeInTheDocument();
    
    // Check for close icon
    const closeIcon = document.querySelector('[data-testid="CloseIcon"]');
    expect(closeIcon).toBeInTheDocument();
  });

  it('displays dividers between categories', () => {
    render(<KeyboardShortcutsDialog {...defaultProps} />);
    
    // Should have dividers between categories (but not before the first one)
    const dividers = document.querySelectorAll('hr');
    expect(dividers.length).toBeGreaterThan(0);
  });
});