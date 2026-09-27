import React from 'react';
import { clsx } from 'clsx';

interface PageHeaderProps {
  /** Small uppercase eyebrow label, e.g. module tag. */
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  /** Right-aligned action buttons/controls. */
  actions?: React.ReactNode;
  className?: string;
}

/**
 * Canonical page header used at the top of every module surface.
 * Keeps title hierarchy, descriptive context and primary actions aligned
 * across Dashboard, Cases, Projects, GIS, Intelligence, Analytics, etc.
 */
export const PageHeader: React.FC<PageHeaderProps> = ({
  eyebrow,
  title,
  subtitle,
  actions,
  className,
}) => {
  return (
    <div
      className={clsx(
        'flex flex-wrap items-start justify-between gap-4',
        className
      )}
    >
      <div className="min-w-0">
        {eyebrow && (
          <div className="mb-1.5">{eyebrow}</div>
        )}
        <h1 className="text-xl font-bold tracking-tight text-gov-slate">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-1 text-xs text-slate-500 max-w-2xl">{subtitle}</p>
        )}
      </div>
      {actions && (
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {actions}
        </div>
      )}
    </div>
  );
};

/** Small uppercase module tag rendered inside PageHeader `eyebrow`. */
export const PageEyebrow: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className,
}) => (
  <span
    className={clsx(
      'inline-flex items-center gap-1.5 rounded border border-gov-navy/20 bg-gov-blue-soft px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-gov-navy',
      className
    )}
  >
    {children}
  </span>
);
