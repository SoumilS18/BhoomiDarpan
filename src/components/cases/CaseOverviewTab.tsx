import React, { useState } from 'react';
import { AcquisitionCase, Parcel } from '../../../shared/types';
import { ROLE_LABELS } from '../../lib/domainLabels';
import { Badge } from '../common/Badge';
import { Button } from '../common/Button';
import { CaseExternalContextCard } from './CaseExternalContextCard';
import { StatutoryAwardModal } from './StatutoryAwardModal';
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
  IndianRupee,
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
  const [selectedAwardParcel, setSelectedAwardParcel] = useState<Parcel | null>(null);
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
      {(() => {
        const spatialRelationships = (caseItem as any).spatial_relationships || [];
        const criticalSpatialRel = spatialRelationships.find(
          (r: any) => r.relationship_type === 'boundary_overlap' || r.relationship_type === 'complete_enclosure' || r.relationship_type === 'cadastral_collision'
        );

        if (!isDelayed && pendingDocs.length === 0 && disputedParcels.length === 0 && !criticalSpatialRel) {
          return null;
        }

        return (
          <div className="bg-amber-50/70 border border-amber-200/90 rounded-xl p-4 shadow-xs space-y-3">
            <div className="flex items-center gap-2 text-amber-900 font-bold text-xs">
              <Flame className="h-4 w-4 text-amber-700" />
              <span>Immediate Operational Attention Required</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
              {/* Spatial Boundary Overlap / Collision Alert */}
              {criticalSpatialRel && (
                <div className="bg-white p-3 rounded-lg border border-rose-200 flex justify-between items-center shadow-2xs md:col-span-3">
                  <div className="flex items-start gap-2.5">
                    <AlertTriangle className="h-4 w-4 text-rose-600 mt-0.5 shrink-0" />
                    <div>
                      <span className="font-semibold text-rose-900 block text-xs">
                        Spatial &amp; Cadastral Conflict Warning ({criticalSpatialRel.relationship_type === 'boundary_overlap' ? `${criticalSpatialRel.intersection_area_hectares} Ha / ${criticalSpatialRel.source_overlap_percentage}% Overlap` : 'Survey Collision'})
                      </span>
                      <span className="text-[11px] text-slate-600">
                        {criticalSpatialRel.evidence_summary}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onNavigateTab('gis')}
                    className="px-2.5 py-1 text-[11px] font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded transition-colors flex items-center gap-1 cursor-pointer shrink-0 ml-3"
                  >
                    <span>View Map</span>
                    <ArrowRight className="h-3 w-3" />
                  </button>
                </div>
              )}

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
        );
      })()}

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
              {caseItem.parcels && caseItem.parcels.length > 0 && (
                <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-[11px] text-slate-600 font-medium">
                    {caseItem.parcels.length} Cadastral Parcels
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      if (caseItem.parcels && caseItem.parcels.length > 0) {
                        setSelectedAwardParcel(caseItem.parcels[0]);
                      }
                    }}
                    className="text-[11px] font-semibold text-gov-navy hover:text-gov-blue flex items-center gap-1 cursor-pointer transition-colors bg-slate-50 hover:bg-slate-100 px-2 py-1 rounded border border-slate-200"
                  >
                    <IndianRupee className="h-3 w-3 text-emerald-600" />
                    <span>Statutory Form-11 Award</span>
                  </button>
                </div>
              )}
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
      {/* 2.5 SPATIAL & CADASTRAL RELATIONSHIP INTELLIGENCE & ADVISORY SECTION */}
      {/* ========================================================================= */}
      {caseItem.spatial_relationships && caseItem.spatial_relationships.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4 shadow-xs">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <Layers className="h-4 w-4 text-gov-navy" />
              <div>
                <h3 className="font-bold text-gov-slate text-xs uppercase tracking-wider">
                  Spatial &amp; Cadastral Relationship Intelligence
                </h3>
                <p className="text-[11px] text-slate-500">
                  Evidence-backed cross-case spatial intersection and cadastral collision detection
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-mono text-slate-400">
                {caseItem.spatial_relationships.length} Relationship{caseItem.spatial_relationships.length > 1 ? 's' : ''} Detected
              </span>
              <button
                type="button"
                onClick={() => onNavigateTab('gis')}
                className="px-2.5 py-1 text-xs font-semibold text-gov-navy bg-blue-50 hover:bg-blue-100 rounded border border-blue-200 transition-colors flex items-center gap-1 cursor-pointer"
              >
                <MapPin className="h-3.5 w-3.5 text-blue-600" />
                <span>View on GIS Map</span>
              </button>
            </div>
          </div>

          <div className="space-y-3">
            {caseItem.spatial_relationships.map((rel, idx) => (
              <div
                key={idx}
                className={`p-4 rounded-lg border text-xs space-y-3 ${
                  rel.relationship_type === 'boundary_overlap' || rel.relationship_type === 'complete_enclosure'
                    ? 'bg-rose-50/40 border-rose-200'
                    : rel.relationship_type === 'cadastral_collision'
                    ? 'bg-amber-50/40 border-amber-200'
                    : 'bg-slate-50 border-slate-200'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-gov-slate font-mono text-sm">
                      {rel.related_case_number}
                    </span>
                    <span className="text-slate-400">•</span>
                    <span className="text-slate-600 font-medium">
                      Project: {rel.related_project_name}
                    </span>
                  </div>
                  <div>
                    {rel.relationship_type === 'boundary_overlap' && (
                      <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-red-100 text-red-800 border border-red-200">
                        Boundary Overlap: {rel.overlap_pct}% ({rel.intersection_area_hectares} Ha)
                      </span>
                    )}
                    {rel.relationship_type === 'complete_enclosure' && (
                      <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-red-100 text-red-800 border border-red-200">
                        Complete Spatial Enclosure
                      </span>
                    )}
                    {rel.relationship_type === 'cadastral_collision' && (
                      <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                        Shared Cadastral Identifiers
                      </span>
                    )}
                    {rel.relationship_type === 'nearby' && (
                      <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-blue-100 text-blue-800 border border-blue-200">
                        Adjacent Corridor ({rel.distance_km} km)
                      </span>
                    )}
                    {rel.relationship_type === 'same_administrative_unit' && (
                      <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-700 border border-slate-200">
                        Shared Revenue Village
                      </span>
                    )}
                  </div>
                </div>

                {/* Evidence Summary Grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 bg-white p-3 rounded-md border border-slate-200/80">
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase font-semibold block">
                      Evidence &amp; Geometry
                    </span>
                    <p className="text-slate-700 mt-0.5 text-[11px]">
                      {rel.evidence_summary}
                    </p>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase font-semibold block">
                      Cadastral / Survey Alignment
                    </span>
                    <div className="mt-0.5 text-[11px]">
                      {rel.shared_survey_numbers && rel.shared_survey_numbers.length > 0 ? (
                        <div className="text-red-700 font-mono font-medium">
                          Survey Nos: {rel.shared_survey_numbers.join(', ')}
                        </div>
                      ) : (
                        <span className="text-slate-500">No duplicate survey identifiers</span>
                      )}
                      {rel.shared_khata_numbers && rel.shared_khata_numbers.length > 0 && (
                        <div className="text-slate-600 font-mono text-[10px]">
                          Khata: {rel.shared_khata_numbers.join(', ')}
                        </div>
                      )}
                    </div>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase font-semibold block">
                      Jurisdiction &amp; Provenance
                    </span>
                    <div className="mt-0.5 text-[11px] text-slate-600">
                      <div>Village: <strong>{rel.shared_admin_unit?.village || rel.shared_geography?.village || 'N/A'}</strong></div>
                      <div>LGD Code: <span className="font-mono">{rel.shared_admin_unit?.village_lgd_code || rel.shared_geography?.village_lgd_code || 'N/A'}</span></div>
                    </div>
                  </div>
                </div>

                {/* Alternative Spacing & Mitigation Solutions */}
                {rel.alternative_solutions && rel.alternative_solutions.length > 0 && (
                  <div className="space-y-1.5 pt-1">
                    <span className="text-[10px] text-gov-navy uppercase font-bold tracking-wider block">
                      Recommended Clearance Spacing &amp; Realignment Alternatives
                    </span>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                      {rel.alternative_solutions.map((sol: any, sIdx: number) => (
                        <div
                          key={sIdx}
                          className="bg-white p-3 rounded border border-blue-100 text-[11px] space-y-1.5 shadow-2xs"
                        >
                          <div className="flex items-center justify-between">
                            <strong className="text-gov-slate font-semibold text-xs">
                              {sol.strategy_name}
                            </strong>
                            {sol.recommended_buffer_meters && (
                              <span className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded bg-blue-50 text-blue-800 border border-blue-200">
                                {sol.recommended_buffer_meters}m {sol.clearance_direction || ''}
                              </span>
                            )}
                          </div>
                          <p className="text-slate-600 text-[11px] leading-relaxed">{sol.justification}</p>
                          <div className="pt-1 border-t border-slate-100 flex items-center justify-between text-[10px]">
                            <span className="text-emerald-700 font-medium">
                              Retains {sol.retained_area_hectares} Ha ({sol.retained_area_percentage}%)
                            </span>
                            <span className="text-slate-400 font-mono text-[9px]">
                              {sol.statutory_procedure?.split(':')[0]}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Structured Advisory Recommendations */}
                {rel.recommendations && rel.recommendations.length > 0 && (
                  <div className="space-y-1.5 pt-1">
                    <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider block">
                      Advisory Review Action Items (Non-destructive)
                    </span>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {rel.recommendations.map((rec, rIdx) => (
                        <div key={rIdx} className="bg-white/80 p-2.5 rounded border border-slate-200 text-[11px] space-y-1">
                          <div className="flex items-center justify-between">
                            <strong className="text-gov-navy font-semibold">{rec.title}</strong>
                            <span className="text-[9px] px-1.5 py-0.2 rounded font-mono uppercase bg-slate-100 text-slate-600">
                              {(rec.action_type || rec.type || 'Review').replace(/_/g, ' ')}
                            </span>
                          </div>
                          <p className="text-slate-600 text-[10px]">{rec.description}</p>
                          <div className="text-[9px] text-slate-400 italic pt-0.5">
                            {rec.statutory_guardrail}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

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

      {/* ========================================================================= */}
      {/* 4. STATUTORY AWARD STATEMENT & FORM-11 MODAL */}
      {/* ========================================================================= */}
      {selectedAwardParcel && (
        <StatutoryAwardModal
          isOpen={true}
          caseId={caseItem.id}
          parcel={selectedAwardParcel}
          onClose={() => setSelectedAwardParcel(null)}
          onAwardUpdated={() => {
            onRefresh?.();
          }}
        />
      )}
    </div>
  );
};
