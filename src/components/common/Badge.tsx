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
    slate: 'bg-slate-100 text-slate-700 border-slate-200',
    navy: 'bg-blue-50 text-blue-700 border-blue-200',
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    amber: 'bg-amber-50 text-amber-800 border-amber-200',
    red: 'bg-red-50 text-red-700 border-red-200',
    purple: 'bg-purple-50 text-purple-700 border-purple-200',
    outline: 'bg-transparent text-slate-600 border-slate-300',
  };

  const sizeStyles = {
    sm: 'text-xs px-2 py-0.5 font-medium',
    md: 'text-sm px-2.5 py-1 font-medium',
  };

  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 rounded-full border',
        variantStyles[variant],
        sizeStyles[size],
        pulse && 'animate-pulse ring-2 ring-red-300',
        className
      )}
    >
      {children}
    </span>
  );
};
