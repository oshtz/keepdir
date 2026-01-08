import { useState, useCallback, useEffect } from 'react';

export interface ContextMenuItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  divider?: boolean;
  shortcut?: string;
}

export interface ContextMenuState {
  isOpen: boolean;
  position: { x: number; y: number };
  items: ContextMenuItem[];
}

export const useContextMenu = () => {
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    isOpen: false,
    position: { x: 0, y: 0 },
    items: []
  });

  const showContextMenu = useCallback((
    event: React.MouseEvent,
    items: ContextMenuItem[]
  ) => {
    event.preventDefault();
    event.stopPropagation();

    // Calculate position to ensure menu stays within viewport
    const { clientX, clientY } = event;
    const menuWidth = 200; // Approximate menu width
    const menuHeight = items.length * 40; // Approximate item height

    const x = clientX + menuWidth > window.innerWidth 
      ? clientX - menuWidth 
      : clientX;
    
    const y = clientY + menuHeight > window.innerHeight 
      ? clientY - menuHeight 
      : clientY;

    setContextMenu({
      isOpen: true,
      position: { x, y },
      items
    });
  }, []);

  const hideContextMenu = useCallback(() => {
    setContextMenu(prev => ({ ...prev, isOpen: false }));
  }, []);

  const handleItemClick = useCallback((item: ContextMenuItem) => {
    if (!item.disabled) {
      item.onClick();
    }
    hideContextMenu();
  }, [hideContextMenu]);

  // Close context menu on outside click or escape
  useEffect(() => {
    const handleClickOutside = () => {
      if (contextMenu.isOpen) {
        hideContextMenu();
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && contextMenu.isOpen) {
        hideContextMenu();
      }
    };

    if (contextMenu.isOpen) {
      document.addEventListener('click', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);

      return () => {
        document.removeEventListener('click', handleClickOutside);
        document.removeEventListener('keydown', handleKeyDown);
      };
    }
    return undefined;
  }, [contextMenu.isOpen, hideContextMenu]);

  return {
    contextMenu,
    showContextMenu,
    hideContextMenu,
    handleItemClick
  };
};