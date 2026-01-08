import React, { useEffect, useRef } from 'react';
import { useUpdate } from '../contexts/UpdateContext';
import Snackbar from '@mui/material/Snackbar';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import CloseIcon from '@mui/icons-material/Close';

/**
 * AutoUpdater - Headless component that runs update checks in the background
 *
 * Behavior:
 * 1. Waits 3 seconds after mount for app to settle
 * 2. Checks for updates
 * 3. If update available, automatically downloads
 * 4. Shows a snackbar notification when ready
 * 5. User must explicitly click to install
 */
const AutoUpdater: React.FC = () => {
  const { status, updateInfo, checkNow, downloadNow, installNow } = useUpdate();
  const hasChecked = useRef(false);
  const [snackbarOpen, setSnackbarOpen] = React.useState(false);

  // Run update check on mount (after delay)
  useEffect(() => {
    if (hasChecked.current) return;

    const timer = setTimeout(async () => {
      hasChecked.current = true;

      try {
        const info = await checkNow();
        if (info) {
          // Update is available, start download
          await downloadNow();
        }
      } catch (err) {
        console.error('Auto-update check failed:', err);
      }
    }, 3000); // 3 second delay for app to settle

    return () => clearTimeout(timer);
  }, [checkNow, downloadNow]);

  // Show snackbar when update is ready
  useEffect(() => {
    if (status === 'ready' && updateInfo) {
      setSnackbarOpen(true);
    }
  }, [status, updateInfo]);

  const handleClose = (_event?: React.SyntheticEvent | Event, reason?: string) => {
    if (reason === 'clickaway') {
      return;
    }
    setSnackbarOpen(false);
  };

  const handleInstall = () => {
    setSnackbarOpen(false);
    installNow();
  };

  const action = (
    <>
      <Button color="primary" size="small" onClick={handleInstall}>
        Restart Now
      </Button>
      <IconButton size="small" color="inherit" onClick={handleClose}>
        <CloseIcon fontSize="small" />
      </IconButton>
    </>
  );

  return (
    <Snackbar
      open={snackbarOpen}
      autoHideDuration={null} // Don't auto-hide - user should decide
      onClose={handleClose}
      message={`Update ${updateInfo?.version || ''} is ready to install`}
      action={action}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
    />
  );
};

export default AutoUpdater;
