import React from 'react';
import { clsx } from 'clsx';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  hoverEffect?: boolean;
}

export const Card: React.FC<CardProps> = ({
  children,
  hoverEffect = false,
  className,
  ...props
}) => {
  return (
    <div
      className={clsx(
        'bg-[#FFFDF9] border border-sand-200 rounded-xl shadow-gov overflow-hidden',
        hoverEffect && 'transition-all duration-200 hover:shadow-gov-md hover:border-sand-300',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
};

export const CardHeader: React.FC<{
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}> = ({ title, subtitle, action, className }) => {
  return (
    <div className={clsx('px-5 py-4 border-b border-sand-100 flex items-center justify-between', className)}>
      <div>
        <h3 className="text-base font-semibold text-mocha-900 tracking-tight">{title}</h3>
        {subtitle && <p className="text-xs text-mocha-500 mt-0.5">{subtitle}</p>}
      </div>
      {action && <div>{action}</div>}
    </div>
  );
};

export const CardContent: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className,
}) => {
  return <div className={clsx('p-5', className)}>{children}</div>;
};
