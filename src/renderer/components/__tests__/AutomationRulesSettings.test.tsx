import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AutomationRulesSettings from '../AutomationRulesSettings';

jest.mock('../WatchFoldersSettings', () => {
  return function MockWatchFoldersSettings() {
    return <div data-testid="watch-folders-settings">Watch folders</div>;
  };
});

jest.mock('../RuleActionsQueue', () => {
  return function MockRuleActionsQueue() {
    return <div data-testid="rule-actions-queue">Rule actions</div>;
  };
});

const mockKeepDirAPI = window.keepdirAPI as jest.Mocked<typeof window.keepdirAPI>;

async function openAssistantSettings(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /assistant settings/i }));
}

describe('AutomationRulesSettings', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    mockKeepDirAPI.getRuleAssistantKey.mockResolvedValue({ success: true, apiKey: null });
    mockKeepDirAPI.saveRuleAssistantKey.mockResolvedValue({ success: true });
    mockKeepDirAPI.deleteRuleAssistantKey.mockResolvedValue({ success: true });
    mockKeepDirAPI.fetchAssistantModels.mockResolvedValue({ success: true, models: [] });
    mockKeepDirAPI.draftRuleWithAssistant.mockResolvedValue({ success: true, content: '{}' });
    mockKeepDirAPI.simulateRuleAction.mockResolvedValue({ success: true });
    mockKeepDirAPI.getWorkspaceSetting.mockResolvedValue([
      {
        id: 'rule-1',
        name: 'Invoices',
        enabled: true,
        order: 0,
        match: { nameContains: 'invoice', extensionIn: ['pdf'] },
        action: { targetFolder: 'Documents', targetNameTemplate: '{date}-{basename}.{ext}' },
        stopOnMatch: true
      }
    ]);
    mockKeepDirAPI.saveWorkspaceSetting.mockResolvedValue({ success: true });
  });

  it('renders watched folders, ordered rules, and dry-run queue', async () => {
    render(<AutomationRulesSettings workspaceId="workspace-1" />);

    expect(screen.getByRole('heading', { name: 'Rules' })).toBeInTheDocument();
    expect(screen.getByTestId('watch-folders-settings')).toBeInTheDocument();
    expect(screen.getByTestId('rule-actions-queue')).toBeInTheDocument();

    await waitFor(() => expect(screen.getByText('Invoices')).toBeInTheDocument());
    expect(screen.getByText(/invoice.*pdf.*Documents/i)).toBeInTheDocument();
  });

  it('can hide the embedded dry-run queue', async () => {
    render(<AutomationRulesSettings workspaceId="workspace-1" showQueue={false} />);

    expect(screen.getByRole('heading', { name: 'Rules' })).toBeInTheDocument();
    expect(screen.getByTestId('watch-folders-settings')).toBeInTheDocument();
    expect(screen.queryByTestId('rule-actions-queue')).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('Invoices')).toBeInTheDocument());
  });

  it('adds a disabled default rule', async () => {
    const user = userEvent.setup();
    render(<AutomationRulesSettings workspaceId="workspace-1" />);

    await waitFor(() => expect(screen.getByText('Invoices')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /add rule/i }));

    expect(mockKeepDirAPI.saveWorkspaceSetting).toHaveBeenCalledWith(
      'workspace-1',
      'automationRules',
      expect.arrayContaining([
        expect.objectContaining({
          name: 'PDFs to Documents',
          enabled: false,
          match: { extensionIn: ['pdf'] },
          action: { targetFolder: 'Documents' }
        })
      ])
    );
  });

  it('previews a sample file through the rule simulator', async () => {
    mockKeepDirAPI.simulateRuleAction.mockResolvedValue({
      success: true,
      action: {
        id: 'simulation',
        workspaceId: 'workspace-1',
        folderPath: 'C:\\Downloads',
        filePath: 'C:\\Downloads\\invoice.pdf',
        originalName: 'invoice.pdf',
        targetPath: 'C:\\Downloads\\Documents\\invoice.pdf',
        targetName: 'invoice.pdf',
        ruleId: 'rule-1',
        ruleName: 'Invoices',
        ruleTrace: [
          {
            ruleId: 'rule-1',
            ruleName: 'Invoices',
            matched: true,
            uncertain: false,
            reasons: ['extension is pdf']
          }
        ],
        status: 'pending',
        fileSize: 0,
        fileMtimeMs: 0,
        errorMessage: null,
        createdAt: '0',
        updatedAt: '0'
      }
    });
    const user = userEvent.setup();
    render(<AutomationRulesSettings workspaceId="workspace-1" />);

    await user.clear(screen.getByLabelText('File name'));
    await user.type(screen.getByLabelText('File name'), 'invoice.pdf');
    await user.click(screen.getByRole('button', { name: /^test$/i }));

    await waitFor(() =>
      expect(mockKeepDirAPI.simulateRuleAction).toHaveBeenCalledWith('workspace-1', 'invoice.pdf')
    );
    expect(screen.getByText('Matched Invoices')).toBeInTheDocument();
    expect(screen.getByTitle('Invoices: extension is pdf')).toBeInTheDocument();
    expect(screen.getByText(/Documents\/invoice\.pdf/)).toBeInTheDocument();
  });

  it('loads a saved provider key from the OS keychain', async () => {
    mockKeepDirAPI.getRuleAssistantKey.mockResolvedValue({ success: true, apiKey: 'saved-key' });
    const user = userEvent.setup();

    render(<AutomationRulesSettings workspaceId="workspace-1" />);

    await openAssistantSettings(user);
    await waitFor(() => expect(screen.getByLabelText('Rule assistant API key')).toHaveValue('saved-key'));
    expect(screen.getByText('Key saved.')).toBeInTheDocument();
  });

  it('loads persisted assistant provider settings', async () => {
    mockKeepDirAPI.getWorkspaceSetting.mockImplementation(async (_workspaceId, key) => {
      if (key === 'ruleAssistantSettings') {
        return {
          provider: 'lmstudio',
          endpoint: 'http://localhost:1234/v1',
          model: 'local-model'
        };
      }
      return [
        {
          id: 'rule-1',
          name: 'Invoices',
          enabled: true,
          order: 0,
          match: { nameContains: 'invoice', extensionIn: ['pdf'] },
          action: { targetFolder: 'Documents' },
          stopOnMatch: true
        }
      ];
    });
    const user = userEvent.setup();

    render(<AutomationRulesSettings workspaceId="workspace-1" />);

    await openAssistantSettings(user);
    await waitFor(() => expect(screen.getByLabelText('Rule assistant provider')).toHaveValue('lmstudio'));
    expect(screen.getByLabelText('Rule assistant base URL')).toHaveValue('http://localhost:1234/v1');
    expect(screen.getByLabelText('Rule assistant model')).toHaveValue('local-model');
    await waitFor(() => expect(mockKeepDirAPI.getRuleAssistantKey).toHaveBeenCalledWith('lmstudio'));
  });

  it('saves assistant keys to the OS keychain on blur', async () => {
    const user = userEvent.setup();
    render(<AutomationRulesSettings workspaceId="workspace-1" />);

    await openAssistantSettings(user);
    await user.type(screen.getByLabelText('Rule assistant API key'), 'sk-persist');
    await user.click(screen.getByLabelText('Tell KeepDir what to move'));

    await waitFor(() => expect(mockKeepDirAPI.saveRuleAssistantKey).toHaveBeenCalledWith('openai', 'sk-persist'));
  });

  it('collapses assistant settings by default', async () => {
    const user = userEvent.setup();
    render(<AutomationRulesSettings workspaceId="workspace-1" />);

    expect(screen.queryByLabelText('Rule assistant provider')).not.toBeInTheDocument();
    await openAssistantSettings(user);
    expect(screen.getByLabelText('Rule assistant provider')).toBeInTheDocument();
  });

  it('loads provider models into the model picker', async () => {
    mockKeepDirAPI.fetchAssistantModels.mockResolvedValue({
      success: true,
      models: ['gemini-3-pro']
    });
    const user = userEvent.setup();
    render(<AutomationRulesSettings workspaceId="workspace-1" />);

    await waitFor(() => expect(screen.getByText('Invoices')).toBeInTheDocument());
    await openAssistantSettings(user);
    await user.selectOptions(screen.getByLabelText('Rule assistant provider'), 'google');
    await user.click(screen.getByRole('button', { name: /load models/i }));

    await user.click(screen.getByRole('combobox', { name: /Rule assistant model/i }));
    await waitFor(() => expect(screen.getByText('gemini-3-pro')).toBeInTheDocument());
    expect(screen.queryByText('embedding-only')).not.toBeInTheDocument();
    expect(mockKeepDirAPI.fetchAssistantModels).toHaveBeenCalledWith(
      'google',
      '',
      'https://generativelanguage.googleapis.com/v1beta'
    );
  });

  it('drafts a disabled rule from plain English', async () => {
    mockKeepDirAPI.draftRuleWithAssistant.mockResolvedValue({
      success: true,
      content: JSON.stringify({
        name: 'Invoices',
        match: { nameContains: 'invoice', extensionIn: ['pdf'] },
        action: {
          targetFolder: 'Finance/Invoices',
          targetNameTemplate: '{date}-{basename}.{ext}'
        },
        stopOnMatch: true
      })
    });
    const user = userEvent.setup();
    render(<AutomationRulesSettings workspaceId="workspace-1" />);

    await waitFor(() => expect(screen.getByText('Invoices')).toBeInTheDocument());
    await openAssistantSettings(user);
    await user.type(screen.getByLabelText('Tell KeepDir what to move'), 'Move invoice PDFs to Finance/Invoices');
    await user.type(screen.getByLabelText('Rule assistant API key'), 'sk-test');
    await user.click(screen.getByRole('button', { name: /draft rule/i }));

    await waitFor(() => expect(mockKeepDirAPI.saveWorkspaceSetting).toHaveBeenCalled());
    expect(mockKeepDirAPI.saveRuleAssistantKey).toHaveBeenCalledWith('openai', 'sk-test');
    expect(mockKeepDirAPI.draftRuleWithAssistant).toHaveBeenCalledWith(
      'openai',
      'sk-test',
      'https://api.openai.com/v1',
      'gpt-5.4-mini',
      'Move invoice PDFs to Finance/Invoices'
    );
    expect(mockKeepDirAPI.saveWorkspaceSetting).toHaveBeenCalledWith(
      'workspace-1',
      'automationRules',
      expect.arrayContaining([
        expect.objectContaining({
          name: 'Invoices',
          enabled: false,
          order: 1,
          match: expect.objectContaining({ nameContains: 'invoice', extensionIn: ['pdf'] }),
          action: expect.objectContaining({
            targetFolder: 'Finance/Invoices',
            targetNameTemplate: '{date}-{basename}.{ext}'
          }),
          stopOnMatch: true
        })
      ])
    );
    expect(screen.getByText('Drafted a disabled rule for review.')).toBeInTheDocument();
  });

  it('drafts multiple disabled rules from one assistant response', async () => {
    mockKeepDirAPI.draftRuleWithAssistant.mockResolvedValue({
      success: true,
      content: JSON.stringify([
        {
          name: 'Images',
          match: { extensionIn: ['png', 'jpg'] },
          action: { targetFolder: '30 Media/Images' },
          stopOnMatch: true
        },
        {
          name: 'Archives',
          match: { extensionIn: ['zip'] },
          action: { targetFolder: '70 Archives' },
          stopOnMatch: true
        }
      ])
    });
    const user = userEvent.setup();
    render(<AutomationRulesSettings workspaceId="workspace-1" />);

    await waitFor(() => expect(screen.getByText('Invoices')).toBeInTheDocument());
    await openAssistantSettings(user);
    await user.type(screen.getByLabelText('Tell KeepDir what to move'), 'Make rules for images and archives');
    await user.type(screen.getByLabelText('Rule assistant API key'), 'sk-test');
    await user.click(screen.getByRole('button', { name: /draft rule/i }));

    await waitFor(() =>
      expect(mockKeepDirAPI.saveWorkspaceSetting).toHaveBeenCalledWith(
        'workspace-1',
        'automationRules',
        expect.arrayContaining([
          expect.objectContaining({
            name: 'Images',
            enabled: false,
            order: 1,
            action: expect.objectContaining({ targetFolder: '30 Media/Images' })
          }),
          expect.objectContaining({
            name: 'Archives',
            enabled: false,
            order: 2,
            action: expect.objectContaining({ targetFolder: '70 Archives' })
          })
        ])
      )
    );
    expect(screen.getByText('Drafted 2 disabled rules for review.')).toBeInTheDocument();
  });

  it('normalizes alternate assistant field names for legacy formats', async () => {
    mockKeepDirAPI.draftRuleWithAssistant.mockResolvedValue({
      success: true,
      content: JSON.stringify({
        name: 'Screenshots',
        match: { 'name contains': 'screenshot', extension_in: ['.png', '.jpg'] },
        action: { 'target folder': '30 Media/Images', 'ask': true },
        stop_on_match: false
      })
    });
    const user = userEvent.setup();
    render(<AutomationRulesSettings workspaceId="workspace-1" />);

    await waitFor(() => expect(screen.getByText('Invoices')).toBeInTheDocument());
    await openAssistantSettings(user);
    await user.type(screen.getByLabelText('Tell KeepDir what to move'), 'Move screenshots to media');
    await user.type(screen.getByLabelText('Rule assistant API key'), 'sk-test');
    await user.click(screen.getByRole('button', { name: /draft rule/i }));

    await waitFor(() =>
      expect(mockKeepDirAPI.saveWorkspaceSetting).toHaveBeenCalledWith(
        'workspace-1',
        'automationRules',
        expect.arrayContaining([
          expect.objectContaining({
            name: 'Screenshots',
            enabled: false,
            match: expect.objectContaining({
              nameContains: 'screenshot',
              extensionIn: ['png', 'jpg']
            }),
            action: expect.objectContaining({
              ask: true,
              targetFolder: '30 Media/Images'
            }),
            stopOnMatch: false
          })
        ])
      )
    );
  });

  it('drafts through Anthropic messages', async () => {
    mockKeepDirAPI.draftRuleWithAssistant.mockResolvedValue({
      success: true,
      content: JSON.stringify({
        name: 'Ask for screenshots',
        match: { extensionIn: ['png'] },
        action: { ask: true },
        stopOnMatch: true
      })
    });
    const user = userEvent.setup();
    render(<AutomationRulesSettings workspaceId="workspace-1" />);

    await waitFor(() => expect(screen.getByText('Invoices')).toBeInTheDocument());
    await openAssistantSettings(user);
    await user.selectOptions(screen.getByLabelText('Rule assistant provider'), 'anthropic');
    await user.type(screen.getByLabelText('Tell KeepDir what to move'), 'Ask me before handling screenshots');
    await user.type(screen.getByLabelText('Rule assistant API key'), 'sk-ant-test');
    await user.click(screen.getByRole('button', { name: /draft rule/i }));

    await waitFor(() => expect(mockKeepDirAPI.saveWorkspaceSetting).toHaveBeenCalled());
    expect(mockKeepDirAPI.draftRuleWithAssistant).toHaveBeenCalledWith(
      'anthropic',
      'sk-ant-test',
      'https://api.anthropic.com/v1',
      'claude-2',
      'Ask me before handling screenshots'
    );
    expect(mockKeepDirAPI.saveWorkspaceSetting).toHaveBeenCalledWith(
      'workspace-1',
      'automationRules',
      expect.arrayContaining([
        expect.objectContaining({
          name: 'Ask for screenshots',
          enabled: false,
          action: expect.objectContaining({ ask: true })
        })
      ])
    );
  });

  it('drafts through Google Gemini', async () => {
    mockKeepDirAPI.draftRuleWithAssistant.mockResolvedValue({
      success: true,
      content: JSON.stringify({
        name: 'Chrome downloads',
        'match.extensionIn': ['.pdf'],
        'action.targetFolder': 'Downloads/Chrome',
        stopOnMatch: true
      })
    });
    const user = userEvent.setup();
    render(<AutomationRulesSettings workspaceId="workspace-1" />);

    await waitFor(() => expect(screen.getByText('Invoices')).toBeInTheDocument());
    await openAssistantSettings(user);
    await user.selectOptions(screen.getByLabelText('Rule assistant provider'), 'google');
    await user.type(screen.getByLabelText('Tell KeepDir what to move'), 'Move Chrome downloads into Downloads/Chrome');
    await user.type(screen.getByLabelText('Rule assistant API key'), 'gemini-test');
    await user.click(screen.getByRole('button', { name: /draft rule/i }));

    await waitFor(() => expect(mockKeepDirAPI.saveWorkspaceSetting).toHaveBeenCalled());
    expect(mockKeepDirAPI.draftRuleWithAssistant).toHaveBeenCalledWith(
      'google',
      'gemini-test',
      'https://generativelanguage.googleapis.com/v1beta',
      'gemini-3-flash-preview',
      'Move Chrome downloads into Downloads/Chrome'
    );
    expect(mockKeepDirAPI.saveWorkspaceSetting).toHaveBeenCalledWith(
      'workspace-1',
      'automationRules',
      expect.arrayContaining([
        expect.objectContaining({
          name: 'Chrome downloads',
          enabled: false,
          match: expect.objectContaining({ extensionIn: ['pdf'] }),
          action: expect.objectContaining({ targetFolder: 'Downloads/Chrome' })
        })
      ])
    );
  });
});
