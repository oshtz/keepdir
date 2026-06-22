import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Moon, Sun } from 'phosphor-react';
import logo from '../../assets/icon.png';
import AutomationRulesSettings from './components/AutomationRulesSettings';
import RuleActionsQueue from './components/RuleActionsQueue';
import WatchFoldersSettings from './components/WatchFoldersSettings';
import StatDeck from './components/StatDeck';
import { Checkbox, IconButton, Panel, PanelHeader, Tooltip } from './components/ui';
import { useDashboardStats } from './hooks/useDashboardStats';
import { hexToRgb, idealInk } from './utils';

// Legacy exports kept for back-compat; the default identity is now the signal accent.
export const DEFAULT_MONO_ACCENT_COLOR = '#525252';
export const SIGNAL_ACCENT_COLOR = '#D4FF4F';
const DEFAULT_WORKSPACE_ID = 'default';

const isValidHexColor = (color: string) =>
  /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.test(color);

// Theme preview helper kept for tests.
export const getTheme = (
  darkMode: boolean,
  accentColor: string = SIGNAL_ACCENT_COLOR,
  workspaceTheme?: { accentColor?: string; darkMode?: boolean; customColors?: { primary?: string; background?: string; surface?: string } }
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
        default:
          customColors.background || (finalDarkMode ? '#0C0C0D' : '#F4F4F1'),
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

const SIDEBAR_WIDTH_KEY = 'keepdir.sidebarWidth';
const DEFAULT_SIDEBAR_WIDTH = 360;
const MIN_SIDEBAR_WIDTH = 280;
const MAX_SIDEBAR_WIDTH = 520;

function loadSidebarWidth(): number {
  const raw = Number(localStorage.getItem(SIDEBAR_WIDTH_KEY));
  if (!Number.isFinite(raw)) return DEFAULT_SIDEBAR_WIDTH;
  return Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, raw));
}

const App: React.FC = () => {
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('darkMode') === 'true');
  const [sidebarWidth, setSidebarWidth] = useState(() => loadSidebarWidth());
  const [showHistory, setShowHistory] = useState(false);
  const [footerEl, setFooterEl] = useState<HTMLDivElement | null>(null);
  const draggingRef = useRef(false);
  const stats = useDashboardStats(DEFAULT_WORKSPACE_ID);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
    document.documentElement.style.colorScheme = darkMode ? 'dark' : 'light';
  }, [darkMode]);

  const handleDarkMode = (checked: boolean) => {
    setDarkMode(checked);
    localStorage.setItem('darkMode', String(checked));
  };

  const startResize = useCallback((event: React.MouseEvent) => {
    event.preventDefault();
    draggingRef.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);

  useEffect(() => {
    const onMove = (event: MouseEvent) => {
      if (!draggingRef.current) return;
      const next = Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, event.clientX));
      setSidebarWidth(next);
    };
    const onUp = () => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      setSidebarWidth((width) => {
        localStorage.setItem(SIDEBAR_WIDTH_KEY, String(width));
        return width;
      });
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);

  const meshBackground = useMemo(
    () =>
      darkMode
        ? 'radial-gradient(1200px 560px at 12% -10%, rgba(255,255,255,0.05), transparent 58%), radial-gradient(900px 520px at 104% 110%, rgba(255,255,255,0.03), transparent 60%)'
        : 'radial-gradient(1100px 540px at 10% -10%, rgba(0,0,0,0.05), transparent 60%), radial-gradient(900px 520px at 104% 110%, rgba(0,0,0,0.03), transparent 60%)',
    [darkMode]
  );

  return (
    <div
      className="relative flex flex-col min-w-0 h-[100dvh] overflow-hidden bg-bg"
      style={{ backgroundImage: meshBackground }}
    >
      <div className="kd-grain" />

      {/* Console body: sidebar (brand · stats · sources · queue) · workbench */}
      <main
        className="relative z-10 flex-1 min-h-0 min-w-0 flex flex-col md:flex-row gap-3 p-3 overflow-y-auto md:overflow-hidden"
        style={{ '--sidebar-width': `${sidebarWidth}px` } as React.CSSProperties}
      >
        {/* Sidebar */}
        <Panel delay={0} className="w-full md:w-[var(--sidebar-width)] md:flex-shrink-0">
          {/* Brand */}
          <div className="flex-shrink-0 p-5 pb-4 flex items-center justify-between gap-2 min-w-0">
            <div className="flex items-center gap-2.5 min-w-0">
              <img
                src={logo}
                alt="KeepDir"
                className="w-7 h-7 rounded-[var(--radius-md)] object-cover flex-shrink-0"
              />
              <div className="min-w-0 pr-1">
                <div className="font-display font-semibold text-[15px] leading-none tracking-tight truncate">
                  KeepDir
                </div>
                <div className="font-mono text-[9px] uppercase tracking-[0.08em] text-text-secondary leading-none mt-0.5 truncate">
                  Rules-first file automation
                </div>
              </div>
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

          {/* Engine + stats */}
          <div className="flex-shrink-0 px-5 pb-4 pt-2">
            <StatDeck stats={stats} />
          </div>

          {/* Sources + Queue: each scrolls within a bounded flex column */}
          <div className="flex-1 min-h-0 flex flex-col">
            {/* Sources */}
            <div className="flex-shrink-0 px-5 pt-1 pb-2">
              <Eyebrow>Sources</Eyebrow>
            </div>
            <div className="flex-shrink-1 min-h-0 max-h-[45%] overflow-y-auto px-3 pb-3">
              <WatchFoldersSettings workspaceId={DEFAULT_WORKSPACE_ID} />
            </div>

            {/* Queue: header + scrollable content (footer is portaled to sidebar bottom) */}
            <div className="flex-1 min-h-0 flex flex-col border-t border-black/[0.08] dark:border-white/[0.08] pt-2.5">
              <PanelHeader
                eyebrow="Review · live"
                title="Action Queue"
                badge={`${stats.queueTotal} queued`}
                compact
                divider={false}
                actions={
                  <Checkbox
                    checked={showHistory}
                    onChange={(e) => setShowHistory(e.target.checked)}
                    aria-label="Show history"
                    label="History"
                  />
                }
              />
              <div className="flex-1 min-h-0">
                <RuleActionsQueue
                  workspaceId={DEFAULT_WORKSPACE_ID}
                  embedded
                  showHistory={showHistory}
                  onShowHistoryChange={setShowHistory}
                  footerTarget={footerEl}
                />
              </div>
            </div>
          </div>

          {/* Footer: action controls docked at sidebar bottom */}
          <div ref={setFooterEl} className="flex-shrink-0 border-t border-border" />
        </Panel>

        {/* Resize handle (desktop) */}
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize sidebar"
          onMouseDown={startResize}
          className="hidden md:block flex-shrink-0 w-2 -mx-1 cursor-col-resize group relative"
        >
          <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-px bg-border transition-colors duration-300 group-hover:bg-text-secondary/40 group-active:bg-text-secondary/60" />
        </div>

        {/* Workbench */}
        <Panel delay={70} className="md:flex-1 md:min-w-0">
          <div className="flex-1 min-h-0 overflow-auto p-4 h-full">
            <AutomationRulesSettings
              workspaceId={DEFAULT_WORKSPACE_ID}
              showQueue={false}
              showWatchFolders={false}
            />
          </div>
        </Panel>
      </main>
    </div>
  );
};

function Eyebrow({ children }: { children?: React.ReactNode }) {
  return <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-text-secondary">{children || 'Sources'}</span>;
}

export default App;
