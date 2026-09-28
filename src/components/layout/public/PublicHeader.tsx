import React, { useState } from 'react';
import { Menu, X, ArrowRight, LayoutDashboard } from 'lucide-react';
import { Link, useRoute, publicNavRoutes, getRouteById } from '../../../router';
import { useAuth } from '../../../context/AuthContext';
import { NationalEmblem } from '../../common/NationalEmblem';

/**
 * Public website header. Shares the application's design language (gov
 * palette, institutional accent, National Emblem brand mark) but presents marketing
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
    <header className="sticky top-0 z-40 bg-[#FFFDF9] border-b border-sand-200 shadow-gov-header">
      {/* Institutional dual-tone Terra & Gold accent */}
      <div className="h-1 bg-gradient-to-r from-terra-900 via-terra-700 to-gold-500" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-4">
          {/* Brand with seamless National Emblem */}
          <Link
            to={getRouteById('public.landing').path}
            className="flex items-center gap-3 shrink-0"
            aria-label="BhoomiDarpan home"
          >
            <div className="flex shrink-0 items-center justify-center" title="Government of India - State Emblem">
              <NationalEmblem size={50} className="filter drop-shadow-xs hover:scale-105 transition-transform" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xl font-bold tracking-tight text-mocha-900 font-sans">
                  BhoomiDarpan
                </span>
                <span className="text-[10px] font-semibold text-terra-800 bg-sand-100 px-2 py-0.5 rounded border border-sand-300/80 shadow-2xs">
                  भूमिदर्पण
                </span>
              </div>
              <p className="text-[11px] text-mocha-500 hidden md:block font-medium">
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
