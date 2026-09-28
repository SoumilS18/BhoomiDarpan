import React, { useEffect, useState } from 'react';
import { Card } from '../common/Card';
import { Button } from '../common/Button';
import { fetchPortfolioTrends } from '../../lib/api';
import { PortfolioTrendData } from '../../../shared/types';
import {
  TrendingUp,
  TrendingDown,
  Minus,
  AlertCircle,
  Clock,
  Calendar,
  Layers,
  HelpCircle,
  RefreshCw,
} from 'lucide-react';

interface PortfolioTrendsViewProps {
  onRefreshParent?: () => void;
}

export const PortfolioTrendsView: React.FC<PortfolioTrendsViewProps> = () => {
  const [metricName, setMetricName] = useState<string>('schedule_deviation');
  const [trendData, setTrendData] = useState<PortfolioTrendData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadTrends = async (mName: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetchPortfolioTrends(mName);
      setTrendData(res.trends);
    } catch (err: any) {
      setError(err.message || 'Failed to aggregate portfolio trends');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadTrends(metricName);
  }, [metricName]);

  const getDirectionBadge = (dir: PortfolioTrendData['direction']) => {
    switch (dir) {
      case 'improving':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <TrendingDown className="h-3.5 w-3.5 text-emerald-600" />
            Improving (Delay Decreasing)
          </span>
        );
      case 'deteriorating':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200">
            <TrendingUp className="h-3.5 w-3.5 text-rose-600" />
            Deteriorating (Delay Accumulating)
          </span>
        );
      case 'stable':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-sky-50 text-sky-700 border border-sky-200">
            <Minus className="h-3.5 w-3.5 text-sky-600" />
            Stable (Within SLA Tolerance)
          </span>
        );
      case 'insufficient_history':
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">
            <AlertCircle className="h-3.5 w-3.5 text-amber-600" />
            Insufficient History Baseline
          </span>
        );
    }
  };

  return (
    <div className="space-y-4">
      {/* Header and Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200">
        <div>
          <h3 className="text-sm font-bold text-gov-slate flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-gov-navy" />
            Temporal Trend &amp; Velocity Intelligence
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Empirical period-over-period comparison enforcing 14-day statutory minimum observation windows.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={metricName}
            onChange={(e) => setMetricName(e.target.value)}
            className="text-xs border border-slate-300 rounded-lg px-2.5 py-1.5 bg-slate-50 text-gov-slate font-medium focus:ring-1 focus:ring-gov-navy"
          >
            <option value="schedule_deviation">Milestone Schedule Deviation (Days)</option>
            <option value="lifecycle_velocity">Lifecycle Progress Velocity (%/day)</option>
          </select>
          <Button
            variant="outline"
            size="sm"
            onClick={() => loadTrends(metricName)}
            leftIcon={<RefreshCw className={`h-3 w-3 ${isLoading ? 'animate-spin' : ''}`} />}
          >
            Refresh
          </Button>
        </div>
      </div>

      {isLoading && (
        <Card className="p-12 text-center text-xs text-slate-500">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-gov-navy mx-auto mb-2" />
          Evaluating historical case trajectory and statutory trend policies...
        </Card>
      )}

      {error && (
        <Card className="p-6 border-l-4 border-l-rose-500 bg-rose-50/50">
          <div className="flex items-center gap-2 text-rose-800 font-bold text-xs">
            <AlertCircle className="h-4 w-4 text-rose-600" />
            Trend Analysis Query Error
          </div>
          <p className="text-xs text-rose-600 mt-1">{error}</p>
        </Card>
      )}

      {trendData && !isLoading && (
        <div className="space-y-4">
          {/* Main Trend Indicator Card */}
          <Card className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Trend Evaluation State
                </span>
                <div className="mt-1 flex items-center gap-3">
                  {getDirectionBadge(trendData.direction)}
                  <span className="text-xs text-slate-500">
                    Sample: <strong>{trendData.sample_size}</strong> cases in scope
                  </span>
                </div>
              </div>

              <div className="text-right">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Period Delta
                </span>
                <div className="text-xl font-bold text-gov-slate mt-0.5">
                  {trendData.direction === 'insufficient_history'
                    ? 'N/A'
                    : `${trendData.delta > 0 ? '+' : ''}${trendData.delta} days`}
                </div>
              </div>
            </div>

            {/* If Insufficient History: Transparent Honest Explanatory Callout */}
            {trendData.direction === 'insufficient_history' && (
              <div className="mt-4 p-4 rounded-xl bg-amber-50/80 border border-amber-200 text-amber-900 text-xs flex gap-3">
                <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <strong className="font-bold text-amber-800">
                    Statutory Data Freshness &amp; History Policy
                  </strong>
                  <p className="text-amber-700 leading-relaxed">
                    {trendData.reason ||
                      'To avoid statistical bias, BhoomiDarpan requires an observation span of at least 14 days and at least 3 cases before declaring an operational trend.'}
                  </p>
                  <p className="text-[11px] text-amber-600">
                    Current observation window:{' '}
                    <strong>{trendData.observation_window_days} day(s)</strong>. Real historical records are actively accumulating.
                  </p>
                </div>
              </div>
            )}

            {/* Period Breakdown Comparison */}
            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Baseline Period */}
              <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200/80">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-600">
                  <span className="flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5 text-slate-400" />
                    Baseline Window
                  </span>
                  <span className="text-[11px] text-slate-500">
                    {trendData.baseline_period.start || 'T-Baseline'} → {trendData.baseline_period.end || 'T-Midpoint'}
                  </span>
                </div>
                <div className="mt-2 text-2xl font-bold text-gov-slate">
                  {trendData.direction === 'insufficient_history'
                    ? '—'
                    : `${trendData.baseline_value}d`}
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5">
                  Initial observation baseline average
                </div>
              </div>

              {/* Current Period */}
              <div className="p-3.5 rounded-lg bg-blue-50/60 border border-blue-200/80">
                <div className="flex items-center justify-between text-xs font-semibold text-gov-navy">
                  <span className="flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5 text-blue-500" />
                    Current Evaluation Window
                  </span>
                  <span className="text-[11px] text-blue-600 font-mono">
                    {trendData.current_period.start || 'T-Midpoint'} → {trendData.current_period.end || 'T-Current'}
                  </span>
                </div>
                <div className="mt-2 text-2xl font-bold text-gov-navy">
                  {trendData.direction === 'insufficient_history'
                    ? '—'
                    : `${trendData.current_value}d`}
                </div>
                <div className="text-[10px] text-blue-500 mt-0.5">
                  Active period average delay
                </div>
              </div>
            </div>
          </Card>

          {/* Auditability & Provenance Footer */}
          <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-[11px] text-slate-500 flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <HelpCircle className="h-3.5 w-3.5 text-slate-400" />
              Formula: Delta = Current Window Mean − Baseline Window Mean (Min 14d policy rule).
            </span>
            <span className="text-slate-400">Zero Hardcoding Engine</span>
          </div>
        </div>
      )}
    </div>
  );
};
