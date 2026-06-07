import React from 'react';
import {
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Divider,
  Box
} from '@mui/material';
import { ContextMenuItem } from '../hooks/useContextMenu';

interface ContextMenuProps {
  open: boolean;
  position: { x: number; y: number };
  items: ContextMenuItem[];
  onItemClick: (item: ContextMenuItem) => void;
  onClose: () => void;
}

const ContextMenu: React.FC<ContextMenuProps> = ({
  open,
  position,
  items,
  onItemClick,
  onClose
}) => {
  return (
    <Menu
      open={open}
      onClose={onClose}
      anchorReference="anchorPosition"
      anchorPosition={{ top: position.y, left: position.x }}
      transformOrigin={{ vertical: 'top', horizontal: 'left' }}
      transitionDuration={0}
      PaperProps={{
        'data-testid': 'context-menu-overlay',
        'data-surface': 'overlay-sheet',
        sx: {
          borderRadius: 1,
          minWidth: 200,
          boxShadow: 'none',
          border: '1px solid',
          borderColor: (theme) =>
            theme.palette.mode === 'dark'
              ? 'rgba(255,255,255,0.18)'
              : 'rgba(0,0,0,0.18)',
          backgroundColor: 'background.paper',
          backgroundImage: 'none',
          color: 'text.primary',
          '& .MuiMenuItem-root': {
            borderRadius: 1,
            mx: 0.25,
            my: 0,
            minHeight: 34,
            color: 'text.primary',
            '&:hover': {
              backgroundColor: 'action.hover'
            },
            '&.Mui-disabled': {
              opacity: 0.5
            }
          }
        }
      }}
      MenuListProps={{
        sx: { py: 0.5 }
      }}
    >
      {items.flatMap((item, index) => {
        const renderedItems: React.ReactElement[] = [];

        if (item.divider && index > 0) {
          renderedItems.push(
            <Divider key={`${item.id}-divider`} sx={{ my: 0.5, mx: 1 }} />
          );
        }

        renderedItems.push(
          <MenuItem
            key={item.id}
            onClick={() => onItemClick(item)}
            disabled={item.disabled}
            sx={{
              fontFamily: 'var(--font-body)',
              fontSize: '0.875rem'
            }}
          >
            {item.icon && (
              <ListItemIcon sx={{ minWidth: 36, color: 'text.secondary' }}>
                {item.icon}
              </ListItemIcon>
            )}
            <ListItemText
              primary={item.label}
              primaryTypographyProps={{
                sx: { fontFamily: 'var(--font-body)' }
              }}
            />
            {item.shortcut && (
              <Box
                sx={{
                  ml: 2,
                  px: 1,
                  py: 0.25,
                  backgroundColor: 'action.hover',
                  borderRadius: 0.75,
                  fontSize: '0.75rem',
                  fontFamily: 'monospace',
                  color: 'text.secondary'
                }}
              >
                {item.shortcut}
              </Box>
            )}
          </MenuItem>
        );

        return renderedItems;
      })}
    </Menu>
  );
};

export default ContextMenu;
