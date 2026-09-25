import React, { useEffect, useState } from 'react';
import { fetchCaseById, fetchCaseIntelligence } from '../lib/api';
import { AcquisitionCase, CaseStageInstance, CaseIntelligenceBundle } from '../../shared/types';
import { Button } from '../components/common/Button';
import { Badge } from '../components/common/Badge';
import { Card, CardHeader, CardContent } from '../components/common/Card';
import { CaseOverviewTab } from '../components/cases/CaseOverviewTab';
import { TimelineGantt } from '../components/workflow/TimelineGantt';
import { StageAdvanceModal } from '../components/workflow/StageAdvanceModal';
import { CaseMapView } from '../components/gis/CaseMapView';
import { GeoJSONImportModal } from '../components/gis/GeoJSONImportModal';
import { AddParcelModal } from '../components/gis/AddParcelModal';
import { DocumentsTab } from '../components/documents/DocumentsTab';
import { RiskOverviewCard } from '../components/intelligence/RiskOverviewCard';
import { BottleneckList } from '../components/intelligence/BottleneckList';
import { RootCausePanel } from '../components/intelligence/RootCausePanel';
import { DownstreamImpactView } from '../components/intelligence/DownstreamImpactView';
import { WhatIfSimulator } from '../components/intelligence/WhatIfSimulator';
import { RecommendationsList } from '../components/intelligence/RecommendationsList';
import { DisputesTab } from '../components/disputes/DisputesTab';
import {
  ArrowLeft,
  Clock,
  MapPin,
  FileText,
  AlertTriangle,
  History,
  Building2,
  CheckCircle2,
  GitBranch,
  RefreshCw,
  Layers,
  Plus,
  Sparkles,
  Scale,
  Lightbulb,
  ShieldCheck,
  ChevronRight,
  ExternalLink,
} from 'lucide-react';
import { clsx } from 'clsx';

export type CaseDetailTab =
  | 'overview'
  | 'workflow'
  | 'intelligence'
  | 'gis'
  | 'documents'
  | 'disputes'
  | 'recommendations'
  | 'audit';

interface CaseDetailPageProps {
  caseId: string;
  onBack: () => void;
  /**
   * Tab requested by the current URL (`/cases/:caseId/:tab`). Legacy aliases
   * (`timeline`, `parcels`, `info`, `external_context`) are still normalised by
   * `normalizeTab` below so previously issued links keep working.
   */
  initialTab?: string;
  /**
   * Advances to another in-page tab. The shell reflects this into the URL, so
   * tabs are deep-linkable and back/forward navigable.
   */
  onTabChange: (tab: CaseDetailTab) => void;
}

