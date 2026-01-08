import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { UpdateInfo, UpdateDownloadProgress } from '../electron.d';

export type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'ready'
  | 'installing'
  | 'up-to-date'
  | 'error';

interface UpdateState {
  currentVersion: string | null;
  status: UpdateStatus;
  updateInfo: UpdateInfo | null;
  updatePath: string | null;
  downloadProgress: number;
  error: string | null;
  lastCheckedAt: number | null;
}

interface UpdateContextType extends UpdateState {
  checkNow: () => Promise<UpdateInfo | null>;
  downloadNow: () => Promise<string | null>;
  installNow: () => Promise<void>;
  clearError: () => void;
}

const UpdateContext = createContext<UpdateContextType | undefined>(undefined);

export const UpdateProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentVersion, setCurrentVersion] = useState<string | null>(null);
  const [status, setStatus] = useState<UpdateStatus>('idle');
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [updatePath, setUpdatePath] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [lastCheckedAt, setLastCheckedAt] = useState<number | null>(null);

  // Load current version on mount
  useEffect(() => {
    const loadVersion = async () => {
      try {
        const version = await window.electronAPI.getAppVersion();
        setCurrentVersion(version);
      } catch (err) {
        console.error('Failed to get app version:', err);
      }
    };
    loadVersion();
  }, []);

  // Subscribe to download progress events
  useEffect(() => {
    const unsubscribe = window.electronAPI.onUpdateDownloadProgress((progress: UpdateDownloadProgress) => {
      setDownloadProgress(progress.percent);
    });
    return unsubscribe;
  }, []);

  const checkNow = useCallback(async (): Promise<UpdateInfo | null> => {
    setStatus('checking');
    setError(null);

    try {
      const result = await window.electronAPI.checkForUpdate();
      setLastCheckedAt(Date.now());

      if (result.error) {
        setStatus('error');
        setError(result.error);
        return null;
      }

      if (result.updateInfo) {
        setUpdateInfo(result.updateInfo);
        setStatus('available');
        return result.updateInfo;
      }

      setStatus('up-to-date');
      return null;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      setStatus('error');
      setError(errorMessage);
      return null;
    }
  }, []);

  const downloadNow = useCallback(async (): Promise<string | null> => {
    if (!updateInfo) {
      setError('No update available to download.');
      return null;
    }

    setStatus('downloading');
    setDownloadProgress(0);
    setError(null);

    try {
      const result = await window.electronAPI.downloadUpdate(updateInfo);

      if (result.error) {
        setStatus('error');
        setError(result.error);
        return null;
      }

      if (result.updatePath) {
        setUpdatePath(result.updatePath);
        setStatus('ready');
        return result.updatePath;
      }

      setStatus('error');
      setError('Download failed - no update path returned.');
      return null;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      setStatus('error');
      setError(errorMessage);
      return null;
    }
  }, [updateInfo]);

  const installNow = useCallback(async (): Promise<void> => {
    if (!updatePath) {
      setError('No update downloaded to install.');
      return;
    }

    setStatus('installing');
    setError(null);

    try {
      const result = await window.electronAPI.installUpdate(updatePath);

      if (result.error) {
        setStatus('error');
        setError(result.error);
        return;
      }

      // If successful, the app will restart - this code may not execute
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      setStatus('error');
      setError(errorMessage);
    }
  }, [updatePath]);

  const clearError = useCallback(() => {
    setError(null);
    if (status === 'error') {
      setStatus('idle');
    }
  }, [status]);

  return (
    <UpdateContext.Provider
      value={{
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
      }}
    >
      {children}
    </UpdateContext.Provider>
  );
};

export const useUpdate = () => {
  const context = useContext(UpdateContext);
  if (context === undefined) {
    throw new Error('useUpdate must be used within an UpdateProvider');
  }
  return context;
};
