import React from 'react';
import { render, screen, fireEvent, act, within } from '@testing-library/react';
import App, {
  DEFAULT_MONO_ACCENT_COLOR,
  SIGNAL_ACCENT_COLOR,
  getTheme,
  pendingRenameNotificationBody,
} from '../App';

// The command deck pulls live counts asynchronously; flush those updates so each
// render settles inside act() before we assert.
async function renderApp() {
  await act(async () => {
    render(<App />);
  });
}

jest.mock('../components/AutomationRulesSettings', () => {
  return function MockAutomationRulesSettings() {
    return <div data-testid="automation-rules-settings">AutomationRulesSettings</div>;
  };
});

jest.mock('../components/RuleActionsQueue', () => {
  return function MockRuleActionsQueue() {
    return <div data-testid="rule-actions-queue">RuleActionsQueue</div>;
  };
});

jest.mock('../components/WatchFoldersSettings', () => {
  return function MockWatchFoldersSettings() {
    return <div data-testid="watch-folders-settings">WatchFoldersSettings</div>;
  };
});

describe('App', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('uses the signal-accent theme tokens by default', () => {
    const lightTheme = getTheme(false);
    const darkTheme = getTheme(true);
    const customTheme = getTheme(false, '#00FF00');

    expect(DEFAULT_MONO_ACCENT_COLOR).toBe('#525252');
    expect(SIGNAL_ACCENT_COLOR).toBe('#D4FF4F');
    expect(lightTheme.palette.primary.main).toBe('#D4FF4F');
    expect(lightTheme.palette.primary.contrastText).toBe('#0C0C0D');
    expect(lightTheme.palette.background.default).toBe('#F4F4F1');
    expect(darkTheme.palette.primary.main).toBe('#D4FF4F');
    expect(darkTheme.palette.background.default).toBe('#0C0C0D');
    expect(customTheme.palette.primary.main).toBe('#00FF00');
  });

  it('formats pending rename notifications', () => {
    expect(pendingRenameNotificationBody(1)).toBe('1 file is ready to organize.');
    expect(pendingRenameNotificationBody(3)).toBe('3 files are ready to organize.');
  });

  it('renders the automation console shell', async () => {
    await renderApp();

    expect(screen.getByText('KeepDir')).toBeInTheDocument();
    expect(screen.getByText('Folder cleanup')).toBeInTheDocument();
    expect(screen.getByTestId('watch-folders-settings')).toBeInTheDocument();
    expect(screen.getByTestId('automation-rules-settings')).toBeInTheDocument();
    expect(screen.getByTestId('rule-actions-queue')).toBeInTheDocument();
  });

  it('renders the command deck with live stat tiles', async () => {
    await renderApp();

    const statDeck = within(screen.getByTestId('stat-deck'));
    expect(statDeck.getByText('Watching')).toBeInTheDocument();
    expect(statDeck.getByText('Queue')).toBeInTheDocument();
    expect(statDeck.getByText('Engine')).toBeInTheDocument();
  });

  it('persists dark mode preference', async () => {
    await renderApp();

    fireEvent.click(screen.getByRole('button', { name: /switch to dark mode/i }));

    expect(localStorage.getItem('darkMode')).toBe('true');
  });
});
