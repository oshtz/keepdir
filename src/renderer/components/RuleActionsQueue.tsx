import React, { useCallback, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowCounterClockwise, ArrowsClockwise, Check, X } from 'phosphor-react';
import { Alert, Button, Checkbox, Dialog, Input } from './ui';
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

function getStatusLabel(status: RuleActionStatus) {
  switch (status) {
    case 'pending':
      return 'ready';
    case 'needs_review':
      return 'check';
    case 'conflict':
      return 'blocked';
    default:
      return status;
  }
}

function compactPath(path?: string | null) {
  if (!path) {
    return 'Choose destination';
  }
  const parts = path.split(/[\\/]/).filter(Boolean);
  if (parts.length <= 2) {
    return path;
  }
  return parts.slice(-2).join('/');
}

function nextConflictName(name: string) {
  const dot = name.lastIndexOf('.');
  if (dot > 0) {
    return `${name.slice(0, dot)}-2${name.slice(dot)}`;
  }
  return `${name}-2`;
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
  const { actions, loading, error, apply, undo, skip, refresh, renameTarget } = useRuleActions(workspaceId, showHistory);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [actionError, setActionError] = useState<string | null>(null);
  const [targetDrafts, setTargetDrafts] = useState<Record<string, string>>({});

  const selectedActions = useMemo(
    () => actions.filter((action) => selectedIds.includes(action.id)),
    [actions, selectedIds]
  );
  const canApply = selectedActions.length > 0 && selectedActions.every((action) => action.status === 'pending');
  const canUndo = selectedActions.length > 0 && selectedActions.every((action) => action.status === 'applied');
  const canRevise = selectedActions.length > 0 && selectedActions.every((action) => action.status !== 'applied');
  const canSelect = useCallback(
    (action: RuleAction) =>
      action.status === 'applied'
        ? showHistory
        : action.status !== 'skipped' && action.status !== 'undone',
    [showHistory]
  );
  const selectableActionIds = useMemo(
    () => actions.filter((action) => canSelect(action)).map((action) => action.id),
    [actions, canSelect]
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

  const runRename = async (id: string, targetName: string) => {
    setActionError(null);
    try {
      const result = await renameTarget(id, targetName);
      if (result.error) {
        setActionError(result.error);
        return;
      }
      setTargetDrafts((previous) => {
        const next = { ...previous };
        delete next[id];
        return next;
      });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Rename failed');
    }
  };

  const content = (
    <div className="flex-1 min-h-0 min-w-0 overflow-y-auto pb-3">
      {(error || actionError) && <Alert severity="error" className="mb-3">{error || actionError}</Alert>}
      {loading && <div className="text-sm text-text-secondary">Loading rule actions...</div>}
      {!loading && actions.length === 0 && (
        <div className={cn('max-w-[420px] pt-3 mt-4', embedded && 'mt-8')}>
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
          const trace = getTrace(action);
          const targetLabel = compactPath(action.targetPath);
          return (
            <li
              key={action.id}
              className="kd-card px-3 py-2.5 flex items-start gap-2.5"
              title={`From: ${action.filePath}\nMatched: ${trace}\nTo: ${action.targetPath || 'Choose destination'}`}
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
                    <span className="flex-shrink-0 text-text-secondary">-&gt;</span>
                    <span className="font-mono text-sm text-text-secondary truncate flex-1" title={action.targetPath || undefined}>
                      {targetLabel}
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
                    {getStatusLabel(action.status)}
                  </span>
                </div>
                {action.errorMessage && (
                  <div className="mt-1.5 font-mono text-[11px] text-danger truncate">
                    {action.errorMessage}
                  </div>
                )}
                {action.status === 'conflict' && (
                  <div className="mt-2 flex items-end gap-2">
                    <Input
                      label="Rename to"
                      value={targetDrafts[action.id] ?? nextConflictName(action.targetName || action.originalName)}
                      onChange={(event) =>
                        setTargetDrafts((previous) => ({
                          ...previous,
                          [action.id]: event.target.value,
                        }))
                      }
                      inputClassName="text-xs px-2.5 py-1.5"
                      className="flex-1"
                    />
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() =>
                        runRename(
                          action.id,
                          targetDrafts[action.id] ?? nextConflictName(action.targetName || action.originalName)
                        )
                      }
                    >
                      Rename
                    </Button>
                  </div>
                )}
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
        disabled={!canRevise}
        onClick={() => runAction(skip)}
      >
        Skip
      </Button>
      <Button
        variant="ghost"
        size="sm"
        leftIcon={<ArrowsClockwise size={14} weight="light" />}
        disabled={!canRevise}
        onClick={() => runAction(refresh)}
      >
        Refresh
      </Button>
      <Button
        variant="ghost"
        size="sm"
        leftIcon={<ArrowCounterClockwise size={14} weight="light" />}
        disabled={!canUndo}
        onClick={() => runAction(undo)}
      >
        Undo
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
    <div className="flex items-center justify-between gap-2 flex-wrap min-w-0 w-full pt-2.5 pb-1 flex-shrink-0">
      {selectionControls}
      {actionButtons}
    </div>
  ) : (
    /* Full actionsBar with Show history toggle (standalone / dialog) */
    <div className="flex flex-col gap-2 pt-2.5 flex-shrink-0 w-full min-w-0">
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
        <div className="flex-shrink-0">
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
