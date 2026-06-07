import React from 'react';
import { Box, List, ListItem, ListItemButton, ListItemIcon, ListItemText } from '@mui/material';
import SettingsIcon from '@mui/icons-material/Settings';
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
  tabs?: SettingsTab[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
}

const defaultTabs: SettingsTab[] = [
  { id: 'general', label: 'General', icon: <SettingsIcon /> },
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
      data-testid="settings-sidepanel"
      data-surface="plain-nav"
      sx={{
        width: 252,
        minWidth: 252,
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
        p: 1.5,
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
          <ListItem key={tab.id} disablePadding sx={{ mb: 0.75 }}>
            <ListItemButton
              selected={activeTab === tab.id}
              onClick={() => onTabChange(tab.id)}
              sx={{
                borderRadius: 1,
                position: 'relative',
                overflow: 'hidden',
                py: 1.2,
                px: 1.5,
                '&.Mui-selected': {
                  backgroundColor: 'action.selected',
                  color: 'text.primary',
                  '&:hover': {
                    backgroundColor: 'action.hover'
                  },
                  '& .MuiListItemIcon-root': {
                    color: 'text.primary'
                  }
                },
                '&:hover': {
                  backgroundColor: 'action.hover'
                },
                transition: 'background-color 0.16s ease, color 0.16s ease'
              }}
            >
              <ListItemIcon
                sx={{
                  minWidth: 34,
                  position: 'relative',
                  zIndex: 1,
                  color: activeTab === tab.id ? 'text.primary' : 'text.secondary',
                  '& .MuiSvgIcon-root': {
                    fontSize: 19
                  }
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
                    color: activeTab === tab.id ? 'text.primary' : 'text.primary',
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
