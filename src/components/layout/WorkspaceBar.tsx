import React from 'react';
import { X } from 'lucide-react';
import { clsx } from 'clsx';
import type { WorkspaceItem } from '../../workspace/workspace';

interface WorkspaceBarProps {
  items: WorkspaceItem[];
  activeId: string | null;
  onActivate: (item: WorkspaceItem) => void;
  onClose: (item: WorkspaceItem) => void;
}

export const WorkspaceBar: React.FC<WorkspaceBarProps> = ({
  items,
  activeId,
  onActivate,
  onClose,
}) => {
  if (items.length === 0) {
    return null;
  }

  return (
    <div className="border-b border-slate-200 bg-slate-100/70" aria-label="Open workspace pages">
      <div className="max-w-[1600px] mx-auto flex items-stretch gap-1 overflow-x-auto px-3 pt-2" role="tablist">
        {items.map((item) => {
          const isActive = item.id === activeId;
          return (
            <div
              key={item.id}
              role="tab"
              aria-selected={isActive}
              className={clsx(
                'group mb-1 flex min-w-0 max-w-56 shrink-0 items-center gap-1 rounded-md border px-3 py-1.5 text-xs transition-colors',
                'focus-within:ring-2 focus-within:ring-gov-navy/30',
                isActive
                  ? 'border-slate-200 bg-white text-gov-navy shadow-gov'
                  : 'border-transparent text-slate-600 hover:bg-white/70 hover:text-gov-slate'
              )}
            >
              <span
                className={clsx(
                  'h-1.5 w-1.5 shrink-0 rounded-full',
                  isActive ? 'bg-gov-navy' : 'bg-slate-300'
                )}
                aria-hidden="true"
              />
              <button
                type="button"
                className="min-w-0 flex-1 truncate text-left font-medium outline-none"
                onClick={() => onActivate(item)}
                title={item.title}
              >
                {item.title}
              </button>
              {item.closable && (
                <button
                  type="button"
                  className="ml-2 shrink-0 rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus:ring-2 focus:ring-gov-navy/40"
                  onClick={() => onClose(item)}
                  aria-label={`Close ${item.title}`}
                  title={`Close ${item.title}`}
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
