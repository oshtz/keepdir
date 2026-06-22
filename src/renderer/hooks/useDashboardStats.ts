import { useCallback, useEffect, useState } from 'react';
import type { FileRule, RuleAction, WatchFolder } from '../appApi';

const AUTOMATION_RULES_KEY = 'automationRules';

export interface DashboardStats {
  foldersTotal: number;
  foldersEnabled: number;
  rulesTotal: number;
  rulesEnabled: number;
  queueTotal: number;
  queuePending: number;
  queueAttention: number;
  engineActive: boolean;
}

const EMPTY_STATS: DashboardStats = {
  foldersTotal: 0,
  foldersEnabled: 0,
  rulesTotal: 0,
  rulesEnabled: 0,
  queueTotal: 0,
  queuePending: 0,
  queueAttention: 0,
  engineActive: false,
};

const ATTENTION_STATUSES = new Set(['needs_review', 'conflict', 'stale', 'error']);

/**
 * Reads aggregate counts for the command deck. Watch folders and the action queue
 * push live events, so we refresh on those; rules have no event, so a slow safety
 * interval keeps that tile honest after edits in the same window.
 */
export function useDashboardStats(workspaceId?: string | null): DashboardStats {
  const [stats, setStats] = useState<DashboardStats>(EMPTY_STATS);

  const refresh = useCallback(async () => {
    if (!workspaceId) {
      setStats(EMPTY_STATS);
      return;
    }

    try {
      const [foldersResult, rulesValue, queueResult] = await Promise.all([
        window.keepdirAPI.getWatchFolders(workspaceId),
        window.keepdirAPI.getWorkspaceSetting(workspaceId, AUTOMATION_RULES_KEY),
        window.keepdirAPI.getRuleActions(workspaceId, { includeHistory: false }),
      ]);

      const folders: WatchFolder[] = foldersResult?.folders ?? [];
      const rules: FileRule[] = Array.isArray(rulesValue) ? (rulesValue as FileRule[]) : [];
      const actions: RuleAction[] = queueResult?.actions ?? [];

      const foldersEnabled = folders.filter((folder) => folder.enabled).length;
      const rulesEnabled = rules.filter((rule) => rule.enabled).length;

      setStats({
        foldersTotal: folders.length,
        foldersEnabled,
        rulesTotal: rules.length,
        rulesEnabled,
        queueTotal: actions.length,
        queuePending: actions.filter((action) => action.status === 'pending').length,
        queueAttention: actions.filter((action) => ATTENTION_STATUSES.has(action.status)).length,
        engineActive: foldersEnabled > 0 && rulesEnabled > 0,
      });
    } catch {
      // Stats are best-effort decoration; never surface their failures to the user.
    }
  }, [workspaceId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const unsubscribeFolders = window.keepdirAPI.onWatchFoldersChanged((payload) => {
      if (payload.workspaceId === workspaceId) {
        void refresh();
      }
    });
    const unsubscribeActions = window.keepdirAPI.onRuleActionsChanged((payload) => {
      if (payload.workspaceId === workspaceId) {
        void refresh();
      }
    });
    const interval = window.setInterval(() => void refresh(), 6000);
    return () => {
      unsubscribeFolders();
      unsubscribeActions();
      window.clearInterval(interval);
    };
  }, [refresh, workspaceId]);

  return stats;
}
