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
    slate: 'bg-sand-100 text-mocha-800 border-sand-300/80 shadow-2xs',
    navy: 'bg-sand-100 text-terra-900 border-terra-300/80 shadow-2xs',
    emerald: 'bg-emerald-50 text-emerald-900 border-emerald-300/80 shadow-2xs',
    amber: 'bg-gold-100 text-gold-900 border-gold-300/90 shadow-2xs',
    red: 'bg-sienna-50 text-sienna-900 border-sienna-200/90 shadow-2xs',
    purple: 'bg-stone-100 text-stone-800 border-stone-300 shadow-2xs',
    outline: 'bg-[#FFFDF9] text-mocha-800 border-sand-300 shadow-2xs',
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
