import React, { useEffect } from 'react';
import { clsx } from 'clsx';
import { Layers, ArrowLeft } from 'lucide-react';
import { Link, getRouteById } from '../../../router';
import { PUBLIC_CONFIG } from '../../../lib/publicConfig';

/**
 * Shared shell for every authentication / account-access surface.
 *
 * Deliberately NOT the application shell: no operational sidebar, no
 * workspace bar, no module header. A visitor arriving at /login must land on
 * an account page, not on the officer dashboard.
 *
 * The shell also owns the document title and the "you are already signed in"
 * affordance so the individual pages only deal with their own form state.
 */
export const AuthShell: React.FC<{
  title: React.ReactNode;
  /** Short supporting line rendered under the title. */
  subtitle?: React.ReactNode;
  /** Extra content rendered above the form card (capability notices etc). */
  banner?: React.ReactNode;
  /** Card content. */
  children: React.ReactNode;
  /** Links rendered under the card (back to sign-in, forgot password, ...). */
  footer?: React.ReactNode;
}> = ({ title, subtitle, banner, children, footer }) => {
  useEffect(() => {
    document.title = `${typeof title === 'string' ? title : 'Account'} | ${PUBLIC_CONFIG.name}`;
    return () => {
      document.title = `${PUBLIC_CONFIG.name} | Land Acquisition Decision-Support Platform`;
    };
  }, [title]);

  const homePath = getRouteById('public.landing').path;
  const loginPath = getRouteById('auth.login').path;
  const privacyPath = getRouteById('public.privacy').path;
  const termsPath = getRouteById('public.terms').path;

  return (
    <div className="flex min-h-screen flex-col bg-gov-canvas text-gov-slate lg:flex-row">
      {/* Skip link */}
      <a
        href="#auth-main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-gov-navy focus:px-4 focus:py-2 focus:text-sm focus:text-white"
      >
        Skip to form
      </a>

      {/* Brand panel — decorative on small screens, informational on large */}
      <aside className="relative overflow-hidden bg-gov-slate px-6 py-8 text-white sm:px-10 lg:w-[42%] lg:shrink-0 lg:py-12">
        <div className="h-1 absolute inset-x-0 top-0 bg-gov-saffron" aria-hidden="true" />
        <div
          className="absolute inset-0 opacity-20"
          aria-hidden="true"
          style={{
            backgroundImage:
              'radial-gradient(circle at 20% 15%, #1e3a8a 0%, transparent 50%), radial-gradient(circle at 80% 85%, #2563eb 0%, transparent 50%)',
          }}
        />

        <div className="relative">
          <Link
            to={homePath}
            className="inline-flex items-center gap-2 text-sm font-medium text-slate-300 transition-colors hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Back to home
          </Link>

          <div className="mt-8 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-white/10">
              <Layers className="h-6 w-6 text-amber-400" aria-hidden="true" />
            </div>
            <div>
              <p className="text-lg font-bold tracking-tight">{PUBLIC_CONFIG.name}</p>
              <p className="text-[11px] font-semibold text-amber-300">{PUBLIC_CONFIG.nativeName}</p>
            </div>
          </div>

          <p className="mt-6 max-w-md text-xl font-semibold leading-snug tracking-tight sm:text-2xl">
            {PUBLIC_CONFIG.descriptor}
          </p>

          <div className="mt-6 flex flex-wrap gap-2" aria-label="Operating model">
            {PUBLIC_CONFIG.operatingModel.map((step) => (
              <span
                key={step}
                className="rounded-md border border-white/15 bg-white/10 px-2.5 py-1 text-xs font-semibold"
              >
                {step}
              </span>
            ))}
          </div>

          <p className="mt-6 hidden max-w-md text-sm leading-relaxed text-slate-400 lg:block">
            {PUBLIC_CONFIG.deploymentStatement}
          </p>
          <p className="mt-4 hidden max-w-md text-xs leading-relaxed text-slate-500 lg:block">
            {PUBLIC_CONFIG.decisionSupportNotice}
          </p>
        </div>
      </aside>

      {/* Form panel */}
      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 sm:px-8">
          <Link
            to={homePath}
            className="inline-flex items-center gap-2 rounded-md text-sm font-medium text-slate-600 transition-colors hover:text-gov-slate lg:hidden"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Home
          </Link>
          <p className="text-xs text-slate-500 lg:ml-auto">
            Account access for authorised officers
          </p>
        </header>

        <main id="auth-main" className="flex flex-1 items-start justify-center px-4 py-10 sm:px-8">
          <div className="w-full max-w-md">
            <div className="mb-6">
              <h1 className="text-2xl font-bold tracking-tight text-gov-slate">{title}</h1>
              {subtitle && <p className="mt-2 text-sm leading-relaxed text-slate-600">{subtitle}</p>}
            </div>

            {banner && <div className="mb-5">{banner}</div>}

            <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-gov">{children}</div>

            {footer && <div className="mt-5 space-y-3">{footer}</div>}

            <div className="mt-8 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 border-t border-slate-200 pt-5 text-xs text-slate-500">
              <Link to={homePath} className="hover:text-gov-slate">
                Home
              </Link>
              <Link to={loginPath} className="hover:text-gov-slate">
                Sign In
              </Link>
              <Link to={privacyPath} className="hover:text-gov-slate">
                Privacy
              </Link>
              <Link to={termsPath} className="hover:text-gov-slate">
                Terms
              </Link>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

/**
 * Field wrapper providing the consistent label / hint / error treatment used
 * across every account form.
 */
export const AuthField: React.FC<{
  id: string;
  label: React.ReactNode;
  required?: boolean;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}> = ({ id, label, required, hint, error, children, className }) => (
  <div className={className}>
    <label htmlFor={id} className={clsx('label', required && 'label-required')}>
      {label}
    </label>
    {children}
    {hint && !error && <p className="mt-1 text-[11px] text-slate-500">{hint}</p>}
    {error && (
      <p id={`${id}-error`} role="alert" className="mt-1 text-[11px] font-medium text-gov-red">
        {error}
      </p>
    )}
  </div>
);
