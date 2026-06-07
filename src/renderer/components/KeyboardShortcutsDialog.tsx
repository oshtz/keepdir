import React from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
  Chip,
  Divider,
  IconButton
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import KeyboardIcon from '@mui/icons-material/Keyboard';
import { KeyboardShortcut, formatShortcut } from '../hooks/useKeyboardShortcuts';

interface KeyboardShortcutsDialogProps {
  open: boolean;
  onClose: () => void;
  shortcuts: KeyboardShortcut[];
}

const KeyboardShortcutsDialog: React.FC<KeyboardShortcutsDialogProps> = ({
  open,
  onClose,
  shortcuts
}) => {
  // Group shortcuts by category
  const groupedShortcuts = shortcuts.reduce((acc, shortcut) => {
    if (!acc[shortcut.category]) {
      acc[shortcut.category] = [];
    }
    acc[shortcut.category].push(shortcut);
    return acc;
  }, {} as Record<string, KeyboardShortcut[]>);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        tabIndex: -1,
        sx: {
          borderRadius: 1,
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: 'none',
          border: '1px solid',
          borderColor: 'divider',
          backgroundImage: 'none'
        }
      }}
    >
      <DialogTitle sx={{ 
        p: 2.5,
        backgroundColor: 'background.default',
        borderBottom: '1px solid',
        borderColor: 'divider'
      }}>
        <Box display="flex" alignItems="center">
          <KeyboardIcon sx={{ mr: 2, color: 'text.secondary' }} />
          <Typography variant="h5" component="div" sx={{ flexGrow: 1, fontWeight: 600, fontFamily: 'var(--font-header)' }}>
            Keyboard Shortcuts
          </Typography>
          <IconButton 
            onClick={onClose} 
            size="small"
            sx={{ 
              color: 'text.secondary',
              '&:hover': { 
                backgroundColor: 'action.hover',
                color: 'text.primary'
              }
            }}
          >
            <CloseIcon />
          </IconButton>
        </Box>
      </DialogTitle>
      
      <DialogContent sx={{ p: 4, overflow: 'auto', flex: 1 }}>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3, fontFamily: 'var(--font-body)' }}>
          Use these keyboard shortcuts to navigate and perform actions quickly
        </Typography>
        
        {Object.entries(groupedShortcuts).map(([category, categoryShortcuts], index) => (
          <Box key={category} sx={{ mb: 3 }}>
            {index > 0 && <Divider sx={{ mb: 3 }} />}
            
            <Typography 
              variant="h6" 
              sx={{ 
                mb: 2, 
                color: 'primary.main', 
                fontFamily: 'var(--font-header)',
                fontWeight: 600
              }}
            >
              {category}
            </Typography>
            
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {categoryShortcuts.map((shortcut, shortcutIndex) => (
                <Box
                  key={shortcutIndex}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    py: 1.25,
                    px: 0,
                    borderBottom: '1px solid',
                    borderColor: 'divider',
                    '&:hover': {
                      backgroundColor: 'transparent'
                    }
                  }}
                >
                  <Typography 
                    variant="body2" 
                    sx={{ 
                      fontFamily: 'var(--font-body)',
                      flex: 1
                    }}
                  >
                    {shortcut.description}
                  </Typography>
                  
                  <Chip
                    label={formatShortcut(shortcut)}
                    size="small"
                    variant="outlined"
                    sx={{
                      fontFamily: 'monospace',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      backgroundColor: 'action.hover',
                      borderColor: 'divider'
                    }}
                  />
                </Box>
              ))}
            </Box>
          </Box>
        ))}
        
        <Box sx={{ mt: 4, p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
          <Typography component="div" variant="body2" sx={{ fontFamily: 'var(--font-body)', color: 'text.secondary' }}>
            <strong>Tip:</strong> Keyboard shortcuts are disabled when typing in input fields. 
            Press <Chip label="?" size="small" sx={{ mx: 0.5, fontSize: '0.7rem' }} /> to show this dialog anytime.
          </Typography>
        </Box>
      </DialogContent>
      
      <DialogActions sx={{ p: 2, borderTop: '1px solid', borderColor: 'divider' }}>
        <Button 
          onClick={onClose}
          variant="contained"
          sx={{ 
            px: 4,
            fontFamily: 'var(--font-header)'
          }}
        >
          Got it
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default KeyboardShortcutsDialog;
