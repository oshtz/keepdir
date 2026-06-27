import React, { useCallback, useEffect, useState } from 'react';
import { Folder, Plus, Spinner, Trash } from 'phosphor-react';
import { Alert, Button, IconButton, Switch } from './ui';
import type { WatchFolder } from '../appApi';

function folderName(path: string) {
  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] || path;
}

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
      const result = await window.keepdirAPI.getWatchFolders(workspaceId);
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
    const unsubscribe = window.keepdirAPI.onWatchFoldersChanged((payload) => {
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

    const selectedPath = await window.keepdirAPI.selectDirectory();
    if (!selectedPath) {
      return;
    }

    const result = await window.keepdirAPI.saveWatchFolder(workspaceId, {
      id: createWatchFolderId(),
      path: selectedPath,
      enabled: true,
      recursive: false,
      createdAt: new Date().toISOString(),
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

    const result = await window.keepdirAPI.setWatchFolderEnabled(workspaceId, folder.id, !folder.enabled);
    if (result.error) {
      setError(result.error);
      return;
    }
    await loadFolders();
  };

  const handleRecursiveToggle = async (folder: WatchFolder) => {
    if (!workspaceId) {
      return;
    }

    const result = await window.keepdirAPI.saveWatchFolder(workspaceId, {
      ...folder,
      recursive: !folder.recursive,
    });
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

    const result = await window.keepdirAPI.removeWatchFolder(workspaceId, folder.id);
    if (result.error) {
      setError(result.error);
      return;
    }
    await loadFolders();
  };

  return (
    <div className="min-w-0 flex flex-col gap-3">
      <Button
        variant="secondary"
        leftIcon={<Plus size={16} weight="light" />}
        onClick={handleAdd}
        disabled={!workspaceId || loading}
        className="w-full justify-center"
      >
        Add watched folder
      </Button>

      {error && <Alert severity="error">{error}</Alert>}
      {loading && <Spinner size={18} className="self-center animate-spin text-text-secondary" />}

      <div className="flex flex-col gap-2">
        {folders.map((folder) => (
          <div
            key={folder.id}
            className="kd-card p-3 flex flex-col gap-2 group"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <Folder
                size={18}
                weight="light"
                className={cn(
                  'flex-shrink-0 transition-colors duration-300',
                  folder.enabled ? 'text-accent' : 'text-text-secondary'
                )}
              />
              <div className="min-w-0 flex-1">
                <div
                  title={folder.path}
                  className="font-mono text-[12px] font-semibold leading-tight truncate"
                >
                  {folderName(folder.path)}
                </div>
                <div
                  title={folder.path}
                  className="font-mono text-[10.5px] text-text-secondary truncate"
                >
                  {folder.path}
                </div>
              </div>
              <IconButton
                label={`Remove ${folder.path}`}
                onClick={() => handleRemove(folder)}
                className="flex-shrink-0 opacity-60 group-hover:opacity-100 transition-opacity duration-300"
              >
                <Trash size={16} weight="light" />
              </IconButton>
            </div>

            <div className="flex items-center justify-between gap-2">
              <Switch
                checked={folder.enabled}
                onChange={() => handleToggle(folder)}
                aria-label={`Watch ${folder.path}`}
                label={folder.enabled ? 'On' : 'Paused'}
              />
              <Switch
                checked={Boolean(folder.recursive)}
                onChange={() => handleRecursiveToggle(folder)}
                aria-label={`Watch subfolders in ${folder.path}`}
                label="Subfolders"
              />
            </div>
          </div>
        ))}
      </div>

      {!loading && folders.length === 0 && (
        <div className="pt-2">
          <Folder size={20} weight="light" className="text-text-secondary mb-2" />
          <div className="font-display font-semibold text-[13.5px]">Nothing watched yet</div>
          <div className="text-sm text-text-secondary mt-1 leading-relaxed">
            Add Downloads to start previewing matches.
          </div>
        </div>
      )}
    </div>
  );
};

function cn(...classes: (string | false | undefined)[]) {
  return classes.filter(Boolean).join(' ');
}

export default WatchFoldersSettings;
