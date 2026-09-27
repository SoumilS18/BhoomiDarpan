import React, { useEffect, useState, useMemo } from 'react';
import { fetchPortfolioOperations } from '../lib/api';
import { PortfolioOperationsData, PortfolioFilterParams } from '../../shared/types';
import { Button } from '../components/common/Button';
import { EmptyState } from '../components/common/EmptyState';
import { PageHeader, PageEyebrow } from '../components/common/PageHeader';
import { SectionHeading } from '../components/common/SectionHeading';
import { StatCard } from '../components/common/StatCard';
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
  GitPullRequest,
  FileCheck2,
  Activity,
  AlertTriangle,
  ArrowRight,
} from 'lucide-react';

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
        description="This deployment has no acquisition cases recorded yet. Cases appear here as soon as they are created through the case initiation workflow."
        actionLabel="Initiate First Case"
        onAction={onOpenCreateCase}
      />
    );
  }

  const { summary, attention_queue, geographic_cases, available_filters } = portfolioData;

  // Pending Actions Count (Unverified Docs + Active Disputes)
  const pendingActionsCount = attention_queue.reduce(
    (acc, item) => acc + (item.unverified_docs_count || 0) + (item.disputed_parcels_count || 0),
    0
  );

  return (
    <div className="space-y-6">
      {/* Page header */}
      <PageHeader
        eyebrow={
          <PageEyebrow>
            <Activity className="h-3 w-3 text-emerald-600" />
            National Operations Command
          </PageEyebrow>
        }
        title="Land Acquisition Operations & Decision Support"
        subtitle="Operational awareness, SLA adherence, systemic friction triage, and cadastral spatial concentrations across the national portfolio."
        actions={
          <>
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
          </>
        }
      />

      {/* Multi-dimensional filter bar */}
      <PortfolioFilterBar
        filters={filters}
        availableFilters={available_filters}
        onFilterChange={handleFilterChange}
        onResetFilters={handleResetFilters}
      />

      {/* Section 1: Operational status metrics */}
      <section>
        <SectionHeading
          title="Operational Status"
          hint="Real-time statutory metrics"
          action={
            Object.keys(filters).length > 0 ? (
              <span className="text-[11px] font-semibold text-gov-navy">
                Filters Active ({Object.keys(filters).length})
              </span>
            ) : undefined
          }
        />

        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <StatCard
            label="Active Cases"
            value={summary.active_cases}
            hint={`${summary.total_cases} total recorded`}
            icon={<FolderKanban className="h-4 w-4" />}
            tone="navy"
            active={filters.status === 'active'}
            onClick={() => handleFilterChange('status', filters.status === 'active' ? undefined : 'active')}
          />
          <StatCard
            label="Delayed Cases"
            value={summary.delayed_cases}
            hint={`+${summary.total_delay_days_accumulated}d SLA slippage`}
            icon={<Clock className="h-4 w-4" />}
            tone="red"
            active={filters.status === 'delayed'}
            onClick={() => handleFilterChange('status', filters.status === 'delayed' ? undefined : 'delayed')}
          />
          <StatCard
            label="Critical Risk"
            value={summary.at_risk_cases}
            hint="Deterministic risk assessment"
            icon={<ShieldAlert className="h-4 w-4" />}
            tone="amber"
            active={filters.risk_level === 'critical'}
            onClick={() => handleFilterChange('risk_level', filters.risk_level === 'critical' ? undefined : 'critical')}
          />
          <StatCard
            label="Attention Required"
            value={summary.attention_queue_count}
            hint="Cases in active triage"
            icon={<Flame className="h-4 w-4" />}
            tone="orange"
          />
          <StatCard
            label="Active Bottlenecks"
            value={summary.active_bottlenecks_count}
            hint="Systemic stage blockers"
            icon={<GitPullRequest className="h-4 w-4" />}
            tone="slate"
          />
          <StatCard
            label="Pending Actions"
            value={pendingActionsCount}
            hint="Docs & disputes pending"
            icon={<FileCheck2 className="h-4 w-4" />}
            tone="emerald"
          />
        </div>
      </section>

      {/* Section 2: Attention queue */}
      <section>
        <SectionHeading
          title="Operational Attention Queue"
          hint="Select a case to open its workspace"
          action={
            <button
              type="button"
              onClick={onNavigateToCases}
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-gov-navy hover:underline"
            >
              View all cases
              <ArrowRight className="h-3 w-3" />
            </button>
          }
        />
        <AttentionQueue queue={attention_queue} onSelectCase={onSelectCase} />
      </section>

      {/* Sections 3 & 4: Workflow health & geographic overview */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        {/* Section 3: Workflow health */}
        <section className="lg:col-span-5">
          <SectionHeading title="Workflow Health & SLAs" hint="RFCTLARR stages" />
          <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-gov">
            {/* Status breakdown bar */}
            <div>
              <div className="mb-2 flex items-center justify-between text-xs font-semibold text-gov-slate">
                <span>Milestone Trajectory Distribution</span>
                <span className="text-[11px] font-normal text-slate-500">
                  {workflowHealthBreakdown.total} total cases
                </span>
              </div>

              <div className="flex h-2.5 overflow-hidden rounded-full bg-slate-100">
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

              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <div className="flex items-center gap-2 rounded-lg border border-emerald-100 bg-emerald-50/50 p-2">
                  <div className="h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-500" />
                  <div className="min-w-0">
                    <div className="font-bold text-gov-slate tabular-nums">{workflowHealthBreakdown.onTrack}</div>
                    <div className="text-[10px] text-slate-500">On Track (Within Buffer)</div>
                  </div>
                </div>
                <div className="flex items-center gap-2 rounded-lg border border-amber-100 bg-amber-50/50 p-2">
                  <div className="h-2.5 w-2.5 shrink-0 rounded-full bg-amber-500" />
                  <div className="min-w-0">
                    <div className="font-bold text-gov-slate tabular-nums">{workflowHealthBreakdown.approachingSla}</div>
                    <div className="text-[10px] text-slate-500">Approaching SLA Limit</div>
                  </div>
                </div>
                <div className="flex items-center gap-2 rounded-lg border border-red-100 bg-red-50/50 p-2">
                  <div className="h-2.5 w-2.5 shrink-0 rounded-full bg-red-500" />
                  <div className="min-w-0">
                    <div className="font-bold text-gov-slate tabular-nums">{workflowHealthBreakdown.delayed}</div>
                    <div className="text-[10px] text-slate-500">Delayed (SLA Breached)</div>
                  </div>
                </div>
                <div className="flex items-center gap-2 rounded-lg border border-orange-100 bg-orange-50/50 p-2">
                  <div className="h-2.5 w-2.5 shrink-0 rounded-full bg-orange-500" />
                  <div className="min-w-0">
                    <div className="font-bold text-gov-slate tabular-nums">{workflowHealthBreakdown.blocked}</div>
                    <div className="text-[10px] text-slate-500">Blocked / Dispute Stays</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Stage-by-stage distribution */}
            {stageDistribution.length > 0 && (
              <div className="space-y-2 border-t border-slate-100 pt-3">
                <div className="text-xs font-semibold text-slate-600">Cases by Statutory Stage</div>
                <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
                  {stageDistribution.map((stg) => {
                    const pct = Math.round((stg.count / (summary.total_cases || 1)) * 100);
                    return (
                      <div key={stg.stage_title} className="text-xs">
                        <div className="mb-0.5 flex justify-between text-[11px]">
                          <span className="max-w-[200px] truncate font-medium text-gov-slate">
                            {stg.stage_title}
                          </span>
                          <span className="shrink-0 font-mono text-slate-500">
                            {stg.count} ({pct}%)
                          </span>
                        </div>
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                          <div
                            style={{ width: `${pct}%` }}
                            className="h-full rounded-full bg-gov-navy"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Section 4: Geographic overview */}
        <section className="lg:col-span-7">
          <SectionHeading
            title="Geographic Operational Overview"
            hint="Concentration of operational problems & parcel friction"
          />
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-gov">
            <PortfolioMapView
              geographicCases={geographic_cases}
              onSelectCase={onSelectCase}
            />
          </div>
        </section>
      </div>

      {/* Section 5: Trends (empirical or insufficient-history state) */}
      <section>
        <SectionHeading
          title="Trend Intelligence & Velocity"
          hint="Empirical statutory comparisons — zero manufactured trend lines"
        />
        <PortfolioTrendsView />
      </section>
    </div>
  );
};
