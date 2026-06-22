import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowsClockwise, Check, X } from 'phosphor-react';
import { Alert, Button, Checkbox, Dialog } from './ui';
import { useRuleActions } from '../hooks/useRuleActions';
import type { RuleAction, RuleActionStatus } from '../appApi';

interface RuleActionsQueueProps {
  workspaceId?: string | null;
  open?: boolean;
  onClose?: () => void;
  embedded?: boolean;
  /** Controlled show-history toggle. When provided, the parent renders the toggle. */
  showHistory?: boolean;
  onShowHistoryChange?: (show: boolean) => void;
  /** DOM element to portal the action footer into (sidebar footer). */
  footerTarget?: HTMLElement | null;
}

function getStatusColor(status: RuleActionStatus): 'default' | 'error' | 'warning' | 'success' {
  if (status === 'error' || status === 'conflict') {
    return 'error';
  }
  if (status === 'stale' || status === 'needs_review') {
    return 'warning';
  }
  if (status === 'pending') {
    return 'success';
  }
  return 'default';
}

function getTrace(action: RuleAction) {
  const matched = action.ruleTrace.filter((item) => item.matched);
  return matched.length
    ? matched.map((item) => `${item.ruleName}: ${item.reasons.join(', ')}`).join(' | ')
    : action.errorMessage || 'No rule matched';
}

function getFinalAction(action: RuleAction) {
  if (action.targetPath) {
    return 'Move';
  }
  return action.status === 'needs_review' ? 'Ask' : 'Review';
}

