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
} from 'lucide-react';
import { clsx } from 'clsx';
import { useAuth } from '../../context/AuthContext';
import { fetchNotificationCounts } from '../../lib/api';
import { Link, navRoutesForRole, type BadgeSource, type IconKey, type ModuleId } from '../../router';
import { NationalEmblem } from '../common/NationalEmblem';

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
  governance: ShieldCheck,
  admin: Settings,
};

interface SidebarProps {
  /** Module resolved from the matched route; drives the active highlight. */
  activeModule: ModuleId | null;
  caseCount?: number;
  /**
   * Below the `lg` breakpoint the sidebar is an overlay drawer instead of a
   * permanent rail. This flag drives its open/closed position.
   */
  mobileOpen?: boolean;
  /** Closes the mobile drawer (backdrop click, Escape, or navigation). */
  onCloseMobile?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeModule,
  caseCount,
  mobileOpen = false,
  onCloseMobile,
}) => {
  const { activePersona, session } = useAuth();
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
    <>
      {/* Mobile-only scrim behind the overlay drawer. */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-[45] bg-[#3D150D]/70 backdrop-blur-xs lg:hidden"
          onClick={onCloseMobile}
          aria-hidden="true"
        />
      )}
      <aside
        id="primary-application-navigation"
        aria-label="Primary Application Navigation"
        className={clsx(
          'flex shrink-0 flex-col justify-between bg-[#5C2318] text-sand-100 transition-all duration-200 select-none z-20 border-r border-[#4A1A10] shadow-gov-md',
          isCollapsed ? 'w-[68px] py-4 px-2' : 'w-64 py-5 px-3',
          // Below `lg` the sidebar leaves the document flow and becomes an
          // overlay drawer toggled from the header's navigation button.
          'max-lg:fixed max-lg:inset-y-0 max-lg:left-0 max-lg:z-[46] max-lg:overflow-y-auto',
          mobileOpen ? 'max-lg:translate-x-0' : 'max-lg:-translate-x-full'
        )}
      >
      {/* Top: brand + navigation */}
      <div className="space-y-5">
        {/* Branding - National Emblem integrated seamlessly */}
        <div
          className={clsx(
            'flex items-center gap-2.5',
            isCollapsed && 'flex-col'
          )}
        >
          <div className="flex shrink-0 items-center justify-center" title="Government of India - State Emblem">
            <NationalEmblem size={isCollapsed ? 38 : 44} variant="gold" className="filter drop-shadow-xs" />
          </div>
          {!isCollapsed && (
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="truncate text-sm font-bold tracking-tight text-sand-50">
                  BhoomiSetu
                </span>
                <span className="rounded border border-gold-400/30 bg-gold-500/15 px-1.5 py-px text-[9px] font-semibold text-gold-200">
                  भूमिसेतु
                </span>
              </div>
              <p className="truncate text-[10px] text-sand-300/80">
                Land Acquisition Decision Support
              </p>
            </div>
          )}
        </div>

        {/* Nav section label + collapse toggle */}
        <div className="flex items-center justify-between px-1">
          {!isCollapsed && (
            <span className="text-[10px] font-bold uppercase tracking-widest text-sand-300/60">
              Operations
            </span>
          )}
          <button
            type="button"
            onClick={() => setIsCollapsed(!isCollapsed)}
            aria-label={isCollapsed ? 'Expand navigation sidebar' : 'Collapse navigation sidebar'}
            className="rounded-md p-1 text-sand-300/70 transition-colors hover:bg-white/10 hover:text-sand-50 cursor-pointer"
            title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {isCollapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronLeft className="h-4 w-4" />
            )}
          </button>
        </div>

        {/* Navigation destination list */}
        <nav className="space-y-1">
          {destinations.map((dest) => {
            const Icon = NAV_ICONS[dest.iconKey];
            const isActive = activeModule === dest.module;
            const badge = resolveBadge(dest.badgeSource);

            return (
              <Link
                key={dest.id}
                to={dest.path}
                onClick={onCloseMobile}
                aria-current={isActive ? 'page' : undefined}
                title={isCollapsed ? `${dest.title} (${dest.description ?? ''})` : undefined}
                className={clsx(
                  'group relative flex w-full items-center rounded-lg text-xs font-medium transition-colors text-left cursor-pointer',
                  isCollapsed ? 'justify-center p-3' : 'gap-3 px-3 py-2.5',
                  isActive
                    ? 'bg-terra-800/80 font-semibold text-sand-50 shadow-2xs border border-terra-600/40'
                    : 'text-sand-200/80 hover:bg-terra-800/40 hover:text-sand-50'
                )}
              >
                {/* Active indicator */}
                <span
                  className={clsx(
                    'absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r bg-gold-400 shadow-xs transition-opacity',
                    isActive ? 'opacity-100' : 'opacity-0'
                  )}
                  aria-hidden="true"
                />
                <Icon
                  className={clsx(
                    'h-4 w-4 shrink-0 transition-colors',
                    isActive ? 'text-gold-400' : 'text-sand-300/70 group-hover:text-sand-100'
                  )}
                />
                {!isCollapsed && (
                  <div className="min-w-0 flex-1">
                    <div className="truncate leading-tight">{dest.title}</div>
                    {dest.hindiLabel && (
                      <div
                        className={clsx(
                          'mt-0.5 text-[10px] leading-none font-normal',
                          isActive ? 'text-sand-200' : 'text-sand-400/60'
                        )}
                      >
                        {dest.hindiLabel}
                      </div>
                    )}
                  </div>
                )}

                {/* Badge indicator */}
                {badge !== null && badge !== undefined && (
                  <span
                    className={clsx(
                      'shrink-0 rounded-full px-1.5 text-[10px] font-bold tabular-nums',
                      isCollapsed
                        ? 'absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center bg-sienna-500 p-0 text-white'
                        : isActive
                        ? 'bg-gold-400 text-terra-950 font-bold'
                        : 'bg-terra-800 text-sand-200 border border-terra-700/50'
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

      {/* Bottom: identity + statutory note */}
      <div className={clsx('space-y-3 border-t border-terra-700/60 pt-4', isCollapsed && 'px-0.5')}>
        {/* Active officer identity */}
        <div
          className={clsx(
            'rounded-lg border border-terra-700/70 bg-terra-800/40 p-2.5 text-xs shadow-2xs',
            isCollapsed && 'p-2 text-center'
          )}
        >
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gold-400/20 text-[11px] font-bold text-gold-300 ring-1 ring-gold-400/40">
              {activePersona.name
                .split(' ')
                .map((n) => n[0])
                .filter(Boolean)
                .slice(0, 2)
                .join('')
                .toUpperCase()}
            </div>
            {!isCollapsed && (
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold text-sand-50">
                  {activePersona.name}
                </p>
                <p className="truncate text-[10px] text-sand-300/80">
                  {activePersona.label}
                </p>
              </div>
            )}
          </div>
          {!isCollapsed && (
            <div className="mt-2 border-t border-terra-700/50 pt-2">
              <p className="truncate text-[10px] text-sand-300/70">
                {activePersona.department}
              </p>
              <span className="mt-1.5 inline-flex items-center gap-1 rounded bg-terra-900/60 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-sand-200 border border-terra-700/40">
                <span
                  className={`h-1 w-1 rounded-full ${session ? 'bg-emerald-400' : 'bg-sand-400'}`}
                />
                {session ? 'Signed-in session' : 'No active session'}
              </span>
            </div>
          )}
        </div>

        {/* Statutory note */}
        {!isCollapsed && (
          <div className="rounded-lg border border-terra-700/60 bg-terra-900/30 p-2.5 text-[11px] text-sand-300/80">
            <div className="mb-0.5 flex items-center gap-1.5 font-semibold text-sand-100">
              <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-gold-400" />
              <span className="text-xs">RFCTLARR 2013</span>
            </div>
            <p className="text-[10px] leading-snug text-sand-300/70">
              Statutory engine with rigid audit trail and zero fabricated signals.
            </p>
          </div>
        )}
      </div>
      </aside>
    </>
  );
};
