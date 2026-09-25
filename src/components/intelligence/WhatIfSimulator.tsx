import React, { useState } from 'react';
import { CaseStageInstance, ScenarioSimulation } from '../../../shared/types';
import { Badge } from '../common/Badge';
import {
  Sliders,
  Play,
  CheckCircle2,
  AlertCircle,
  Calendar,
  Sparkles,
  ArrowRight,
  TrendingDown,
  Info,
  Layers,
} from 'lucide-react';
import { api } from '../../lib/api';
import { formatDate } from '../../lib/utils';

interface WhatIfSimulatorProps {
  caseId: string;
  stages: CaseStageInstance[];
}

export const WhatIfSimulator: React.FC<WhatIfSimulatorProps> = ({ caseId, stages }) => {
  const [actionType, setActionType] = useState<
    | 'compress_stage_duration'
    | 'fast_track_hearing'
    | 'waive_dependency_lag'
    | 'resolve_active_bottleneck'
    | 'resolve_document_backlog'
    | 'resolve_data_discrepancy'
    | 'disburse_advance_compensation'
  >('compress_stage_duration');

  const [targetStageId, setTargetStageId] = useState<string>(stages[0]?.stage_id || stages[0]?.id || '');
  const [daysDelta, setDaysDelta] = useState<number>(10);
  const [scenarioName, setScenarioName] = useState<string>('Intervention Simulation - Timeline Compression');
  const [scenarioNotes, setScenarioNotes] = useState<string>('Administrative fast-tracking with dedicated revenue surveyor team.');
  const [isSimulating, setIsSimulating] = useState(false);
  const [simulationResult, setSimulationResult] = useState<ScenarioSimulation | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Update scenario name intelligently when action type or stage changes
  const handleActionTypeChange = (type: any) => {
    setActionType(type);
    const selectedStage = stages.find((s) => s.stage_id === targetStageId || s.id === targetStageId);
    const stageName = selectedStage?.stage?.title || 'Milestone';
    switch (type) {
      case 'compress_stage_duration':
        setScenarioName(`Timeline Acceleration: ${stageName}`);
        break;
      case 'fast_track_hearing':
        setScenarioName(`Fast-Track Statutory Hearing: ${stageName}`);
        break;
      case 'waive_dependency_lag':
        setScenarioName(`Waive Administrative Lag: ${stageName}`);
        break;
      case 'resolve_active_bottleneck':
        setScenarioName(`Resolve Bottleneck: ${stageName}`);
        break;
      case 'resolve_document_backlog':
        setScenarioName(`Clear Document Backlog: ${stageName}`);
        break;
      case 'resolve_data_discrepancy':
        setScenarioName(`Reconcile Data Discrepancy: ${stageName}`);
        break;
      case 'disburse_advance_compensation':
        setScenarioName(`Advance Compensation Disbursal: ${stageName}`);
        break;
    }
  };

  const handleRunSimulation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetStageId) {
      setError('Please select a target milestone stage for simulation.');
      return;
    }

    try {
      setIsSimulating(true);
      setError(null);

      const res = await api.runWhatIfSimulation(caseId, {
        name: scenarioName.trim() || 'Custom What-If Scenario',
        description: scenarioNotes.trim(),
        proposed_actions: [
          {
            action_type: actionType,
            target_stage_id: targetStageId,
            duration_delta_days: Number(daysDelta),
            description: `${actionType.replace(/_/g, ' ')} with ${daysDelta} days accelerated on ${targetStageId}`,
          },
        ],
      });

      setSimulationResult(res.simulation);
    } catch (err: any) {
      console.error('Simulation error:', err);
      setError(err.message || 'Failed to compute scenario simulation');
    } finally {
      setIsSimulating(false);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-5 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
        <div className="flex items-center gap-2">
          <Sliders className="h-4 w-4 text-gov-navy" />
          <h4 className="text-xs font-bold text-gov-slate uppercase tracking-wider">
            Predictive What-If Scenario Simulator
          </h4>
        </div>
        <Badge variant="navy">In-Memory Sandbox • Zero Production Mutation</Badge>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Simulation Parameter Form */}
        <form onSubmit={handleRunSimulation} className="lg:col-span-5 space-y-4">
          <div>
            <label className="block font-semibold text-gov-slate mb-1">Intervention Policy Type</label>
            <select
              value={actionType}
              onChange={(e) => handleActionTypeChange(e.target.value)}
              className="w-full text-xs rounded-lg border border-slate-300 px-3 py-2 bg-white text-gov-slate focus:outline-none focus:ring-2 focus:ring-gov-navy"
            >
              <option value="compress_stage_duration">Accelerate Milestones (Additional Surveyors/Resources)</option>
              <option value="fast_track_hearing">Fast-Track Section 15 Hearing (Continuous Sessions)</option>
              <option value="waive_dependency_lag">Eliminate Inter-Departmental Notice Buffer Lag</option>
              <option value="resolve_active_bottleneck">Targeted Bottleneck Intervention</option>
              <option value="resolve_document_backlog">Clear Statutory Document Backlog (Registry Sign-off)</option>
              <option value="resolve_data_discrepancy">Reconcile Cross-Source Discrepancies (GIS / Land Records)</option>
              <option value="disburse_advance_compensation">Advance 80% Compensation (Section 40 Urgent)</option>
            </select>
          </div>

          <div>
            <label className="block font-semibold text-gov-slate mb-1">Target Milestone Stage</label>
            <select
              value={targetStageId}
              onChange={(e) => setTargetStageId(e.target.value)}
              className="w-full text-xs rounded-lg border border-slate-300 px-3 py-2 bg-white text-gov-slate focus:outline-none focus:ring-2 focus:ring-gov-navy"
            >
              {stages.map((st) => (
                <option key={st.stage_id || st.id} value={st.stage_id || st.id}>
                  {st.stage?.title || st.stage?.code || `Stage ${st.stage_id}`} ({st.status})
                </option>
              ))}
            </select>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="font-semibold text-gov-slate">Accelerated Duration Delta</label>
              <span className="font-mono font-bold text-gov-navy bg-blue-50 border border-blue-200 px-2 py-0.5 rounded text-[11px]">
                -{daysDelta} Days
              </span>
            </div>
            <input
              type="range"
              min="1"
              max="60"
              value={daysDelta}
              onChange={(e) => setDaysDelta(parseInt(e.target.value, 10))}
              className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-gov-navy"
            />
            <div className="flex justify-between text-[10px] text-slate-400 mt-1">
              <span>1 day min</span>
              <span>30 days</span>
              <span>60 days max</span>
            </div>
          </div>

          <div>
            <label className="block font-semibold text-gov-slate mb-1">Scenario Label</label>
            <input
              type="text"
              value={scenarioName}
              onChange={(e) => setScenarioName(e.target.value)}
              className="w-full text-xs rounded-lg border border-slate-300 px-3 py-2 bg-white text-gov-slate focus:outline-none focus:ring-2 focus:ring-gov-navy"
              placeholder="Descriptive scenario name"
            />
          </div>

          {error && (
            <div className="p-2.5 bg-red-50 text-red-700 border border-red-200 rounded-lg text-[11px] flex items-center gap-1.5">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={isSimulating}
            className="w-full py-2.5 px-4 bg-gov-navy hover:bg-gov-navy-light text-white font-semibold rounded-lg shadow-sm flex items-center justify-center gap-2 disabled:opacity-50 transition-colors"
          >
            {isSimulating ? (
              <>
                <div className="animate-spin rounded-full h-3.5 w-3.5 border-2 border-white border-t-transparent" />
                <span>Simulating Dependency Graph...</span>
              </>
            ) : (
              <>
                <Play className="h-3.5 w-3.5" />
                <span>Execute In-Memory Simulation</span>
              </>
            )}
          </button>
        </form>

        {/* Right Column: Simulation Output Comparison */}
        <div className="lg:col-span-7 bg-slate-50 rounded-xl border border-slate-200/80 p-4 space-y-4">
          {!simulationResult ? (
            <div className="h-full min-h-[220px] flex flex-col items-center justify-center text-center p-6 text-slate-400">
              <Layers className="h-8 w-8 mb-2 text-slate-300" />
              <strong className="text-slate-600 text-xs">Awaiting Simulation Parameters</strong>
              <p className="text-[11px] text-slate-400 max-w-xs mt-1">
                Configure policy intervention parameters on the left and click execute to evaluate the projected cascading schedule impact.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-slate-200/60 pb-2.5">
                <div className="flex items-center gap-1.5">
                  <Sparkles className="h-4 w-4 text-gov-navy" />
                  <span className="font-bold text-gov-slate text-xs">{simulationResult.name}</span>
                </div>
                <Badge variant="emerald">Simulated Output Ready</Badge>
              </div>

              {/* High-level metrics */}
              <div className="grid grid-cols-3 gap-2.5 text-center">
                <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                  <span className="text-[10px] text-slate-400 block font-medium">Days Recovered</span>
                  <strong className="text-emerald-700 text-base font-bold font-mono">
                    +{simulationResult.delay_recovered_days}d
                  </strong>
                </div>

                <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                  <span className="text-[10px] text-slate-400 block font-medium">Risk Score Delta</span>
                  <strong className="text-gov-navy text-base font-bold font-mono">
                    {simulationResult.simulation_result.risk_score_delta > 0
                      ? `-${simulationResult.simulation_result.risk_score_delta} pts`
                      : '0 pts'}
                  </strong>
                </div>

                <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                  <span className="text-[10px] text-slate-400 block font-medium">Timeline Shift</span>
                  <strong className="text-gov-slate text-base font-bold font-mono">
                    {simulationResult.simulation_result.net_timeline_change_days}d
                  </strong>
                </div>
              </div>

              {/* Date Comparison */}
              <div className="bg-white p-3 rounded-lg border border-slate-200 space-y-1.5 text-[11px]">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Original Projected Completion:</span>
                  <span className="font-mono text-slate-700">
                    {formatDate(simulationResult.original_projected_date)}
                  </span>
                </div>
                <div className="flex items-center justify-between font-semibold">
                  <span className="text-gov-slate">Simulated Realignment Date:</span>
                  <span className="font-mono text-emerald-700 flex items-center gap-1">
                    <TrendingDown className="h-3.5 w-3.5" />
                    {formatDate(simulationResult.simulated_projected_date)}
                  </span>
                </div>
              </div>

              {/* Feasibility Notes */}
              {simulationResult.simulation_result.feasibility_notes && (
                <div className="bg-blue-50/60 border border-blue-200/80 p-3 rounded-lg text-[11px] text-blue-900 space-y-1">
                  <div className="font-semibold flex items-center gap-1 text-gov-navy">
                    <Info className="h-3.5 w-3.5" /> Statutory Feasibility Assessment:
                  </div>
                  <p>{simulationResult.simulation_result.feasibility_notes}</p>
                </div>
              )}

              {/* Affected Stages Breakdown */}
              {simulationResult.simulation_result.affected_stages?.length > 0 && (
                <div className="space-y-1.5">
                  <span className="font-semibold text-gov-slate text-[11px]">Cascading Milestone Shifts:</span>
                  <div className="max-h-36 overflow-y-auto space-y-1">
                    {simulationResult.simulation_result.affected_stages.map((st, i) => (
                      <div
                        key={i}
                        className="bg-white px-2.5 py-1.5 rounded border border-slate-200 text-[10px] flex items-center justify-between"
                      >
                        <span className="font-medium text-gov-slate truncate max-w-[140px]">
                          {st.stage_title || st.stage_id}
                        </span>
                        <div className="flex items-center gap-1.5 font-mono text-slate-500">
                          <span>{formatDate(st.original_end)}</span>
                          <ArrowRight className="h-3 w-3 text-slate-400" />
                          <span className="text-emerald-700 font-semibold">{formatDate(st.simulated_end)}</span>
                          <span className="text-emerald-700 bg-emerald-50 px-1 rounded">
                            (-{st.days_saved}d)
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Operational Assumptions */}
              {simulationResult.simulation_result.assumptions_applied &&
                simulationResult.simulation_result.assumptions_applied.length > 0 && (
                  <div className="bg-amber-50/70 border border-amber-200/80 p-3 rounded-lg text-[11px] text-amber-900 space-y-1">
                    <div className="font-semibold text-amber-950 flex items-center gap-1">
                      <Sparkles className="h-3.5 w-3.5 text-amber-600" /> Key Operational Assumptions:
                    </div>
                    <ul className="list-disc list-inside space-y-0.5 text-amber-900/90 text-[10px]">
                      {simulationResult.simulation_result.assumptions_applied.map((asm, idx) => (
                        <li key={idx}>{asm}</li>
                      ))}
                    </ul>
                  </div>
                )}

              <div className="text-[10px] text-slate-400 flex items-center gap-1 pt-1">
                <CheckCircle2 className="h-3 w-3 text-emerald-600 shrink-0" />
                <span>Computed via DAG backward-pass. Live database remains unmutated.</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
