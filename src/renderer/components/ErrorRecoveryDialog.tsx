import React, { useState } from 'react';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import CloseIcon from '@mui/icons-material/Close';
import ErrorIcon from '@mui/icons-material/Error';
import RefreshIcon from '@mui/icons-material/Refresh';
import SkipNextIcon from '@mui/icons-material/SkipNext';
import UndoIcon from '@mui/icons-material/Undo';
import StopIcon from '@mui/icons-material/Stop';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Checkbox from '@mui/material/Checkbox';
import Collapse from '@mui/material/Collapse';
import ExpandLess from '@mui/icons-material/ExpandLess';
import ExpandMore from '@mui/icons-material/ExpandMore';
import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import LinearProgress from '@mui/material/LinearProgress';
import Divider from '@mui/material/Divider';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import FolderIcon from '@mui/icons-material/Folder';

export interface FailedOperation {
  id: string;
  filePath: string;
  fileName: string;
  isDirectory: boolean;
  operationType: 'rename' | 'move' | 'sort';
  error: string;
  errorCode?: string;
  canRetry: boolean;
}

export interface SuccessfulOperation {
  id: string;
  originalPath: string;
  newPath: string;
  fileName: string;
  operationType: 'rename' | 'move' | 'sort';
}

export type RecoveryAction = 'retry' | 'skip' | 'rollback' | 'abort';

interface ErrorRecoveryDialogProps {
  open: boolean;
  onClose: () => void;
  failedOperations: FailedOperation[];
  successfulOperations: SuccessfulOperation[];
  onRetry: (operationIds: string[]) => Promise<void>;
  onSkip: (operationIds: string[]) => void;
  onRollback: () => Promise<void>;
  onAbort: () => void;
  isProcessing?: boolean;
  processingMessage?: string;
}

