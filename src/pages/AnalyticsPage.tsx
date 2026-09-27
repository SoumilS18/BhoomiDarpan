import React, { useState, useEffect } from 'react';
import { fetchPortfolioOperations } from '../lib/api';
import { PortfolioOperationsData, PortfolioFilterParams } from '../../shared/types';
import { Button } from '../components/common/Button';
import { EmptyState } from '../components/common/EmptyState';
import { PageHeader, PageEyebrow } from '../components/common/PageHeader';
import { PortfolioFilterBar } from '../components/dashboard/PortfolioFilterBar';
import { PortfolioVisualizations } from '../components/dashboard/PortfolioVisualizations';
import { PortfolioTrendsView } from '../components/dashboard/PortfolioTrendsView';
import { GeographicDrilldownView } from '../components/dashboard/GeographicDrilldownView';
import { InterventionOutcomesView } from '../components/dashboard/InterventionOutcomesView';
import { WorkflowPerformanceView } from '../components/dashboard/WorkflowPerformanceView';
import {
  BarChart3,
  TrendingUp,
  Compass,
  CheckCircle2,
  Clock,
  RefreshCw,
  PieChart,
} from 'lucide-react';
import { clsx } from 'clsx';

/** Addressable sub-views of the analytics workspace (`/analytics/:view`). */
export type AnalyticsView = 'portfolio' | 'trends' | 'geography' | 'outcomes' | 'slas';

const ANALYTICS_VIEWS: AnalyticsView[] = ['portfolio', 'trends', 'geography', 'outcomes', 'slas'];

interface AnalyticsPageProps {
  onSelectCase: (caseId: string, tab?: string) => void;
  /** Sub-view requested by the current URL. */
  view?: string;
  onViewChange: (view: AnalyticsView) => void;
}

