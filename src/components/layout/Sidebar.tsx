import React, { useEffect, useState } from 'react';
import {
  LayoutDashboard,
  FileText,
  Building2,
  MapPin,
  Sparkles,
  BarChart3,
  Bell,
  Settings,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  UserCheck,
  ShieldAlert,
} from 'lucide-react';
import { clsx } from 'clsx';
import { useAuth } from '../../context/AuthContext';
import { fetchNotificationCounts } from '../../lib/api';
import { Link, navRoutesForRole, type BadgeSource, type IconKey, type ModuleId } from '../../router';

/**
 * Maps the registry's serialisable `iconKey` values to lucide components.
 * Keeping icons out of the registry is what allows `routes.tsx` to stay free
 * of icon imports and remain cheap to import from tests.
 */
const NAV_ICONS: Record<IconKey, React.ComponentType<{ className?: string }>> = {
  dashboard: LayoutDashboard,
  cases: FileText,
  projects: Building2,
  gis: MapPin,
  intelligence: Sparkles,
  analytics: BarChart3,
  notifications: Bell,
  governance: ShieldAlert,
  admin: Settings,
};

interface SidebarProps {
  /** Module resolved from the matched route; drives the active highlight. */
  activeModule: ModuleId | null;
  caseCount?: number;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeModule, caseCount }) => {
  const { activePersona } = useAuth();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [unreadAlerts, setUnreadAlerts] = useState<number>(0);

  useEffect(() => {
    fetchNotificationCounts()
      .then((res) => {
        setUnreadAlerts(res.counts.unread_count || 0);
      })
      .catch(() => {
        // Degraded mode fallback
      });
  }, [activeModule]);

  /**
   * Registry-driven destinations for the active persona.
   *
   * IMPORTANT: role filtering here governs NAVIGATION VISIBILITY only. It is
   * not an authorisation control - the Express API enforces authorisation via
   * `requireAuth` / `requireRole`.
   */
  const destinations = navRoutesForRole(activePersona.role);

  const resolveBadge = (source?: BadgeSource): string | number | null => {
    if (source === 'caseCount') {
      return caseCount !== undefined && caseCount > 0 ? caseCount : null;
    }
    if (source === 'unreadNotifications') {
      return unreadAlerts > 0 ? unreadAlerts : null;
    }
    return null;
  };

  return (
    <aside
      aria-label="Primary Application Navigation"
      className={clsx(
        'bg-white border-r border-slate-200 flex flex-col justify-between shrink-0 transition-all duration-200 select-none z-20',
        isCollapsed ? 'w-18 py-4 px-2' : 'w-64 py-5 px-3'
      )}
    >
      {/* Top Navigation Items */}
      <div className="space-y-4">
        {/* Workspace Title & Collapse Toggle */}
        <div className="flex items-center justify-between px-2">
          {!isCollapsed ? (
            <div className="flex flex-col">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Operations Workspace
              </span>
              <span className="text-[11px] font-semibold text-gov-slate">
                RFCTLARR 2013 Compliance
              </span>
            </div>
          ) : (
            <div className="mx-auto text-[10px] font-bold text-gov-navy">
              BS
            </div>
          )}
          <button
            type="button"
            onClick={() => setIsCollapsed(!isCollapsed)}
            aria-label={isCollapsed ? 'Expand navigation sidebar' : 'Collapse navigation sidebar'}
            className="p-1 rounded-md text-slate-400 hover:text-gov-slate hover:bg-slate-100 transition-colors cursor-pointer"
            title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {isCollapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronLeft className="h-4 w-4" />
            )}
          </button>
        </div>

        {/* Navigation Destination List */}
        <nav className="space-y-1">
          {destinations.map((dest) => {
            const Icon = NAV_ICONS[dest.iconKey];
            const isActive = activeModule === dest.module;
            const badge = resolveBadge(dest.badgeSource);
            const badgeVariant = dest.badgeSource === 'unreadNotifications' ? 'red' : 'navy';

            return (
              <Link
                key={dest.id}
                to={dest.path}
                aria-current={isActive ? 'page' : undefined}
                title={isCollapsed ? `${dest.title} (${dest.description ?? ''})` : undefined}
                className={clsx(
                  'w-full flex items-center rounded-lg text-xs font-medium transition-all text-left cursor-pointer group relative',
                  isCollapsed ? 'justify-center p-3' : 'justify-between px-3 py-2.5',
                  isActive
                    ? 'bg-gov-navy text-white shadow-sm font-semibold'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-gov-slate'
                )}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Icon
                    className={clsx(
                      'h-4 w-4 shrink-0 transition-colors',
                      isActive ? 'text-amber-400' : 'text-slate-400 group-hover:text-gov-navy'
                    )}
                  />
                  {!isCollapsed && (
                    <div className="truncate">
                      <div className="truncate leading-tight">{dest.title}</div>
                      {dest.hindiLabel && (
                        <div
                          className={clsx(
                            'text-[10px] leading-none mt-0.5 font-normal',
                            isActive ? 'text-blue-200' : 'text-slate-400'
                          )}
                        >
                          {dest.hindiLabel}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Badge indicator */}
                {badge !== null && badge !== undefined && (
                  <span
                    className={clsx(
                      'text-[10px] px-2 py-0.5 rounded-full font-bold tabular-nums shrink-0',
                      isCollapsed
                        ? 'absolute top-1 right-1 h-2 w-2 p-0 rounded-full bg-red-500'
                        : badgeVariant === 'red'
                        ? isActive
                          ? 'bg-red-500 text-white'
                          : 'bg-red-100 text-red-700'
                        : isActive
                        ? 'bg-blue-800 text-amber-300'
                        : 'bg-slate-100 text-slate-700'
                    )}
                  >
                    {!isCollapsed ? badge : ''}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Bottom Identity & Statutory Compliance Card */}
      <div className="pt-4 border-t border-slate-100 space-y-3">
        {/* Active Officer Identity Pill */}
        <div
          className={clsx(
            'rounded-lg border border-slate-200 bg-slate-50/70 p-2.5 text-xs transition-all',
            isCollapsed && 'p-2 text-center'
          )}
        >
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-full bg-gov-navy/10 text-gov-navy flex items-center justify-center font-bold text-xs shrink-0">
              <UserCheck className="h-4 w-4 text-gov-navy" />
            </div>
            {!isCollapsed && (
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-gov-slate text-xs truncate">
                  {activePersona.name}
                </p>
                <p className="text-[10px] text-slate-500 truncate">
                  {activePersona.label}
                </p>
              </div>
            )}
          </div>
          {!isCollapsed && (
            <div className="mt-2 pt-2 border-t border-slate-200/60 flex items-center justify-between text-[10px] text-slate-400">
              <span className="truncate">{activePersona.department}</span>
            </div>
          )}
        </div>

        {/* SLA Compliance Note */}
        {!isCollapsed && (
          <div className="rounded-lg bg-emerald-50/50 p-2.5 border border-emerald-200/60 text-[11px] text-slate-600">
            <div className="font-semibold text-gov-slate flex items-center gap-1.5 mb-0.5">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
              <span className="text-xs">Statutory Engine</span>
            </div>
            <p className="text-[10px] text-slate-500 leading-snug">
              Rigid audit trail with zero fabricated signals.
            </p>
          </div>
        )}
      </div>
    </aside>
  );
};