const ErrorRecoveryDialog: React.FC<ErrorRecoveryDialogProps> = ({
  open,
  onClose,
  failedOperations,
  successfulOperations,
  onRetry,
  onSkip,
  onRollback,
  onAbort,
  isProcessing = false,
  processingMessage = 'Processing...'
}) => {
  const [selectedFailedIds, setSelectedFailedIds] = useState<Set<string>>(
    new Set(failedOperations.filter(op => op.canRetry).map(op => op.id))
  );
  const [showSuccessful, setShowSuccessful] = useState(false);
  const [showErrorDetails, setShowErrorDetails] = useState<string | null>(null);

  const handleToggleFailedItem = (id: string) => {
    const newSelected = new Set(selectedFailedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedFailedIds(newSelected);
  };

  const handleSelectAllFailed = () => {
    const retryableIds = failedOperations.filter(op => op.canRetry).map(op => op.id);
    if (selectedFailedIds.size === retryableIds.length) {
      setSelectedFailedIds(new Set());
    } else {
      setSelectedFailedIds(new Set(retryableIds));
    }
  };

  const handleRetrySelected = async () => {
    if (selectedFailedIds.size > 0) {
      await onRetry(Array.from(selectedFailedIds));
    }
  };

  const handleSkipSelected = () => {
    if (selectedFailedIds.size > 0) {
      onSkip(Array.from(selectedFailedIds));
    }
  };

  const handleSkipAll = () => {
    onSkip(failedOperations.map(op => op.id));
    onClose();
  };

  const handleRollbackAll = async () => {
    await onRollback();
  };

  const retryableCount = failedOperations.filter(op => op.canRetry).length;
  const nonRetryableCount = failedOperations.length - retryableCount;

  const getErrorMessage = (error: string, errorCode?: string): string => {
    const messages: Record<string, string> = {
      'ENOENT': 'File or directory not found',
      'EACCES': 'Permission denied',
      'EEXIST': 'File already exists',
      'ENOTEMPTY': 'Directory is not empty',
      'EBUSY': 'File is in use by another process',
      'EINVAL': 'Invalid file name or path',
      'ENAMETOOLONG': 'File name is too long'
    };
    return errorCode && messages[errorCode] ? messages[errorCode] : error;
  };

  return (
    <Dialog
      open={open}
      onClose={isProcessing ? undefined : onClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        tabIndex: -1,
        sx: {
          borderRadius: 1.5,
          overflow: 'hidden'
        }
      }}
    >
      <DialogTitle
        sx={{
          p: 2,
          background: 'linear-gradient(135deg, rgba(255,118,117,0.1) 0%, rgba(255,255,255,1) 100%)',
          borderBottom: '1px solid rgba(0,0,0,0.06)'
        }}
      >
        <Box display="flex" alignItems="center" gap={1}>
          <ErrorIcon color="error" />
          <Typography
            variant="h6"
            component="div"
            sx={{
              flexGrow: 1,
              fontWeight: 600,
              fontFamily: 'var(--font-header)'
            }}
          >
            Operation Errors
          </Typography>
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ fontFamily: 'var(--font-body)' }}
          >
            {failedOperations.length} failed, {successfulOperations.length} successful
          </Typography>
          {!isProcessing && (
            <IconButton
              onClick={onClose}
              size="small"
              aria-label="close"
              sx={{
                color: 'text.secondary',
                '&:hover': {
                  backgroundColor: 'rgba(0,0,0,0.04)',
                  color: 'text.primary'
                }
              }}
            >
              <CloseIcon />
            </IconButton>
          )}
        </Box>
      </DialogTitle>

      <DialogContent sx={{ p: 3 }}>
        {/* Processing Indicator */}
        {isProcessing && (
          <Box sx={{ mb: 3 }}>
            <Alert severity="info" sx={{ mb: 2 }}>
              <AlertTitle sx={{ fontFamily: 'var(--font-header)' }}>
                {processingMessage}
              </AlertTitle>
              <Typography variant="body2" sx={{ fontFamily: 'var(--font-body)' }}>
                Please wait while the operation completes...
              </Typography>
            </Alert>
            <LinearProgress />
          </Box>
        )}

        {/* Error Summary */}
        <Alert 
          severity="error" 
          sx={{ 
            mb: 3,
            '& .MuiAlert-message': { width: '100%' }
          }}
        >
          <AlertTitle sx={{ fontFamily: 'var(--font-header)' }}>
            {failedOperations.length} operation{failedOperations.length !== 1 ? 's' : ''} failed
          </AlertTitle>
          <Typography variant="body2" sx={{ fontFamily: 'var(--font-body)', mb: 1 }}>
            Some file operations could not be completed. You can retry, skip, or rollback the changes.
          </Typography>
          {nonRetryableCount > 0 && (
            <Typography variant="body2" color="error" sx={{ fontFamily: 'var(--font-body)' }}>
              Note: {nonRetryableCount} operation{nonRetryableCount !== 1 ? 's' : ''} cannot be retried.
            </Typography>
          )}
        </Alert>

        {/* Failed Operations List */}
        <Box sx={{ mb: 3 }}>
          <Box display="flex" alignItems="center" justifyContent="space-between" mb={1}>
            <Typography
              variant="subtitle1"
              sx={{ fontFamily: 'var(--font-header)', fontWeight: 600 }}
            >
              Failed Operations
            </Typography>
            {retryableCount > 1 && (
              <Button
                size="small"
                onClick={handleSelectAllFailed}
                sx={{ fontFamily: 'var(--font-header)' }}
              >
                {selectedFailedIds.size === retryableCount ? 'Deselect All' : 'Select All'}
              </Button>
            )}
          </Box>

          <List
            sx={{
              border: '1px solid',
              borderColor: 'error.light',
              borderRadius: 1.5,
              maxHeight: 250,
              overflow: 'auto',
              '&::-webkit-scrollbar': {
                width: '6px'
              },
              '&::-webkit-scrollbar-thumb': {
                background: 'rgba(0,0,0,0.2)',
                borderRadius: 'var(--border-radius-small)'
              }
            }}
          >
            {failedOperations.map((op, index) => (
              <React.Fragment key={op.id}>
                <ListItem
                  dense
                  sx={{
                    backgroundColor: selectedFailedIds.has(op.id) ? 'error.light' : 'transparent',
                    '&:hover': { backgroundColor: 'action.hover' }
                  }}
                >
                  {op.canRetry && (
                    <Checkbox
                      edge="start"
                      checked={selectedFailedIds.has(op.id)}
                      onChange={() => handleToggleFailedItem(op.id)}
                      tabIndex={-1}
                      disableRipple
                      disabled={isProcessing}
                    />
                  )}
                  <ListItemIcon sx={{ minWidth: 36 }}>
                    {op.isDirectory ? (
                      <FolderIcon fontSize="small" color="error" />
                    ) : (
                      <InsertDriveFileIcon fontSize="small" color="error" />
                    )}
                  </ListItemIcon>
                  <ListItemText
                    primary={
                      <Typography
                        variant="body2"
                        sx={{
                          fontFamily: 'var(--font-body)',
                          fontWeight: 500,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}
                      >
                        {op.fileName}
                      </Typography>
                    }
                    secondary={
                      <Box>
                        <Typography
                          variant="caption"
                          color="error"
                          sx={{
                            fontFamily: 'var(--font-body)',
                            display: 'block'
                          }}
                        >
                          {getErrorMessage(op.error, op.errorCode)}
                        </Typography>
                        {showErrorDetails === op.id && (
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            sx={{
                              fontFamily: 'var(--font-body)',
                              display: 'block',
                              mt: 0.5,
                              wordBreak: 'break-all'
                            }}
                          >
                            Path: {op.filePath}
                          </Typography>
                        )}
                      </Box>
                    }
                  />
                  <IconButton
                    size="small"
                    onClick={() => setShowErrorDetails(showErrorDetails === op.id ? null : op.id)}
                  >
                    {showErrorDetails === op.id ? <ExpandLess /> : <ExpandMore />}
                  </IconButton>
                </ListItem>
                {index < failedOperations.length - 1 && <Divider component="li" />}
              </React.Fragment>
            ))}
          </List>
        </Box>

        {/* Successful Operations (Collapsible) */}
        {successfulOperations.length > 0 && (
          <Box>
            <Button
              onClick={() => setShowSuccessful(!showSuccessful)}
              endIcon={showSuccessful ? <ExpandLess /> : <ExpandMore />}
              sx={{
                width: '100%',
                justifyContent: 'space-between',
                fontFamily: 'var(--font-header)',
                color: 'success.main',
                mb: 1
              }}
            >
              {successfulOperations.length} Successful Operations
              {showSuccessful ? '' : ' (click to view)'}
            </Button>
            
            <Collapse in={showSuccessful}>
              <Alert severity="success" sx={{ mb: 1 }}>
                <Typography variant="body2" sx={{ fontFamily: 'var(--font-body)' }}>
                  These operations completed successfully. Rolling back will undo them.
                </Typography>
              </Alert>
              <List
                dense
                sx={{
                  border: '1px solid',
                  borderColor: 'success.light',
                  borderRadius: 1.5,
                  maxHeight: 150,
                  overflow: 'auto'
                }}
              >
                {successfulOperations.map((op, index) => (
                  <ListItem key={op.id} divider={index < successfulOperations.length - 1}>
                    <ListItemIcon sx={{ minWidth: 36 }}>
                      <InsertDriveFileIcon fontSize="small" color="success" />
                    </ListItemIcon>
                    <ListItemText
                      primary={
                        <Typography variant="body2" sx={{ fontFamily: 'var(--font-body)' }}>
                          {op.fileName}
                        </Typography>
                      }
                      secondary={
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          sx={{ fontFamily: 'var(--font-body)' }}
                        >
                          {op.operationType}: {op.originalPath.split(/[\\/]/).pop()} → {op.newPath.split(/[\\/]/).pop()}
                        </Typography>
                      }
                    />
                  </ListItem>
                ))}
              </List>
            </Collapse>
          </Box>
        )}
      </DialogContent>

      <DialogActions
        sx={{
          p: 3,
          gap: 1.5,
          borderTop: '1px solid',
          borderColor: 'divider',
          flexWrap: 'wrap'
        }}
      >
        {/* Abort Button */}
        <Button
          onClick={onAbort}
          disabled={isProcessing}
          startIcon={<StopIcon />}
          color="error"
          sx={{ fontFamily: 'var(--font-header)' }}
        >
          Abort
        </Button>

        {/* Rollback Button */}
        {successfulOperations.length > 0 && (
          <Button
            onClick={handleRollbackAll}
            disabled={isProcessing}
            startIcon={<UndoIcon />}
            color="warning"
            variant="outlined"
            sx={{ fontFamily: 'var(--font-header)' }}
          >
            Rollback All
          </Button>
        )}

        <Box sx={{ flex: 1 }} />

        {/* Skip Buttons */}
        <Button
          onClick={handleSkipAll}
          disabled={isProcessing}
          startIcon={<SkipNextIcon />}
          color="inherit"
          sx={{ fontFamily: 'var(--font-header)' }}
        >
          Skip All
        </Button>

        {selectedFailedIds.size > 0 && selectedFailedIds.size < failedOperations.length && (
          <Button
            onClick={handleSkipSelected}
            disabled={isProcessing}
            startIcon={<SkipNextIcon />}
            color="inherit"
            sx={{ fontFamily: 'var(--font-header)' }}
          >
            Skip Selected ({selectedFailedIds.size})
          </Button>
        )}

        {/* Retry Button */}
        {retryableCount > 0 && (
          <Button
            onClick={handleRetrySelected}
            disabled={isProcessing || selectedFailedIds.size === 0}
            startIcon={<RefreshIcon />}
            variant="contained"
            sx={{ fontFamily: 'var(--font-header)' }}
          >
            Retry Selected ({selectedFailedIds.size})
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
};

export default ErrorRecoveryDialog;