export const CaseDetailPage: React.FC<CaseDetailPageProps> = ({
  caseId,
  onBack,
  initialTab = 'overview',
  onTabChange,
}) => {
  const [caseItem, setCaseItem] = useState<AcquisitionCase | null>(null);
  const [intelligenceBundle, setIntelligenceBundle] = useState<CaseIntelligenceBundle | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Normalize initialTab
  const normalizeTab = (t?: string): CaseDetailTab => {
    if (!t) return 'overview';
    if (t === 'timeline') return 'workflow';
    if (t === 'parcels') return 'gis';
    if (t === 'external_context') return 'overview';
    if (t === 'info') return 'overview';
    const valid: CaseDetailTab[] = [
      'overview',
      'workflow',
      'intelligence',
      'gis',
      'documents',
      'disputes',
      'recommendations',
      'audit',
    ];
    return valid.includes(t as any) ? (t as CaseDetailTab) : 'overview';
  };

  // The active tab is derived from the URL rather than held in local state, so
  // refresh, deep links and Back/Forward all identify the same tab. Existing
  // `setActiveTab(...)` call sites continue to work: they now push a route.
  const activeTab = normalizeTab(initialTab);
  const setActiveTab = (tab: CaseDetailTab) => onTabChange(tab);

  // Modals state
  const [selectedStage, setSelectedStage] = useState<CaseStageInstance | null>(null);
  const [isAdvanceModalOpen, setIsAdvanceModalOpen] = useState(false);
  const [isGeoJSONModalOpen, setIsGeoJSONModalOpen] = useState(false);
  const [isAddParcelModalOpen, setIsAddParcelModalOpen] = useState(false);
  const [selectedParcelId, setSelectedParcelId] = useState<string | undefined>(undefined);
  const [gisRefreshKey, setGisRefreshKey] = useState(0);

  useEffect(() => {
    loadCaseDetails();
  }, [caseId]);

  const loadCaseDetails = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [caseRes, intelRes] = await Promise.all([
        fetchCaseById(caseId),
        fetchCaseIntelligence(caseId).catch(() => ({ intelligence: null })),
      ]);
      setCaseItem(caseRes.case);
      setIntelligenceBundle(intelRes?.intelligence || null);
    } catch (err: any) {
      setError(err.message || 'Failed to load case details');
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenAdvance = (stage: CaseStageInstance) => {
    setSelectedStage(stage);
    setIsAdvanceModalOpen(true);
  };

  const formatCurrency = (amount: number) => {
    if (amount >= 10000000) return `₹${(amount / 10000000).toFixed(2)} Cr`;
    if (amount >= 100000) return `₹${(amount / 100000).toFixed(2)} L`;
    return `₹${amount.toLocaleString('en-IN')}`;
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center p-20 space-y-3 bg-white rounded-xl border border-slate-200">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gov-navy" />
        <p className="text-xs text-slate-500 font-medium">
          Loading case operational intelligence workspace...
        </p>
      </div>
    );
  }

  if (error || !caseItem) {
    return (
      <div className="p-12 text-center space-y-4 bg-white rounded-xl border border-red-200">
        <div className="text-red-600 font-semibold text-sm">{error || 'Case not found'}</div>
        <Button variant="outline" onClick={onBack} leftIcon={<ArrowLeft className="h-4 w-4" />}>
          Back to Registry
        </Button>
      </div>
    );
  }

  const metrics = caseItem.calculated_metrics;
  const isDelayed = metrics?.is_delayed || caseItem.status === 'delayed';
  const delayDays = metrics?.net_delay_days || 0;

  // Counts for tabs
  const docsCount = (caseItem.documents || []).length;
  const parcelsCount = (caseItem.parcels || []).length;
  const auditCount = (caseItem.audit_logs || []).length;
  const recsCount = intelligenceBundle?.recommendations?.length || 0;

  return (
    <div className="space-y-5">
      {/* Top Breadcrumb Navigation */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onBack} leftIcon={<ArrowLeft className="h-4 w-4" />}>
            Back to Registry
          </Button>
          <div className="text-xs text-slate-400 flex items-center gap-1.5 ml-2">
            <span>{caseItem.state}</span>
            <span>/</span>
            <span>{caseItem.district}</span>
            <span>/</span>
            <strong className="text-gov-slate">{caseItem.village}</strong>
            <span className="font-mono text-[10px] text-gov-navy bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100 ml-1">
              {caseItem.case_number}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={loadCaseDetails}
            leftIcon={<RefreshCw className="h-3.5 w-3.5" />}
          >
            Refresh
          </Button>
        </div>
      </div>

      {/* Case Header Banner */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <span className="font-mono text-xs font-bold text-gov-navy bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                  {caseItem.case_number}
                </span>
                <Badge variant={caseItem.priority === 'critical' ? 'red' : caseItem.priority === 'high' ? 'amber' : 'navy'}>
                  {caseItem.priority.toUpperCase()} PRIORITY
                </Badge>
                <Badge variant={caseItem.status === 'completed' ? 'emerald' : isDelayed ? 'red' : 'navy'}>
                  {caseItem.status.toUpperCase()}
                </Badge>
                {caseItem.project?.code && (
                  <span className="text-[11px] font-mono text-slate-500 bg-slate-50 px-2 py-0.5 rounded border">
                    {caseItem.project.code}
                  </span>
                )}
              </div>

              <h1 className="text-xl font-bold text-gov-slate tracking-tight">
                {caseItem.title}
              </h1>

              <p className="text-xs text-slate-500 mt-1 max-w-3xl">
                {caseItem.description || 'Statutory land acquisition proceedings under digital workflow monitoring.'}
              </p>
            </div>

            {isDelayed && (
              <div className="rounded-xl bg-red-50 border border-red-200 p-3.5 text-right shrink-0">
                <div className="flex items-center gap-1.5 text-xs font-bold text-gov-red justify-end">
                  <AlertTriangle className="h-4 w-4" />
                  <span>+{delayDays} Days SLA Delay</span>
                </div>
                <div className="text-[11px] text-slate-600 mt-1">
                  Projected Completion: <strong className="text-gov-slate">{metrics?.projected_completion_date}</strong>
                </div>
              </div>
            )}
          </div>

          {/* Dynamic Vitals Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-6 pt-5 border-t border-slate-100 text-xs">
            <div>
              <span className="text-[10px] text-slate-400 uppercase font-semibold block">Workflow Engine</span>
              <strong className="text-gov-slate font-semibold truncate block mt-0.5">
                {caseItem.workflow?.name || 'Standard Acquisition'}
              </strong>
            </div>

            <div>
              <span className="text-[10px] text-slate-400 uppercase font-semibold block">Current Milestone</span>
              <strong className="text-gov-slate font-semibold block mt-0.5 truncate">
                {metrics?.current_stage_title || 'Initiation'}
              </strong>
            </div>

            <div>
              <span className="text-[10px] text-slate-400 uppercase font-semibold block">Stage Progress</span>
              <strong className="text-gov-slate font-semibold block mt-0.5">
                {metrics?.completed_stages ?? 0} of {metrics?.total_stages ?? 0} ({metrics?.progress_percentage ?? 0}%)
              </strong>
            </div>

            <div>
              <span className="text-[10px] text-slate-400 uppercase font-semibold block">Total Land Demarcated</span>
              <strong className="text-gov-slate font-semibold block mt-0.5">
                {caseItem.total_area_hectares} Hectares
              </strong>
            </div>

            <div>
              <span className="text-[10px] text-slate-400 uppercase font-semibold block">Compensation Budget</span>
              <strong className="text-gov-slate font-semibold block mt-0.5">
                {formatCurrency(caseItem.estimated_compensation)}
              </strong>
            </div>
          </div>
        </div>

        {/* ===================================================================== */}
        {/* 8 CANONICAL TABS (STRICTLY ALIGNED WITH UX ARCHITECTURE) */}
        {/* ===================================================================== */}
        <div className="flex border-t border-slate-200 bg-slate-50/70 px-6 gap-6 text-xs font-medium overflow-x-auto">
          {/* Tab 1: Overview */}
          <button
            type="button"
            onClick={() => setActiveTab('overview')}
            className={clsx(
              'py-3.5 flex items-center gap-2 border-b-2 transition-all whitespace-nowrap cursor-pointer',
              activeTab === 'overview'
                ? 'border-gov-navy text-gov-navy font-bold'
                : 'border-transparent text-slate-500 hover:text-gov-slate'
            )}
          >
            <FileText className="h-4 w-4" />
            <span>1. Overview</span>
          </button>

          {/* Tab 2: Workflow */}
          <button
            type="button"
            onClick={() => setActiveTab('workflow')}
            className={clsx(
              'py-3.5 flex items-center gap-2 border-b-2 transition-all whitespace-nowrap cursor-pointer',
              activeTab === 'workflow'
                ? 'border-gov-navy text-gov-navy font-bold'
                : 'border-transparent text-slate-500 hover:text-gov-slate'
            )}
          >
            <Clock className="h-4 w-4" />
            <span>2. Workflow</span>
            {isDelayed && (
              <span className="h-2 w-2 rounded-full bg-red-500" />
            )}
          </button>

          {/* Tab 3: Intelligence */}
          <button
            type="button"
            onClick={() => setActiveTab('intelligence')}
            className={clsx(
              'py-3.5 flex items-center gap-2 border-b-2 transition-all whitespace-nowrap cursor-pointer',
              activeTab === 'intelligence'
                ? 'border-gov-navy text-gov-navy font-bold'
                : 'border-transparent text-slate-500 hover:text-gov-slate'
            )}
          >
            <Sparkles className="h-4 w-4 text-amber-500" />
            <span>3. Intelligence</span>
            {caseItem.priority === 'critical' && (
              <span className="h-2 w-2 rounded-full bg-amber-500" />
            )}
          </button>

          {/* Tab 4: GIS */}
          <button
            type="button"
            onClick={() => setActiveTab('gis')}
            className={clsx(
              'py-3.5 flex items-center gap-2 border-b-2 transition-all whitespace-nowrap cursor-pointer',
              activeTab === 'gis'
                ? 'border-gov-navy text-gov-navy font-bold'
                : 'border-transparent text-slate-500 hover:text-gov-slate'
            )}
          >
            <Layers className="h-4 w-4 text-gov-navy" />
            <span>4. GIS &amp; Cadastre ({parcelsCount})</span>
          </button>

          {/* Tab 5: Documents */}
          <button
            type="button"
            onClick={() => setActiveTab('documents')}
            className={clsx(
              'py-3.5 flex items-center gap-2 border-b-2 transition-all whitespace-nowrap cursor-pointer',
              activeTab === 'documents'
                ? 'border-gov-navy text-gov-navy font-bold'
                : 'border-transparent text-slate-500 hover:text-gov-slate'
            )}
          >
            <FileText className="h-4 w-4 text-blue-600" />
            <span>5. Documents ({docsCount})</span>
          </button>

          {/* Tab 6: Objections & Disputes */}
          <button
            type="button"
            onClick={() => setActiveTab('disputes')}
            className={clsx(
              'py-3.5 flex items-center gap-2 border-b-2 transition-all whitespace-nowrap cursor-pointer',
              activeTab === 'disputes'
                ? 'border-gov-navy text-gov-navy font-bold'
                : 'border-transparent text-slate-500 hover:text-gov-slate'
            )}
          >
            <Scale className="h-4 w-4 text-purple-600" />
            <span>6. Objections &amp; Disputes</span>
          </button>

          {/* Tab 7: Recommendations */}
          <button
            type="button"
            onClick={() => setActiveTab('recommendations')}
            className={clsx(
              'py-3.5 flex items-center gap-2 border-b-2 transition-all whitespace-nowrap cursor-pointer',
              activeTab === 'recommendations'
                ? 'border-gov-navy text-gov-navy font-bold'
                : 'border-transparent text-slate-500 hover:text-gov-slate'
            )}
          >
            <Lightbulb className="h-4 w-4 text-amber-500" />
            <span>7. Recommendations ({recsCount})</span>
          </button>

          {/* Tab 8: History / Audit */}
          <button
            type="button"
            onClick={() => setActiveTab('audit')}
            className={clsx(
              'py-3.5 flex items-center gap-2 border-b-2 transition-all whitespace-nowrap cursor-pointer',
              activeTab === 'audit'
                ? 'border-gov-navy text-gov-navy font-bold'
                : 'border-transparent text-slate-500 hover:text-gov-slate'
            )}
          >
            <History className="h-4 w-4" />
            <span>8. History &amp; Audit ({auditCount})</span>
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* TAB CONTENT IMPLEMENTATION */}
      {/* ========================================================================= */}

      {/* TAB 1: OVERVIEW */}
      {activeTab === 'overview' && (
        <CaseOverviewTab
          caseItem={caseItem}
          onNavigateTab={(t) => setActiveTab(normalizeTab(t))}
          onRefresh={loadCaseDetails}
        />
      )}

      {/* TAB 2: WORKFLOW */}
      {activeTab === 'workflow' && (
        <Card className="border-slate-200">
          <CardHeader
            title="Statutory Workflow Progression (Expected vs Actual Timeline)"
            subtitle="Stage progression timeline, statutory SLA baselines, prerequisite checks, and advancement guards"
          />
          <CardContent>
            {caseItem.stage_instances && caseItem.stage_instances.length > 0 ? (
              <TimelineGantt
                stages={caseItem.stage_instances}
                onSelectStageForAdvance={handleOpenAdvance}
              />
            ) : (
              <div className="text-center py-12 text-slate-400 text-xs">
                No stages initialized for this case.
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* TAB 3: INTELLIGENCE */}
      {activeTab === 'intelligence' && intelligenceBundle && (
        <div className="space-y-6">
          {/* Header Note */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-wrap items-center justify-between gap-3 shadow-xs">
            <div>
              <h3 className="font-bold text-gov-slate text-sm flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-amber-500" />
                <span>Decision Intelligence &amp; Causal Diagnostics</span>
              </h3>
              <p className="text-[11px] text-slate-500">
                Rigorous deterministic risk scoring, active bottlenecks, root cause attribution, and downstream DAG propagation.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={loadCaseDetails} leftIcon={<RefreshCw className="h-3.5 w-3.5" />}>
              Re-run Diagnostic Engine
            </Button>
          </div>

          {/* 1. Risk Overview Card */}
          <RiskOverviewCard
            assessment={intelligenceBundle.risk_assessment}
            baselineCompletionDate={intelligenceBundle.downstream_impact?.baseline_completion_date}
          />

          {/* 2. Bottlenecks & Root Causes */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <BottleneckList bottlenecks={intelligenceBundle.bottlenecks} />
            <RootCausePanel rootCauses={intelligenceBundle.root_causes} />
          </div>

          {/* 3. Downstream DAG Impact Analysis */}
          <DownstreamImpactView impact={intelligenceBundle.downstream_impact} />

          {/* 4. What-If Scenario Simulator */}
          <WhatIfSimulator caseId={caseId} stages={caseItem.stage_instances || []} />
        </div>
      )}

      {/* TAB 4: GIS & SPATIAL CADASTRE */}
      {activeTab === 'gis' && (
        <div className="space-y-5">
          <Card className="border-slate-200">
            <CardHeader
              title="Cadastral GIS &amp; Spatial Representation"
              subtitle="Interactive georeferenced boundary, cadastral parcels, and Bhuvan thematic satellite overlays"
              action={
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIsGeoJSONModalOpen(true)}
                    leftIcon={<Layers className="h-3.5 w-3.5" />}
                  >
                    Import GeoJSON
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => setIsAddParcelModalOpen(true)}
                    leftIcon={<Plus className="h-3.5 w-3.5" />}
                  >
                    Demarcate Parcel
                  </Button>
                </div>
              }
            />
            <CardContent>
              <CaseMapView
                caseId={caseItem.id}
                caseTitle={caseItem.title}
                onOpenImportBoundary={() => setIsGeoJSONModalOpen(true)}
                onOpenAddParcel={() => setIsAddParcelModalOpen(true)}
                onSelectParcel={(pId) => setSelectedParcelId(pId)}
                selectedParcelId={selectedParcelId}
                refreshTrigger={gisRefreshKey}
              />
            </CardContent>
          </Card>

          {/* Cadastral Land Parcels Registry Table */}
          <Card className="border-slate-200">
            <CardHeader
              title={`Cadastral Parcels Registry (${(caseItem.parcels || []).length} Parcels)`}
              subtitle="Individual survey numbers, land classifications, registered khatas, and verified ownership"
            />
            <CardContent>
              {caseItem.parcels && caseItem.parcels.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 font-semibold uppercase tracking-wider text-[10px]">
                        <th className="py-2.5 px-3">Survey #</th>
                        <th className="py-2.5 px-3">Khata #</th>
                        <th className="py-2.5 px-3">Landowner(s)</th>
                        <th className="py-2.5 px-3">Classification</th>
                        <th className="py-2.5 px-3">Area (Acres)</th>
                        <th className="py-2.5 px-3">Estimated Compensation</th>
                        <th className="py-2.5 px-3">Cadastral Status</th>
                        <th className="py-2.5 px-3 text-right">Map Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {caseItem.parcels.map((p) => (
                        <tr
                          key={p.id}
                          className={clsx(
                            'hover:bg-slate-50 transition-colors',
                            selectedParcelId === p.id && 'bg-blue-50/50'
                          )}
                        >
                          <td className="py-2.5 px-3 font-mono font-bold text-gov-navy">
                            {p.survey_number}
                          </td>
                          <td className="py-2.5 px-3 font-mono text-slate-500">
                            {p.khata_number || 'N/A'}
                          </td>
                          <td className="py-2.5 px-3 font-medium text-gov-slate">
                            {p.landowner_names?.join(', ') || 'Unregistered'}
                          </td>
                          <td className="py-2.5 px-3 capitalize text-slate-600">
                            {p.land_type || 'Agricultural'}
                          </td>
                          <td className="py-2.5 px-3 tabular-nums font-medium text-gov-slate">
                            {p.area_acres}
                          </td>
                          <td className="py-2.5 px-3 tabular-nums font-semibold text-gov-slate">
                            {formatCurrency(p.compensation_amount)}
                          </td>
                          <td className="py-2.5 px-3">
                            <span
                              className={clsx(
                                'text-[10px] font-bold px-2 py-0.5 rounded-full capitalize',
                                p.acquisition_status === 'possessed'
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                  : p.acquisition_status === 'disputed'
                                  ? 'bg-red-50 text-red-700 border border-red-200'
                                  : 'bg-blue-50 text-blue-700 border border-blue-200'
                              )}
                            >
                              {p.acquisition_status}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            <button
                              type="button"
                              onClick={() => setSelectedParcelId(p.id)}
                              className="text-xs font-semibold text-gov-navy hover:underline cursor-pointer"
                            >
                              Center
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="py-8 text-center text-xs text-slate-400">
                  No cadastral parcels demarcated yet. Click &quot;Demarcate Parcel&quot; to register land parcels.
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* TAB 5: DOCUMENTS */}
      {activeTab === 'documents' && (
        <Card className="border-slate-200">
          <CardHeader
            title="Statutory Documents &amp; Legal Order Vault"
            subtitle="Original file repository, Gemini structured entity extraction, and human validation ledger"
          />
          <CardContent>
            <DocumentsTab
              caseId={caseItem.id}
              stageInstances={caseItem.stage_instances}
            />
          </CardContent>
        </Card>
      )}

      {/* TAB 6: DISPUTES & OBJECTIONS */}
      {activeTab === 'disputes' && (
        <Card className="border-slate-200">
          <CardHeader
            title="Objections, Grievance Conciliation &amp; Judicial Injunctions"
            subtitle="Section 15 statutory objections, hearing records, conciliation awards, and High Court stay tracking"
          />
          <CardContent>
            <DisputesTab
              caseId={caseItem.id}
              parcels={caseItem.parcels}
              onDisputeUpdated={loadCaseDetails}
            />
          </CardContent>
        </Card>
      )}

      {/* TAB 7: RECOMMENDATIONS */}
      {activeTab === 'recommendations' && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-wrap items-center justify-between gap-3 shadow-xs">
            <div>
              <h3 className="font-bold text-gov-slate text-sm flex items-center gap-2">
                <Lightbulb className="h-4 w-4 text-amber-500" />
                <span>Officer Decision Support &amp; Corrective Interventions</span>
              </h3>
              <p className="text-[11px] text-slate-500">
                Actionable interventions generated from active bottlenecks, SLA delays, and document friction. Lifecycle: Proposed → Accepted → Implemented → Completed → Observed Outcome.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={loadCaseDetails} leftIcon={<RefreshCw className="h-3.5 w-3.5" />}>
              Refresh Advisories
            </Button>
          </div>

          <RecommendationsList
            recommendations={intelligenceBundle?.recommendations || []}
            onRecommendationUpdated={loadCaseDetails}
          />
        </div>
      )}

      {/* TAB 8: AUDIT HISTORY */}
      {activeTab === 'audit' && (
        <Card className="border-slate-200">
          <CardHeader
            title="Statutory Chronological Audit &amp; Event Ledger"
            subtitle="Immutable record of administrative decisions, stage updates, document verifications, and disputes"
          />
          <CardContent>
            {caseItem.audit_logs && caseItem.audit_logs.length > 0 ? (
              <div className="divide-y divide-slate-100">
                {caseItem.audit_logs.map((log) => (
                  <div key={log.id} className="py-3 text-xs flex items-start justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-gov-slate capitalize">
                          {log.event_type.replace(/_/g, ' ')}
                        </span>
                        <span className="font-mono text-[10px] text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded border">
                          {(log.metadata as any)?.actor_role || log.actor_name}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500">
                        Actor: <strong>{log.actor_name || 'System Engine'}</strong>
                      </p>
                    </div>
                    <div className="text-[10px] font-mono text-slate-400 whitespace-nowrap text-right">
                      {new Date(log.created_at).toLocaleString('en-IN')}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-12 text-center text-xs text-slate-400">
                No audit events recorded for this case yet.
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Modals */}
      {selectedStage && (
        <StageAdvanceModal
          isOpen={isAdvanceModalOpen}
          onClose={() => setIsAdvanceModalOpen(false)}
          caseId={caseItem.id}
          stageInstance={selectedStage}
          onStageUpdated={() => {
            loadCaseDetails();
            setIsAdvanceModalOpen(false);
          }}
        />
      )}

      <GeoJSONImportModal
        isOpen={isGeoJSONModalOpen}
        onClose={() => setIsGeoJSONModalOpen(false)}
        caseId={caseItem.id}
        onSuccess={() => {
          setGisRefreshKey((k) => k + 1);
          loadCaseDetails();
        }}
      />

      <AddParcelModal
        isOpen={isAddParcelModalOpen}
        onClose={() => setIsAddParcelModalOpen(false)}
        caseId={caseItem.id}
        onSuccess={() => {
          setGisRefreshKey((k) => k + 1);
          loadCaseDetails();
        }}
      />
    </div>
  );
};
