import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { navigate, getRouteById } from '../../router';
import {
  Shield,
  ChevronDown,
  UserCircle,
  Building2,
  MapPin,
  Info,
  LogOut,
  Loader2,
} from 'lucide-react';

/**
 * Profile / account control.
 *
 * ONE MODE, decided by whether a verified session exists:
 *
 *  1. `session !== null`  — a real Supabase session. The menu shows that
 *     account's own profile row (name, role, department, jurisdiction),
 *     offers NO way to change role — a signed-in identity is not switchable —
 *     and exposes a real "Sign out" that calls the provider's `signOut()`.
 *
 *  2. `session === null`  — there is no account to present. The menu says so
 *     and offers a route to sign in. It deliberately renders neither a fake
 *     identity nor a fake "Sign out": there is no session to end, and there is
 *     certainly nothing to switch to.
 *
 * There is deliberately no persona/role picker anywhere in this component.
 * Authorisation is a property of the authenticated account (`user_profiles`
 * read server-side from the JWT), never something the browser chooses.
 */
export const RoleSwitcher: React.FC = () => {
  const { activePersona, session, sessionStatus, isRealAuthConfigured, signOut } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);

  const hasRealSession = Boolean(session);

  const initials = activePersona.name
    .split(' ')
    .map((n) => n[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const handleSignOut = async () => {
    if (isSigningOut) return;
    setIsSigningOut(true);
    try {
      await signOut();
      // Only navigate once the provider has actually cleared the session, so
      // we never land on sign-in while a session is still active (the login
      // route would immediately redirect back).
      navigate(getRouteById('auth.login').path, { replace: true });
    } finally {
      setIsSigningOut(false);
      setIsOpen(false);
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label={
          hasRealSession
            ? `Account menu for ${activePersona.name}`
            : 'Account menu'
        }
        className="flex items-center gap-2.5 rounded-lg border border-sand-200 bg-[#FFFDF9] px-2.5 py-1.5 text-left shadow-gov transition-colors hover:bg-sand-100/60 cursor-pointer"
        title={hasRealSession ? 'Open your account menu' : 'Open account menu'}
      >
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-terra-700 text-[10px] font-bold text-white shadow-xs">
          {initials}
        </div>
        <div className="hidden md:block text-left">
          <div className="flex items-center gap-1.5 text-xs font-semibold leading-tight text-mocha-900">
            <span className="max-w-[150px] truncate">{activePersona.name}</span>
            <span
              className={`inline-block h-1.5 w-1.5 rounded-full ${
                hasRealSession ? 'bg-emerald-500' : 'bg-sand-400'
              }`}
            />
          </div>
          <div className="text-[10px] text-mocha-500">{activePersona.label}</div>
        </div>
        <ChevronDown className="ml-1 h-4 w-4 text-mocha-400" />
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setIsOpen(false)} />
          <div
            role="menu"
            className="absolute right-0 z-30 mt-2 w-80 divide-y divide-sand-100 rounded-xl border border-sand-200 bg-[#FFFDF9] py-2 shadow-xl"
          >
            {/* Active account context */}
            <div className="px-4 py-3">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-terra-700 text-sm font-bold text-white shadow-xs">
                  {initials}
                </div>
                <div className="min-w-0">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-mocha-400">
                    Signed-in account
                  </span>
                  <p className="mt-0.5 truncate text-sm font-semibold text-mocha-900">
                    {activePersona.name}
                  </p>
                  <p className="text-[11px] text-mocha-500">{activePersona.label}</p>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 border-t border-slate-100 pt-3 text-[11px]">
                <span className="flex items-center gap-1 text-slate-400">
                  <Building2 className="h-3 w-3" /> Organization
                </span>
                <span className="truncate text-right font-medium text-slate-700">
                  {activePersona.department || '—'}
                </span>
                <span className="flex items-center gap-1 text-slate-400">
                  <MapPin className="h-3 w-3" /> Jurisdiction
                </span>
                <span className="truncate text-right font-medium text-slate-700">
                  {hasRealSession ? session?.jurisdiction || 'National scope' : '—'}
                </span>
                <span className="flex items-center gap-1 text-slate-400">
                  <Shield className="h-3 w-3" /> Session
                </span>
                <span
                  className={`truncate text-right font-medium ${
                    hasRealSession ? 'text-emerald-700' : 'text-amber-700'
                  }`}
                >
                  {hasRealSession ? 'Signed-in session' : 'No active session'}
                </span>
              </div>

              {hasRealSession ? (
                <div className="mt-2 flex items-start gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 p-2 text-[10px] leading-snug text-emerald-800">
                  <Info className="mt-px h-3 w-3 shrink-0" />
                  <span>
                    Authenticated as {session?.email || 'this account'}. Role authorisation is
                    enforced server-side on every request and cannot be changed from this menu.
                  </span>
                </div>
              ) : (
                <div className="mt-2 flex items-start gap-1.5 rounded-md border border-amber-200 bg-amber-50 p-2 text-[10px] leading-snug text-amber-800">
                  <Info className="mt-px h-3 w-3 shrink-0" />
                  <span>
                    {isRealAuthConfigured
                      ? 'No account is signed in. Sign in to use the application.'
                      : 'Authentication is not configured for this deployment.'}
                  </span>
                </div>
              )}
            </div>

            {/* Real sign-out — only when a real session exists to end. */}
            {hasRealSession && (
              <div className="px-4 py-2">
                <button
                  role="menuitem"
                  onClick={handleSignOut}
                  disabled={isSigningOut || sessionStatus === 'restoring'}
                  className="flex w-full items-center gap-2.5 rounded-md border border-slate-200 px-3 py-2.5 text-left text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSigningOut ? (
                    <Loader2 className="h-4 w-4 animate-spin text-slate-500" />
                  ) : (
                    <LogOut className="h-4 w-4 text-slate-500" />
                  )}
                  {isSigningOut ? 'Signing out…' : 'Sign out'}
                </button>
              </div>
            )}

            {/* Signed out — route to sign-in. No identity and no role picker is
                rendered here: there is no account to display, and choosing a
                role in a browser is not how authorisation works. */}
            {!hasRealSession && (
              <div className="px-4 py-2">
                <button
                  role="menuitem"
                  onClick={() => {
                    setIsOpen(false);
                    navigate(getRouteById('auth.login').path, { replace: true });
                  }}
                  className="flex w-full items-center gap-2.5 rounded-md border border-slate-200 px-3 py-2.5 text-left text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
                >
                  <UserCircle className="h-4 w-4 text-slate-500" />
                  Sign in
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};
