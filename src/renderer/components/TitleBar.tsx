import React from 'react';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import MinimizeIcon from '@mui/icons-material/Minimize';
import MaximizeIcon from '@mui/icons-material/Crop169';
import CloseIcon from '@mui/icons-material/Close';

interface TitleBarProps {
  children?: React.ReactNode;
}

const TitleBar: React.FC<TitleBarProps> = ({ children }) => {
  const handleWindowControl = (action: 'minimize' | 'maximize' | 'close') => {
    switch (action) {
      case 'minimize':
        window.electronAPI.minimizeWindow();
        break;
      case 'maximize':
        window.electronAPI.maximizeWindow();
        break;
      case 'close':
        window.electronAPI.closeWindow();
        break;
    }
  };

  return (
    <Box
      sx={{
        height: '32px',
        bgcolor: 'background.paper',
        display: 'flex',
        alignItems: 'center',
        WebkitAppRegion: 'drag',
        px: 1,
        minWidth: 0,
        overflow: 'hidden',
        borderBottom: '1px solid',
        borderColor: 'divider',
      }}
    >
      {/* App Title - Left side */}
      <Box sx={{
        fontSize: '0.875rem',
        fontFamily: 'var(--font-header)',
        fontWeight: 600,
        color: 'text.primary',
        flexShrink: 0,
        minWidth: '60px',
        maxWidth: '100px',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        mr: 1
      }}>
        keepdir
      </Box>

      {/* Children content in the middle section */}
      {children && (
        <Box sx={{
          WebkitAppRegion: 'no-drag',
          display: 'flex',
          alignItems: 'center',
          gap: 1,
        }}>
          {children}
        </Box>
      )}

      {/* Spacer - Takes remaining space and maintains drag region */}
      <Box sx={{
        flex: 1,
        minHeight: '32px', // Ensure full height for drag area
      }} />

      {/* Window Controls - Right side */}
      <Box sx={{
        WebkitAppRegion: 'no-drag',
        display: 'flex',
        alignItems: 'center',
        flexShrink: 0,
        gap: 0.25,
      }}>
        <IconButton
          size="small"
          onClick={() => handleWindowControl('minimize')}
          sx={{
            p: 0.5,
            minWidth: '28px',
            minHeight: '28px',
            borderRadius: 1.5,
            '&:hover': {
              bgcolor: 'action.hover',
            }
          }}
        >
          <MinimizeIcon sx={{ fontSize: '16px' }} />
        </IconButton>
        <IconButton
          size="small"
          onClick={() => handleWindowControl('maximize')}
          sx={{
            p: 0.5,
            minWidth: '28px',
            minHeight: '28px',
            borderRadius: 1.5,
            '&:hover': {
              bgcolor: 'action.hover',
            }
          }}
        >
          <MaximizeIcon sx={{ fontSize: '16px' }} />
        </IconButton>
        <IconButton
          size="small"
          onClick={() => handleWindowControl('close')}
          sx={{
            p: 0.5,
            minWidth: '28px',
            minHeight: '28px',
            borderRadius: 1.5,
            '&:hover': {
              bgcolor: 'error.main',
              color: 'error.contrastText'
            }
          }}
        >
          <CloseIcon sx={{ fontSize: '16px' }} />
        </IconButton>
      </Box>
    </Box>
  );
};

export default TitleBar;
