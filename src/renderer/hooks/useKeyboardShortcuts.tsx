import { useEffect, useCallback } from 'react';
import { useWorkspace } from '../contexts/WorkspaceContext';

export interface KeyboardShortcut {
  key: string;
  ctrlKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
  metaKey?: boolean;
  description: string;
  action: () => void;
  category: string;
}

interface UseKeyboardShortcutsProps {
  shortcuts: KeyboardShortcut[];
  enabled?: boolean;
}

export const useKeyboardShortcuts = ({ shortcuts, enabled = true }: UseKeyboardShortcutsProps) => {
  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (!enabled) return;

    // Don't trigger shortcuts when typing in input fields
    const target = event.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
      return;
    }

    const matchingShortcut = shortcuts.find(shortcut => {
      const keyMatches = shortcut.key.toLowerCase() === event.key.toLowerCase();
      const ctrlMatches = !!shortcut.ctrlKey === event.ctrlKey;
      const altMatches = !!shortcut.altKey === event.altKey;
      const shiftMatches = !!shortcut.shiftKey === event.shiftKey;
      const metaMatches = !!shortcut.metaKey === event.metaKey;

      return keyMatches && ctrlMatches && altMatches && shiftMatches && metaMatches;
    });

    if (matchingShortcut) {
      event.preventDefault();
      event.stopPropagation();
      matchingShortcut.action();
    }
  }, [shortcuts, enabled]);

  useEffect(() => {
    if (enabled) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
    return undefined;
  }, [handleKeyDown, enabled]);

  return { shortcuts };
};

// Global keyboard shortcuts hook for the main app
export const useGlobalKeyboardShortcuts = () => {
  const {
    workspaces,
    currentWorkspace,
    setCurrentWorkspace,
    addRecentFolder,
    clearRecentFolders
  } = useWorkspace();

  const shortcuts: KeyboardShortcut[] = [
    // Workspace navigation
    {
      key: '1',
      ctrlKey: true,
      description: 'Switch to first workspace',
      category: 'Workspace',
      action: () => {
        if (workspaces[0]) {
          setCurrentWorkspace(workspaces[0]);
        }
      }
    },
    {
      key: '2',
      ctrlKey: true,
      description: 'Switch to second workspace',
      category: 'Workspace',
      action: () => {
        if (workspaces[1]) {
          setCurrentWorkspace(workspaces[1]);
        }
      }
    },
    {
      key: '3',
      ctrlKey: true,
      description: 'Switch to third workspace',
      category: 'Workspace',
      action: () => {
        if (workspaces[2]) {
          setCurrentWorkspace(workspaces[2]);
        }
      }
    },
    {
      key: '4',
      ctrlKey: true,
      description: 'Switch to fourth workspace',
      category: 'Workspace',
      action: () => {
        if (workspaces[3]) {
          setCurrentWorkspace(workspaces[3]);
        }
      }
    },
    {
      key: '5',
      ctrlKey: true,
      description: 'Switch to fifth workspace',
      category: 'Workspace',
      action: () => {
        if (workspaces[4]) {
          setCurrentWorkspace(workspaces[4]);
        }
      }
    },
    // Navigation shortcuts
    {
      key: 'Tab',
      ctrlKey: true,
      description: 'Switch to next workspace',
      category: 'Workspace',
      action: () => {
        if (workspaces.length > 1 && currentWorkspace) {
          const currentIndex = workspaces.findIndex(w => w.id === currentWorkspace.id);
          const nextIndex = (currentIndex + 1) % workspaces.length;
          setCurrentWorkspace(workspaces[nextIndex]);
        }
      }
    },
    {
      key: 'Tab',
      ctrlKey: true,
      shiftKey: true,
      description: 'Switch to previous workspace',
      category: 'Workspace',
      action: () => {
        if (workspaces.length > 1 && currentWorkspace) {
          const currentIndex = workspaces.findIndex(w => w.id === currentWorkspace.id);
          const prevIndex = currentIndex === 0 ? workspaces.length - 1 : currentIndex - 1;
          setCurrentWorkspace(workspaces[prevIndex]);
        }
      }
    },
    // Directory shortcuts
    {
      key: 'o',
      ctrlKey: true,
      description: 'Open directory',
      category: 'Directory',
      action: async () => {
        try {
          const path = await window.electronAPI.selectDirectory();
          if (path) {
            addRecentFolder(path);
          }
        } catch (error) {
          console.error('Failed to open directory:', error);
        }
      }
    },
    // Clear recent folders
    {
      key: 'Delete',
      ctrlKey: true,
      shiftKey: true,
      description: 'Clear recent folders',
      category: 'Directory',
      action: () => {
        clearRecentFolders();
      }
    },
    // Refresh/reload
    {
      key: 'F5',
      description: 'Refresh current directory',
      category: 'Directory',
      action: () => {
        // Trigger a refresh of the current directory
        window.location.reload();
      }
    },
    {
      key: 'r',
      ctrlKey: true,
      description: 'Refresh current directory',
      category: 'Directory',
      action: () => {
        // Trigger a refresh of the current directory
        window.location.reload();
      }
    }
  ];

  return useKeyboardShortcuts({ shortcuts });
};

// Helper function to format keyboard shortcut display
export const formatShortcut = (shortcut: KeyboardShortcut): string => {
  const parts: string[] = [];
  
  if (shortcut.ctrlKey) parts.push('Ctrl');
  if (shortcut.altKey) parts.push('Alt');
  if (shortcut.shiftKey) parts.push('Shift');
  if (shortcut.metaKey) parts.push('Cmd');
  
  // Format special keys
  let key = shortcut.key;
  switch (key.toLowerCase()) {
    case ' ':
      key = 'Space';
      break;
    case 'arrowup':
      key = '↑';
      break;
    case 'arrowdown':
      key = '↓';
      break;
    case 'arrowleft':
      key = '←';
      break;
    case 'arrowright':
      key = '→';
      break;
    case 'enter':
      key = 'Enter';
      break;
    case 'escape':
      key = 'Esc';
      break;
    case 'tab':
      key = 'Tab';
      break;
    case 'delete':
      key = 'Del';
      break;
    default:
      key = key.toUpperCase();
  }
  
  parts.push(key);
  
  return parts.join(' + ');
};