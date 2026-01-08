import React, { useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Chip from '@mui/material/Chip';
import Collapse from '@mui/material/Collapse';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import ListItemSecondaryAction from '@mui/material/ListItemSecondaryAction';
import Tooltip from '@mui/material/Tooltip';
import Alert from '@mui/material/Alert';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import { useTheme } from '@mui/material/styles';
import UndoIcon from '@mui/icons-material/Undo';
import RedoIcon from '@mui/icons-material/Redo';
import DeleteIcon from '@mui/icons-material/Delete';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import FolderIcon from '@mui/icons-material/Folder';
import DriveFileRenameOutlineIcon from '@mui/icons-material/DriveFileRenameOutline';
import DriveFileMoveIcon from '@mui/icons-material/DriveFileMove';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import HistoryIcon from '@mui/icons-material/History';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import { useOperationHistory } from '../contexts/OperationHistoryContext';

const OperationHistoryPanel: React.FC = () => {
  const theme = useTheme();
  const {
    history,
    canUndo,
    canRedo,
    undo,
    redo,
    undoSingle,
    clearHistory,
    downloadHistoryAsJSON,
    downloadHistoryAsCSV
  } = useOperationHistory();

  const [expandedBatches, setExpandedBatches] = useState<Set<string>>(new Set());
  const [confirmClear, setConfirmClear] = useState(false);

  const toggleBatchExpansion = (batchId: string) => {
    setExpandedBatches(prev => {
      const newSet = new Set(prev);
      if (newSet.has(batchId)) {
        newSet.delete(batchId);
      } else {
        newSet.add(batchId);
      }
      return newSet;
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return theme.palette.success.main;
      case 'failed':
        return theme.palette.error.main;
      case 'rolled_back':
        return theme.palette.warning.main;
      default:
        return theme.palette.text.secondary;
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircleIcon sx={{ fontSize: 16, color: theme.palette.success.main }} />;
      case 'failed':
        return <ErrorIcon sx={{ fontSize: 16, color: theme.palette.error.main }} />;
      case 'rolled_back':
        return <UndoIcon sx={{ fontSize: 16, color: theme.palette.warning.main }} />;
      default:
        return null;
    }
  };

  const getOperationIcon = (type: string) => {
    switch (type) {
      case 'rename':
        return <DriveFileRenameOutlineIcon sx={{ fontSize: 16 }} />;
      case 'move':
      case 'sort':
        return <DriveFileMoveIcon sx={{ fontSize: 16 }} />;
      default:
        return <FolderIcon sx={{ fontSize: 16 }} />;
    }
  };

  const formatTimestamp = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString();
  };

  const handleUndoBatch = async () => {
    await undo();
  };

  const handleRedoBatch = async () => {
    await redo();
  };

  const handleUndoSingle = async (batchId: string, operationId: string) => {
    await undoSingle(batchId, operationId);
  };

  const handleClearHistory = () => {
    clearHistory();
    setConfirmClear(false);
  };

  // Sort history by timestamp (most recent first)
  const sortedHistory = [...history].sort((a, b) => 
    new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  return (
    <Box>
      <Typography
        variant="h6"
        gutterBottom
        sx={{
          mb: 2,
          color: "text.primary",
          fontFamily: "var(--font-header)",
          display: 'flex',
          alignItems: 'center',
          gap: 1
        }}
      >
        <HistoryIcon />
        Operation History
      </Typography>

      {/* Action Buttons */}
      <Box sx={{ display: 'flex', gap: 1, mb: 3, flexWrap: 'wrap' }}>
        <Tooltip title="Undo last operation">
          <span>
            <Button
              variant="outlined"
              size="small"
              startIcon={<UndoIcon />}
              onClick={handleUndoBatch}
              disabled={!canUndo}
              sx={{ fontFamily: 'var(--font-header)' }}
            >
              Undo
            </Button>
          </span>
        </Tooltip>
        <Tooltip title="Redo last undone operation">
          <span>
            <Button
              variant="outlined"
              size="small"
              startIcon={<RedoIcon />}
              onClick={handleRedoBatch}
              disabled={!canRedo}
              sx={{ fontFamily: 'var(--font-header)' }}
            >
              Redo
            </Button>
          </span>
        </Tooltip>
        <Box sx={{ flex: 1 }} />
        <Tooltip title="Export as JSON">
          <Button
            variant="text"
            size="small"
            startIcon={<FileDownloadIcon />}
            onClick={downloadHistoryAsJSON}
            disabled={history.length === 0}
            sx={{ fontFamily: 'var(--font-header)' }}
          >
            JSON
          </Button>
        </Tooltip>
        <Tooltip title="Export as CSV">
          <Button
            variant="text"
            size="small"
            startIcon={<FileDownloadIcon />}
            onClick={downloadHistoryAsCSV}
            disabled={history.length === 0}
            sx={{ fontFamily: 'var(--font-header)' }}
          >
            CSV
          </Button>
        </Tooltip>
        <Tooltip title="Clear all history">
          <Button
            variant="text"
            size="small"
            color="error"
            startIcon={<DeleteIcon />}
            onClick={() => setConfirmClear(true)}
            disabled={history.length === 0}
            sx={{ fontFamily: 'var(--font-header)' }}
          >
            Clear
          </Button>
        </Tooltip>
      </Box>

      {/* History List */}
      {history.length === 0 ? (
        <Box sx={{
          p: 4,
          textAlign: 'center',
          backgroundColor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.01)',
          borderRadius: 1.5,
          border: `1px dashed ${theme.palette.divider}`
        }}>
          <HistoryIcon sx={{ fontSize: 48, color: theme.palette.text.disabled, mb: 2 }} />
          <Typography variant="body1" color="text.secondary" sx={{ fontFamily: 'var(--font-body)' }}>
            No operations recorded yet
          </Typography>
          <Typography variant="body2" color="text.disabled" sx={{ fontFamily: 'var(--font-body)', mt: 1 }}>
            Rename or sort files to see history here
          </Typography>
        </Box>
      ) : (
        <List sx={{ 
          maxHeight: '50vh', 
          overflow: 'auto',
          '&::-webkit-scrollbar': { width: '6px' },
          '&::-webkit-scrollbar-thumb': { background: theme.palette.primary.main + '30', borderRadius: 'var(--border-radius-small)' },
        }}>
          {sortedHistory.map((batch) => (
            <Box key={batch.id} sx={{ mb: 1 }}>
              <ListItem
                sx={{
                  backgroundColor: theme.palette.background.paper,
                  borderRadius: 1.5,
                  border: `1px solid ${theme.palette.divider}`,
                  cursor: 'pointer',
                  '&:hover': {
                    backgroundColor: theme.palette.action.hover
                  }
                }}
                onClick={() => toggleBatchExpansion(batch.id)}
              >
                <ListItemIcon sx={{ minWidth: 36 }}>
                  {getStatusIcon(batch.status)}
                </ListItemIcon>
                <ListItemText
                  primary={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography variant="body2" sx={{ fontFamily: 'var(--font-body)', fontWeight: 500 }}>
                        {batch.name}
                      </Typography>
                      <Chip
                        label={batch.status}
                        size="small"
                        sx={{
                          height: 20,
                          fontSize: '0.65rem',
                          backgroundColor: `${getStatusColor(batch.status)}20`,
                          color: getStatusColor(batch.status),
                          fontFamily: 'var(--font-body)'
                        }}
                      />
                    </Box>
                  }
                  secondary={
                    <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'var(--font-body)' }}>
                      {formatTimestamp(new Date(batch.timestamp))} - {batch.completedCount} completed, {batch.failedCount} failed
                    </Typography>
                  }
                />
                <ListItemSecondaryAction>
                  <IconButton size="small" onClick={(e) => { e.stopPropagation(); toggleBatchExpansion(batch.id); }}>
                    {expandedBatches.has(batch.id) ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                  </IconButton>
                </ListItemSecondaryAction>
              </ListItem>

              {/* Expanded Operations */}
              <Collapse in={expandedBatches.has(batch.id)}>
                <Box sx={{ pl: 3, pt: 1 }}>
                  <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'var(--font-header)', fontWeight: 600 }}>
                    Directory: {batch.directory}
                  </Typography>
                  <List dense sx={{ py: 0.5 }}>
                    {batch.operations.slice(0, 20).map((operation) => (
                      <ListItem
                        key={operation.id}
                        sx={{
                          py: 0.5,
                          pl: 1,
                          borderLeft: `2px solid ${getStatusColor(operation.status)}`,
                          ml: 1,
                          mb: 0.5,
                          backgroundColor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.01)',
                          borderRadius: '0 var(--border-radius-small) var(--border-radius-small) 0'
                        }}
                      >
                        <ListItemIcon sx={{ minWidth: 28 }}>
                          {getOperationIcon(operation.type)}
                        </ListItemIcon>
                        <ListItemText
                          primary={
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                              <Typography variant="caption" sx={{ fontFamily: 'var(--font-body)', color: theme.palette.text.secondary }}>
                                {operation.originalName}
                              </Typography>
                              <Typography variant="caption" sx={{ color: theme.palette.primary.main }}>
                                {' -> '}
                              </Typography>
                              <Typography variant="caption" sx={{ fontFamily: 'var(--font-body)', fontWeight: 500 }}>
                                {operation.newName}
                              </Typography>
                            </Box>
                          }
                          secondary={operation.error ? (
                            <Typography variant="caption" color="error" sx={{ fontFamily: 'var(--font-body)' }}>
                              Error: {operation.error}
                            </Typography>
                          ) : null}
                        />
                        {operation.status === 'completed' && (
                          <Tooltip title="Undo this operation">
                            <IconButton
                              size="small"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleUndoSingle(batch.id, operation.id);
                              }}
                              sx={{ opacity: 0.6, '&:hover': { opacity: 1 } }}
                            >
                              <UndoIcon sx={{ fontSize: 14 }} />
                            </IconButton>
                          </Tooltip>
                        )}
                      </ListItem>
                    ))}
                    {batch.operations.length > 20 && (
                      <Typography variant="caption" color="text.disabled" sx={{ pl: 3, fontFamily: 'var(--font-body)', fontStyle: 'italic' }}>
                        ... and {batch.operations.length - 20} more operations
                      </Typography>
                    )}
                  </List>
                </Box>
              </Collapse>
            </Box>
          ))}
        </List>
      )}

      {/* Confirm Clear Dialog */}
      <Dialog open={confirmClear} onClose={() => setConfirmClear(false)}>
        <DialogTitle sx={{ fontFamily: 'var(--font-header)' }}>
          Clear Operation History?
        </DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ fontFamily: 'var(--font-body)' }}>
            This will permanently delete all operation history. You won't be able to undo any previous operations.
          </Alert>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmClear(false)} sx={{ fontFamily: 'var(--font-header)' }}>
            Cancel
          </Button>
          <Button onClick={handleClearHistory} color="error" variant="contained" sx={{ fontFamily: 'var(--font-header)' }}>
            Clear All
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default OperationHistoryPanel;
