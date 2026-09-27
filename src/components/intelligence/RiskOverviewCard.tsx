import React, { useState } from 'react';
import { RiskAssessment } from '../../../shared/types';
import { Badge } from '../common/Badge';
import {
  AlertTriangle,
  Clock,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  Info,
  TrendingUp,
  Activity,
  FileCheck,
  Ban,
  Sparkles,
} from 'lucide-react';
import { formatDate } from '../../lib/utils';

interface RiskOverviewCardProps {
  assessment: RiskAssessment;
  baselineCompletionDate?: string;
}

export const RiskOverviewCard: React.FC<RiskOverviewCardProps> = ({
  assessment,
  baselineCompletionDate,
}) => {
  const [showDetails, setShowDetails] = useState(false);

  const score = assessment.overall_risk_score;
  const level = assessment.risk_level;

  const getScoreColor = () => {
    if (level === 'critical') return 'text-red-700 bg-red-50 border-red-200';
    if (level === 'high') return 'text-amber-700 bg-amber-50 border-amber-200';
    if (level === 'medium') return 'text-blue-700 bg-blue-50 border-blue-200';
    return 'text-emerald-700 bg-emerald-50 border-emerald-200';
  };

  const getProgressBarColor = (val: number) => {
    if (val >= 70) return 'bg-red-500';
    if (val >= 40) return 'bg-amber-500';
    return 'bg-emerald-500';
  };

  const bd = assessment.factor_breakdown;
  const pred = bd.predictive_delay;

  /**
   * Live policy weight for a scoring category.
   *
   * The weights are configuration (`risk_scoring_weights` policy), not
   * constants — they are reported back on each factor detail. When a category
   * contributed no detail, no percentage is shown rather than a stale one.
   */
  const weightLabel = (category: string): string => {
    const detail = (bd.details || []).find(
      (d) => d.category === category && typeof d.weight === 'number'
    );
    if (!detail || typeof detail.weight !== 'number') return '';
    return ` (${Math.round(detail.weight * 100)}%)`;
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-4">
      {/* Top Banner */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div
            className={`h-12 w-12 rounded-xl border flex items-center justify-center font-bold text-lg font-mono ${getScoreColor()}`}
          >
            {score}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-gov-slate text-base">Composite Acquisition Risk Index</h3>
              <Badge
                variant={
                  level === 'critical'
                    ? 'red'
                    : level === 'high'
                    ? 'amber'
                    : level === 'medium'
                    ? 'navy'
                    : 'emerald'
                }
              >
                {level.toUpperCase()} RISK
              </Badge>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Explainable multi-factor decision intelligence
              {assessment.model_version ? ` • Model: ${assessment.model_version}` : ''}
              {assessment.confidence !== undefined && assessment.confidence !== null
                ? ` • Confidence: ${Math.round(assessment.confidence * 100)}%`
                : ''}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <div className="rounded-lg bg-slate-50 border border-slate-200 px-3.5 py-2 text-right">
            <span className="text-[10px] text-slate-500 block uppercase font-semibold">
              Current Accumulated Delay
            </span>
            <span
              className={`text-sm font-bold font-mono ${
                assessment.predicted_delay_days > 0 ? 'text-red-600' : 'text-emerald-600'
              }`}
            >
              {assessment.predicted_delay_days > 0
                ? `+${assessment.predicted_delay_days} Days SLA Delay`
                : '0 Days (On Track)'}
            </span>
          </div>

          {pred && (
            <div className="rounded-lg bg-blue-50/70 border border-blue-200 px-3.5 py-2 text-right">
              <span className="text-[10px] text-blue-700 block uppercase font-semibold">
                Predictive Forward Projection
              </span>
              <span className="text-sm font-bold font-mono text-blue-900">
                +{pred.expected_additional_delay_days}d Additional Risk
              </span>
            </div>
          )}
        </div>
      </div>

      {/* 4 Risk Dimensions Bar Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2">
        <div className="bg-slate-50/80 p-3 rounded-lg border border-slate-200 text-xs">
          <div className="flex justify-between items-center mb-1.5">
            <span className="text-slate-600 font-medium">Schedule Delay{weightLabel('workflow_deviation')}</span>
            <span className="font-mono font-bold text-gov-slate">{bd.schedule_delay_score}/100</span>
          </div>
          <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full ${getProgressBarColor(bd.schedule_delay_score)}`}
              style={{ width: `${Math.min(100, bd.schedule_delay_score)}%` }}
            />
          </div>
        </div>

        <div className="bg-slate-50/80 p-3 rounded-lg border border-slate-200 text-xs">
          <div className="flex justify-between items-center mb-1.5">
            <span className="text-slate-600 font-medium">Dependency Stalls{weightLabel('dependency_blockage')}</span>
            <span className="font-mono font-bold text-gov-slate">{bd.dependency_blockage_score}/100</span>
          </div>
          <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full ${getProgressBarColor(bd.dependency_blockage_score)}`}
              style={{ width: `${Math.min(100, bd.dependency_blockage_score)}%` }}
            />
          </div>
        </div>

        <div className="bg-slate-50/80 p-3 rounded-lg border border-slate-200 text-xs">
          <div className="flex justify-between items-center mb-1.5">
            <span className="text-slate-600 font-medium">Document Friction{weightLabel('document_friction')}</span>
            <span className="font-mono font-bold text-gov-slate">{bd.missing_documents_score}/100</span>
          </div>
          <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full ${getProgressBarColor(bd.missing_documents_score)}`}
              style={{ width: `${Math.min(100, bd.missing_documents_score)}%` }}
            />
          </div>
        </div>

        <div className="bg-slate-50/80 p-3 rounded-lg border border-slate-200 text-xs">
          <div className="flex justify-between items-center mb-1.5">
            <span className="text-slate-600 font-medium">Cadastral Disputes{weightLabel('cadastral_dispute')}</span>
            <span className="font-mono font-bold text-gov-slate">{bd.cadastral_dispute_score}/100</span>
          </div>
          <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full ${getProgressBarColor(bd.cadastral_dispute_score)}`}
              style={{ width: `${Math.min(100, bd.cadastral_dispute_score)}%` }}
            />
          </div>
        </div>
      </div>

      {/* Predictive Delay Details Banner */}
      {pred && (
        <div className="bg-blue-50/60 rounded-xl border border-blue-200 p-3.5 text-xs space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-blue-200/60 pb-2">
            <div className="flex items-center gap-1.5 font-bold text-gov-navy">
              <Activity className="h-4 w-4 text-blue-600" />
              <span>Predictive Delay Forecast &amp; Milestone Velocity</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-white text-blue-900 border border-blue-200">
                Empirical Velocity: {pred.historical_velocity_ratio}x
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-white text-blue-900 border border-blue-200">
                Range: {pred.min_projected_delay_days}d – {pred.max_projected_delay_days}d
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[11px]">
            <div>
              <strong className="text-gov-slate block mb-1">Major Contributing Friction Factors:</strong>
              <ul className="list-disc list-inside space-y-0.5 text-slate-700">
                {pred.major_contributing_factors.map((f, i) => (
                  <li key={i}>{f}</li>
                ))}
              </ul>
            </div>

            <div>
              <strong className="text-gov-slate block mb-1">Predictive Horizon &amp; Limitations:</strong>
              {pred.limitations && pred.limitations.length > 0 ? (
                <ul className="list-disc list-inside space-y-0.5 text-amber-800">
                  {pred.limitations.map((lim, i) => (
                    <li key={i}>{lim}</li>
                  ))}
                </ul>
              ) : (
                <span className="text-slate-600">
                  Calculated from comprehensive completed milestone velocity and forward DAG critical-path propagation.
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Executive Inferences */}
      {assessment.ai_inferences && assessment.ai_inferences.length > 0 && (
        <div className="bg-slate-50/80 rounded-lg p-3 border border-slate-200 text-xs space-y-1">
          <span className="font-bold text-gov-navy text-[11px] uppercase tracking-wider block">
            Executive Decision Inferences:
          </span>
          <ul className="space-y-0.5 text-slate-700 text-[11px] list-disc list-inside">
            {assessment.ai_inferences.map((inf, idx) => (
              <li key={idx}>{inf}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Expandable Mathematical Evidence Details */}
      <div className="pt-1">
        <button
          type="button"
          onClick={() => setShowDetails(!showDetails)}
          className="text-xs text-gov-navy font-semibold hover:underline flex items-center gap-1"
        >
          {showDetails ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          {showDetails ? 'Hide Mathematical Factor Evidence' : 'Inspect Mathematical Factor Evidence'}
        </button>

        {showDetails && (
          <div className="mt-3 bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-2 text-xs">
            <div className="font-bold text-gov-slate text-[11px] uppercase tracking-wider border-b pb-1">
              Deterministic Evidence Elements:
            </div>
            {bd.details && bd.details.length > 0 ? (
              <div className="space-y-2">
                {bd.details.map((item, idx) => {
                  const isExcluded = item.status === 'excluded';
                  return (
                    <div
                      key={idx}
                      className={`p-2 rounded border text-[11px] flex items-start justify-between gap-3 ${
                        isExcluded ? 'bg-slate-100/80 border-slate-200 text-slate-500' : 'bg-white border-slate-200'
                      }`}
                    >
                      <div className="space-y-0.5 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-gov-slate">{item.factor}</span>
                          {item.policy_key && (
                            <span className="font-mono text-[9px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded border border-slate-200">
                              Policy: {item.policy_key}
                            </span>
                          )}
                          {isExcluded && (
                            <span className="font-bold text-[9px] bg-amber-50 text-amber-800 border border-amber-200 px-1.5 py-0.5 rounded flex items-center gap-0.5">
                              <Ban className="h-2.5 w-2.5" /> EXCLUDED
                            </span>
                          )}
                        </div>
                        <p className="text-slate-600">{item.evidence}</p>
                      </div>
                      <span
                        className={`font-mono font-bold text-xs shrink-0 ${
                          isExcluded ? 'text-slate-400' : 'text-gov-navy'
                        }`}
                      >
                        {item.impact > 0 ? `+${item.impact} pts` : '0 pts'}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-slate-500 italic text-[11px]">
                No active risk factors accumulating penalty points.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
