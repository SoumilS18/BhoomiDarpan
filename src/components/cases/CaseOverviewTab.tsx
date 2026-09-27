import React from 'react';
import { AcquisitionCase } from '../../../shared/types';
import { ROLE_LABELS } from '../../lib/domainLabels';
import { Badge } from '../common/Badge';
import { Button } from '../common/Button';
import { CaseExternalContextCard } from './CaseExternalContextCard';
import {
  FileText,
  Clock,
  MapPin,
  AlertTriangle,
  CheckCircle2,
  Scale,
  Sparkles,
  GitBranch,
  Layers,
  ArrowRight,
  ShieldAlert,
  Building2,
  FileWarning,
  Flame,
  Zap,
} from 'lucide-react';

interface CaseOverviewTabProps {
  caseItem: AcquisitionCase;
  onNavigateTab: (tab: string) => void;
  onRefresh?: () => void;
}

export const CaseOverviewTab: React.FC<CaseOverviewTabProps> = ({
  caseItem,
  onNavigateTab,
  onRefresh,
}) => {
  const metrics = caseItem.calculated_metrics;
  const isDelayed = metrics?.is_delayed || caseItem.status === 'delayed';
  const delayDays = metrics?.net_delay_days || 0;

  // Unverified or missing docs
  const pendingDocs = (caseItem.documents || []).filter(
    (d) => d.status === 'validation_required'
  );
  // Disputed parcels
  const disputedParcels = (caseItem.parcels || []).filter(
    (p) => p.acquisition_status === 'disputed'
  );

  /**
   * Responsible role for the case.
   *
   * Read from the LIVE stage definition (`workflow_stages.required_role`) for
   * whichever stage is currently open. Nothing is hardcoded: if the workflow
   * has no open stage, or the stage defines no required role, the UI says so
   * instead of asserting a default owner.
   */
  const openStage = (caseItem.stage_instances || []).find(
    (i) => i.status === 'in_progress' || i.status === 'pending_approval' || i.status === 'blocked'
  );
  const openStageRequiredRole = openStage?.stage?.required_role;
  const responsibleRoleText = openStageRequiredRole
    ? ROLE_LABELS[openStageRequiredRole]
    : openStage
      ? 'Not defined for this stage'
      : 'No open stage';

  const formatCurrency = (amount: number) => {
    if (amount >= 10000000) return `₹${(amount / 10000000).toFixed(2)} Cr`;
    if (amount >= 100000) return `₹${(amount / 100000).toFixed(2)} L`;
    return `₹${amount.toLocaleString('en-IN')}`;
  };

  return (
    <div className="space-y-6">
      {/* ========================================================================= */}
      {/* 1. ACTION REQUIRED COCKPIT (IF ANY ACTION PENDING) */}
      {/* ========================================================================= */}
      {(isDelayed || pendingDocs.length > 0 || disputedParcels.length > 0) && (
        <div className="bg-amber-50/60 border border-amber-200/80 rounded-xl p-4 shadow-xs">
          <div className="flex items-center gap-2 mb-2 text-amber-900 font-bold text-xs">
            <Flame className="h-4 w-4 text-amber-700" />
            <span>Immediate Operational Attention Required</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
            {/* SLA Delay Alert */}
            {isDelayed && (
              <div className="bg-white p-3 rounded-lg border border-red-200 flex justify-between items-center">
                <div>
                  <span className="font-semibold text-gov-red block">
                    +{delayDays} Days Statutory SLA Delay
                  </span>
                  <span className="text-[10px] text-slate-500">
                    Projected: {metrics?.projected_completion_date}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => onNavigateTab('workflow')}
                  className="px-2 py-1 text-[11px] font-semibold text-white bg-gov-red hover:bg-red-700 rounded transition-colors flex items-center gap-1 cursor-pointer"
                >
                  <span>Workflow</span>
                  <ArrowRight className="h-3 w-3" />
                </button>
              </div>
            )}

            {/* Missing/Pending Docs */}
            {pendingDocs.length > 0 && (
              <div className="bg-white p-3 rounded-lg border border-amber-200 flex justify-between items-center">
                <div>
                  <span className="font-semibold text-amber-800 block">
                    {pendingDocs.length} Pending Document Verification{pendingDocs.length > 1 ? 's' : ''}
                  </span>
                  <span className="text-[10px] text-slate-500">
                    Prerequisite for stage advance
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => onNavigateTab('documents')}
                  className="px-2 py-1 text-[11px] font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded transition-colors flex items-center gap-1 cursor-pointer"
                >
                  <span>Review</span>
                  <ArrowRight className="h-3 w-3" />
                </button>
              </div>
            )}

            {/* Disputed Parcels */}
            {disputedParcels.length > 0 && (
              <div className="bg-white p-3 rounded-lg border border-red-200 flex justify-between items-center">
                <div>
                  <span className="font-semibold text-gov-red block">
                    {disputedParcels.length} Active Cadastral Dispute{disputedParcels.length > 1 ? 's' : ''}
                  </span>
                  <span className="text-[10px] text-slate-500">
                    Section 15 objections active
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => onNavigateTab('disputes')}
                  className="px-2 py-1 text-[11px] font-semibold text-white bg-gov-navy hover:bg-gov-blue rounded transition-colors flex items-center gap-1 cursor-pointer"
                >
                  <span>Disputes</span>
                  <ArrowRight className="h-3 w-3" />
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. THREE-PANEL OPERATIONAL GRID */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Panel 1: What is this case? (Identity & Authority) */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4 shadow-xs">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-2.5">
            <Building2 className="h-4 w-4 text-gov-navy" />
            <h3 className="font-bold text-gov-slate text-xs uppercase tracking-wider">
              Statutory Authority &amp; Identity
            </h3>
          </div>

          <div className="space-y-3 text-xs">
            <div>
              <span className="text-[10px] text-slate-400 uppercase font-semibold block">
                Sponsoring Project
              </span>
              <div className="font-semibold text-gov-slate mt-0.5">
                {caseItem.project?.name || 'Unassigned'}
              </div>
              <div className="text-[11px] text-slate-500">
                Agency: <strong>{caseItem.project?.sponsoring_agency || '—'}</strong>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-100">
              <span className="text-[10px] text-slate-400 uppercase font-semibold block">
                Administrative Location
              </span>
              <div className="font-semibold text-gov-slate mt-0.5">
                Village {caseItem.village}
              </div>
              <div className="text-[11px] text-slate-500">
                District: <strong>{caseItem.district}</strong>, State: <strong>{caseItem.state}</strong>
              </div>
              {caseItem.village_lgd_code && (
                <div className="text-[10px] font-mono text-slate-400 mt-0.5">
                  LGD Code: {caseItem.village_lgd_code}
                </div>
              )}
            </div>

            <div className="pt-2 border-t border-slate-100">
              <span className="text-[10px] text-slate-400 uppercase font-semibold block">
                Cadastral Scope &amp; Budget
              </span>
              <div className="grid grid-cols-2 gap-2 mt-1">
                <div className="bg-slate-50 p-2 rounded border border-slate-100">
                  <span className="text-[10px] text-slate-400 block">Total Area</span>
                  <strong className="text-gov-slate font-bold">{caseItem.total_area_hectares} Ha</strong>
                </div>
                <div className="bg-slate-50 p-2 rounded border border-slate-100">
                  <span className="text-[10px] text-slate-400 block">Est. Compensation</span>
                  <strong className="text-gov-slate font-bold">{formatCurrency(caseItem.estimated_compensation)}</strong>
                </div>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px]">
              <span className="text-slate-500">Responsible Role:</span>
              <span className="font-semibold text-gov-navy">{responsibleRoleText}</span>
            </div>
          </div>
        </div>

        {/* Panel 2: What is happening? (Current Workflow & Milestones) */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4 shadow-xs">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-2.5">
            <Clock className="h-4 w-4 text-gov-navy" />
            <h3 className="font-bold text-gov-slate text-xs uppercase tracking-wider">
              Current Workflow &amp; Trajectory
            </h3>
          </div>

          <div className="space-y-3 text-xs">
            <div>
              <span className="text-[10px] text-slate-400 uppercase font-semibold block">
                Current Statutory Stage
              </span>
              <div className="text-sm font-bold text-gov-slate mt-0.5 flex items-center justify-between">
                <span>{metrics?.current_stage_title || '—'}</span>
                <Badge variant={isDelayed ? 'red' : 'navy'}>
                  {caseItem.status.toUpperCase()}
                </Badge>
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                Stage {metrics?.completed_stages ?? 0} of {metrics?.total_stages ?? 0} ({metrics?.progress_percentage ?? 0}%)
              </div>
            </div>

            {/* Progress bar */}
            <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
              <div
                style={{ width: `${metrics?.progress_percentage ?? 0}%` }}
                className={`h-full rounded-full transition-all ${
                  isDelayed ? 'bg-red-500' : 'bg-gov-navy'
                }`}
              />
            </div>

            <div className="pt-2 border-t border-slate-100 space-y-1.5">
              <span className="text-[10px] text-slate-400 uppercase font-semibold block">
                Milestone Dates
              </span>
              <div className="flex justify-between text-[11px] text-slate-600">
                <span>Proceedings Initiated:</span>
                <strong className="text-gov-slate">{caseItem.start_date || 'N/A'}</strong>
              </div>
              <div className="flex justify-between text-[11px] text-slate-600">
                <span>Statutory SLA Deadline:</span>
                <strong className="text-gov-slate">{caseItem.expected_completion_date || 'N/A'}</strong>
              </div>
              <div className="flex justify-between text-[11px]">
                <span className="text-slate-600">Projected Completion:</span>
                <strong className={isDelayed ? 'text-red-600' : 'text-emerald-700'}>
                  {metrics?.projected_completion_date || caseItem.expected_completion_date}
                </strong>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => onNavigateTab('workflow')}
                className="w-full py-2 bg-slate-50 hover:bg-slate-100 text-gov-slate font-semibold rounded-lg border border-slate-200 transition-colors flex items-center justify-center gap-1.5 cursor-pointer text-xs"
              >
                <GitBranch className="h-3.5 w-3.5 text-gov-navy" />
                <span>Open Full Workflow Gantt</span>
              </button>
            </div>
          </div>
        </div>

        {/* Panel 3: Spatial & Cadastral Status */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4 shadow-xs">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-2.5">
            <Layers className="h-4 w-4 text-gov-navy" />
            <h3 className="font-bold text-gov-slate text-xs uppercase tracking-wider">
              Spatial Cadastre &amp; GIS Status
            </h3>
          </div>

          <div className="space-y-3 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-slate-600">Boundary Demarcation:</span>
              {caseItem.geojson_boundary ? (
                <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded text-[11px]">
                  <CheckCircle2 className="h-3 w-3" /> Demarcated
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-amber-700 font-semibold bg-amber-50 border border-amber-200 px-2 py-0.5 rounded text-[11px]">
                  <AlertTriangle className="h-3 w-3" /> Boundary Pending
                </span>
              )}
            </div>

            <div className="flex items-center justify-between">
              <span className="text-slate-600">Cadastral Parcels:</span>
              <strong className="text-gov-slate">
                {(caseItem.parcels || []).length} Parcels Mapped
              </strong>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-slate-600">Statutory Documents:</span>
              <strong className="text-gov-slate">
                {(caseItem.documents || []).length} Uploaded
              </strong>
            </div>

            <div className="pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => onNavigateTab('gis')}
                className="w-full py-2 bg-slate-50 hover:bg-slate-100 text-gov-slate font-semibold rounded-lg border border-slate-200 transition-colors flex items-center justify-center gap-1.5 cursor-pointer text-xs"
              >
                <MapPin className="h-3.5 w-3.5 text-emerald-600" />
                <span>Open GIS Cadastral Map</span>
              </button>
            </div>

            <div className="pt-1">
              <button
                type="button"
                onClick={() => onNavigateTab('intelligence')}
                className="w-full py-2 bg-gov-navy hover:bg-gov-blue text-white font-semibold rounded-lg shadow-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer text-xs"
              >
                <Sparkles className="h-3.5 w-3.5 text-amber-300" />
                <span>Inspect Intelligence &amp; Root Cause</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 3. LIVE EXTERNAL CONTEXT & MULTI-SOURCE SENSORY */}
      {/* ========================================================================= */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-bold text-gov-slate text-xs uppercase tracking-wider">
            Live Multi-Source Context &amp; Satellite Observations
          </h3>
          <span className="text-[10px] text-slate-400">
            Real external feeds strictly bound to case GIS coordinates
          </span>
        </div>
        <CaseExternalContextCard caseId={caseItem.id} />
      </div>
    </div>
  );
};
