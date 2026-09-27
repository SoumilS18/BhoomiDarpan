import React from 'react';
import { clsx } from 'clsx';

export type StatTone = 'navy' | 'emerald' | 'amber' | 'red' | 'orange' | 'slate';

interface StatCardProps {
  label: string;
  value: React.ReactNode;
  /** Small supporting line under the value (e.g. delta or context). */
  hint?: React.ReactNode;
  icon?: React.ReactNode;
  tone?: StatTone;
  /** Render as selected (e.g. when the stat is an active filter). */
  active?: boolean;
  onClick?: () => void;
  className?: string;
}

const toneStyles: Record<StatTone, { text: string; icon: string; activeRing: string }> = {
  navy: {
    text: 'text-gov-slate',
    icon: 'text-gov-navy',
    activeRing: 'border-gov-navy ring-2 ring-gov-navy/15 bg-gov-blue-soft/40',
  },
  emerald: {
    text: 'text-emerald-700',
    icon: 'text-emerald-600',
    activeRing: 'border-emerald-600 ring-2 ring-emerald-600/15 bg-emerald-50/40',
  },
  amber: {
    text: 'text-amber-700',
    icon: 'text-amber-600',
    activeRing: 'border-amber-600 ring-2 ring-amber-600/15 bg-amber-50/40',
  },
  red: {
    text: 'text-red-700',
    icon: 'text-red-600',
    activeRing: 'border-red-600 ring-2 ring-red-600/15 bg-red-50/40',
  },
  orange: {
    text: 'text-orange-700',
    icon: 'text-orange-600',
    activeRing: 'border-orange-600 ring-2 ring-orange-600/15 bg-orange-50/40',
  },
  slate: {
    text: 'text-gov-slate',
    icon: 'text-slate-500',
    activeRing: 'border-gov-navy ring-2 ring-gov-navy/15 bg-slate-50',
  },
};

/**
 * Standard KPI / metric card. When `onClick` is provided it behaves as a
 * filter chip; `active` reflects the selected state.
 */
export const StatCard: React.FC<StatCardProps> = ({
  label,
  value,
  hint,
  icon,
  tone = 'navy',
  active = false,
  onClick,
  className,
}) => {
  const t = toneStyles[tone];
  const clickable = Boolean(onClick);

  return (
    <div
      onClick={onClick}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      onKeyDown={
        clickable
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick?.();
              }
            }
          : undefined
      }
      className={clsx(
        'rounded-xl border bg-white p-4 shadow-gov transition-all',
        clickable && 'cursor-pointer hover:shadow-gov-md hover:border-slate-300',
        active ? t.activeRing : 'border-slate-200',
        className
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          {label}
        </span>
        {icon && <span className={clsx('shrink-0', t.icon)}>{icon}</span>}
      </div>
      <div className={clsx('mt-2 text-2xl font-bold tabular-nums', t.text)}>
        {value}
      </div>
      {hint && <div className="mt-1 truncate text-[11px] text-slate-400">{hint}</div>}
    </div>
  );
};
