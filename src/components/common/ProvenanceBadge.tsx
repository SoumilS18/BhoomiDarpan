import React from 'react';
import { ProvenanceType, VerificationStatus } from '../../../shared/types';
import { ShieldCheck, Bot, User, Globe, Calculator, AlertCircle } from 'lucide-react';
import { clsx } from 'clsx';

interface ProvenanceBadgeProps {
  type: ProvenanceType;
  verificationStatus?: VerificationStatus;
  sourceName?: string;
  timestamp?: string;
  compact?: boolean;
}

export const ProvenanceBadge: React.FC<ProvenanceBadgeProps> = ({
  type,
  verificationStatus,
  sourceName,
  timestamp,
  compact = false,
}) => {
  const getBadgeConfig = () => {
    switch (type) {
      case 'USER_ENTERED':
        return {
          label: 'User Entered',
          icon: User,
          color: 'bg-blue-50 text-blue-700 border-blue-200',
        };
      case 'DATABASE_DERIVED':
        return {
          label: 'Database Derived',
          icon: ShieldCheck,
          color: 'bg-slate-100 text-slate-700 border-slate-200',
        };
      case 'EXTERNALLY_SOURCED':
        return {
          label: sourceName || 'External Source',
          icon: Globe,
          color: 'bg-purple-50 text-purple-700 border-purple-200',
        };
      case 'AI_EXTRACTED':
        return {
          label: 'AI Extracted',
          icon: Bot,
          color: 'bg-amber-50 text-amber-800 border-amber-300',
        };
      case 'AI_GENERATED_ASSISTED':
        return {
          label: 'AI Assisted',
          icon: Bot,
          color: 'bg-indigo-50 text-indigo-700 border-indigo-200',
        };
      case 'SYSTEM_CALCULATED':
        return {
          label: 'Statutory Math',
          icon: Calculator,
          color: 'bg-emerald-50 text-emerald-700 border-emerald-200',
        };
      default:
        return {
          label: 'Unknown',
          icon: AlertCircle,
          color: 'bg-slate-100 text-slate-600 border-slate-200',
        };
    }
  };

  const config = getBadgeConfig();
  const Icon = config.icon;

  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 border rounded font-medium transition-colors',
        config.color,
        compact ? 'px-1.5 py-0.5 text-[10px]' : 'px-2.5 py-1 text-xs'
      )}
      title={`${config.label} ${timestamp ? `at ${new Date(timestamp).toLocaleString()}` : ''}`}
    >
      <Icon className={clsx(compact ? 'h-3 w-3' : 'h-3.5 w-3.5')} />
      <span>{config.label}</span>
      {verificationStatus === 'human_verified' && (
        <span className="text-[10px] text-emerald-700 font-bold ml-0.5" title="Human Officer Verified">
          ✓ Verified
        </span>
      )}
      {verificationStatus === 'rejected' && (
        <span className="text-[10px] text-rose-700 font-bold ml-0.5" title="Rejected by Officer">
          ✗ Rejected
        </span>
      )}
    </span>
  );
};
