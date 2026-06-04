import React, { useMemo, useState } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Chip from '@mui/material/Chip';
import type { ChipProps } from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import DeleteIcon from '@mui/icons-material/Delete';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import RefreshIcon from '@mui/icons-material/Refresh';
import { useWatchedRenameQueue } from '../hooks/useWatchedRenameQueue';
import type { WatchedRenameSuggestionStatus } from '../electron';

interface WatchedRenameQueueProps {
  workspaceId?: string | null;
  open: boolean;
  onClose: () => void;
}

function getStatusColor(status: WatchedRenameSuggestionStatus): ChipProps['color'] {
  if (status === 'error') {
    return 'error';
  }
  if (status === 'stale') {
    return 'warning';
  }
  if (status === 'suggested') {
    return 'success';
  }
  if (status === 'analyzing' || status === 'queued') {
    return 'info';
  }
  return 'default';
}

const WatchedRenameQueue: React.FC<WatchedRenameQueueProps> = ({ workspaceId, open, onClose }) => {
  const { groupedByFolder, suggestions, loading, error, apply, dismiss, refresh } = useWatchedRenameQueue(workspaceId);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [actionError, setActionError] = useState<string | null>(null);

  const selected = useMemo(() => Array.from(selectedIds), [selectedIds]);

  const toggle = (id: string) => {
    setSelectedIds((previous) => {
      const next = new Set(previous);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const runAction = async (action: (ids: string[]) => Promise<unknown>) => {
    setActionError(null);
    await action(selected);
    setSelectedIds(new Set());
  };

  const runFileAction = async (action: (filePath: string) => Promise<{ error?: string }>, filePath: string) => {
    setActionError(null);
    const result = await action(filePath);
    if (result.error) {
      setActionError(result.error);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth PaperProps={{ tabIndex: -1 }}>
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          <Typography variant="h6" sx={{ flex: 1, fontFamily: 'var(--font-header)' }}>
            Watched Rename Queue
          </Typography>
          <IconButton aria-label="close" onClick={onClose}>
            <CloseIcon />
          </IconButton>
        </Box>
      </DialogTitle>

      <DialogContent dividers>
        {(error || actionError) && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error || actionError}
          </Alert>
        )}
        {loading && <Typography>Loading watched suggestions...</Typography>}
        {!loading && suggestions.length === 0 && (
          <Typography color="text.secondary">No watched rename suggestions waiting for review.</Typography>
        )}

        {Object.entries(groupedByFolder).map(([folderPath, folderSuggestions]) => (
          <Box key={folderPath} sx={{ mb: 2 }}>
            <Typography variant="subtitle2" sx={{ fontFamily: 'var(--font-header)', mb: 1 }}>
              {folderPath}
            </Typography>
            <List dense>
              {folderSuggestions.map((suggestion) => (
                <ListItem
                  key={suggestion.id}
                  secondaryAction={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      <Tooltip title="Open file">
                        <IconButton
                          aria-label={`Open ${suggestion.originalName}`}
                          size="small"
                          onClick={() => runFileAction(window.electronAPI.openFile, suggestion.filePath)}
                        >
                          <OpenInNewIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Show in folder">
                        <IconButton
                          aria-label={`Reveal ${suggestion.originalName}`}
                          size="small"
                          onClick={() => runFileAction(window.electronAPI.revealInFolder, suggestion.filePath)}
                        >
                          <FolderOpenIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Chip label={suggestion.status} size="small" color={getStatusColor(suggestion.status)} />
                    </Box>
                  }
                >
                  <Checkbox
                    checked={selectedIds.has(suggestion.id)}
                    onChange={() => toggle(suggestion.id)}
                    inputProps={{ 'aria-label': `Select ${suggestion.originalName}` }}
                  />
                  <ListItemText
                    primary={`${suggestion.originalName} -> ${suggestion.suggestedName || '(no suggestion)'}`}
                    secondary={suggestion.errorMessage || suggestion.reason || ''}
                    primaryTypographyProps={{ sx: { fontFamily: 'var(--font-body)', fontWeight: 600 } }}
                    secondaryTypographyProps={{ sx: { fontFamily: 'var(--font-body)' } }}
                  />
                </ListItem>
              ))}
            </List>
          </Box>
        ))}
      </DialogContent>

      <DialogActions sx={{ p: 2, gap: 1 }}>
        <Button startIcon={<DeleteIcon />} disabled={selected.length === 0} onClick={() => runAction(dismiss)}>
          Dismiss Selected
        </Button>
        <Button startIcon={<RefreshIcon />} disabled={selected.length === 0} onClick={() => runAction(refresh)}>
          Refresh Selected
        </Button>
        <Button variant="contained" startIcon={<CheckIcon />} disabled={selected.length === 0} onClick={() => runAction(apply)}>
          Apply Selected
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default WatchedRenameQueue;