const RuleActionsQueue: React.FC<RuleActionsQueueProps> = ({
  workspaceId,
  open = true,
  onClose,
  embedded = false,
  showHistory: controlledShowHistory,
  onShowHistoryChange,
  footerTarget,
}) => {
  const [internalShowHistory, setInternalShowHistory] = useState(false);
  const isControlled = controlledShowHistory !== undefined;
  const showHistory = controlledShowHistory ?? internalShowHistory;
  const handleShowHistoryChange = (value: boolean) => {
    if (onShowHistoryChange) {
      onShowHistoryChange(value);
    } else {
      setInternalShowHistory(value);
    }
  };
  const { actions, loading, error, apply, skip, refresh } = useRuleActions(workspaceId, showHistory);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [actionError, setActionError] = useState<string | null>(null);

  const selectedActions = useMemo(
    () => actions.filter((action) => selectedIds.includes(action.id)),
    [actions, selectedIds]
  );
  const canApply = selectedActions.length > 0 && selectedActions.every((action) => action.status === 'pending');
  const canSelect = (action: RuleAction) => action.status !== 'applied' && action.status !== 'skipped';
  const selectableActionIds = useMemo(
    () => actions.filter((action) => canSelect(action)).map((action) => action.id),
    [actions]
  );
  const isAllSelected =
    selectableActionIds.length > 0 && selectableActionIds.every((id) => selectedIds.includes(id));
  const isIndeterminate =
    !isAllSelected && selectableActionIds.some((id) => selectedIds.includes(id));

  const toggle = (id: string) => {
    setSelectedIds((previous) => {
      if (previous.includes(id)) {
        return previous.filter((item) => item !== id);
      }
      return [...previous, id];
    });
  };

  const runAction = async (action: (ids: string[]) => Promise<{ error?: string }>) => {
    setActionError(null);
    let result: { error?: string };
    try {
      result = await action(selectedIds);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Rule action failed');
      return;
    }
    if (result.error) {
      setActionError(result.error);
      return;
    }
    setSelectedIds([]);
  };

  const content = (
    <div className="flex-1 min-h-0 min-w-0 overflow-y-auto px-3 pb-3">
      {(error || actionError) && <Alert severity="error" className="mb-3">{error || actionError}</Alert>}
      {loading && <div className="text-sm text-text-secondary">Loading rule actions...</div>}
      {!loading && actions.length === 0 && (
        <div className={cn('max-w-[420px] border-t border-border pt-3 mt-4', embedded && 'mt-8')}>
          <div className="font-header font-semibold text-sm">
            {showHistory ? 'No history yet' : 'Queue is clear'}
          </div>
          <div className="text-sm text-text-secondary mt-1 leading-relaxed">
            {showHistory
              ? 'Applied and skipped actions will appear here.'
              : 'Matched files appear here for review before anything moves.'}
          </div>
        </div>
      )}
      <ul className="flex flex-col gap-2">
        {actions.map((action) => {
          const statusColor = getStatusColor(action.status);
          const finalAction = getFinalAction(action);
          const trace = getTrace(action);
          return (
            <li
              key={action.id}
              className="kd-card px-3 py-2.5 flex items-start gap-2.5"
            >
              <Checkbox
                checked={selectedIds.includes(action.id)}
                disabled={!canSelect(action)}
                onChange={() => toggle(action.id)}
                aria-label={`Select ${action.originalName}`}
                className="mt-1 flex-shrink-0"
              />
              <div className="min-w-0 flex-1">
                {/* Primary read: filename → target */}
                <div className="flex items-center justify-between gap-2 min-w-0">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="font-mono text-sm font-semibold truncate">{action.originalName}</span>
                    <span className="flex-shrink-0 text-text-secondary">→</span>
                    <span className="font-mono text-sm text-text-secondary truncate flex-1">
                      {action.targetPath || '(ask)'}
                    </span>
                  </div>
                  <span
                    className={cn(
                      'flex-shrink-0 inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-mono uppercase tracking-[0.08em]',
                      statusColor === 'success' && 'bg-text/[0.06] dark:bg-white/[0.1] text-text',
                      statusColor === 'warning' && 'bg-warning/15 text-warning',
                      statusColor === 'error' && 'bg-danger/15 text-danger',
                      statusColor === 'default' && 'bg-black/[0.04] dark:bg-white/[0.06] text-text-secondary'
                    )}
                  >
                    <span
                      className={cn(
                        'w-1.5 h-1.5 rounded-full',
                        statusColor === 'success' && 'bg-text dark:bg-white',
                        statusColor === 'warning' && 'bg-warning',
                        statusColor === 'error' && 'bg-danger',
                        statusColor === 'default' && 'bg-text-secondary/60'
                      )}
                    />
                    {action.status}
                  </span>
                </div>
                {/* Secondary: quiet labeled fields (each line is one text node for test matching) */}
                <div className="font-mono text-[11px] text-text-secondary leading-relaxed mt-1.5 flex flex-col gap-0.5 min-w-0">
                  <span className="truncate">{`Original path: ${action.filePath}`}</span>
                  <span className="truncate">{`Trace: ${trace}`}</span>
                  <span className="truncate">{`Action: ${finalAction} · Target: ${action.targetPath || '(ask)'}`}</span>
                  {action.errorMessage && (
                    <span className="text-danger truncate">{`Reason: ${action.errorMessage}`}</span>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );

  const selectionControls = (
    <Checkbox
      checked={isAllSelected}
      indeterminate={isIndeterminate}
      disabled={selectableActionIds.length === 0}
      onChange={() => {
        setSelectedIds((previous) => {
          if (previous.length === selectableActionIds.length) {
            return [];
          }
          return [...selectableActionIds];
        });
      }}
      aria-label="Select all action rows"
      label="Select all"
    />
  );

  const historyToggle = (
    <Checkbox
      checked={showHistory}
      onChange={(event) => handleShowHistoryChange(event.target.checked)}
      aria-label="Show history"
      label="Show history"
    />
  );

  const actionButtons = (
    <div className="flex items-center justify-end gap-1.5 flex-wrap min-w-0">
      <Button
        variant="ghost"
        size="sm"
        leftIcon={<X size={14} weight="light" />}
        disabled={selectedIds.length === 0}
        onClick={() => runAction(skip)}
      >
        Skip
      </Button>
      <Button
        variant="ghost"
        size="sm"
        leftIcon={<ArrowsClockwise size={14} weight="light" />}
        disabled={selectedIds.length === 0}
        onClick={() => runAction(refresh)}
      >
        Refresh
      </Button>
      <Button
        variant="primary"
        size="sm"
        leftIcon={<Check size={14} weight="light" />}
        disabled={!canApply}
        onClick={() => runAction(apply)}
      >
        Apply
      </Button>
    </div>
  );

  const actionsBar = isControlled ? (
    /* Compact footer: single row — Select all on left, buttons on right */
    <div className="flex items-center justify-between gap-2 flex-wrap min-w-0 w-full px-3 pt-2.5 pb-3 flex-shrink-0">
      {selectionControls}
      {actionButtons}
    </div>
  ) : (
    /* Full actionsBar with Show history toggle (standalone / dialog) */
    <div className="flex flex-col gap-2 pt-2.5 flex-shrink-0 w-full min-w-0 px-3">
      <div className="flex items-center gap-4 flex-wrap min-w-0">
        {selectionControls}
        {historyToggle}
      </div>
      {actionButtons}
    </div>
  );

  if (embedded) {
    if (footerTarget) {
      return (
        <div className="min-w-0 flex-1 min-h-0 flex flex-col">
          {content}
          {createPortal(actionsBar, footerTarget)}
        </div>
      );
    }
    return (
      <div className="min-w-0 flex-1 min-h-0 flex flex-col">
        {content}
        <div className="flex-shrink-0 border-t border-border">
          {actionsBar}
        </div>
      </div>
    );
  }

  return (
    <Dialog open={open} onClose={onClose} title="Rule Action Queue" actions={actionsBar}>
      {content}
    </Dialog>
  );
};

function cn(...classes: (string | false | undefined)[]) {
  return classes.filter(Boolean).join(' ');
}

export default RuleActionsQueue;
