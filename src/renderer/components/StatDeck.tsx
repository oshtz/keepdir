import React from 'react';
import { Folder, List, Tray } from 'phosphor-react';
import type { DashboardStats } from '../hooks/useDashboardStats';

interface StatDeckProps {
  stats: DashboardStats;
}

const StatRow: React.FC<{
  label: string;
  value: number;
  sub: string;
  accent?: boolean;
  icon: React.ReactNode;
}> = ({ label, value, sub, accent = false, icon }) => {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="text-text-secondary">{icon}</div>
        <div className="min-w-0">
          <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-text-secondary truncate">{label}</div>
          <div className="font-mono text-[11px] text-text-secondary truncate">{sub}</div>
        </div>
      </div>
      <div
        className={cn(
          'font-display font-semibold text-[1.6rem] leading-none tabular-nums',
          accent && value > 0 ? 'text-accent' : 'text-text'
        )}
      >
        {value}
      </div>
    </div>
  );
};

const StatDeck: React.FC<StatDeckProps> = ({ stats }) => {
  const engineActive = stats.engineActive;
  return (
    <div data-testid="stat-deck" className="flex flex-col gap-4">
      <div>
        <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-text-secondary">Engine</div>
        <div className="flex items-center gap-2.5 mt-2">
          <div
            className={cn(
              'w-2.5 h-2.5 rounded-full flex-shrink-0',
              engineActive ? 'kd-pulse bg-accent' : 'bg-text-secondary/60'
            )}
          />
          <div className="font-display font-semibold text-[1.75rem] leading-none tracking-[-0.02em]">
            {engineActive ? 'Active' : 'Idle'}
          </div>
        </div>
        <div className="font-mono text-[11px] text-text-secondary mt-1.5">
          {engineActive ? 'running' : 'off'}
        </div>
      </div>

      <div className="h-px bg-border" />

      <div className="flex flex-col gap-3">
        <StatRow
          label="Watching"
          value={stats.foldersTotal}
          sub={`${stats.foldersEnabled} active`}
          icon={<Folder size={18} weight="light" />}
        />
        <StatRow
          label="Rules"
          value={stats.rulesTotal}
          sub={`${stats.rulesEnabled} enabled`}
          icon={<List size={18} weight="light" />}
        />
        <StatRow
          label="Queue"
          value={stats.queueTotal}
          sub={
            stats.queueAttention > 0
              ? `${stats.queuePending} ready · ${stats.queueAttention} flagged`
              : `${stats.queuePending} ready`
          }
          accent
          icon={<Tray size={18} weight="light" />}
        />
      </div>
    </div>
  );
};

function cn(...classes: (string | false | undefined)[]) {
  return classes.filter(Boolean).join(' ');
}

export default StatDeck;
