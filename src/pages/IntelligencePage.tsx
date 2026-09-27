import React, { useState, useEffect } from 'react';
import { fetchPortfolioOperations } from '../lib/api';
import { PortfolioOperationsData, PortfolioFilterParams } from '../../shared/types';
import { Button } from '../components/common/Button';
import { EmptyState } from '../components/common/EmptyState';
import { PageHeader, PageEyebrow } from '../components/common/PageHeader';
import { SectionHeading } from '../components/common/SectionHeading';
import { StatCard } from '../components/common/StatCard';
import { PortfolioBottlenecks } from '../components/dashboard/PortfolioBottlenecks';
import { PortfolioFilterBar } from '../components/dashboard/PortfolioFilterBar';
import { GeographicDrilldownView } from '../components/dashboard/GeographicDrilldownView';
import {
  BrainCircuit,
  GitPullRequest,
  Compass,
  RefreshCw,
  Flame,
  ShieldAlert,
  ArrowRight,
  TrendingUp,
} from 'lucide-react';
import { clsx } from 'clsx';

/** Addressable sub-views of the intelligence workspace (`/intelligence/:view`). */
export type IntelligenceView = 'drilldown' | 'bottlenecks' | 'risk_concentration';

const INTELLIGENCE_VIEWS: IntelligenceView[] = ['drilldown', 'bottlenecks', 'risk_concentration'];

interface IntelligencePageProps {
  onSelectCase: (caseId: string, tab?: string) => void;
  /** Sub-view requested by the current URL. */
  view?: string;
  onViewChange: (view: IntelligenceView) => void;
}

