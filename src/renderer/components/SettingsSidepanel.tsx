import React from 'react';
import { motion } from 'framer-motion';
import { Box, List, ListItem, ListItemButton, ListItemIcon, ListItemText } from '@mui/material';
import SettingsIcon from '@mui/icons-material/Settings';
import PaletteIcon from '@mui/icons-material/Palette';
import WorkspaceIcon from '@mui/icons-material/Workspaces';
import ExtensionIcon from '@mui/icons-material/Extension';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import KeyboardIcon from '@mui/icons-material/Keyboard';

interface SettingsTab {
  id: string;
  label: string;
  icon: React.ReactNode;
}

interface SettingsSidepanelProps {
  tabs: SettingsTab[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
}

const defaultTabs: SettingsTab[] = [
  { id: 'general', label: 'General', icon: <SettingsIcon /> },
  { id: 'themes', label: 'Workspace Themes', icon: <PaletteIcon /> },
  { id: 'workspace', label: 'Workspace', icon: <WorkspaceIcon /> },
  { id: 'sections', label: 'Custom Sections', icon: <ExtensionIcon /> },
  { id: 'providers', label: 'AI Providers', icon: <SmartToyIcon /> },
  { id: 'shortcuts', label: 'Keyboard Shortcuts', icon: <KeyboardIcon /> }
];

const SettingsSidepanel: React.FC<SettingsSidepanelProps> = ({
  tabs = defaultTabs,
  activeTab,
  onTabChange
}) => {
  return (
    <Box
      sx={{
        width: 240,
        minWidth: 240,
        height: '100%',
        minHeight: 0,
        borderRight: '1px solid',
        borderColor: 'divider',
        backgroundColor: 'background.default',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0
      }}
    >
      <List sx={{ 
        flex: 1, 
        p: 2, 
        overflow: 'auto',
        '&::-webkit-scrollbar': {
          width: '6px',
        },
        '&::-webkit-scrollbar-track': {
          background: 'transparent',
        },
        '&::-webkit-scrollbar-thumb': {
          background: 'rgba(0,0,0,0.2)',
          borderRadius: 'var(--border-radius-small)',
        },
        '&::-webkit-scrollbar-thumb:hover': {
          background: 'rgba(0,0,0,0.3)',
        },
      }}>
        {tabs.map((tab) => (
          <ListItem key={tab.id} disablePadding sx={{ mb: 1 }}>
            <ListItemButton
              selected={activeTab === tab.id}
              onClick={() => onTabChange(tab.id)}
              sx={{
                borderRadius: 1.5,
                position: 'relative',
                overflow: 'hidden',
                py: 1.5,
                px: 2,
                '&.Mui-selected': {
                  backgroundColor: 'primary.main',
                  color: 'primary.contrastText',
                  '&:hover': {
                    backgroundColor: 'primary.dark'
                  },
                  '& .MuiListItemIcon-root': {
                    color: 'primary.contrastText'
                  }
                },
                '&:hover': {
                  backgroundColor: 'action.hover'
                },
                transition: 'all 0.2s ease'
              }}
            >
              {activeTab === tab.id && (
                <motion.div
                  layoutId="activeSettingsTab"
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    backgroundColor: 'var(--mui-palette-primary-main)',
                    borderRadius: 1.5,
                    zIndex: 0
                  }}
                  initial={false}
                  transition={{
                    type: 'spring',
                    stiffness: 500,
                    damping: 30
                  }}
                />
              )}
              
              <ListItemIcon
                sx={{
                  minWidth: 36,
                  position: 'relative',
                  zIndex: 1,
                  color: activeTab === tab.id ? 'primary.contrastText' : 'text.secondary'
                }}
              >
                {tab.icon}
              </ListItemIcon>
              
              <ListItemText
                primary={tab.label}
                sx={{
                  position: 'relative',
                  zIndex: 1,
                  ml: 0.5,
                  '& .MuiListItemText-primary': {
                    fontFamily: 'var(--font-body)',
                    fontSize: '0.875rem',
                    fontWeight: activeTab === tab.id ? 600 : 400,
                    color: activeTab === tab.id ? 'primary.contrastText' : 'text.primary',
                    lineHeight: 1.2
                  }
                }}
              />
            </ListItemButton>
          </ListItem>
        ))}
      </List>
    </Box>
  );
};

export default SettingsSidepanel;
