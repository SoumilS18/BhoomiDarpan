import React, { useEffect, useState } from 'react';
import { Card } from '../common/Card';
import { Button } from '../common/Button';
import { fetchPortfolioOutcomes } from '../../lib/api';
import { PortfolioOutcomeData } from '../../../shared/types';
import {
  Sparkles,
  CheckCircle2,
  Clock,
  Layers,
  ArrowRight,
  TrendingDown,
  RefreshCw,
  HelpCircle,
  FileCheck,
  AlertCircle,
} from 'lucide-react';

interface InterventionOutcomesViewProps {
  onRefreshParent?: () => void;
}

export const InterventionOutcomesView: React.FC<InterventionOutcomesViewProps> = () => {
  const [outcomeData, setOutcomeData] = useState<PortfolioOutcomeData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadOutcomes = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetchPortfolioOutcomes();
      setOutcomeData(res.outcomes);
    } catch (err: any) {
      setError(err.message || 'Failed to aggregate intervention outcomes');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadOutcomes();
  }, []);

  const getStateBadge = (state: PortfolioOutcomeData['state_breakdown']) => {
    switch (state) {
      case 'observed_outcome':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
            Observed Outcome (Empirically Verified)
          </span>
        );
      case 'implemented':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-800 border border-blue-300">
            <Clock className="h-3.5 w-3.5 text-blue-600" />
            Intervention Implemented (Tracking Active)
          </span>
        );
      case 'accepted':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-purple-100 text-purple-800 border border-purple-300">
            <FileCheck className="h-3.5 w-3.5 text-purple-600" />
            Accepted by Authority (Pending Execution)
          </span>
        );
      case 'proposed':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300">
            <AlertCircle className="h-3.5 w-3.5 text-amber-600" />
            Advisory Proposed (Pending Review)
          </span>
        );
      case 'simulated':
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-700 border border-slate-300">
            <Sparkles className="h-3.5 w-3.5 text-slate-500" />
            Simulated Projection (Sandbox Hypothesis)
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
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            Intervention &amp; Recommendation Realized Outcome Analytics
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Strict separation between simulated hypothesis, advisory proposals, officer acceptance, and empirical observed outcomes.
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={loadOutcomes}
          leftIcon={<RefreshCw className={`h-3 w-3 ${isLoading ? 'animate-spin' : ''}`} />}
        >
          Refresh Outcomes
        </Button>
      </div>

      {isLoading && (
        <Card className="p-12 text-center text-xs text-slate-500">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-gov-navy mx-auto mb-2" />
          Aggregating intervention lifecycle states and post-intervention milestones...
        </Card>
      )}

      {error && (
        <Card className="p-6 border-l-4 border-l-rose-500 bg-rose-50/50">
          <div className="flex items-center gap-2 text-rose-800 font-bold text-xs">
            <AlertCircle className="h-4 w-4 text-rose-600" />
            Outcome Analysis Query Error
          </div>
          <p className="text-xs text-rose-600 mt-1">{error}</p>
        </Card>
      )}

      {outcomeData && !isLoading && (
        <div className="space-y-4">
          {/* Top Lifecycle State Header */}
          <Card className="p-4 bg-gradient-to-r from-white via-slate-50/50 to-white">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Dominant Portfolio State
                </span>
                <div className="mt-1">{getStateBadge(outcomeData.state_breakdown)}</div>
              </div>

              <div className="flex items-center gap-2 text-xs text-slate-500">
                <span>Sample Size: <strong>{outcomeData.metadata.sample_size}</strong> recommendation(s)</span>
              </div>
            </div>
          </Card>

          {/* Separation of States Flow Pipeline */}
          <Card className="p-4">
            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">
              Separation of Intervention States
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
              {/* State 1: Simulated */}
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  1. Simulation
                </div>
                <div className="text-lg font-bold text-gov-slate mt-1">Hypothesis</div>
                <div className="text-[10px] text-slate-400 mt-0.5">
                  In-memory sandbox what-if projection
                </div>
              </div>

              {/* State 2: Proposed */}
              <div className="p-3 rounded-lg bg-amber-50/60 border border-amber-200">
                <div className="text-[10px] font-bold uppercase tracking-wider text-amber-700">
                  2. Proposed
                </div>
                <div className="text-lg font-bold text-amber-800 mt-1">
                  {outcomeData.recommendations.proposed_count}
                </div>
                <div className="text-[10px] text-amber-600 mt-0.5">
                  Advisory system recommendations
                </div>
              </div>

              {/* State 3: Accepted */}
              <div className="p-3 rounded-lg bg-purple-50/60 border border-purple-200">
                <div className="text-[10px] font-bold uppercase tracking-wider text-purple-700">
                  3. Accepted
                </div>
                <div className="text-lg font-bold text-purple-800 mt-1">
                  {outcomeData.recommendations.accepted_count}
                </div>
                <div className="text-[10px] text-purple-600 mt-0.5">
                  Officer endorsed decisions
                </div>
              </div>

              {/* State 4: Implemented */}
              <div className="p-3 rounded-lg bg-blue-50/60 border border-blue-200">
                <div className="text-[10px] font-bold uppercase tracking-wider text-blue-700">
                  4. Implemented
                </div>
                <div className="text-lg font-bold text-blue-800 mt-1">
                  {outcomeData.interventions.implemented_count}
                </div>
                <div className="text-[10px] text-blue-600 mt-0.5">
                  Executed workflow changes
                </div>
              </div>

              {/* State 5: Observed Outcome */}
              <div className="p-3 rounded-lg bg-emerald-50/60 border border-emerald-200">
                <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">
                  5. Observed
                </div>
                <div className="text-lg font-bold text-emerald-800 mt-1">
                  {outcomeData.interventions.realized_savings_days_total}d
                </div>
                <div className="text-[10px] text-emerald-600 mt-0.5">
                  Realized milestone savings
                </div>
              </div>
            </div>
          </Card>

          {/* Expected vs Realized Savings Metric Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="p-4 border-l-4 border-l-blue-500">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Projected Delay Savings
              </span>
              <div className="text-2xl font-bold text-blue-700 mt-1">
                {outcomeData.interventions.expected_savings_days_total} days
              </div>
              <div className="text-[11px] text-slate-500 mt-1">
                Sum of modeled recovery across accepted interventions
              </div>
            </Card>

            <Card className="p-4 border-l-4 border-l-emerald-500">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Realized Delay Savings
              </span>
              <div className="text-2xl font-bold text-emerald-700 mt-1">
                {outcomeData.interventions.realized_savings_days_total} days
              </div>
              <div className="text-[11px] text-slate-500 mt-1">
                Empirically measured reduction on completed milestones
              </div>
            </Card>

            <Card className="p-4 border-l-4 border-l-slate-400">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Post-Intervention Duration
              </span>
              <div className="text-2xl font-bold text-gov-slate mt-1">
                {outcomeData.interventions.observed_post_intervention_delay_days} days
              </div>
              <div className="text-[11px] text-slate-500 mt-1">
                Elapsed duration on milestones post-intervention deployment
              </div>
            </Card>
          </div>

          {/* Provenance and Evidence Card */}
          <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 text-[11px] text-slate-600 space-y-1">
            <div className="flex items-center justify-between font-bold text-slate-700">
              <span className="flex items-center gap-1.5">
                <HelpCircle className="h-3.5 w-3.5 text-slate-400" />
                Data Provenance &amp; Verification Audit
              </span>
              <span className="text-xs bg-slate-200 text-slate-700 px-2 py-0.5 rounded font-mono">
                {outcomeData.metadata.evidence_state}
              </span>
            </div>
            <p className="text-slate-500 text-[10px]">
              Source Tables: {outcomeData.metadata.source_tables.join(', ')} • Method: {outcomeData.metadata.calculation_method}
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
