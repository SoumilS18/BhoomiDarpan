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
  Home,
  Users,
  FileBarChart,
  AlertTriangle,
  Plug,
  ClipboardList,
  UserCog,
} from 'lucide-react';
import { clsx } from 'clsx';
import { useAuth } from '../../context/AuthContext';
import { fetchNotificationCounts } from '../../lib/api';
import { Link, navSectionsForRole, type BadgeSource, type IconKey, type ModuleId, type NavSectionDef } from '../../router';
import type { RouteDef } from '../../router/routes';
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
  home: Home,
  users: Users,
  analytics: BarChart3,
  reports: FileBarChart,
  vault: FileText,
  notifications: AlertTriangle,
  connectors: Plug,
  governance: ShieldCheck,
  audit_trail: ClipboardList,
  user_directory: UserCog,
  system_config: Settings,
  intelligence: Sparkles,
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
   * Registry-driven grouped destinations for the active persona.
   *
   * IMPORTANT: role filtering here governs NAVIGATION VISIBILITY only. It is
   * not an authorisation control - the Express API enforces authorisation via
   * `requireAuth` / `requireRole`.
   */
  const sections = navSectionsForRole(activePersona.role);

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
          'flex shrink-0 flex-col justify-between bg-[#5C2318] text-sand-100 transition-all duration-200 select-none z-20 border-r border-[#4A1A10] shadow-gov-md overflow-y-auto',
          isCollapsed ? 'w-[68px] py-4 px-2' : 'w-64 py-5 px-3',
          // Below `lg` the sidebar leaves the document flow and becomes an
          // overlay drawer toggled from the header's navigation button.
          'max-lg:fixed max-lg:inset-y-0 max-lg:left-0 max-lg:z-[46] max-lg:overflow-y-auto',
          mobileOpen ? 'max-lg:translate-x-0' : 'max-lg:-translate-x-full'
        )}
      >
        {/* Top: brand + navigation */}
        <div className="space-y-4">
          {/* Branding - National Emblem integrated seamlessly */}
          <div
            className={clsx(
              'flex items-center gap-2.5',
              isCollapsed && 'flex-col'
            )}
          >
            <div className="flex shrink-0 items-center justify-center" title="Government of India - State Emblem">
              <NationalEmblem size={isCollapsed ? 38 : 46} className="filter drop-shadow-xs" />
            </div>
            {!isCollapsed && (
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-sm font-bold tracking-tight text-sand-50">
                    BhoomiDarpan
                  </span>
                  <span className="rounded border border-gold-400/30 bg-gold-500/15 px-1.5 py-px text-[9px] font-semibold text-gold-200">
                    भूमिदर्पण
                  </span>
                </div>
                <p className="truncate text-[10px] text-sand-300/80">
                  Land Acquisition Decision Support
                </p>
              </div>
            )}
          </div>

          {/* Collapse toggle */}
          <div className="flex items-center justify-end px-1">
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

          {/* Grouped Navigation Sections */}
          <nav className="space-y-3" aria-label="Sidebar sections">
            {sections.map((section: NavSectionDef, sIdx: number) => (
              <div key={section.id} className="space-y-1">
                {!isCollapsed ? (
                  <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-sand-300/60 font-sans">
                    {section.title}
                  </div>
                ) : sIdx > 0 ? (
                  <div className="my-2 mx-auto w-6 border-t border-terra-700/60" />
                ) : null}

                <div className="space-y-0.5">
                  {section.items.map((dest: RouteDef) => {
                    const Icon = (dest.iconKey && NAV_ICONS[dest.iconKey as IconKey]) || NAV_ICONS.dashboard;
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
                          'group relative flex w-full items-center rounded-lg text-xs font-medium transition-all text-left cursor-pointer',
                          isCollapsed ? 'justify-center p-3' : 'gap-3 px-3 py-2',
                          isActive
                            ? 'bg-terra-900/80 font-semibold text-white shadow-xs border-l-[3px] border-rose-400 pl-[9px]'
                            : 'text-sand-200/80 hover:bg-white/8 hover:text-sand-50'
                        )}
                      >
                        <Icon
                          className={clsx(
                            'h-4 w-4 shrink-0 transition-colors',
                            isActive ? 'text-gold-300' : 'text-sand-300/70 group-hover:text-sand-100'
                          )}
                        />
                        {!isCollapsed && (
                          <div className="min-w-0 flex-1">
                            <div className="truncate leading-tight text-xs">{dest.title}</div>
                            {dest.hindiLabel && (
                              <div
                                className={clsx(
                                  'mt-0.5 text-[9px] leading-none font-normal',
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
                                ? 'absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center bg-rose-500 p-0 text-white'
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
                </div>
              </div>
            ))}
          </nav>
        </div>

        {/* Bottom: identity + statutory note */}
        <div className={clsx('space-y-3 border-t border-terra-700/60 pt-4 mt-4', isCollapsed && 'px-0.5')}>
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
                  .join('')}
              </div>
              {!isCollapsed && (
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold text-sand-50 text-[11px]">
                    {activePersona.name}
                  </div>
                  <div className="truncate text-[10px] font-medium text-gold-300/90 capitalize">
                    {activePersona.role.replace(/_/g, ' ')}
                  </div>
                </div>
              )}
            </div>
            {!isCollapsed && (
              <div className="mt-2 border-t border-terra-700/60 pt-1.5 text-[10px] text-sand-300/80">
                <span className="truncate block font-medium">{activePersona.department}</span>
              </div>
            )}
          </div>

          {/* Statutory footer notice */}
          {!isCollapsed && (
            <div className="px-1 text-[9px] text-sand-400/70 leading-tight">
              <span className="font-semibold text-sand-300/90">RFCTLARR Act 2013</span>
              <span className="block mt-0.5 text-[8px] text-sand-400/50">
                Govt. Land Intelligence Platform
              </span>
            </div>
          )}
        </div>
      </aside>
    </>
  );
};
