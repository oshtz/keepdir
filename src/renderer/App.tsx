import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from '@tauri-apps/plugin-notification';
import { Moon, Sun } from 'phosphor-react';
import logo from '../../assets/icon.svg';
import AutomationRulesSettings from './components/AutomationRulesSettings';
import RuleActionsQueue from './components/RuleActionsQueue';
import WatchFoldersSettings from './components/WatchFoldersSettings';
import StatDeck from './components/StatDeck';
import { Checkbox, IconButton, Panel, PanelHeader, Tooltip } from './components/ui';
import { useDashboardStats } from './hooks/useDashboardStats';
import { getLatestRelease, isNewerVersion } from './updateCheck';
import { hexToRgb, idealInk } from './utils';

// Legacy exports kept for back-compat; the default identity is now the signal accent.
export const DEFAULT_MONO_ACCENT_COLOR = '#525252';
export const SIGNAL_ACCENT_COLOR = '#D4FF4F';
const DEFAULT_WORKSPACE_ID = 'default';

export const pendingRenameNotificationBody = (count: number) =>
  count === 1 ? '1 file is ready to organize.' : `${count} files are ready to organize.`;

const isValidHexColor = (color: string) =>
  /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.test(color);

// Theme preview helper kept for tests.
export const getTheme = (
  darkMode: boolean,
  accentColor: string = SIGNAL_ACCENT_COLOR,
  workspaceTheme?: {
    accentColor?: string;
    darkMode?: boolean;
    customColors?: { primary?: string; background?: string; surface?: string };
  }
) => {
  const workspaceAccentColor = workspaceTheme?.accentColor;
  const sanitizedAccentColor = isValidHexColor(accentColor) ? accentColor : SIGNAL_ACCENT_COLOR;
  const finalAccentColor =
    workspaceAccentColor && isValidHexColor(workspaceAccentColor)
      ? workspaceAccentColor
      : sanitizedAccentColor;
  const finalDarkMode =
    workspaceTheme?.darkMode !== undefined ? workspaceTheme.darkMode : darkMode;
  const customColors = workspaceTheme?.customColors || {};
  const primaryBaseColor =
    customColors.primary && isValidHexColor(customColors.primary)
      ? customColors.primary
      : finalAccentColor;
  const rgb = hexToRgb(primaryBaseColor);
  const accentInk = idealInk(rgb);

  return {
    palette: {
      mode: finalDarkMode ? 'dark' : 'light',
      primary: { main: primaryBaseColor, contrastText: accentInk },
      success: { main: primaryBaseColor, contrastText: accentInk },
      warning: { main: '#F5A623', contrastText: '#0C0C0D' },
      error: { main: '#FF5C5C', contrastText: '#0C0C0D' },
      background: {
        default: customColors.background || (finalDarkMode ? '#0C0C0D' : '#F4F4F1'),
        paper: customColors.surface || (finalDarkMode ? '#141416' : '#FFFFFF'),
      },
      text: {
        primary: finalDarkMode ? '#F4F4F2' : '#121211',
        secondary: finalDarkMode ? '#9C9C97' : '#6A6A64',
      },
      divider: finalDarkMode ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.1)',
    },
  };
};

