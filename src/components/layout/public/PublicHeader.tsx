import React, { useState } from 'react';
import { Layers, Menu, X, ArrowRight, LayoutDashboard } from 'lucide-react';
import { Link, useRoute, publicNavRoutes, getRouteById } from '../../../router';
import { useAuth } from '../../../context/AuthContext';

/**
 * Public website header. Shares the application's design language (gov
 * palette, institutional accent, Layers brand mark) but presents marketing
 * navigation instead of operational controls. Navigation is derived from the
 * route registry (`publicNav` entries) — there is no second nav registry.
 */
export const PublicHeader: React.FC = () => {
  const { route } = useRoute();
  const { session, sessionStatus } = useAuth();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const navItems = publicNavRoutes();
  const loginPath = getRouteById('auth.login').path;
  const requestAccessPath = getRouteById('auth.requestAccess').path;
  const dashboardPath = getRouteById('module.dashboard').path;

  const closeMobileMenu = () => setIsMobileMenuOpen(false);

  return (
    <header className="sticky top-0 z-40 bg-white border-b border-slate-200 shadow-gov-header">
      {/* Institutional top accent (matches the application header) */}
      <div className="h-0.5 bg-gov-navy-dark" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-4">
          {/* Brand */}
          <Link
            to={getRouteById('public.landing').path}
            className="flex items-center gap-3 shrink-0"
            aria-label="BhoomiSetu home"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gov-navy-dark text-white shadow-sm">
              <Layers className="h-5 w-5 text-amber-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-lg font-bold tracking-tight text-gov-slate">
                  BhoomiSetu
                </span>
                <span className="text-[10px] font-semibold text-gov-navy bg-gov-blue-soft px-2 py-0.5 rounded border border-gov-navy/20">
                  भूमिसेतु
                </span>
              </div>
              <p className="text-[11px] text-slate-500 hidden md:block">
                Land Acquisition Intelligence &amp; Decision-Support System
              </p>
            </div>
          </Link>

          {/* Desktop navigation */}
          <nav className="hidden lg:flex items-center gap-1" aria-label="Website">
            {navItems.map((item) => {
              const isActive = route?.id === item.id;
              return (
                <Link
                  key={item.id}
                  to={item.path}
                  aria-current={isActive ? 'page' : undefined}
                  className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    isActive
                      ? 'text-gov-navy bg-gov-blue-soft'
                      : 'text-slate-600 hover:text-gov-slate hover:bg-slate-50'
                  }`}
                >
                  {item.title}
                </Link>
              );
            })}
          </nav>

          {/* Desktop actions */}
          <div className="hidden lg:flex items-center gap-2.5">
            {session ? (
              <Link
                to={dashboardPath}
                className="inline-flex items-center justify-center gap-2 rounded-md bg-gov-navy px-3.5 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-900 focus:outline-none focus:ring-2 focus:ring-gov-navy focus:ring-offset-1"
              >
                <LayoutDashboard className="h-4 w-4" />
                Open Application
              </Link>
            ) : (
              <>
                <Link
                  to={loginPath}
                  className="inline-flex items-center justify-center rounded-md border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-gov-navy focus:ring-offset-1"
                >
                  Sign In
                </Link>
                <Link
                  to={requestAccessPath}
                  className="inline-flex items-center justify-center gap-1.5 rounded-md bg-gov-navy px-3.5 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-900 focus:outline-none focus:ring-2 focus:ring-gov-navy focus:ring-offset-1"
                >
                  Request Access
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </>
            )}
          </div>

          {/* Mobile menu toggle */}
          <button
            type="button"
            className="lg:hidden inline-flex items-center justify-center rounded-md p-2 text-slate-600 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-gov-navy"
            aria-label={isMobileMenuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={isMobileMenuOpen}
            aria-controls="public-mobile-navigation"
            onClick={() => setIsMobileMenuOpen((open) => !open)}
          >
            {isMobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Mobile navigation panel */}
      {isMobileMenuOpen && (
        <nav
          id="public-mobile-navigation"
          className="lg:hidden border-t border-slate-200 bg-white px-4 pt-2 pb-4 space-y-1"
          aria-label="Website"
        >
          {navItems.map((item) => {
            const isActive = route?.id === item.id;
            return (
              <Link
                key={item.id}
                to={item.path}
                onClick={closeMobileMenu}
                aria-current={isActive ? 'page' : undefined}
                className={`block rounded-md px-3 py-2.5 text-sm font-medium ${
                  isActive
                    ? 'text-gov-navy bg-gov-blue-soft'
                    : 'text-slate-600 hover:text-gov-slate hover:bg-slate-50'
                }`}
              >
                {item.title}
              </Link>
            );
          })}
          <div className="pt-3 mt-2 border-t border-slate-100 flex flex-col gap-2">
            {session ? (
              <Link
                to={dashboardPath}
                onClick={closeMobileMenu}
                className="inline-flex items-center justify-center gap-2 rounded-md bg-gov-navy px-3.5 py-2.5 text-sm font-medium text-white shadow-sm"
              >
                <LayoutDashboard className="h-4 w-4" />
                Open Application
              </Link>
            ) : (
              <>
                <Link
                  to={loginPath}
                  onClick={closeMobileMenu}
                  className="inline-flex items-center justify-center rounded-md border border-slate-300 bg-white px-3.5 py-2.5 text-sm font-medium text-slate-700 shadow-sm"
                >
                  Sign In
                </Link>
                <Link
                  to={requestAccessPath}
                  onClick={closeMobileMenu}
                  className="inline-flex items-center justify-center gap-1.5 rounded-md bg-gov-navy px-3.5 py-2.5 text-sm font-medium text-white shadow-sm"
                >
                  Request Access
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </>
            )}
          </div>
        </nav>
      )}

      {/* Session-restore state is surfaced for screen readers only; the header
          buttons render correctly once the check completes. */}
      {sessionStatus === 'restoring' && (
        <span className="sr-only" role="status">
          Checking for an existing session...
        </span>
      )}
    </header>
  );
};
