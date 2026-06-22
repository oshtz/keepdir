import { useCallback, useEffect, useState } from 'react';
import type { ApiResult, RuleAction } from '../appApi';

type RuleActionRunner = (workspaceId: string, ids: string[]) => Promise<ApiResult>;

export function useRuleActions(workspaceId?: string | null, includeHistory = false) {
  const [actions, setActions] = useState<RuleAction[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!workspaceId) {
      setActions([]);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const result = await window.keepdirAPI.getRuleActions(workspaceId, { includeHistory });
      if (result.error) {
        setError(result.error);
        setActions([]);
      } else {
        setError(null);
        setActions(result.actions || []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load rule actions');
      setActions([]);
    } finally {
      setLoading(false);
    }
  }, [workspaceId, includeHistory]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const unsubscribe = window.keepdirAPI.onRuleActionsChanged((payload) => {
      if (payload.workspaceId === workspaceId) {
        load();
      }
    });
    return unsubscribe;
  }, [load, workspaceId]);

  const run = useCallback(async (ids: string[], action: RuleActionRunner) => {
    if (!workspaceId || ids.length === 0) {
      return { success: false };
    }
    const result = await action(workspaceId, ids);
    await load();
    return result;
  }, [load, workspaceId]);

  return {
    actions,
    loading,
    error,
    load,
    apply: (ids: string[]) => run(ids, window.keepdirAPI.applyRuleActions),
    skip: (ids: string[]) => run(ids, window.keepdirAPI.skipRuleActions),
    refresh: (ids: string[]) => run(ids, window.keepdirAPI.refreshRuleActions)
  };
}
