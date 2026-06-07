import React from 'react';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import IconButton from '@mui/material/IconButton';
import CloseIcon from '@mui/icons-material/Close';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import WarningIcon from '@mui/icons-material/Warning';
import SkipNextIcon from '@mui/icons-material/SkipNext';
import DriveFileRenameOutlineIcon from '@mui/icons-material/DriveFileRenameOutline';
import DriveFolderUploadIcon from '@mui/icons-material/DriveFolderUpload';
import MergeTypeIcon from '@mui/icons-material/MergeType';
import UndoIcon from '@mui/icons-material/Undo';
import DownloadIcon from '@mui/icons-material/Download';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Collapse from '@mui/material/Collapse';
import ExpandLess from '@mui/icons-material/ExpandLess';
import ExpandMore from '@mui/icons-material/ExpandMore';
import Chip from '@mui/material/Chip';
import { FileOperation } from '../contexts/OperationHistoryContext';

export interface OperationSummary {
  totalOperations: number;
  renamedCount: number;
  movedCount: number;
  skippedCount: number;
  conflictsResolved: number;
  failedCount: number;
  duration: number; // in milliseconds
  batchId?: string;
  operations?: FileOperation[];
}

interface OperationSummaryModalProps {
  open: boolean;
  onClose: () => void;
  summary: OperationSummary;
  onUndo?: () => void;
  onExport?: () => void;
  title?: string;
}

