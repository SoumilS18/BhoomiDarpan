import React, { useState, useEffect } from 'react';
import { RoleSwitcher } from './RoleSwitcher';
import { NotificationBell } from './NotificationBell';
import { Button } from '../common/Button';
import { NationalEmblem } from '../common/NationalEmblem';
import { Plus, Search, CheckCircle2, AlertCircle, Menu } from 'lucide-react';
import { fetchHealth, HealthResponse } from '../../lib/api';
import { useRoute } from '../../router';

interface HeaderProps {
  onOpenCreateCase: () => void;
  /**
   * Invoked with the trimmed search term. The shell navigates to the case
   * registry's `?q=` filter, so the query becomes real, shareable URL state
   * instead of a local component value.
   */
  onSearch?: (term: string) => void;
  /** Toggles the overlay navigation drawer below the `lg` breakpoint. */
  onToggleNavigation?: () => void;
  /** Current open state of that drawer, mirrored into `aria-expanded`. */
  isNavigationOpen?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  onOpenCreateCase,
  onSearch,
  onToggleNavigation,
  isNavigationOpen = false,
}) => {
  const { route, query } = useRoute();
  const [health, setHealth] = useState<HealthResponse | null>(null);

  /**
   * True when the case registry itself is the active surface. In that case the
   * search box mirrors `?q=` and updates it live. On every other surface the
   * term is applied on submit, so typing cannot yank an officer off the page
   * they are working on.
   */
  const isCasesRegistry = route?.id === 'module.cases';
  const [searchTerm, setSearchTerm] = useState(query.q ?? '');

  useEffect(() => {
    fetchHealth()
      .then(setHealth)
      .catch((err) => console.warn('Health check failed:', err));
  }, []);

  // Keep the box in sync when the URL changes underneath us (deep link / Back).
  useEffect(() => {
    if (isCasesRegistry) {
      setSearchTerm(query.q ?? '');
    }
  }, [isCasesRegistry, query.q]);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    onSearch?.(searchTerm.trim());
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const term = e.target.value;
    setSearchTerm(term);
    if (isCasesRegistry) {
      onSearch?.(term.trim());
    }
  };

  return (
    <header className="sticky top-0 z-40 bg-[#FFFDF9] border-b border-sand-200 shadow-gov-header">
      {/* Institutional dual-tone Terra & Gold accent */}
      <div className="h-1 bg-gradient-to-r from-terra-900 via-terra-700 to-gold-500" />

      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-4">
          {/* Logo, National Emblem & Title */}
          <div className="flex items-center gap-3.5">
            {/* Mobile navigation toggle (the sidebar is an overlay below `lg`) */}
            <button
              type="button"
              onClick={onToggleNavigation}
              aria-label={isNavigationOpen ? 'Close navigation menu' : 'Open navigation menu'}
              aria-expanded={isNavigationOpen}
              aria-controls="primary-application-navigation"
              className="lg:hidden inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-sand-200 bg-[#FFFDF9] text-mocha-700 hover:bg-sand-100/50 focus:outline-none focus:ring-2 focus:ring-terra-700 cursor-pointer"
            >
              <Menu className="h-5 w-5" />
            </button>

            {/* State Emblem of India - Seamlessly integrated without bounding box */}
            <div className="flex items-center shrink-0" title="Government of India - State Emblem">
              <NationalEmblem size={48} variant="gold" className="filter drop-shadow-xs hover:scale-105 transition-transform" />
            </div>

            <div>
              <div className="flex items-center gap-2">
                <span className="text-xl font-bold tracking-tight text-mocha-900 font-sans">
                  BhoomiSetu
                </span>
                <span className="text-[10px] font-semibold text-terra-800 bg-sand-100 px-2 py-0.5 rounded border border-sand-300/80 shadow-2xs">
                  भूमिसेतु
                </span>
              </div>
              <p className="text-[11px] text-mocha-500 hidden md:block font-medium">
                Intelligent Land Acquisition &amp; Decision-Support System
              </p>
            </div>
          </div>

          {/* Quick Search */}
          <div className="hidden lg:flex flex-1 max-w-md items-center">
            <form className="relative w-full" onSubmit={handleSubmit} role="search">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                <Search className="h-4 w-4 text-slate-400" />
              </div>
              <input
                type="text"
                value={searchTerm}
                onChange={handleSearchChange}
                placeholder="Search cases by number, village, survey #..."
                aria-label="Search acquisition cases"
                className="w-full rounded-lg border border-slate-200 bg-slate-50/70 pl-9 pr-3 py-1.5 text-xs text-gov-slate placeholder:text-slate-400 focus:bg-white focus:border-gov-navy focus:outline-none focus:ring-1 focus:ring-gov-navy transition-all"
              />
            </form>
          </div>

          {/* Right Controls */}
          <div className="flex items-center gap-3">
            {/* Supabase Connection Pill */}
            {health && (
              <div
                className={`hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${
                  health.database.connected
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                    : 'bg-amber-50 text-amber-800 border-amber-200'
                }`}
                title={health.database.message}
              >
                {health.database.connected ? (
                  <>
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                    <span>Supabase DB</span>
                  </>
                ) : (
                  <>
                    <AlertCircle className="h-3.5 w-3.5 text-amber-600" />
                    <span>Config Pending</span>
                  </>
                )}
              </div>
            )}

            {/* Notifications & Escalations */}
            <NotificationBell />

            {/* Role Switcher */}
            <RoleSwitcher />

            {/* Action: Create Case */}
            <Button
              onClick={onOpenCreateCase}
              size="sm"
              leftIcon={<Plus className="h-4 w-4" />}
            >
              <span className="hidden sm:inline">Initiate Case</span>
              <span className="sm:hidden">New</span>
            </Button>
          </div>
        </div>
      </div>
    </header>
  );
};
