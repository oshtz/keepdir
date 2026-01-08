import React from 'react';
import Box from '@mui/material/Box';
import Skeleton from '@mui/material/Skeleton';
import Grid from '@mui/material/Grid';
import { useTheme } from '@mui/material/styles';

// Skeleton for directory grid view items
export const DirectoryGridSkeleton: React.FC<{ count?: number }> = ({ count = 12 }) => {
  const theme = useTheme();
  
  return (
    <Grid container spacing={1}>
      {Array.from({ length: count }).map((_, index) => (
        <Grid item xs={6} sm={4} md={3} lg={2.4} xl={2} key={index}>
          <Box
            sx={{
              p: 1.25,
              height: 110,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              borderRadius: 1.5,
              backgroundColor: theme.palette.background.paper,
              border: '1px solid',
              borderColor: theme.palette.divider,
            }}
          >
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flex: 1 }}>
              <Skeleton 
                variant="rounded" 
                width={36} 
                height={36}
                sx={{ borderRadius: 1 }}
              />
            </Box>
            <Box sx={{ mt: 0.5, textAlign: 'center' }}>
              <Skeleton variant="text" width="80%" sx={{ mx: 'auto', fontSize: '0.8rem' }} />
              <Skeleton variant="text" width="50%" sx={{ mx: 'auto', fontSize: '0.7rem' }} />
            </Box>
          </Box>
        </Grid>
      ))}
    </Grid>
  );
};

// Skeleton for directory list view items
export const DirectoryListSkeleton: React.FC<{ count?: number }> = ({ count = 10 }) => {
  const theme = useTheme();
  
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
      {Array.from({ length: count }).map((_, index) => (
        <Box
          key={index}
          sx={{
            display: 'flex',
            alignItems: 'center',
            p: 1.5,
            borderRadius: 1,
            backgroundColor: theme.palette.background.paper,
          }}
        >
          <Skeleton variant="rounded" width={24} height={24} sx={{ mr: 2, borderRadius: 0.5 }} />
          <Box sx={{ flex: 1 }}>
            <Skeleton variant="text" width={`${60 + Math.random() * 30}%`} sx={{ fontSize: '1rem' }} />
            <Skeleton variant="text" width={`${30 + Math.random() * 20}%`} sx={{ fontSize: '0.75rem' }} />
          </Box>
        </Box>
      ))}
    </Box>
  );
};

// Skeleton for directory table view
export const DirectoryTableSkeleton: React.FC<{ count?: number }> = ({ count = 10 }) => {
  const theme = useTheme();
  
  return (
    <Box sx={{ width: '100%' }}>
      {/* Header */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: '40px 1fr 100px 150px',
          gap: 1,
          p: 1,
          borderBottom: '1px solid',
          borderColor: theme.palette.divider,
          bgcolor: theme.palette.background.default,
        }}
      >
        <Box />
        <Skeleton variant="text" width={60} />
        <Skeleton variant="text" width={40} />
        <Skeleton variant="text" width={70} />
      </Box>
      {/* Rows */}
      {Array.from({ length: count }).map((_, index) => (
        <Box
          key={index}
          sx={{
            display: 'grid',
            gridTemplateColumns: '40px 1fr 100px 150px',
            gap: 1,
            p: 1,
            borderBottom: '1px solid',
            borderColor: theme.palette.divider,
            alignItems: 'center',
          }}
        >
          <Skeleton variant="rounded" width={24} height={24} />
          <Skeleton variant="text" width={`${50 + Math.random() * 40}%`} />
          <Skeleton variant="text" width={60} />
          <Skeleton variant="text" width={80} />
        </Box>
      ))}
    </Box>
  );
};

