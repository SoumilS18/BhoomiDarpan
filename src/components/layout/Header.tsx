import React, { useState, useEffect } from 'react';
import { RoleSwitcher } from './RoleSwitcher';
import { NotificationBell } from './NotificationBell';
import { Button } from '../common/Button';
import { Plus, Search, Layers, CheckCircle2, AlertCircle } from 'lucide-react';
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
}

export const Header: React.FC<HeaderProps> = ({ onOpenCreateCase, onSearch }) => {
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
    <header className="sticky top-0 z-40 bg-white border-b border-slate-200/90 shadow-sm">
      {/* Institutional Top Accent Ribbon */}
      <div className="h-1 bg-gradient-to-r from-gov-saffron via-white to-gov-emerald" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-4">
          {/* Logo & Title */}
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gov-navy text-white shadow-sm ring-1 ring-gov-navy/20">
              <Layers className="h-5 w-5 text-amber-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-lg font-bold tracking-tight text-gov-slate">
                  BhoomiSetu
                </span>
                <span className="text-xs font-semibold text-gov-navy bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                  भूमिसेतु
                </span>
                <span className="hidden sm:inline-flex text-[11px] font-medium text-slate-500">
                  SIH 2026
                </span>
              </div>
              <p className="text-[11px] text-slate-500 hidden md:block">
                Intelligent Land Acquisition & Decision-Support System
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
