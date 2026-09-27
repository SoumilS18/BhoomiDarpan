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
    text: 'text-mocha-900',
    icon: 'text-terra-700',
    activeRing: 'border-terra-700 ring-2 ring-terra-700/20 bg-sand-100/50',
  },
  emerald: {
    text: 'text-emerald-800',
    icon: 'text-emerald-700',
    activeRing: 'border-emerald-600 ring-2 ring-emerald-600/20 bg-emerald-50/50',
  },
  amber: {
    text: 'text-gold-900',
    icon: 'text-gold-600',
    activeRing: 'border-gold-500 ring-2 ring-gold-500/20 bg-gold-50/60',
  },
  red: {
    text: 'text-sienna-700',
    icon: 'text-sienna-500',
    activeRing: 'border-sienna-500 ring-2 ring-sienna-500/20 bg-sienna-50/50',
  },
  orange: {
    text: 'text-amber-800',
    icon: 'text-amber-600',
    activeRing: 'border-amber-600 ring-2 ring-amber-600/20 bg-amber-50/50',
  },
  slate: {
    text: 'text-mocha-900',
    icon: 'text-mocha-500',
    activeRing: 'border-terra-700 ring-2 ring-terra-700/20 bg-sand-100/60',
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
        'rounded-xl border bg-[#FFFDF9] p-4 shadow-gov transition-all',
        clickable && 'cursor-pointer hover:shadow-gov-md hover:border-sand-300',
        active ? t.activeRing : 'border-sand-200',
        className
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-mocha-500">
          {label}
        </span>
        {icon && <span className={clsx('shrink-0', t.icon)}>{icon}</span>}
      </div>
      <div className={clsx('mt-2 text-2xl font-bold tabular-nums', t.text)}>
        {value}
      </div>
      {hint && <div className="mt-1 truncate text-[11px] text-mocha-400">{hint}</div>}
    </div>
  );
};
