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
      PaperProps={{
        sx: {
          borderRadius: 1.5,
          minWidth: 200,
          boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
          border: '1px solid',
          borderColor: 'divider',
          '& .MuiMenuItem-root': {
            borderRadius: 1.5,
            mx: 0.5,
            my: 0.25,
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
        sx: { py: 1 }
      }}
    >
      {items.map((item, index) => (
        <React.Fragment key={item.id}>
          {item.divider && index > 0 && (
            <Divider sx={{ my: 0.5, mx: 1 }} />
          )}
          <MenuItem
            onClick={() => onItemClick(item)}
            disabled={item.disabled}
            sx={{
              fontFamily: 'var(--font-body)',
              fontSize: '0.875rem'
            }}
          >
            {item.icon && (
              <ListItemIcon sx={{ minWidth: 36 }}>
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
                  backgroundColor: 'background.default',
                  border: '1px solid',
                  borderColor: 'divider',
                  borderRadius: 0.5,
                  fontSize: '0.75rem',
                  fontFamily: 'monospace',
                  color: 'text.secondary'
                }}
              >
                {item.shortcut}
              </Box>
            )}
          </MenuItem>
        </React.Fragment>
      ))}
    </Menu>
  );
};

export default ContextMenu;