// Skeleton for sort suggestions dialog
export const SortSuggestionsSkeleton: React.FC = () => {
  const theme = useTheme();
  
  return (
    <Box sx={{ p: 2 }}>
      {/* Header info box */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          mb: 2,
          p: 1.5,
          borderRadius: 1.5,
          backgroundColor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
        }}
      >
        <Skeleton variant="circular" width={20} height={20} sx={{ mr: 1 }} />
        <Skeleton variant="text" width="60%" />
      </Box>
      
      {/* Directory tree skeleton */}
      <Box sx={{ 
        border: `1px solid ${theme.palette.divider}`,
        borderRadius: 1.5,
        p: 1
      }}>
        {Array.from({ length: 5 }).map((_, index) => (
          <Box key={index} sx={{ mb: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', p: 0.5 }}>
              <Skeleton variant="rounded" width={16} height={16} sx={{ mr: 1 }} />
              <Skeleton variant="rounded" width={18} height={18} sx={{ mr: 1 }} />
              <Skeleton variant="text" width={`${30 + Math.random() * 30}%`} />
              <Skeleton variant="rounded" width={24} height={18} sx={{ ml: 1, borderRadius: 2 }} />
            </Box>
            {/* Nested files (for some items) */}
            {index % 2 === 0 && (
              <Box sx={{ pl: 4, mt: 0.5 }}>
                {Array.from({ length: 3 }).map((_, fileIndex) => (
                  <Box key={fileIndex} sx={{ display: 'flex', alignItems: 'center', py: 0.25 }}>
                    <Skeleton variant="rounded" width={14} height={14} sx={{ mr: 1 }} />
                    <Skeleton variant="text" width={`${40 + Math.random() * 30}%`} sx={{ fontSize: '0.75rem' }} />
                  </Box>
                ))}
              </Box>
            )}
          </Box>
        ))}
      </Box>
      
      {/* Summary chips */}
      <Box sx={{ mt: 2, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton 
            key={index} 
            variant="rounded" 
            width={80 + Math.random() * 40} 
            height={24} 
            sx={{ borderRadius: 3 }} 
          />
        ))}
      </Box>
    </Box>
  );
};

// Skeleton for rename suggestions dialog
export const RenameSuggestionsSkeleton: React.FC = () => {
  const theme = useTheme();
  
  return (
    <Box sx={{ p: 2 }}>
      {/* Header info box */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          mb: 3,
          p: 2,
          borderRadius: 1.5,
          backgroundColor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
        }}
      >
        <Skeleton variant="circular" width={24} height={24} sx={{ mr: 1.5 }} />
        <Skeleton variant="text" width="70%" />
      </Box>
      
      {/* Rename cards */}
      {Array.from({ length: 4 }).map((_, index) => (
        <Box
          key={index}
          sx={{
            p: 3,
            mb: 2,
            borderRadius: 1.5,
            border: `1px solid ${theme.palette.divider}`,
            backgroundColor: theme.palette.background.paper,
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2 }}>
            <Skeleton variant="rounded" width={48} height={48} sx={{ borderRadius: 1.5 }} />
            <Box sx={{ flex: 1 }}>
              <Skeleton variant="text" width="50%" sx={{ fontSize: '1.25rem', mb: 1 }} />
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                <Skeleton variant="rounded" width={20} height={20} />
                <Skeleton variant="rounded" width={150} height={28} sx={{ borderRadius: 3 }} />
              </Box>
              <Skeleton variant="text" width="100%" />
              <Skeleton variant="text" width="80%" />
            </Box>
          </Box>
        </Box>
      ))}
    </Box>
  );
};

// Skeleton for settings panels
export const SettingsPanelSkeleton: React.FC = () => {
  return (
    <Box>
      <Skeleton variant="text" width={200} sx={{ fontSize: '1.5rem', mb: 2 }} />
      <Skeleton variant="text" width="60%" sx={{ mb: 3 }} />
      
      {/* Form fields skeleton */}
      {Array.from({ length: 3 }).map((_, index) => (
        <Box key={index} sx={{ mb: 2 }}>
          <Skeleton variant="text" width={120} sx={{ mb: 0.5 }} />
          <Skeleton variant="rounded" height={40} sx={{ borderRadius: 1.5 }} />
        </Box>
      ))}
      
      {/* Toggle switches */}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mt: 3 }}>
        {Array.from({ length: 2 }).map((_, index) => (
          <Box key={index} sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Skeleton variant="rounded" width={48} height={24} sx={{ borderRadius: 3 }} />
            <Skeleton variant="text" width={150} />
          </Box>
        ))}
      </Box>
    </Box>
  );
};

// Combined loading skeleton based on view mode
interface DirectorySkeletonProps {
  viewMode: 'grid' | 'list' | 'table' | 'tiles' | 'compact' | 'details';
  count?: number;
}

export const DirectorySkeleton: React.FC<DirectorySkeletonProps> = ({ viewMode, count }) => {
  switch (viewMode) {
    case 'grid':
    case 'tiles':
      return <DirectoryGridSkeleton count={count} />;
    case 'list':
    case 'compact':
      return <DirectoryListSkeleton count={count} />;
    case 'table':
    case 'details':
      return <DirectoryTableSkeleton count={count} />;
    default:
      return <DirectoryGridSkeleton count={count} />;
  }
};

export default DirectorySkeleton;
