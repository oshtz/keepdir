import React from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  LinearProgress,
  IconButton,
  Alert,
  Chip,
} from '@mui/material';
import {
  Close as CloseIcon,
  Pause as PauseIcon,
  PlayArrow as PlayIcon,
  Stop as StopIcon,
} from '@mui/icons-material';
import { useOperationHistory } from '../contexts/OperationHistoryContext';

interface BatchProgressDialogProps {
  open: boolean;
  onClose: () => void;
  batchName: string;
  onConfirmCancel?: () => void;
}

const BatchProgressDialog: React.FC<BatchProgressDialogProps> = ({
  open,
  onClose,
  batchName,
  onConfirmCancel,
}) => {
  const {
    batchExecutionState,
    pauseBatch,
    resumeBatch,
    cancelBatch,
  } = useOperationHistory();

  const [showCancelConfirm, setShowCancelConfirm] = React.useState(false);

  if (!batchExecutionState) {
    return null;
  }

  const { batchId, status, currentIndex, totalOperations, startTime, pausedTime } = batchExecutionState;
  const progress = totalOperations > 0 ? (currentIndex / totalOperations) * 100 : 0;
  const isRunning = status === 'running';
  const isPausedState = status === 'paused';
  const isCancelledState = status === 'cancelled';

  const handlePause = () => {
    pauseBatch(batchId);
  };

  const handleResume = () => {
    resumeBatch(batchId);
  };

  const handleCancel = () => {
    setShowCancelConfirm(true);
  };

  const handleConfirmCancel = () => {
    cancelBatch(batchId);
    setShowCancelConfirm(false);
    onConfirmCancel?.();
  };

  const handleCancelCancel = () => {
    setShowCancelConfirm(false);
  };

  const getElapsedTime = () => {
    const now = pausedTime || new Date();
    const elapsed = now.getTime() - startTime.getTime();
    const seconds = Math.floor(elapsed / 1000);
    const minutes = Math.floor(seconds / 60);
    if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    }
    return `${seconds}s`;
  };

  const getEstimatedTimeRemaining = () => {
    if (currentIndex === 0 || isPausedState) return 'Calculating...';
    const now = new Date();
    const elapsed = now.getTime() - startTime.getTime();
    const avgTimePerOp = elapsed / currentIndex;
    const remaining = avgTimePerOp * (totalOperations - currentIndex);
    const seconds = Math.floor(remaining / 1000);
    const minutes = Math.floor(seconds / 60);
    if (minutes > 0) {
      return `~${minutes}m ${seconds % 60}s`;
    }
    return `~${seconds}s`;
  };

  const getStatusChip = () => {
    if (isCancelledState) {
      return <Chip label="Cancelled" color="error" size="small" />;
    }
    if (isPausedState) {
      return <Chip label="Paused" color="warning" size="small" />;
    }
    if (isRunning) {
      return <Chip label="Running" color="primary" size="small" />;
    }
    return <Chip label="Completed" color="success" size="small" />;
  };

  return (
    <Dialog
      open={open}
      onClose={isPausedState || isCancelledState ? onClose : undefined}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: 2,
        },
      }}
    >
      <DialogTitle
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          pb: 1,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography variant="h6" component="span" sx={{ fontFamily: 'var(--font-header)' }}>
            {batchName}
          </Typography>
          {getStatusChip()}
        </Box>
        {(isPausedState || isCancelledState) && (
          <IconButton onClick={onClose} size="small">
            <CloseIcon />
          </IconButton>
        )}
      </DialogTitle>

      <DialogContent>
        {showCancelConfirm ? (
          <Alert
            severity="warning"
            sx={{ mb: 2 }}
            action={
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Button size="small" onClick={handleCancelCancel}>
                  No, Continue
                </Button>
                <Button size="small" color="error" variant="contained" onClick={handleConfirmCancel}>
                  Yes, Cancel
                </Button>
              </Box>
            }
          >
            <Typography variant="body2" sx={{ fontFamily: 'var(--font-body)' }}>
              Are you sure you want to cancel? {currentIndex} of {totalOperations} operations have been completed. 
              Completed operations will remain applied.
            </Typography>
          </Alert>
        ) : (
          <>
            <Box sx={{ mb: 3 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                <Typography variant="body2" color="text.secondary" sx={{ fontFamily: 'var(--font-body)' }}>
                  Progress: {currentIndex} of {totalOperations} operations
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ fontFamily: 'var(--font-body)' }}>
                  {Math.round(progress)}%
                </Typography>
              </Box>
              <LinearProgress
                variant="determinate"
                value={progress}
                sx={{
                  height: 10,
                  borderRadius: 5,
                  backgroundColor: 'rgba(0,0,0,0.1)',
                  '& .MuiLinearProgress-bar': {
                    borderRadius: 5,
                    backgroundColor: isPausedState ? 'warning.main' : isCancelledState ? 'error.main' : 'primary.main',
                  },
                }}
              />
            </Box>

            <Box sx={{ display: 'flex', gap: 3, mb: 2 }}>
              <Box>
                <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'var(--font-body)' }}>
                  Elapsed Time
                </Typography>
                <Typography variant="body1" sx={{ fontFamily: 'var(--font-header)', fontWeight: 600 }}>
                  {getElapsedTime()}
                </Typography>
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'var(--font-body)' }}>
                  Estimated Remaining
                </Typography>
                <Typography variant="body1" sx={{ fontFamily: 'var(--font-header)', fontWeight: 600 }}>
                  {getEstimatedTimeRemaining()}
                </Typography>
              </Box>
              <Box>
                <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'var(--font-body)' }}>
                  Completed
                </Typography>
                <Typography variant="body1" sx={{ fontFamily: 'var(--font-header)', fontWeight: 600 }}>
                  {currentIndex}
                </Typography>
              </Box>
            </Box>

            {isPausedState && (
              <Alert severity="info" sx={{ mb: 2 }}>
                <Typography variant="body2" sx={{ fontFamily: 'var(--font-body)' }}>
                  Operation paused. Click "Resume" to continue or "Cancel" to stop.
                  Completed operations will remain applied.
                </Typography>
              </Alert>
            )}

            {isCancelledState && (
              <Alert severity="warning" sx={{ mb: 2 }}>
                <Typography variant="body2" sx={{ fontFamily: 'var(--font-body)' }}>
                  Operation cancelled. {currentIndex} of {totalOperations} operations were completed.
                  You can undo completed operations from the Operation History panel.
                </Typography>
              </Alert>
            )}
          </>
        )}
      </DialogContent>

      {!showCancelConfirm && (
        <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
          {!isCancelledState && (
            <>
              {isPausedState ? (
                <Button
                  variant="contained"
                  color="primary"
                  startIcon={<PlayIcon />}
                  onClick={handleResume}
                  sx={{ fontFamily: 'var(--font-header)' }}
                >
                  Resume
                </Button>
              ) : isRunning ? (
                <Button
                  variant="outlined"
                  color="warning"
                  startIcon={<PauseIcon />}
                  onClick={handlePause}
                  sx={{ fontFamily: 'var(--font-header)' }}
                >
                  Pause
                </Button>
              ) : null}
              
              {(isRunning || isPausedState) && (
                <Button
                  variant="outlined"
                  color="error"
                  startIcon={<StopIcon />}
                  onClick={handleCancel}
                  sx={{ fontFamily: 'var(--font-header)' }}
                >
                  Cancel
                </Button>
              )}
            </>
          )}
          
          {(isCancelledState || currentIndex === totalOperations) && (
            <Button
              variant="contained"
              onClick={onClose}
              sx={{ fontFamily: 'var(--font-header)' }}
            >
              Close
            </Button>
          )}
        </DialogActions>
      )}
    </Dialog>
  );
};

export default BatchProgressDialog;
