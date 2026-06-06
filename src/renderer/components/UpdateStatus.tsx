import React from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import LinearProgress from '@mui/material/LinearProgress';
import Alert from '@mui/material/Alert';
import Chip from '@mui/material/Chip';
import Collapse from '@mui/material/Collapse';
import IconButton from '@mui/material/IconButton';
import RefreshIcon from '@mui/icons-material/Refresh';
import DownloadIcon from '@mui/icons-material/Download';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import NewReleasesIcon from '@mui/icons-material/NewReleases';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import { useUpdate } from '../contexts/UpdateContext';

interface UpdateStatusProps {
  darkMode?: boolean;
}

const UpdateStatus: React.FC<UpdateStatusProps> = ({ darkMode }) => {
  const {
    currentVersion,
    status,
    updateInfo,
    updatePath,
    downloadProgress,
    error,
    lastCheckedAt,
    checkNow,
    downloadNow,
    installNow,
    clearError,
  } = useUpdate();

  const [showNotes, setShowNotes] = React.useState(false);

  const handleUpdateAndRestart = async () => {
    const targetUpdatePath = updatePath || (await downloadNow());
    if (targetUpdatePath) {
      await installNow(targetUpdatePath);
    }
  };

  const formatLastChecked = () => {
    if (!lastCheckedAt) return 'Never';
    const date = new Date(lastCheckedAt);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60)
      return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;

    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24)
      return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;

    return date.toLocaleDateString();
  };

  const getStatusChip = () => {
    switch (status) {
      case 'checking':
        return (
          <Chip
            label="Checking..."
            size="small"
            color="info"
            icon={<CircularProgress size={14} />}
          />
        );
      case 'available':
        return (
          <Chip
            label="Update Available"
            size="small"
            color="warning"
            icon={<NewReleasesIcon />}
          />
        );
      case 'downloading':
        return (
          <Chip
            label="Downloading..."
            size="small"
            color="info"
            icon={<DownloadIcon />}
          />
        );
      case 'ready':
        return (
          <Chip
            label="Ready to Install"
            size="small"
            color="success"
            icon={<CheckCircleIcon />}
          />
        );
      case 'installing':
        return (
          <Chip
            label="Installing..."
            size="small"
            color="info"
            icon={<CircularProgress size={14} />}
          />
        );
      case 'up-to-date':
        return (
          <Chip
            label="Up to Date"
            size="small"
            color="success"
            icon={<CheckCircleIcon />}
          />
        );
      case 'error':
        return <Chip label="Error" size="small" color="error" />;
      default:
        return null;
    }
  };

  const getActionButton = () => {
    switch (status) {
      case 'idle':
      case 'up-to-date':
      case 'error':
        return (
          <Button
            variant="outlined"
            size="small"
            startIcon={<RefreshIcon />}
            onClick={checkNow}
          >
            Check for Updates
          </Button>
        );
      case 'available':
        return (
          <Button
            variant="contained"
            size="small"
            startIcon={<RestartAltIcon />}
            onClick={handleUpdateAndRestart}
          >
            Update & Restart
          </Button>
        );
      case 'ready':
        return (
          <Button
            variant="contained"
            size="small"
            color="success"
            startIcon={<RestartAltIcon />}
            onClick={() => installNow(updatePath || undefined)}
          >
            Restart & Update
          </Button>
        );
      case 'checking':
      case 'downloading':
      case 'installing':
        return (
          <Button variant="outlined" size="small" disabled>
            {status === 'checking' && 'Checking...'}
            {status === 'downloading' && 'Downloading...'}
            {status === 'installing' && 'Installing...'}
          </Button>
        );
      default:
        return null;
    }
  };

  return (
    <Box sx={{ width: '100%' }}>
      {/* Version and Status Row */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          mb: 2,
        }}
      >
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            KeepDir
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Version {currentVersion || 'Unknown'}
          </Typography>
        </Box>
        {getStatusChip()}
      </Box>

      {/* Download Progress */}
      {status === 'downloading' && (
        <Box sx={{ mb: 2 }}>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              mb: 0.5,
            }}
          >
            <Typography variant="body2" color="text.secondary">
              Downloading update...
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {downloadProgress}%
            </Typography>
          </Box>
          <LinearProgress variant="determinate" value={downloadProgress} />
        </Box>
      )}

      {/* Error Alert */}
      {error && (
        <Alert severity="error" onClose={clearError} sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {/* Update Info */}
      {updateInfo &&
        (status === 'available' ||
          status === 'ready' ||
          status === 'downloading') && (
          <Box
            sx={{
              p: 2,
              mb: 2,
              borderRadius: 1,
              backgroundColor: darkMode
                ? 'rgba(255,255,255,0.05)'
                : 'rgba(0,0,0,0.02)',
              border: '1px solid',
              borderColor: darkMode
                ? 'rgba(255,255,255,0.1)'
                : 'rgba(0,0,0,0.08)',
            }}
          >
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <Typography variant="subtitle2">
                Version {updateInfo.version} Available
              </Typography>
              {updateInfo.notes && (
                <IconButton
                  size="small"
                  onClick={() => setShowNotes(!showNotes)}
                >
                  {showNotes ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                </IconButton>
              )}
            </Box>

            {updateInfo.publishedAt && (
              <Typography variant="caption" color="text.secondary">
                Released {new Date(updateInfo.publishedAt).toLocaleDateString()}
              </Typography>
            )}

            {/* Release Notes */}
            <Collapse in={showNotes}>
              {updateInfo.notes && (
                <Box
                  sx={{
                    mt: 1,
                    p: 1,
                    borderRadius: 1,
                    backgroundColor: darkMode
                      ? 'rgba(0,0,0,0.2)'
                      : 'rgba(0,0,0,0.04)',
                    maxHeight: 200,
                    overflow: 'auto',
                  }}
                >
                  <Typography
                    variant="body2"
                    component="pre"
                    sx={{
                      whiteSpace: 'pre-wrap',
                      fontFamily: 'inherit',
                      m: 0,
                      fontSize: '0.8rem',
                    }}
                  >
                    {updateInfo.notes}
                  </Typography>
                </Box>
              )}
            </Collapse>
          </Box>
        )}

      {/* Action Button */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        {getActionButton()}
        <Typography variant="caption" color="text.secondary">
          Last checked: {formatLastChecked()}
        </Typography>
      </Box>
    </Box>
  );
};

export default UpdateStatus;
