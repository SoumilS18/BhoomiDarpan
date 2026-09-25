import React, { useState, useEffect } from 'react';
import { fetchPortfolioOperations } from '../lib/api';
import { PortfolioOperationsData } from '../../shared/types';
import { Button } from '../components/common/Button';
import { EmptyState } from '../components/common/EmptyState';
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
  FolderKanban,
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
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Derived from the URL, so each analytics sub-view is deep-linkable.
  // An unrecognised `:view` segment falls back to the default view instead of
  // rendering nothing.
  const activeTab: AnalyticsView = ANALYTICS_VIEWS.includes(view as AnalyticsView)
    ? (view as AnalyticsView)
    : 'portfolio';
  const setActiveTab = (next: AnalyticsView) => onViewChange(next);

  const loadData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetchPortfolioOperations({});
      setPortfolioData(res.portfolio);
    } catch (err: any) {
      setError(err.message || 'Failed to aggregate analytics data');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  if (isLoading && !portfolioData) {
    return (
      <div className="flex flex-col items-center justify-center p-20 space-y-3 bg-white rounded-xl border border-slate-200">
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
        onAction={loadData}
      />
    );
  }

  const summary = portfolioData?.summary;
  const distributions = portfolioData?.distributions;
  const workflowPerformance = portfolioData?.workflow_performance || [];

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-gov-navy bg-blue-50 border border-blue-200 px-2 py-0.5 rounded">
              National Analytics Engine
            </span>
            <span className="text-xs text-slate-300">•</span>
            <span className="text-[11px] text-slate-500">
              Decision Support Telemetry
            </span>
          </div>
          <h1 className="text-xl font-bold text-gov-slate tracking-tight">
            National Land Acquisition Analytics
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Empirical distributions, temporal trends, administrative comparative performance, and verified intervention outcomes.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={loadData}
            leftIcon={<RefreshCw className="h-3.5 w-3.5" />}
          >
            Refresh
          </Button>
        </div>
      </div>

      {/* Analytics Sub-Navigation (Section 20 Structure) */}
      <div className="flex border-b border-slate-200 bg-white rounded-t-xl px-4 gap-6 text-xs font-medium overflow-x-auto shadow-xs">
        <button
          type="button"
          onClick={() => setActiveTab('portfolio')}
          className={clsx(
            'py-3.5 flex items-center gap-2 border-b-2 transition-all whitespace-nowrap cursor-pointer',
            activeTab === 'portfolio'
              ? 'border-gov-navy text-gov-navy font-bold'
              : 'border-transparent text-slate-500 hover:text-gov-slate'
          )}
        >
          <PieChart className="h-4 w-4 text-gov-navy" />
          <span>1. Portfolio Overview</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('trends')}
          className={clsx(
            'py-3.5 flex items-center gap-2 border-b-2 transition-all whitespace-nowrap cursor-pointer',
            activeTab === 'trends'
              ? 'border-gov-navy text-gov-navy font-bold'
              : 'border-transparent text-slate-500 hover:text-gov-slate'
          )}
        >
          <TrendingUp className="h-4 w-4 text-blue-600" />
          <span>2. Trends &amp; Velocity</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('geography')}
          className={clsx(
            'py-3.5 flex items-center gap-2 border-b-2 transition-all whitespace-nowrap cursor-pointer',
            activeTab === 'geography'
              ? 'border-gov-navy text-gov-navy font-bold'
              : 'border-transparent text-slate-500 hover:text-gov-slate'
          )}
        >
          <Compass className="h-4 w-4 text-emerald-600" />
          <span>3. Geography</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('outcomes')}
          className={clsx(
            'py-3.5 flex items-center gap-2 border-b-2 transition-all whitespace-nowrap cursor-pointer',
            activeTab === 'outcomes'
              ? 'border-gov-navy text-gov-navy font-bold'
              : 'border-transparent text-slate-500 hover:text-gov-slate'
          )}
        >
          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          <span>4. Verified Outcomes</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('slas')}
          className={clsx(
            'py-3.5 flex items-center gap-2 border-b-2 transition-all whitespace-nowrap cursor-pointer',
            activeTab === 'slas'
              ? 'border-gov-navy text-gov-navy font-bold'
              : 'border-transparent text-slate-500 hover:text-gov-slate'
          )}
        >
          <Clock className="h-4 w-4 text-teal-600" />
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
