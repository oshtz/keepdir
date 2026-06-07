import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Box, Typography, useTheme } from '@mui/material';

interface Tab {
  id: string;
  label: string;
  content?: React.ReactNode;
}

interface SmoothTabsProps {
  tabs: Tab[];
  onTabChange?: (tabId: string) => void;
  activeTab?: string;
  variant?: 'underline' | 'pill' | 'background';
}

const SmoothTabs: React.FC<SmoothTabsProps> = ({
  tabs,
  onTabChange,
  activeTab,
  variant = 'underline'
}) => {
  const theme = useTheme();
  const [selectedTab, setSelectedTab] = useState(activeTab || tabs[0]?.id);

  const handleTabClick = (tabId: string) => {
    setSelectedTab(tabId);
    onTabChange?.(tabId);
  };

  const getTabStyles = () => {
    switch (variant) {
      case 'pill':
        return {
          container: {
            backgroundColor: 'rgba(0,0,0,0.05)',
            borderRadius: 'var(--border-radius-medium)',
            padding: '4px',
            display: 'flex',
            gap: '4px'
          },
          tab: {
            padding: '8px 16px',
            borderRadius: 'var(--border-radius-medium)',
            cursor: 'pointer',
            position: 'relative' as const,
            zIndex: 1,
            transition: 'color 0.2s ease'
          },
          indicator: {
            backgroundColor: 'white',
            borderRadius: 'var(--border-radius-medium)',
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
          }
        };
      case 'background':
        return {
          container: {
            display: 'flex',
            gap: '8px',
            padding: '4px',
            backgroundColor: theme.palette.mode === 'dark'
              ? 'rgba(255,255,255,0.05)'
              : 'rgba(0,0,0,0.04)',
            borderRadius: 'var(--border-radius-medium)'
          },
          tab: {
            padding: '12px 20px',
            borderRadius: 'var(--border-radius-medium)',
            cursor: 'pointer',
            position: 'relative' as const,
            zIndex: 1,
            transition: 'color 0.2s ease'
          },
          indicator: {
            backgroundColor: theme.palette.primary.main,
            borderRadius: 'var(--border-radius-medium)'
          }
        };
      default: // underline
        return {
          container: {
            display: 'flex',
            borderBottom: '1px solid rgba(0,0,0,0.1)',
            position: 'relative' as const
          },
          tab: {
            padding: '12px 20px',
            cursor: 'pointer',
            position: 'relative' as const,
            zIndex: 1,
            transition: 'color 0.2s ease'
          },
          indicator: {
            height: '2px',
            backgroundColor: theme.palette.primary.main,
            bottom: 0
          }
        };
    }
  };

  const styles = getTabStyles();

  return (
    <Box>
      <Box sx={styles.container}>
        {tabs.map((tab) => (
          <Box
            key={tab.id}
            sx={styles.tab}
            onClick={() => handleTabClick(tab.id)}
          >
            <Typography
              variant="body2"
              sx={{
                fontFamily: 'var(--font-header)',
                fontWeight: selectedTab === tab.id ? 600 : 400,
                color: selectedTab === tab.id 
                  ? (variant === 'background' ? theme.palette.primary.contrastText : 'primary.main')
                  : 'text.secondary',
                position: 'relative',
                zIndex: 2
              }}
            >
              {tab.label}
            </Typography>
            
            {selectedTab === tab.id && (
              <motion.div
                layoutId="activeTab"
                style={{
                  position: 'absolute',
                  top: variant === 'underline' ? 'auto' : 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  zIndex: 0,
                  ...styles.indicator
                }}
                initial={false}
                transition={{
                  type: 'spring',
                  stiffness: 500,
                  damping: 30
                }}
              />
            )}
          </Box>
        ))}
      </Box>
      
      {/* Tab Content */}
      <Box sx={{ mt: 2 }}>
        {tabs.map((tab) => (
          <motion.div
            key={tab.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ 
              opacity: selectedTab === tab.id ? 1 : 0,
              y: selectedTab === tab.id ? 0 : 10
            }}
            transition={{ duration: 0.2 }}
            style={{ 
              display: selectedTab === tab.id ? 'block' : 'none'
            }}
          >
            {tab.content}
          </motion.div>
        ))}
      </Box>
    </Box>
  );
};

export default SmoothTabs;