const App: React.FC = () => {
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('darkMode') === 'true');
  const [showHistory, setShowHistory] = useState(false);
  const stats = useDashboardStats(DEFAULT_WORKSPACE_ID);

  const notifyPendingRenames = useCallback(async (pendingCount: number) => {
    try {
      let granted = await isPermissionGranted();
      if (!granted) {
        granted = (await requestPermission()) === 'granted';
      }
      if (granted) {
        sendNotification({
          title: 'KeepDir',
          body: pendingRenameNotificationBody(pendingCount),
        });
      }
    } catch {
      // Native notifications are optional; the tray badge still shows pending work.
    }
  }, []);

  const checkForUpdates = useCallback(async () => {
    try {
      const [currentVersion, latestRelease] = await Promise.all([
        window.keepdirAPI.getAppVersion(),
        getLatestRelease(),
      ]);

      if (!latestRelease) {
        window.alert('No KeepDir releases are published yet.');
        return;
      }

      if (!isNewerVersion(latestRelease.version, currentVersion)) {
        window.alert(`KeepDir is up to date (${currentVersion}).`);
        return;
      }

      if (
        window.confirm(
          `KeepDir ${latestRelease.version} is available.\n\nOpen the GitHub release page?`
        )
      ) {
        await window.keepdirAPI.openLatestRelease();
      }
    } catch (error) {
      window.alert(
        `Could not check for updates: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }, []);

  useEffect(
    () => window.keepdirAPI.onCheckUpdatesRequested(() => void checkForUpdates()),
    [checkForUpdates]
  );

  useEffect(
    () =>
      window.keepdirAPI.onPendingRenamesDetected((payload) =>
        void notifyPendingRenames(payload.pendingCount)
      ),
    [notifyPendingRenames]
  );

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
    document.documentElement.style.colorScheme = darkMode ? 'dark' : 'light';
  }, [darkMode]);

  const handleDarkMode = (checked: boolean) => {
    setDarkMode(checked);
    localStorage.setItem('darkMode', String(checked));
  };

  const meshBackground = useMemo(
    () =>
      darkMode
        ? 'radial-gradient(1200px 560px at 12% -10%, rgba(255,255,255,0.05), transparent 58%), radial-gradient(900px 520px at 104% 110%, rgba(255,255,255,0.03), transparent 60%)'
        : 'radial-gradient(1100px 540px at 10% -10%, rgba(0,0,0,0.05), transparent 60%), radial-gradient(900px 520px at 104% 110%, rgba(0,0,0,0.03), transparent 60%)',
    [darkMode]
  );

  return (
    <div
      className="relative flex h-[100dvh] min-w-0 flex-col overflow-hidden bg-bg"
      style={{ backgroundImage: meshBackground }}
    >
      <div className="kd-grain" />

      <main className="relative z-10 flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-hidden p-4">
        <Panel delay={0} className="flex-shrink-0">
          <div className="flex min-w-0 items-center justify-between gap-4 px-1 py-1">
            <div className="flex min-w-0 items-center gap-3">
              <img
                src={logo}
                alt="KeepDir"
                className="h-8 w-8 flex-shrink-0 rounded-[var(--radius-md)] object-cover"
              />
              <div className="min-w-0">
                <div className="truncate font-display text-[16px] font-semibold leading-tight">
                  KeepDir
                </div>
                <div className="truncate font-mono text-[10px] uppercase leading-tight tracking-[0.1em] text-text-secondary">
                  Folder cleanup
                </div>
              </div>
            </div>

            <div className="hidden min-w-0 items-center gap-2 lg:flex">
              <HeaderMetric label="folders" value={stats.foldersEnabled} />
              <HeaderMetric label="rules" value={stats.rulesEnabled} />
              <HeaderMetric label="ready" value={stats.queuePending} accent />
              <HeaderMetric label="check" value={stats.queueAttention} warning />
            </div>

            <Tooltip title={darkMode ? 'Light mode' : 'Dark mode'}>
              <IconButton
                label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
                onClick={() => handleDarkMode(!darkMode)}
                className="flex-shrink-0"
              >
                {darkMode ? <Sun size={18} weight="light" /> : <Moon size={18} weight="light" />}
              </IconButton>
            </Tooltip>
          </div>
        </Panel>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-5 overflow-y-auto lg:grid lg:grid-cols-[260px_minmax(0,1fr)] lg:overflow-hidden xl:grid-cols-[280px_minmax(0,1fr)_430px]">
          <aside className="flex min-h-fit min-w-0 flex-col gap-5 lg:min-h-0">
            <Panel delay={40} className="flex-shrink-0">
              <div className="p-1">
                <StatDeck stats={stats} />
              </div>
            </Panel>

            <Panel delay={70} className="min-h-[260px] lg:flex-1">
              <div className="flex-shrink-0 px-1 pb-3 pt-1">
                <Eyebrow>Sources</Eyebrow>
              </div>
              <div className="min-h-0 flex-1 overflow-auto">
                <WatchFoldersSettings workspaceId={DEFAULT_WORKSPACE_ID} />
              </div>
            </Panel>
          </aside>

          <section className="min-h-[520px] min-w-0">
            <Panel delay={90} className="h-full">
              <PanelHeader
                eyebrow="Review"
                title="Queue"
                badge={`${stats.queueTotal}`}
                divider
                actions={
                  <Checkbox
                    checked={showHistory}
                    onChange={(e) => setShowHistory(e.target.checked)}
                    aria-label="Show history"
                    label="History"
                  />
                }
              />
              <RuleActionsQueue
                workspaceId={DEFAULT_WORKSPACE_ID}
                embedded
                showHistory={showHistory}
                onShowHistoryChange={setShowHistory}
              />
            </Panel>
          </section>

          <aside className="min-h-[520px] min-w-0 lg:col-span-2 xl:col-span-1">
            <Panel delay={120} className="h-full">
              <div className="min-h-0 flex-1 overflow-auto p-1">
                <AutomationRulesSettings
                  workspaceId={DEFAULT_WORKSPACE_ID}
                  showQueue={false}
                  showWatchFolders={false}
                />
              </div>
            </Panel>
          </aside>
        </div>
      </main>
    </div>
  );
};

function Eyebrow({ children }: { children?: React.ReactNode }) {
  return (
    <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-text-secondary">
      {children || 'Sources'}
    </span>
  );
}

function HeaderMetric({
  label,
  value,
  accent = false,
  warning = false,
}: {
  label: string;
  value: number;
  accent?: boolean;
  warning?: boolean;
}) {
  return (
    <div className="flex items-baseline gap-2 px-1.5 py-1">
      <span
        className={cn(
          'font-display text-[18px] font-semibold leading-none tabular-nums',
          accent && value > 0 && 'text-accent',
          warning && value > 0 && 'text-warning'
        )}
      >
        {value}
      </span>
      <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-secondary">
        {label}
      </span>
    </div>
  );
}

function cn(...classes: (string | false | undefined)[]) {
  return classes.filter(Boolean).join(' ');
}

export default App;
