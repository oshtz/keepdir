import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ApiResult, WatchedRenameSuggestion } from '../electron';

type QueueAction = (workspaceId: string, ids: string[]) => Promise<ApiResult>;

export function useWatchedRenameQueue(workspaceId?: string | null) {
  const [suggestions, setSuggestions] = useState<WatchedRenameSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!workspaceId) {
      setSuggestions([]);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const result = await window.electronAPI.getWatchedRenameSuggestions(workspaceId);
      if (result.error) {
        setError(result.error);
        setSuggestions([]);
      } else {
        setError(null);
        setSuggestions(result.suggestions || []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load watched rename suggestions');
      setSuggestions([]);
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const unsubscribe = window.electronAPI.onWatchedRenameSuggestionsChanged((payload) => {
      if (payload.workspaceId === workspaceId) {
        load();
      }
    });
    return unsubscribe;
  }, [load, workspaceId]);

  const runAction = useCallback(async (ids: string[], action: QueueAction) => {
    if (!workspaceId || ids.length === 0) {
      return { success: false };
    }

    const result = await action(workspaceId, ids);
    await load();
    return result;
  }, [load, workspaceId]);

  const dismiss = useCallback((ids: string[]) => (
    runAction(ids, window.electronAPI.dismissWatchedRenameSuggestions)
  ), [runAction]);

  const refresh = useCallback((ids: string[]) => (
    runAction(ids, window.electronAPI.refreshWatchedRenameSuggestions)
  ), [runAction]);

  const apply = useCallback((ids: string[]) => (
    runAction(ids, window.electronAPI.applyWatchedRenameSuggestions)
  ), [runAction]);

  const groupedByFolder = useMemo(() => {
    return suggestions.reduce<Record<string, WatchedRenameSuggestion[]>>((groups, suggestion) => {
      if (!groups[suggestion.folderPath]) {
        groups[suggestion.folderPath] = [];
      }
      groups[suggestion.folderPath].push(suggestion);
      return groups;
    }, {});
  }, [suggestions]);

  return {
    suggestions,
    groupedByFolder,
    loading,
    error,
    load,
    dismiss,
    refresh,
    apply
  };
}
