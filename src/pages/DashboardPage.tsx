import React, { useEffect, useState, useMemo } from 'react';
import { fetchPortfolioOperations } from '../lib/api';
import { PortfolioOperationsData, PortfolioFilterParams } from '../../shared/types';
import { Button } from '../components/common/Button';
import { EmptyState } from '../components/common/EmptyState';
import { AttentionQueue } from '../components/dashboard/AttentionQueue';
import { PortfolioMapView } from '../components/dashboard/PortfolioMapView';
import { PortfolioFilterBar } from '../components/dashboard/PortfolioFilterBar';
import { PortfolioTrendsView } from '../components/dashboard/PortfolioTrendsView';
import {
  FolderKanban,
  RefreshCw,
  Plus,
  Flame,
  Clock,
  ShieldAlert,
  AlertTriangle,
  GitPullRequest,
  CheckCircle2,
  FileCheck2,
  MapPin,
  TrendingUp,
  Activity,
  Layers,
  ArrowRight,
  ShieldCheck,
} from 'lucide-react';
import { clsx } from 'clsx';

interface DashboardPageProps {
  onSelectCase: (caseId: string, tab?: string) => void;
  onOpenCreateCase: () => void;
  onNavigateToCases: () => void;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({
  onSelectCase,
  onOpenCreateCase,
  onNavigateToCases,
}) => {
  const [portfolioData, setPortfolioData] = useState<PortfolioOperationsData | null>(null);
  const [filters, setFilters] = useState<PortfolioFilterParams>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = async (activeFilterState: PortfolioFilterParams) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetchPortfolioOperations(activeFilterState);
      setPortfolioData(res.portfolio);
    } catch (err: any) {
      setError(err.message || 'Failed to aggregate portfolio operations data');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData(filters);
  }, [filters]);

  const handleFilterChange = (key: keyof PortfolioFilterParams, value: string | undefined) => {
    setFilters((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const handleResetFilters = () => {
    setFilters({});
  };

  // Workflow Health Categorization: On Track, Approaching SLA, Delayed, Blocked
  const workflowHealthBreakdown = useMemo(() => {
    if (!portfolioData) return { onTrack: 0, approachingSla: 0, delayed: 0, blocked: 0, total: 0 };
    const queue = portfolioData.attention_queue;
    const summary = portfolioData.summary;

    const delayed = summary.delayed_cases;
    const blocked = queue.filter((q) => q.has_active_bottleneck || q.disputed_parcels_count > 0).length;
    const criticalOrHigh = summary.at_risk_cases;
    const approachingSla = Math.max(0, criticalOrHigh - delayed);
    const onTrack = Math.max(0, summary.total_cases - delayed - approachingSla);

    return {
      onTrack,
      approachingSla,
      delayed,
      blocked,
      total: summary.total_cases,
    };
  }, [portfolioData]);

  // Stage distribution
  const stageDistribution = useMemo(() => {
    if (!portfolioData) return [];
    return portfolioData.distributions?.by_stage || [];
  }, [portfolioData]);

  if (isLoading && !portfolioData) {
    return (
      <div className="flex flex-col items-center justify-center p-20 space-y-3">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gov-navy" />
        <p className="text-xs text-slate-500 font-medium">
          Aggregating national operations signals, SLA health &amp; spatial boundaries...
        </p>
      </div>
    );
  }

  if (error && !portfolioData) {
    return (
      <EmptyState
        icon={<AlertTriangle className="h-8 w-8 text-amber-500" />}
        title="Unable to connect to Operations Database"
        description={error}
        actionLabel="Retry Operations Query"
        onAction={() => loadData(filters)}
      />
    );
  }

  if (!portfolioData || (portfolioData.summary.total_cases === 0 && Object.keys(filters).length === 0)) {
    return (
      <EmptyState
        icon={<FolderKanban className="h-8 w-8 text-gov-navy" />}
        title="No Land Acquisition Cases Found"
        description="The database currently has zero recorded cases. Create a new case or run the reproducible seed script to populate test cases."
        actionLabel="Initiate First Case"
        onAction={onOpenCreateCase}
      />
    );
  }

  const { summary, attention_queue, bottlenecks, geographic_cases, available_filters } = portfolioData;

  // Pending Actions Count (Unverified Docs + Active Disputes)
  const pendingActionsCount = attention_queue.reduce(
    (acc, item) => acc + (item.unverified_docs_count || 0) + (item.disputed_parcels_count || 0),
    0
  );

  return (
    <div className="space-y-6">
      {/* ========================================================================= */}
      {/* 1. NATIONAL COMMAND HEADER */}
      {/* ========================================================================= */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-gov-navy bg-blue-50 border border-blue-200 px-2 py-0.5 rounded">
              National Operations Command
            </span>
            <span className="text-xs text-slate-300">•</span>
            <span className="text-[11px] text-slate-500 flex items-center gap-1">
              <Activity className="h-3 w-3 text-emerald-600 animate-pulse" />
              Live Statutory Telemetry
            </span>
          </div>
          <h1 className="text-xl font-bold text-gov-slate tracking-tight">
            Land Acquisition Operations &amp; Decision Support Center
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Operational awareness, SLA adherence, systemic friction triage, and cadastral spatial concentrations.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => loadData(filters)}
            leftIcon={<RefreshCw className="h-3.5 w-3.5" />}
          >
            Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={onNavigateToCases}>
            Case Registry ({summary.total_cases})
          </Button>
          <Button size="sm" onClick={onOpenCreateCase} leftIcon={<Plus className="h-3.5 w-3.5" />}>
            Initiate Case
          </Button>
        </div>
      </div>

      {/* Multi-Dimensional Filter Bar (if filters available) */}
      <PortfolioFilterBar
        filters={filters}
        availableFilters={available_filters}
        onFilterChange={handleFilterChange}
        onResetFilters={handleResetFilters}
      />

      {/* ========================================================================= */}
      {/* SECTION 1: OPERATIONAL STATUS */}
      {/* ========================================================================= */}
      <div>
        <div className="flex items-center justify-between mb-2.5">
          <div className="flex items-center gap-2">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Section 1: Operational Status
            </h2>
            <span className="text-[10px] text-slate-400">| Real-time statutory metrics</span>
          </div>
          {Object.keys(filters).length > 0 && (
            <span className="text-[11px] text-gov-navy font-semibold">
              Filters Active ({Object.keys(filters).length})
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {/* Active Cases */}
          <div
            onClick={() => handleFilterChange('status', filters.status === 'active' ? undefined : 'active')}
            className={clsx(
              'p-3.5 rounded-xl border bg-white cursor-pointer transition-all hover:shadow-xs',
              filters.status === 'active'
                ? 'border-gov-navy ring-2 ring-gov-navy/20 bg-blue-50/20'
                : 'border-slate-200'
            )}
          >
            <div className="flex items-center justify-between text-slate-500 text-[11px] font-semibold">
              <span>Active Cases</span>
              <FolderKanban className="h-3.5 w-3.5 text-gov-navy" />
            </div>
            <div className="mt-2 text-2xl font-bold text-gov-slate tabular-nums">
              {summary.active_cases}
            </div>
            <div className="mt-0.5 text-[10px] text-slate-400 truncate">
              {summary.total_cases} total recorded
            </div>
          </div>

          {/* Delayed Cases */}
          <div
            onClick={() => handleFilterChange('status', filters.status === 'delayed' ? undefined : 'delayed')}
            className={clsx(
              'p-3.5 rounded-xl border bg-white cursor-pointer transition-all hover:shadow-xs',
              filters.status === 'delayed'
                ? 'border-red-600 ring-2 ring-red-600/20 bg-red-50/20'
                : 'border-slate-200'
            )}
          >
            <div className="flex items-center justify-between text-slate-500 text-[11px] font-semibold">
              <span className="text-gov-red">Delayed Cases</span>
              <Clock className="h-3.5 w-3.5 text-gov-red" />
            </div>
            <div className="mt-2 text-2xl font-bold text-gov-red tabular-nums">
              {summary.delayed_cases}
            </div>
            <div className="mt-0.5 text-[10px] text-red-600 font-medium truncate">
              +{summary.total_delay_days_accumulated}d SLA Slippage
            </div>
          </div>

          {/* Critical-Risk Cases */}
          <div
            onClick={() => handleFilterChange('risk_level', filters.risk_level === 'critical' ? undefined : 'critical')}
            className={clsx(
              'p-3.5 rounded-xl border bg-white cursor-pointer transition-all hover:shadow-xs',
              filters.risk_level === 'critical'
                ? 'border-amber-600 ring-2 ring-amber-600/20 bg-amber-50/20'
                : 'border-slate-200'
            )}
          >
            <div className="flex items-center justify-between text-slate-500 text-[11px] font-semibold">
              <span className="text-amber-800">Critical Risk</span>
              <ShieldAlert className="h-3.5 w-3.5 text-amber-600" />
            </div>
            <div className="mt-2 text-2xl font-bold text-amber-700 tabular-nums">
              {summary.at_risk_cases}
            </div>
            <div className="mt-0.5 text-[10px] text-slate-400 truncate">
              Deterministic risk assessment
            </div>
          </div>

          {/* Attention Queue Items */}
          <div className="p-3.5 rounded-xl border border-slate-200 bg-white">
            <div className="flex items-center justify-between text-slate-500 text-[11px] font-semibold">
              <span className="text-purple-700">Attention Required</span>
              <Flame className="h-3.5 w-3.5 text-purple-600" />
            </div>
            <div className="mt-2 text-2xl font-bold text-purple-800 tabular-nums">
              {summary.attention_queue_count}
            </div>
            <div className="mt-0.5 text-[10px] text-purple-700 font-medium truncate">
              Cases in active triage
            </div>
          </div>

          {/* Unresolved Bottlenecks */}
          <div className="p-3.5 rounded-xl border border-slate-200 bg-white">
            <div className="flex items-center justify-between text-slate-500 text-[11px] font-semibold">
              <span className="text-orange-700">Active Bottlenecks</span>
              <GitPullRequest className="h-3.5 w-3.5 text-orange-600" />
            </div>
            <div className="mt-2 text-2xl font-bold text-gov-slate tabular-nums">
              {summary.active_bottlenecks_count}
            </div>
            <div className="mt-0.5 text-[10px] text-slate-400 truncate">
              Systemic stage blockers
            </div>
          </div>

          {/* Pending Actions */}
          <div className="p-3.5 rounded-xl border border-slate-200 bg-white">
            <div className="flex items-center justify-between text-slate-500 text-[11px] font-semibold">
              <span className="text-teal-700">Pending Actions</span>
              <FileCheck2 className="h-3.5 w-3.5 text-teal-600" />
            </div>
            <div className="mt-2 text-2xl font-bold text-teal-800 tabular-nums">
              {pendingActionsCount}
            </div>
            <div className="mt-0.5 text-[10px] text-slate-400 truncate">
              Docs &amp; disputes pending
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* SECTION 2: ATTENTION QUEUE */}
      {/* ========================================================================= */}
      <div>
        <div className="flex items-center justify-between mb-2.5">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Section 2: Operational Attention Queue
          </h2>
          <span className="text-[11px] text-slate-400">
            Click any action button to jump directly into the relevant case workspace
          </span>
        </div>
        <AttentionQueue
          queue={attention_queue}
          onSelectCase={onSelectCase}
        />
      </div>

      {/* ========================================================================= */}
      {/* SECTIONS 3 & 4: WORKFLOW HEALTH & GEOGRAPHIC OVERVIEW (SPLIT VIEW) */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* SECTION 3: WORKFLOW HEALTH (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Section 3: Workflow Health &amp; SLAs
            </h2>
            <span className="text-[10px] text-slate-400">RFCTLARR Stages</span>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4 shadow-xs">
            {/* Status Breakdown Bar */}
            <div>
              <div className="flex justify-between text-xs font-semibold text-gov-slate mb-1.5">
                <span>Milestone Trajectory Distribution</span>
                <span className="text-slate-500 text-[11px]">
                  {workflowHealthBreakdown.total} Total Cases
                </span>
              </div>

              {/* Proportional Segmented Bar */}
              <div className="h-3 rounded-full bg-slate-100 flex overflow-hidden">
                <div
                  style={{ width: `${(workflowHealthBreakdown.onTrack / (workflowHealthBreakdown.total || 1)) * 100}%` }}
                  className="bg-emerald-500 transition-all"
                  title={`On Track: ${workflowHealthBreakdown.onTrack}`}
                />
                <div
                  style={{ width: `${(workflowHealthBreakdown.approachingSla / (workflowHealthBreakdown.total || 1)) * 100}%` }}
                  className="bg-amber-500 transition-all"
                  title={`Approaching SLA: ${workflowHealthBreakdown.approachingSla}`}
                />
                <div
                  style={{ width: `${(workflowHealthBreakdown.delayed / (workflowHealthBreakdown.total || 1)) * 100}%` }}
                  className="bg-red-500 transition-all"
                  title={`Delayed: ${workflowHealthBreakdown.delayed}`}
                />
              </div>

              {/* Legend Grid */}
              <div className="grid grid-cols-2 gap-2 mt-3 text-xs">
                <div className="flex items-center gap-2 p-2 rounded-lg bg-emerald-50/50 border border-emerald-100">
                  <div className="h-2.5 w-2.5 rounded-full bg-emerald-500 shrink-0" />
                  <div>
                    <div className="font-bold text-gov-slate">{workflowHealthBreakdown.onTrack} Cases</div>
                    <div className="text-[10px] text-slate-500">On Track (Within Buffer)</div>
                  </div>
                </div>

                <div className="flex items-center gap-2 p-2 rounded-lg bg-amber-50/50 border border-amber-100">
                  <div className="h-2.5 w-2.5 rounded-full bg-amber-500 shrink-0" />
                  <div>
                    <div className="font-bold text-gov-slate">{workflowHealthBreakdown.approachingSla} Cases</div>
                    <div className="text-[10px] text-slate-500">Approaching SLA SLA Limit</div>
                  </div>
                </div>

                <div className="flex items-center gap-2 p-2 rounded-lg bg-red-50/50 border border-red-100">
                  <div className="h-2.5 w-2.5 rounded-full bg-red-500 shrink-0" />
                  <div>
                    <div className="font-bold text-gov-slate">{workflowHealthBreakdown.delayed} Cases</div>
                    <div className="text-[10px] text-slate-500">Delayed (SLA Breached)</div>
                  </div>
                </div>

                <div className="flex items-center gap-2 p-2 rounded-lg bg-orange-50/50 border border-orange-100">
                  <div className="h-2.5 w-2.5 rounded-full bg-orange-500 shrink-0" />
                  <div>
                    <div className="font-bold text-gov-slate">{workflowHealthBreakdown.blocked} Cases</div>
                    <div className="text-[10px] text-slate-500">Blocked / Dispute Stays</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Stage-by-Stage Progression Distribution */}
            {stageDistribution.length > 0 && (
              <div className="pt-3 border-t border-slate-100 space-y-2">
                <div className="text-xs font-semibold text-slate-600">
                  Cases by Statutory Stage
                </div>
                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {stageDistribution.map((stg) => {
                    const pct = Math.round((stg.count / (summary.total_cases || 1)) * 100);
                    return (
                      <div key={stg.stage_title} className="text-xs">
                        <div className="flex justify-between text-[11px] mb-0.5">
                          <span className="font-medium text-gov-slate truncate max-w-[200px]">
                            {stg.stage_title}
                          </span>
                          <span className="font-mono text-slate-500 shrink-0">
                            {stg.count} ({pct}%)
                          </span>
                        </div>
                        <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                          <div
                            style={{ width: `${pct}%` }}
                            className="h-full bg-gov-navy rounded-full"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* SECTION 4: GEOGRAPHIC OVERVIEW (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Section 4: Geographic Operational Overview
            </h2>
            <span className="text-[10px] text-slate-400">
              Concentration of operational problems &amp; parcel friction
            </span>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
            <PortfolioMapView
              geographicCases={geographic_cases}
              onSelectCase={onSelectCase}
            />
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* SECTION 5: TRENDS (EMPIRICAL OR INSUFFICIENT-HISTORY STATE) */}
      {/* ========================================================================= */}
      <div>
        <div className="flex items-center justify-between mb-2.5">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Section 5: Trend Intelligence &amp; Velocity
          </h2>
          <span className="text-[11px] text-slate-400">
            Empirical statutory comparisons (Zero manufactured trend lines)
          </span>
        </div>
        <PortfolioTrendsView />
      </div>
    </div>
  );
};
