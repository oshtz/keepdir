import React, { useCallback, useEffect, useState } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import IconButton from '@mui/material/IconButton';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Switch from '@mui/material/Switch';
import Typography from '@mui/material/Typography';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import FolderIcon from '@mui/icons-material/Folder';
import type { WatchFolder } from '../electron';

interface WatchFoldersSettingsProps {
  workspaceId?: string | null;
}

function createWatchFolderId() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
    return `watch-${globalThis.crypto.randomUUID()}`;
  }
  return `watch-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

const WatchFoldersSettings: React.FC<WatchFoldersSettingsProps> = ({ workspaceId }) => {
  const [folders, setFolders] = useState<WatchFolder[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadFolders = useCallback(async () => {
    if (!workspaceId) {
      setFolders([]);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const result = await window.electronAPI.getWatchFolders(workspaceId);
      if (result.error) {
        setError(result.error);
        setFolders([]);
      } else {
        setError(null);
        setFolders(result.folders || []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load watched folders');
      setFolders([]);
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    loadFolders();
  }, [loadFolders]);

  useEffect(() => {
    const unsubscribe = window.electronAPI.onWatchFoldersChanged((payload) => {
      if (payload.workspaceId === workspaceId) {
        if (payload.error) {
          setError(payload.error);
        }
        loadFolders();
      }
    });
    return unsubscribe;
  }, [loadFolders, workspaceId]);

  const handleAdd = async () => {
    if (!workspaceId) {
      return;
    }

    const selectedPath = await window.electronAPI.selectDirectory();
    if (!selectedPath) {
      return;
    }

    const result = await window.electronAPI.saveWatchFolder(workspaceId, {
      id: createWatchFolderId(),
      path: selectedPath,
      enabled: true,
      createdAt: new Date().toISOString()
    });
    if (result.error) {
      setError(result.error);
      return;
    }
    await loadFolders();
  };

  const handleToggle = async (folder: WatchFolder) => {
    if (!workspaceId) {
      return;
    }

    const result = await window.electronAPI.setWatchFolderEnabled(workspaceId, folder.id, !folder.enabled);
    if (result.error) {
      setError(result.error);
      return;
    }
    await loadFolders();
  };

  const handleRemove = async (folder: WatchFolder) => {
    if (!workspaceId) {
      return;
    }

    const result = await window.electronAPI.removeWatchFolder(workspaceId, folder.id);
    if (result.error) {
      setError(result.error);
      return;
    }
    await loadFolders();
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, mb: 2 }}>
        <Typography variant="h6" sx={{ fontFamily: 'var(--font-header)' }}>
          Watch Folders
        </Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={handleAdd} disabled={!workspaceId || loading}>
          Add Watched Folder
        </Button>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {loading && <CircularProgress size={20} />}

      <List dense>
        {folders.map((folder) => (
          <ListItem
            key={folder.id}
            secondaryAction={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Switch
                  checked={folder.enabled}
                  onChange={() => handleToggle(folder)}
                  inputProps={{ 'aria-label': `Watch ${folder.path}` }}
                />
                <IconButton aria-label={`Remove ${folder.path}`} onClick={() => handleRemove(folder)}>
                  <DeleteIcon />
                </IconButton>
              </Box>
            }
          >
            <FolderIcon sx={{ mr: 1.5, color: 'primary.main' }} />
            <ListItemText
              primary={folder.path}
              secondary={folder.enabled ? 'Watching' : 'Paused'}
              primaryTypographyProps={{ sx: { fontFamily: 'var(--font-body)' } }}
              secondaryTypographyProps={{ sx: { fontFamily: 'var(--font-body)' } }}
            />
          </ListItem>
        ))}
      </List>

      {!loading && folders.length === 0 && (
        <Typography variant="body2" color="text.secondary" sx={{ fontFamily: 'var(--font-body)', mt: 2 }}>
          No watched folders configured.
        </Typography>
      )}
    </Box>
  );
};

export default WatchFoldersSettings;
