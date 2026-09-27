import React from 'react';
import { clsx } from 'clsx';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'slate' | 'navy' | 'emerald' | 'amber' | 'red' | 'purple' | 'outline';
  size?: 'sm' | 'md';
  pulse?: boolean;
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'slate',
  size = 'sm',
  pulse = false,
  className,
}) => {
  const variantStyles = {
    slate: 'bg-slate-100/90 text-slate-700 border-slate-200/90 shadow-2xs',
    navy: 'bg-blue-50 text-blue-800 border-blue-200/80 shadow-2xs',
    emerald: 'bg-emerald-50 text-emerald-800 border-emerald-200/80 shadow-2xs',
    amber: 'bg-amber-50 text-amber-800 border-amber-200/80 shadow-2xs',
    red: 'bg-red-50 text-red-800 border-red-200/80 shadow-2xs',
    purple: 'bg-purple-50 text-purple-800 border-purple-200/80 shadow-2xs',
    outline: 'bg-white text-slate-700 border-slate-300 shadow-2xs',
  };

  const sizeStyles = {
    sm: 'text-[11px] px-2.5 py-0.5 font-medium tracking-tight',
    md: 'text-xs px-3 py-1 font-medium tracking-tight',
  };

  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-full border transition-colors',
        variantStyles[variant],
        sizeStyles[size],
        pulse && 'animate-pulse ring-2 ring-red-400/40',
        className
      )}
    >
      {children}
    </span>
  );
};
