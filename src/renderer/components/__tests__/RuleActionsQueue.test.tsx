import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RuleActionsQueue from '../RuleActionsQueue';
import type { RuleAction } from '../../appApi';

const mockApply = jest.fn();
const mockSkip = jest.fn();
const mockRefresh = jest.fn();
let mockActions: RuleAction[] = [];
let mockLastIncludeHistory = false;

jest.mock('../../hooks/useRuleActions', () => ({
  useRuleActions: (_workspaceId: string, includeHistory: boolean) => {
    mockLastIncludeHistory = includeHistory;
    return {
      actions: mockActions,
      loading: false,
      error: null,
      apply: mockApply,
      skip: mockSkip,
      refresh: mockRefresh
    };
  }
}));

function action(overrides: Partial<RuleAction> = {}): RuleAction {
  return {
    id: 'action-1',
    workspaceId: 'workspace-1',
    folderPath: 'C:\\Downloads',
    filePath: 'C:\\Downloads\\invoice.pdf',
    originalName: 'invoice.pdf',
    targetPath: 'C:\\Downloads\\Invoices\\invoice.pdf',
    targetName: 'invoice.pdf',
    ruleId: 'rule-1',
    ruleName: 'Invoices',
    ruleTrace: [{
      ruleId: 'rule-1',
      ruleName: 'Invoices',
      matched: true,
      uncertain: false,
      reasons: ['name contains "invoice"']
    }],
    status: 'pending',
    fileSize: 12,
    fileMtimeMs: 1000,
    errorMessage: null,
    createdAt: '2026-06-21T00:00:00.000Z',
    updatedAt: '2026-06-21T00:00:00.000Z',
    ...overrides
  };
}

describe('RuleActionsQueue', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockApply.mockResolvedValue({ success: true });
    mockSkip.mockResolvedValue({ success: true });
    mockRefresh.mockResolvedValue({ success: true });
    mockActions = [];
    mockLastIncludeHistory = false;
  });

  it('shows the full dry-run row fields and conflict/error reasons', () => {
    mockActions = [
      action({
        status: 'conflict',
        errorMessage: 'Target already exists',
      }),
      action({
        id: 'action-2',
        originalName: 'bad.pdf',
        filePath: 'C:\\Downloads\\bad.pdf',
        targetPath: null,
        ruleTrace: [],
        status: 'error',
        errorMessage: 'Target path must stay inside the watched folder',
      }),
    ];

    render(<RuleActionsQueue workspaceId="workspace-1" embedded />);

    expect(screen.getByText('conflict')).toBeInTheDocument();
    expect(screen.getByText('error')).toBeInTheDocument();
    expect(screen.getByText(/Original path: C:\\Downloads\\invoice\.pdf/)).toBeInTheDocument();
    expect(screen.getByText(/Trace: Invoices: name contains "invoice"/)).toBeInTheDocument();
    expect(screen.getByText(/Action: Move/)).toBeInTheDocument();
    expect(screen.getByText(/Target: C:\\Downloads\\Invoices\\invoice\.pdf/)).toBeInTheDocument();
    expect(screen.getByText(/Reason: Target already exists/)).toBeInTheDocument();
    expect(
      screen.getByText(/Reason: Target path must stay inside the watched folder/)
    ).toBeInTheDocument();
  });

  it('can apply, skip, and refresh selected queue rows', async () => {
    const user = userEvent.setup();
    mockActions = [action()];

    render(<RuleActionsQueue workspaceId="workspace-1" embedded />);

    await user.click(screen.getByLabelText('Select invoice.pdf'));
    await user.click(screen.getByRole('button', { name: /apply/i }));
    expect(mockApply).toHaveBeenCalledWith(['action-1']);

    await user.click(screen.getByLabelText('Select invoice.pdf'));
    await user.click(screen.getByRole('button', { name: /skip/i }));
    expect(mockSkip).toHaveBeenCalledWith(['action-1']);

    await user.click(screen.getByLabelText('Select invoice.pdf'));
    await user.click(screen.getByRole('button', { name: /refresh/i }));
    expect(mockRefresh).toHaveBeenCalledWith(['action-1']);
  });

  it('can select and clear all selectable rows', async () => {
    const user = userEvent.setup();
    mockActions = [
      action({ id: 'action-1', status: 'pending', originalName: 'invoice.pdf' }),
      action({ id: 'action-2', status: 'pending', originalName: 'receipt.pdf' }),
      action({ id: 'action-3', status: 'applied', originalName: 'done.pdf' })
    ];

    render(<RuleActionsQueue workspaceId="workspace-1" embedded />);

    await user.click(screen.getByLabelText('Select all action rows'));
    expect(screen.getByRole('checkbox', { name: /select invoice\.pdf/i })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /select receipt\.pdf/i })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /select done\.pdf/i })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: /skip/i }));
    expect(mockSkip).toHaveBeenCalledWith(['action-1', 'action-2']);

    await user.click(screen.getByLabelText('Select all action rows'));
    expect(screen.getByRole('checkbox', { name: /select invoice\.pdf/i })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /select receipt\.pdf/i })).toBeChecked();

    await user.click(screen.getByLabelText('Select all action rows'));
    expect(screen.getByRole('checkbox', { name: /select invoice\.pdf/i })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: /select receipt\.pdf/i })).not.toBeChecked();
  });

  it('can request history and keeps terminal rows read-only', async () => {
    const user = userEvent.setup();
    mockActions = [action({ status: 'applied' })];

    render(<RuleActionsQueue workspaceId="workspace-1" embedded />);

    expect(mockLastIncludeHistory).toBe(false);
    await user.click(screen.getByLabelText('Show history'));
    expect(mockLastIncludeHistory).toBe(true);
    expect(screen.getByLabelText('Select invoice.pdf')).toBeDisabled();
  });

  it('shows rejected action errors without clearing selection', async () => {
    const user = userEvent.setup();
    mockActions = [action()];
    mockApply.mockRejectedValue(new Error('IPC failed'));

    render(<RuleActionsQueue workspaceId="workspace-1" embedded />);

    await user.click(screen.getByLabelText('Select invoice.pdf'));
    await user.click(screen.getByRole('button', { name: /apply/i }));

    expect(await screen.findByText('IPC failed')).toBeInTheDocument();
    expect(screen.getByLabelText('Select invoice.pdf')).toBeChecked();
  });
});