export const AnalyticsPage: React.FC<AnalyticsPageProps> = ({
  onSelectCase,
  view,
  onViewChange,
}) => {
  const [portfolioData, setPortfolioData] = useState<PortfolioOperationsData | null>(null);
  // Server-side filters: every change here is sent to `GET /api/analytics/portfolio`
  // and applied by the API before any aggregation runs.
  const [filters, setFilters] = useState<PortfolioFilterParams>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Derived from the URL, so each analytics sub-view is deep-linkable.
  // An unrecognised `:view` segment falls back to the default view instead of
  // rendering nothing.
  const activeTab: AnalyticsView = ANALYTICS_VIEWS.includes(view as AnalyticsView)
    ? (view as AnalyticsView)
    : 'portfolio';
  const setActiveTab = (next: AnalyticsView) => onViewChange(next);

  const loadData = async (activeFilters: PortfolioFilterParams) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetchPortfolioOperations(activeFilters);
      setPortfolioData(res.portfolio);
    } catch (err: any) {
      setError(err.message || 'Failed to aggregate analytics data');
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
      <div className="flex flex-col items-center justify-center p-20 space-y-3 bg-white rounded-xl border border-slate-200 shadow-gov">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gov-navy" />
        <p className="text-xs text-slate-500 font-medium">
          Aggregating national analytics, empirical trend series &amp; verified intervention outcomes...
        </p>
      </div>
    );
  }

  if (error && !portfolioData) {
    return (
      <EmptyState
        title="Analytics Service Error"
        description={error}
        actionLabel="Retry"
        onAction={() => loadData(filters)}
      />
    );
  }

  const summary = portfolioData?.summary;
  const distributions = portfolioData?.distributions;
  const workflowPerformance = portfolioData?.workflow_performance || [];

  return (
    <div className="space-y-6">
      {/* Page header */}
      <PageHeader
        eyebrow={
          <PageEyebrow>
            <BarChart3 className="h-3 w-3" />
            National Analytics
          </PageEyebrow>
        }
        title="National Land Acquisition Analytics"
        subtitle="Empirical distributions, temporal progression trends, and verified intervention outcomes."
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

      {/* Analytics Sub-Navigation (Section 20 Structure) */}
      <div className="flex gap-6 overflow-x-auto rounded-t-xl border-b border-slate-200 bg-white px-4 text-xs font-medium shadow-gov">
        <button
          type="button"
          onClick={() => setActiveTab('portfolio')}
          className={clsx(
            'flex cursor-pointer items-center gap-2 whitespace-nowrap border-b-2 py-3.5 transition-all',
            activeTab === 'portfolio'
              ? 'border-gov-navy font-bold text-gov-navy'
              : 'border-transparent text-slate-500 hover:text-gov-slate'
          )}
        >
          <PieChart
            className={clsx('h-4 w-4', activeTab === 'portfolio' ? 'text-gov-navy' : 'text-slate-400')}
          />
          <span>1. Portfolio Overview</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('trends')}
          className={clsx(
            'flex cursor-pointer items-center gap-2 whitespace-nowrap border-b-2 py-3.5 transition-all',
            activeTab === 'trends'
              ? 'border-gov-navy font-bold text-gov-navy'
              : 'border-transparent text-slate-500 hover:text-gov-slate'
          )}
        >
          <TrendingUp
            className={clsx('h-4 w-4', activeTab === 'trends' ? 'text-gov-navy' : 'text-slate-400')}
          />
          <span>2. Trends &amp; Velocity</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('geography')}
          className={clsx(
            'flex cursor-pointer items-center gap-2 whitespace-nowrap border-b-2 py-3.5 transition-all',
            activeTab === 'geography'
              ? 'border-gov-navy font-bold text-gov-navy'
              : 'border-transparent text-slate-500 hover:text-gov-slate'
          )}
        >
          <Compass
            className={clsx('h-4 w-4', activeTab === 'geography' ? 'text-gov-navy' : 'text-slate-400')}
          />
          <span>3. Geography</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('outcomes')}
          className={clsx(
            'flex cursor-pointer items-center gap-2 whitespace-nowrap border-b-2 py-3.5 transition-all',
            activeTab === 'outcomes'
              ? 'border-gov-navy font-bold text-gov-navy'
              : 'border-transparent text-slate-500 hover:text-gov-slate'
          )}
        >
          <CheckCircle2
            className={clsx('h-4 w-4', activeTab === 'outcomes' ? 'text-gov-navy' : 'text-slate-400')}
          />
          <span>4. Verified Outcomes</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('slas')}
          className={clsx(
            'flex cursor-pointer items-center gap-2 whitespace-nowrap border-b-2 py-3.5 transition-all',
            activeTab === 'slas'
              ? 'border-gov-navy font-bold text-gov-navy'
              : 'border-transparent text-slate-500 hover:text-gov-slate'
          )}
        >
          <Clock
            className={clsx('h-4 w-4', activeTab === 'slas' ? 'text-gov-navy' : 'text-slate-400')}
          />
          <span>5. SLA Durations</span>
        </button>
      </div>

      {/* Sub-Tab View Content */}
      <div className="space-y-6">
        {/* SUBTAB 1: PORTFOLIO DISTRIBUTIONS */}
        {activeTab === 'portfolio' && distributions && (
          <PortfolioVisualizations
            distributions={distributions}
            totalCases={summary?.total_cases || 0}
          />
        )}

        {/* SUBTAB 2: TRENDS & VELOCITY */}
        {activeTab === 'trends' && (
          <PortfolioTrendsView />
        )}

        {/* SUBTAB 3: GEOGRAPHY DRILLDOWN */}
        {activeTab === 'geography' && (
          <GeographicDrilldownView onSelectCase={onSelectCase} />
        )}

        {/* SUBTAB 4: INTERVENTION OUTCOMES */}
        {activeTab === 'outcomes' && (
          <InterventionOutcomesView />
        )}

        {/* SUBTAB 5: WORKFLOW PERFORMANCE SLAS */}
        {activeTab === 'slas' && (
          <WorkflowPerformanceView workflows={workflowPerformance} />
        )}
      </div>
    </div>
  );
};