const OperationSummaryModal: React.FC<OperationSummaryModalProps> = ({
  open,
  onClose,
  summary,
  onUndo,
  onExport,
  title = 'Operation Complete'
}) => {
  const [showDetails, setShowDetails] = React.useState(false);

  const hasFailures = summary.failedCount > 0;
  const isPartialSuccess = hasFailures && (summary.renamedCount > 0 || summary.movedCount > 0);
  const isFullSuccess = !hasFailures && summary.totalOperations > 0;

  const formatDuration = (ms: number): string => {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
  };

  const getStatusIcon = () => {
    if (isFullSuccess) return <CheckCircleIcon sx={{ fontSize: 48, color: 'success.main' }} />;
    if (isPartialSuccess) return <WarningIcon sx={{ fontSize: 48, color: 'warning.main' }} />;
    if (hasFailures) return <ErrorIcon sx={{ fontSize: 48, color: 'error.main' }} />;
    return <CheckCircleIcon sx={{ fontSize: 48, color: 'success.main' }} />;
  };

  const getStatusMessage = () => {
    if (isFullSuccess) return 'All operations completed successfully!';
    if (isPartialSuccess) return 'Some operations completed with errors.';
    if (hasFailures && summary.totalOperations === summary.failedCount) return 'All operations failed.';
    if (summary.totalOperations === 0) return 'No operations were performed.';
    return 'Operations completed.';
  };

  const statItems = [
    { 
      label: 'Renamed', 
      value: summary.renamedCount, 
      icon: <DriveFileRenameOutlineIcon />, 
      color: 'primary.main',
      show: summary.renamedCount > 0
    },
    { 
      label: 'Moved', 
      value: summary.movedCount, 
      icon: <DriveFolderUploadIcon />, 
      color: 'info.main',
      show: summary.movedCount > 0
    },
    { 
      label: 'Skipped', 
      value: summary.skippedCount, 
      icon: <SkipNextIcon />, 
      color: 'text.secondary',
      show: summary.skippedCount > 0
    },
    { 
      label: 'Conflicts Resolved', 
      value: summary.conflictsResolved, 
      icon: <MergeTypeIcon />, 
      color: 'warning.main',
      show: summary.conflictsResolved > 0
    },
    { 
      label: 'Failed', 
      value: summary.failedCount, 
      icon: <ErrorIcon />, 
      color: 'error.main',
      show: summary.failedCount > 0
    }
  ].filter(item => item.show);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        tabIndex: -1,
        sx: {
          borderRadius: 1,
          overflow: 'hidden',
          boxShadow: 'none',
          border: '1px solid',
          borderColor: 'divider',
          backgroundImage: 'none'
        }
      }}
    >
      <DialogTitle
        sx={{
          p: 2,
          backgroundColor: 'background.default',
          borderBottom: '1px solid',
          borderColor: 'divider'
        }}
      >
        <Box display="flex" alignItems="center">
          <Typography
            variant="h6"
            component="div"
            sx={{
              flexGrow: 1,
              fontWeight: 600,
              fontFamily: 'var(--font-header)'
            }}
          >
            {title}
          </Typography>
          <IconButton
            onClick={onClose}
            size="small"
            aria-label="close"
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

      <DialogContent sx={{ p: 3 }}>
        {/* Status Header */}
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            py: 3,
            mb: 3,
            backgroundColor: 'transparent',
            borderBottom: '1px solid',
            borderColor: 'divider'
          }}
        >
          {getStatusIcon()}
          <Typography
            variant="h6"
            sx={{
              mt: 2,
              fontFamily: 'var(--font-header)',
              fontWeight: 600,
              textAlign: 'center'
            }}
          >
            {getStatusMessage()}
          </Typography>
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ mt: 0.5, fontFamily: 'var(--font-body)' }}
          >
            Completed in {formatDuration(summary.duration)}
          </Typography>
        </Box>

        {/* Statistics */}
        <Typography
          variant="subtitle1"
          sx={{
            mb: 2,
            fontFamily: 'var(--font-header)',
            fontWeight: 600
          }}
        >
          Summary
        </Typography>

        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
            gap: 2,
            mb: 3
          }}
        >
          {statItems.map((stat, index) => (
            <Box
              key={index}
              sx={{
                p: 2,
                borderBottom: '1px solid',
                borderColor: 'divider',
                textAlign: 'center',
                backgroundColor: 'transparent'
              }}
            >
              <Box
                sx={{
                  display: 'flex',
                  justifyContent: 'center',
                  mb: 1,
                  color: stat.color
                }}
              >
                {stat.icon}
              </Box>
              <Typography
                variant="h4"
                sx={{
                  fontFamily: 'var(--font-header)',
                  fontWeight: 700,
                  color: stat.color
                }}
              >
                {stat.value}
              </Typography>
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ fontFamily: 'var(--font-body)' }}
              >
                {stat.label}
              </Typography>
            </Box>
          ))}
        </Box>

        {/* Total */}
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            p: 2,
            backgroundColor: 'action.hover',
            borderRadius: 1,
            mb: 2
          }}
        >
          <Typography sx={{ fontFamily: 'var(--font-header)', fontWeight: 500 }}>
            Total Operations
          </Typography>
          <Typography
            variant="h6"
            sx={{ fontFamily: 'var(--font-header)', fontWeight: 700 }}
          >
            {summary.totalOperations}
          </Typography>
        </Box>

        {/* Details Expansion */}
        {summary.operations && summary.operations.length > 0 && (
          <>
            <Button
              onClick={() => setShowDetails(!showDetails)}
              endIcon={showDetails ? <ExpandLess /> : <ExpandMore />}
              sx={{
                width: '100%',
                justifyContent: 'space-between',
                fontFamily: 'var(--font-header)',
                color: 'text.secondary'
              }}
            >
              View Details ({summary.operations.length} operations)
            </Button>
            
            <Collapse in={showDetails}>
              <List
                dense
                sx={{
                  maxHeight: 200,
                  overflow: 'auto',
                  border: '1px solid',
                  borderColor: 'divider',
                  borderRadius: 1,
                  mt: 1,
                  '&::-webkit-scrollbar': {
                    width: '6px'
                  },
                  '&::-webkit-scrollbar-thumb': {
                    background: 'rgba(0,0,0,0.2)',
                    borderRadius: 'var(--border-radius-small)'
                  }
                }}
              >
                {summary.operations.map((op, index) => (
                  <ListItem key={op.id || index} divider={index < summary.operations!.length - 1}>
                    <ListItemIcon sx={{ minWidth: 36 }}>
                      {op.status === 'completed' ? (
                        <CheckCircleIcon fontSize="small" color="success" />
                      ) : op.status === 'failed' ? (
                        <ErrorIcon fontSize="small" color="error" />
                      ) : (
                        <SkipNextIcon fontSize="small" color="disabled" />
                      )}
                    </ListItemIcon>
                    <ListItemText
                      primary={
                        <Typography
                          variant="body2"
                          sx={{
                            fontFamily: 'var(--font-body)',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap'
                          }}
                        >
                          {op.originalName || op.originalPath.split(/[\\/]/).pop()}
                        </Typography>
                      }
                      secondary={
                        op.newName && op.newName !== op.originalName ? (
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            sx={{ fontFamily: 'var(--font-body)' }}
                          >
                            → {op.newName}
                          </Typography>
                        ) : op.error ? (
                          <Typography
                            variant="caption"
                            color="error"
                            sx={{ fontFamily: 'var(--font-body)' }}
                          >
                            {op.error}
                          </Typography>
                        ) : null
                      }
                    />
                    <Chip
                      label={op.type}
                      size="small"
                      sx={{
                        fontFamily: 'var(--font-body)',
                        fontSize: '0.65rem',
                        height: 20
                      }}
                    />
                  </ListItem>
                ))}
              </List>
            </Collapse>
          </>
        )}
      </DialogContent>

      <DialogActions sx={{ p: 2, gap: 1, borderTop: '1px solid', borderColor: 'divider' }}>
        {onExport && (
          <Button
            onClick={onExport}
            startIcon={<DownloadIcon />}
            color="inherit"
            sx={{ fontFamily: 'var(--font-header)' }}
          >
            Export Log
          </Button>
        )}
        <Box sx={{ flex: 1 }} />
        {onUndo && summary.renamedCount + summary.movedCount > 0 && (
          <Button
            onClick={onUndo}
            startIcon={<UndoIcon />}
            color="warning"
            variant="outlined"
            sx={{ fontFamily: 'var(--font-header)' }}
          >
            Undo All
          </Button>
        )}
        <Button
          onClick={onClose}
          variant="contained"
          sx={{ fontFamily: 'var(--font-header)' }}
        >
          Done
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default OperationSummaryModal;
