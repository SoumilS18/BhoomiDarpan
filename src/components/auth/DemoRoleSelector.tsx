import React from 'react';
import {
  ShieldCheck,
  Landmark,
  FolderKanban,
  MapPin,
  Scale,
  CheckCircle2,
  Eye,
  Sparkles,
  Check,
  ArrowRight,
  UserCheck,
} from 'lucide-react';
import { DEMO_ROLE_ACCOUNTS, type DemoRoleAccount } from '../../lib/demoAccounts';
import type { UserRole } from '../../../shared/types';
import { clsx } from 'clsx';

interface DemoRoleSelectorProps {
  selectedRole: UserRole | null;
  onSelectRole: (account: DemoRoleAccount, autoSignIn?: boolean) => void;
  disabled?: boolean;
}

const ROLE_ICONS: Record<string, React.FC<{ className?: string }>> = {
  admin: ShieldCheck,
  lao: Landmark,
  project: FolderKanban,
  revenue: MapPin,
  legal: Scale,
  approver: CheckCircle2,
  viewer: Eye,
};

export const DemoRoleSelector: React.FC<DemoRoleSelectorProps> = ({
  selectedRole,
  onSelectRole,
  disabled = false,
}) => {
  return (
    <section
      aria-label="Demo and Evaluation Role Selection"
      className="mb-6 rounded-xl border border-sand-300/80 bg-gradient-to-b from-[#FFFDF9] to-sand-50/60 p-4 sm:p-5 shadow-xs"
    >
      {/* Header bar with badges */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-sand-200/80 pb-3">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-terra-700 text-white shadow-2xs">
            <Sparkles className="h-4 w-4" aria-hidden="true" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold tracking-tight text-mocha-900">
                Evaluation & Judge Quick Access
              </h2>
              <span className="hidden sm:inline-flex items-center rounded-full bg-gold-100 px-2 py-0.5 text-[10px] font-semibold text-gold-900 border border-gold-300/80">
                Demo Accounts
              </span>
            </div>
            <p className="text-xs text-mocha-600">
              Click any demo role to automatically fill its verified credentials:
            </p>
          </div>
        </div>

        {selectedRole && (
          <div className="flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-800 border border-emerald-200 shadow-2xs">
            <UserCheck className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Role credentials applied</span>
          </div>
        )}
      </div>

      {/* Grid of demo role cards */}
      <div className="mt-3.5 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
        {DEMO_ROLE_ACCOUNTS.map((account) => {
          const isSelected = selectedRole === account.role;
          const Icon = ROLE_ICONS[account.iconName] || ShieldCheck;

          return (
            <div
              key={account.role}
              role="button"
              tabIndex={disabled ? -1 : 0}
              aria-pressed={isSelected}
              onClick={() => !disabled && onSelectRole(account, false)}
              onKeyDown={(e) => {
                if (!disabled && (e.key === 'Enter' || e.key === ' ')) {
                  e.preventDefault();
                  onSelectRole(account, false);
                }
              }}
              className={clsx(
                'group relative flex flex-col justify-between rounded-lg border p-3 text-left transition-all duration-150 cursor-pointer select-none',
                isSelected
                  ? 'border-terra-600 bg-terra-50/70 shadow-sm ring-1 ring-terra-600/50'
                  : 'border-sand-200/90 bg-white hover:border-sand-300 hover:bg-sand-50/50 hover:shadow-2xs',
                disabled && 'opacity-60 cursor-not-allowed pointer-events-none'
              )}
            >
              {/* Card top */}
              <div>
                <div className="flex items-start justify-between gap-1.5 mb-1.5">
                  <div className="flex items-center gap-2">
                    <div
                      className={clsx(
                        'flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors',
                        isSelected
                          ? 'bg-terra-700 text-white'
                          : 'bg-sand-100 text-terra-800 group-hover:bg-sand-200'
                      )}
                    >
                      <Icon className="h-4 w-4" aria-hidden="true" />
                    </div>
                    <div>
                      <p className="text-xs font-bold leading-snug text-mocha-900 group-hover:text-terra-900">
                        {account.roleLabel}
                      </p>
                      <span className="text-[10px] font-medium text-mocha-500">
                        {account.badgeLabel}
                      </span>
                    </div>
                  </div>

                  {isSelected && (
                    <span className="inline-flex shrink-0 items-center justify-center rounded-full bg-terra-700 text-white p-0.5">
                      <Check className="h-3 w-3" aria-hidden="true" />
                    </span>
                  )}
                </div>

                <p className="text-[11px] leading-relaxed text-mocha-700 line-clamp-2">
                  {account.description}
                </p>
              </div>

              {/* Card bottom actions */}
              <div className="mt-2.5 flex items-center justify-between border-t border-sand-200/60 pt-2 text-[11px]">
                <span className="font-mono text-[10px] text-mocha-500 truncate max-w-[130px]">
                  {account.email}
                </span>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    tabIndex={-1}
                    className={clsx(
                      'inline-flex items-center gap-1 rounded px-2 py-0.5 font-medium transition-colors',
                      isSelected
                        ? 'bg-terra-700 text-white shadow-2xs'
                        : 'bg-sand-100 text-mocha-800 hover:bg-sand-200'
                    )}
                  >
                    <span>{isSelected ? 'Filled' : 'Fill'}</span>
                  </button>

                  <button
                    type="button"
                    title={`Instant sign-in as ${account.roleLabel}`}
                    aria-label={`Instant sign-in as ${account.roleLabel}`}
                    disabled={disabled}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectRole(account, true);
                    }}
                    className="inline-flex items-center rounded bg-gold-100 px-1.5 py-0.5 text-[10px] font-semibold text-gold-900 border border-gold-300/80 hover:bg-gold-200 transition-colors"
                  >
                    <span>Login</span>
                    <ArrowRight className="ml-0.5 h-2.5 w-2.5" aria-hidden="true" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-3 flex items-center justify-between text-[11px] text-mocha-600 bg-sand-100/60 rounded-md px-3 py-1.5 border border-sand-200">
        <span className="flex items-center gap-1">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
          Live demonstration accounts are verified against active Supabase Auth.
        </span>
        <span className="hidden sm:inline text-mocha-500 font-medium">
          Click <strong>Fill</strong> to inspect credentials or <strong>Login</strong> for 1-click access.
        </span>
      </div>
    </section>
  );
};
