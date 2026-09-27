import React from 'react';
import { clsx } from 'clsx';

interface SectionHeadingProps {
  title: React.ReactNode;
  /** Small contextual hint shown to the right of the title. */
  hint?: React.ReactNode;
  /** Optional right-aligned control (e.g. "View all", filter count). */
  action?: React.ReactNode;
  className?: string;
}

/**
 * Consistent section heading for grouping related content within a page.
 * Uses the restrained uppercase label treatment from the design language.
 */
export const SectionHeading: React.FC<SectionHeadingProps> = ({
  title,
  hint,
  action,
  className,
}) => {
  return (
    <div
      className={clsx(
        'mb-3 flex flex-wrap items-center justify-between gap-2',
        className
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        <h2 className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
          {title}
        </h2>
        {hint && <span className="text-[11px] text-slate-400">{hint}</span>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
};
