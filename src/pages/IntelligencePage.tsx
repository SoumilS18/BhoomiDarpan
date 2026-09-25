import React, { useState, useEffect } from 'react';
import { fetchPortfolioOperations } from '../lib/api';
import { PortfolioOperationsData } from '../../shared/types';
import { Button } from '../components/common/Button';
import { EmptyState } from '../components/common/EmptyState';
import { PortfolioBottlenecks } from '../components/dashboard/PortfolioBottlenecks';
import { GeographicDrilldownView } from '../components/dashboard/GeographicDrilldownView';
import {
  Sparkles,
  GitPullRequest,
  Compass,
  AlertTriangle,
  RefreshCw,
  Flame,
  ShieldAlert,
  ArrowRight,
  TrendingUp,
  Layers,
  FileWarning,
  Scale,
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
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Derived from the URL, so each intelligence sub-view is deep-linkable.
  // An unrecognised `:view` segment falls back to the default view.
  const subTab: IntelligenceView = INTELLIGENCE_VIEWS.includes(view as IntelligenceView)
    ? (view as IntelligenceView)
    : 'drilldown';
  const setSubTab = (next: IntelligenceView) => onViewChange(next);

  const loadData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetchPortfolioOperations({});
      setPortfolioData(res.portfolio);
    } catch (err: any) {
      setError(err.message || 'Failed to aggregate portfolio intelligence');
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
        onAction={loadData}
      />
    );
  }

  const summary = portfolioData?.summary;
  const bottlenecks = portfolioData?.bottlenecks || [];
  const attentionQueue = portfolioData?.attention_queue || [];
  const distributions = portfolioData?.distributions;

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-gov-navy bg-blue-50 border border-blue-200 px-2 py-0.5 rounded">
              Cross-Case Intelligence Hub
            </span>
            <span className="text-xs text-slate-300">•</span>
            <span className="text-[11px] text-slate-500">
              National Hierarchy Telemetry
            </span>
          </div>
          <h1 className="text-xl font-bold text-gov-slate tracking-tight">
            Cross-Case Decision Intelligence &amp; Hierarchy Drilldown
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Systemic friction loci, delay patterns, risk concentration, and multi-tier administrative drilldown from National to Case level.
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

      {/* Intelligence Vitals Ribbon */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-[11px] text-slate-500 font-semibold">
            <span>Systemic Bottlenecks</span>
            <GitPullRequest className="h-4 w-4 text-orange-600" />
          </div>
          <div className="mt-2 text-2xl font-bold text-gov-slate tabular-nums">
            {bottlenecks.length}
          </div>
          <p className="text-[10px] text-slate-400 mt-0.5">Stages causing portfolio delay</p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-[11px] text-slate-500 font-semibold">
            <span>Critical Attention Areas</span>
            <Flame className="h-4 w-4 text-purple-600" />
          </div>
          <div className="mt-2 text-2xl font-bold text-purple-800 tabular-nums">
            {attentionQueue.length}
          </div>
          <p className="text-[10px] text-slate-400 mt-0.5">Immediate operational triage</p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-[11px] text-slate-500 font-semibold">
            <span>Critical / High Risk</span>
            <ShieldAlert className="h-4 w-4 text-amber-600" />
          </div>
          <div className="mt-2 text-2xl font-bold text-amber-700 tabular-nums">
            {summary?.at_risk_cases || 0}
          </div>
          <p className="text-[10px] text-slate-400 mt-0.5">Cases with risk score &gt; 60</p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-[11px] text-slate-500 font-semibold">
            <span>Total SLA Slippage</span>
            <TrendingUp className="h-4 w-4 text-red-600" />
          </div>
          <div className="mt-2 text-2xl font-bold text-red-600 tabular-nums">
            +{summary?.total_delay_days_accumulated || 0}d
          </div>
          <p className="text-[10px] text-slate-400 mt-0.5">Cumulative portfolio delay</p>
        </div>
      </div>

      {/* Sub-Navigation Switcher */}
      <div className="flex border-b border-slate-200 bg-white rounded-t-xl px-4 gap-6 text-xs font-medium overflow-x-auto shadow-xs">
        <button
          type="button"
          onClick={() => setSubTab('drilldown')}
          className={clsx(
            'py-3.5 flex items-center gap-2 border-b-2 transition-all whitespace-nowrap cursor-pointer',
            subTab === 'drilldown'
              ? 'border-gov-navy text-gov-navy font-bold'
              : 'border-transparent text-slate-500 hover:text-gov-slate'
          )}
        >
          <Compass className="h-4 w-4 text-emerald-600" />
          <span>Administrative Hierarchy Drilldown (National → State → District → Case)</span>
        </button>

        <button
          type="button"
          onClick={() => setSubTab('bottlenecks')}
          className={clsx(
            'py-3.5 flex items-center gap-2 border-b-2 transition-all whitespace-nowrap cursor-pointer',
            subTab === 'bottlenecks'
              ? 'border-gov-navy text-gov-navy font-bold'
              : 'border-transparent text-slate-500 hover:text-gov-slate'
          )}
        >
          <GitPullRequest className="h-4 w-4 text-orange-600" />
          <span>Systemic Bottlenecks ({bottlenecks.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setSubTab('risk_concentration')}
          className={clsx(
            'py-3.5 flex items-center gap-2 border-b-2 transition-all whitespace-nowrap cursor-pointer',
            subTab === 'risk_concentration'
              ? 'border-gov-navy text-gov-navy font-bold'
              : 'border-transparent text-slate-500 hover:text-gov-slate'
          )}
        >
          <ShieldAlert className="h-4 w-4 text-amber-600" />
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
          <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4 shadow-xs">
            <div>
              <h3 className="font-bold text-gov-slate text-sm">
                Multi-Dimensional Risk Concentration Analysis
              </h3>
              <p className="text-[11px] text-slate-500">
                Cross-case risk distribution categorized by statutory stage and SLA deviation severity.
              </p>
            </div>

            {/* Distribution Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs pt-2">
              <div className="p-4 rounded-xl border border-red-200 bg-red-50/30">
                <span className="font-bold text-gov-red block">Critical Risk Concentration</span>
                <div className="text-2xl font-bold text-gov-red mt-1">
                  {summary?.at_risk_cases || 0} Cases
                </div>
                <p className="text-[11px] text-slate-600 mt-1">
                  Cases exceeding statutory SLA limits with unresolved disputes or missing Section 11/19 declarations.
                </p>
              </div>

              <div className="p-4 rounded-xl border border-amber-200 bg-amber-50/30">
                <span className="font-bold text-amber-800 block">SLA Warning Buffer</span>
                <div className="text-2xl font-bold text-amber-700 mt-1">
                  {attentionQueue.length} Cases
                </div>
                <p className="text-[11px] text-slate-600 mt-1">
                  Cases approaching statutory maximum stage durations requiring administrative intervention.
                </p>
              </div>

              <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50/30">
                <span className="font-bold text-emerald-800 block">Normal Trajectory</span>
                <div className="text-2xl font-bold text-emerald-700 mt-1">
                  {Math.max(0, (summary?.total_cases || 0) - (summary?.delayed_cases || 0))} Cases
                </div>
                <p className="text-[11px] text-slate-600 mt-1">
                  Proceedings on track within calculated RFCTLARR schedule buffers.
                </p>
              </div>
            </div>

            {/* Top Attention Areas List */}
            <div className="pt-4 border-t border-slate-100">
              <h4 className="font-bold text-gov-slate text-xs uppercase tracking-wider mb-2">
                Highest-Priority Operational Attention Areas
              </h4>
              <div className="divide-y divide-slate-100">
                {attentionQueue.slice(0, 5).map((item) => (
                  <div key={item.case_id} className="py-2.5 flex items-center justify-between text-xs">
                    <div>
                      <span className="font-mono text-gov-navy font-bold mr-2">
                        {item.case_number}
                      </span>
                      <strong className="text-gov-slate">{item.title}</strong>
                      <span className="text-[11px] text-slate-400 ml-2">
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