export const IntelligencePage: React.FC<IntelligencePageProps> = ({
  onSelectCase,
  view,
  onViewChange,
}) => {
  const [portfolioData, setPortfolioData] = useState<PortfolioOperationsData | null>(null);
  // Server-side filters: every change is sent to `GET /api/analytics/portfolio`
  // and applied by the API before any intelligence aggregation runs.
  const [filters, setFilters] = useState<PortfolioFilterParams>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Derived from the URL, so each intelligence sub-view is deep-linkable.
  // An unrecognised `:view` segment falls back to the default view.
  const subTab: IntelligenceView = INTELLIGENCE_VIEWS.includes(view as IntelligenceView)
    ? (view as IntelligenceView)
    : 'drilldown';
  const setSubTab = (next: IntelligenceView) => onViewChange(next);

  const loadData = async (activeFilters: PortfolioFilterParams) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetchPortfolioOperations(activeFilters);
      setPortfolioData(res.portfolio);
    } catch (err: any) {
      setError(err.message || 'Failed to aggregate portfolio intelligence');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData(filters);
  }, [filters]);

  const handleFilterChange = (key: keyof PortfolioFilterParams, value: string | undefined) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const handleResetFilters = () => {
    setFilters({});
  };

  if (isLoading && !portfolioData) {
    return (
      <div className="flex flex-col items-center justify-center p-20 space-y-3 bg-white rounded-xl border border-slate-200">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gov-navy" />
        <p className="text-xs text-slate-500 font-medium">
          Executing multi-case cross-sectional intelligence algorithms and bottleneck aggregations...
        </p>
      </div>
    );
  }

  if (error && !portfolioData) {
    return (
      <EmptyState
        title="Intelligence Service Error"
        description={error}
        actionLabel="Retry Analysis"
        onAction={() => loadData(filters)}
      />
    );
  }

  const summary = portfolioData?.summary;
  const bottlenecks = portfolioData?.bottlenecks || [];
  const attentionQueue = portfolioData?.attention_queue || [];
  const distributions = portfolioData?.distributions;

  return (
    <div className="space-y-6">
      {/* Page header */}
      <PageHeader
        eyebrow={
          <PageEyebrow>
            <BrainCircuit className="h-3 w-3" />
            Cross-Case Intelligence
          </PageEyebrow>
        }
        title="Cross-Case Decision Intelligence & Hierarchy"
        subtitle="Systemic friction analysis, delay patterns, and administrative hierarchy drilldown."
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => loadData(filters)}
            leftIcon={<RefreshCw className="h-3.5 w-3.5" />}
          >
            Refresh
          </Button>
        }
      />

      {/* Server-side filters — every selection refetches the portfolio API */}
      {portfolioData && (
        <PortfolioFilterBar
          filters={filters}
          availableFilters={portfolioData.available_filters}
          onFilterChange={handleFilterChange}
          onResetFilters={handleResetFilters}
        />
      )}

      {/* Intelligence Vitals Ribbon */}
      <section>
        <SectionHeading
          title="Intelligence Vitals"
          hint="Deterministic portfolio-wide signals"
        />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard
            label="Systemic Bottlenecks"
            value={bottlenecks.length}
            hint="Stages causing portfolio delay"
            icon={<GitPullRequest className="h-4 w-4" />}
            tone="orange"
          />
          <StatCard
            label="Critical Attention Areas"
            value={attentionQueue.length}
            hint="Immediate operational triage"
            icon={<Flame className="h-4 w-4" />}
            tone="navy"
          />
          <StatCard
            label="Critical / High Risk"
            value={summary?.at_risk_cases || 0}
            hint="Cases with risk score > 60"
            icon={<ShieldAlert className="h-4 w-4" />}
            tone="amber"
          />
          <StatCard
            label="Total SLA Slippage"
            value={`+${summary?.total_delay_days_accumulated || 0}d`}
            hint="Cumulative portfolio delay"
            icon={<TrendingUp className="h-4 w-4" />}
            tone="red"
          />
        </div>
      </section>

      {/* Sub-Navigation Switcher */}
      <div className="flex gap-6 overflow-x-auto rounded-t-xl border-b border-slate-200 bg-white px-4 text-xs font-medium shadow-gov">
        <button
          type="button"
          onClick={() => setSubTab('drilldown')}
          className={clsx(
            'flex cursor-pointer items-center gap-2 whitespace-nowrap border-b-2 py-3.5 transition-all',
            subTab === 'drilldown'
              ? 'border-gov-navy font-bold text-gov-navy'
              : 'border-transparent text-slate-500 hover:text-gov-slate'
          )}
        >
          <Compass
            className={clsx('h-4 w-4', subTab === 'drilldown' ? 'text-gov-navy' : 'text-slate-400')}
          />
          <span>Administrative Hierarchy Drilldown (National → State → District → Case)</span>
        </button>

        <button
          type="button"
          onClick={() => setSubTab('bottlenecks')}
          className={clsx(
            'flex cursor-pointer items-center gap-2 whitespace-nowrap border-b-2 py-3.5 transition-all',
            subTab === 'bottlenecks'
              ? 'border-gov-navy font-bold text-gov-navy'
              : 'border-transparent text-slate-500 hover:text-gov-slate'
          )}
        >
          <GitPullRequest
            className={clsx('h-4 w-4', subTab === 'bottlenecks' ? 'text-gov-navy' : 'text-slate-400')}
          />
          <span>Systemic Bottlenecks ({bottlenecks.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setSubTab('risk_concentration')}
          className={clsx(
            'flex cursor-pointer items-center gap-2 whitespace-nowrap border-b-2 py-3.5 transition-all',
            subTab === 'risk_concentration'
              ? 'border-gov-navy font-bold text-gov-navy'
              : 'border-transparent text-slate-500 hover:text-gov-slate'
          )}
        >
          <ShieldAlert
            className={clsx('h-4 w-4', subTab === 'risk_concentration' ? 'text-gov-navy' : 'text-slate-400')}
          />
          <span>Risk Concentration &amp; Delay Patterns</span>
        </button>
      </div>

      {/* Sub-Tab Content */}
      <div className="space-y-6">
        {/* SUBTAB 1: ADMINISTRATIVE DRILLDOWN */}
        {subTab === 'drilldown' && (
          <GeographicDrilldownView onSelectCase={onSelectCase} />
        )}

        {/* SUBTAB 2: SYSTEMIC BOTTLENECKS */}
        {subTab === 'bottlenecks' && (
          <PortfolioBottlenecks
            bottlenecks={bottlenecks}
            onSelectCase={onSelectCase}
          />
        )}

        {/* SUBTAB 3: RISK CONCENTRATION */}
        {subTab === 'risk_concentration' && (
          <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-gov">
            <SectionHeading
              title="Multi-Dimensional Risk Concentration Analysis"
              hint="Cross-case risk distribution categorized by statutory stage and SLA deviation severity"
            />

            {/* Distribution Grid */}
            <div className="grid grid-cols-1 gap-4 pt-1 text-xs md:grid-cols-3">
              <div className="rounded-xl border border-red-200 bg-red-50/30 p-4">
                <span className="block font-bold text-gov-red">Critical Risk Concentration</span>
                <div className="mt-1 text-2xl font-bold text-gov-red">
                  {summary?.at_risk_cases || 0} Cases
                </div>
                <p className="mt-1 text-[11px] text-slate-600">
                  Cases exceeding statutory SLA limits with unresolved disputes or missing Section 11/19 declarations.
                </p>
              </div>

              <div className="rounded-xl border border-amber-200 bg-amber-50/30 p-4">
                <span className="block font-bold text-amber-800">SLA Warning Buffer</span>
                <div className="mt-1 text-2xl font-bold text-amber-700">
                  {attentionQueue.length} Cases
                </div>
                <p className="mt-1 text-[11px] text-slate-600">
                  Cases approaching statutory maximum stage durations requiring administrative intervention.
                </p>
              </div>

              <div className="rounded-xl border border-emerald-200 bg-emerald-50/30 p-4">
                <span className="block font-bold text-emerald-800">Normal Trajectory</span>
                <div className="mt-1 text-2xl font-bold text-emerald-700">
                  {Math.max(0, (summary?.total_cases || 0) - (summary?.delayed_cases || 0))} Cases
                </div>
                <p className="mt-1 text-[11px] text-slate-600">
                  Proceedings on track within calculated RFCTLARR schedule buffers.
                </p>
              </div>
            </div>

            {/* Top Attention Areas List */}
            <div className="border-t border-slate-100 pt-4">
              <SectionHeading title="Highest-Priority Operational Attention Areas" />
              <div className="divide-y divide-slate-100">
                {attentionQueue.slice(0, 5).map((item) => (
                  <div key={item.case_id} className="flex items-center justify-between py-2.5 text-xs">
                    <div className="min-w-0">
                      <span className="mr-2 font-mono font-bold text-gov-navy">
                        {item.case_number}
                      </span>
                      <strong className="text-gov-slate">{item.title}</strong>
                      <span className="ml-2 text-[11px] text-slate-400">
                        {item.district}, {item.state}
                      </span>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onSelectCase(item.case_id, 'intelligence')}
                      rightIcon={<ArrowRight className="h-3 w-3" />}
                    >
                      Investigate
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
