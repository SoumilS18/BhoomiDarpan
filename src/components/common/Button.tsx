import React from 'react';
import { clsx } from 'clsx';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'danger' | 'success' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  isLoading = false,
  leftIcon,
  rightIcon,
  className,
  disabled,
  ...props
}) => {
  const baseStyles = 'inline-flex items-center justify-center font-medium rounded-lg transition-all duration-150 active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 select-none';

  const variantStyles = {
    primary: 'bg-terra-700 hover:bg-terra-800 text-white shadow-sm hover:shadow focus-visible:ring-terra-700 cursor-pointer',
    secondary: 'bg-mocha-800 hover:bg-mocha-900 text-sand-50 shadow-sm hover:shadow focus-visible:ring-mocha-700 cursor-pointer',
    outline: 'border border-sand-300 bg-[#FFFDF9] hover:bg-sand-100 hover:border-sand-400 text-mocha-800 shadow-sm focus-visible:ring-terra-700 cursor-pointer',
    danger: 'bg-sienna-500 hover:bg-sienna-600 text-white shadow-sm hover:shadow focus-visible:ring-sienna-500 cursor-pointer',
    success: 'bg-emerald-700 hover:bg-emerald-800 text-white shadow-sm hover:shadow focus-visible:ring-emerald-700 cursor-pointer',
    ghost: 'bg-transparent hover:bg-sand-100 text-mocha-700 focus-visible:ring-sand-400 cursor-pointer',
  };

  const sizeStyles = {
    sm: 'text-xs px-3 py-1.5 gap-1.5 font-medium',
    md: 'text-sm px-4 py-2 gap-2 font-medium',
    lg: 'text-base px-5 py-2.5 gap-2.5 font-semibold',
  };

  return (
    <button
      className={clsx(baseStyles, variantStyles[variant], sizeStyles[size], className)}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading ? (
        <svg className="animate-spin h-4 w-4 text-current" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
      ) : (
        leftIcon
      )}
      <span>{children}</span>
      {!isLoading && rightIcon}
    </button>
  );
};
