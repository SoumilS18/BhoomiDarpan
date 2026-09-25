import {
  AcquisitionCase,
  CaseStageInstance,
  WorkflowStage,
  StageDependency,
  CaseDocument,
  Parcel,
  ExternalObservation,
  DataDiscrepancy,
  PredictiveDelayEstimate,
  EvidenceItem,
  CaseEvent,
} from '../../shared/types';
import { calculateDaysBetween, addDaysToDate, calculateStageDeviations } from './deviationCalculator';
import { calculateDownstreamDAGImpact } from './impactAnalyzer';
import { getPredictiveDelayPolicySync, getWeatherRiskPolicySync } from './policyEngine';

export interface PredictiveDelayParams {
  caseItem: AcquisitionCase;
  stageInstances: CaseStageInstance[];
  stages: WorkflowStage[];
  dependencies: StageDependency[];
  documents?: CaseDocument[];
  parcels?: Parcel[];
  auditLogs?: CaseEvent[];
  externalObservation?: ExternalObservation | null;
  discrepancies?: DataDiscrepancy[];
  currentDateStr?: string;
}

/**
 * Empirical Predictive Delay Engine.
 * Combines completed stage velocity, active stage overdue acceleration,
 * document/dispute friction, and weather conditions with DAG forward-pass projection.
 *
 * Strictly data-driven: no fabricated ML claims, transparent limitations.
 */
export function calculatePredictiveDelay(params: PredictiveDelayParams): {
  estimate: PredictiveDelayEstimate;
  evidenceLedger: EvidenceItem[];
} {
  const policy = getPredictiveDelayPolicySync();
  const weatherPolicy = getWeatherRiskPolicySync();
  const currentDate = params.currentDateStr || new Date().toISOString().split('T')[0];

  const enrichedStages = calculateStageDeviations(params.stageInstances, currentDate);
  const impact = calculateDownstreamDAGImpact({
    stageInstances: params.stageInstances,
    stages: params.stages,
    dependencies: params.dependencies,
    currentDateStr: currentDate,
  });

  const evidenceLedger: EvidenceItem[] = [];
  const limitations: string[] = [];
  const majorContributingFactors: string[] = [];

  // ==========================================================================
  // 1. Empirical Velocity from Completed Milestones
  // ==========================================================================
  const completedStages = enrichedStages.filter((s) => s.status === 'completed' && s.actual_end_date);
  let historicalVelocityRatio = 1.0;
  let methodology: 'historical_velocity_and_critical_path_dag' | 'statutory_baseline_only' =
    'statutory_baseline_only';

  if (completedStages.length > 0) {
    let totalExpectedDays = 0;
    let totalActualDays = 0;

    for (const st of completedStages) {
      const expDays = Math.max(1, calculateDaysBetween(st.expected_start_date, st.expected_end_date));
      const actStart = st.actual_start_date || st.expected_start_date;
      const actEnd = st.actual_end_date || currentDate;
      const actDays = Math.max(1, calculateDaysBetween(actStart, actEnd));

      totalExpectedDays += expDays;
      totalActualDays += actDays;
    }

    historicalVelocityRatio =
      Math.round(((totalActualDays / Math.max(1, totalExpectedDays)) + Number.EPSILON) * 100) / 100;
    methodology = 'historical_velocity_and_critical_path_dag';

    evidenceLedger.push({
      id: `ev-fact-vel-${completedStages.length}`,
      statement: `${completedStages.length} statutory milestone(s) completed with total ${totalActualDays} actual days vs ${totalExpectedDays} expected days (Velocity Ratio: ${historicalVelocityRatio}x).`,
      classification: 'observed_fact',
      source: 'case_stage_instances',
      confidence: 1.0,
      timestamp: currentDate,
    });
  } else {
    limitations.push('Zero completed milestones available on this case: predictive engine cannot compute empirical velocity ratio, defaulting to baseline SLA benchmarks.');
    evidenceLedger.push({
      id: 'ev-lim-no-milestones',
      statement: 'No completed statutory stages recorded; empirical velocity baseline relies on statutory workflow defaults.',
      classification: 'calculated_metric',
      source: 'workflow_stages',
      confidence: 0.70,
      timestamp: currentDate,
    });
  }

  // ==========================================================================
  // 2. Active Stage Overdue & Acceleration Analysis
  // ==========================================================================
  const activeStages = enrichedStages.filter(
    (s) => s.status === 'in_progress' || s.status === 'blocked' || s.status === 'pending_approval'
  );
  let currentStageDelayRiskDays = 0;

  for (const act of activeStages) {
    if (act.is_overdue) {
      currentStageDelayRiskDays += act.overdue_days;
      majorContributingFactors.push(
        `Active stage "${act.stage?.title || act.stage_id}" has exceeded SLA by ${act.overdue_days} day(s).`
      );
      evidenceLedger.push({
        id: `ev-act-overdue-${act.id}`,
        statement: `Active milestone "${act.stage?.title || act.stage_id}" is ${act.overdue_days} days overdue (Expected completion: ${act.expected_end_date}).`,
        classification: 'calculated_metric',
        source: 'case_stage_instances',
        confidence: 0.98,
        entity_ref: act.id,
      });
    }

    if (act.status === 'blocked') {
      currentStageDelayRiskDays += policy.initial_blockage_buffer_days ?? 7;
      majorContributingFactors.push(
        `Active stage "${act.stage?.title || act.stage_id}" is blocked pending prerequisite completion.`
      );
      evidenceLedger.push({
        id: `ev-act-blocked-${act.id}`,
        statement: `Stage "${act.stage?.title || act.stage_id}" is marked blocked: ${act.notes || 'Prerequisite unfulfilled'}.`,
        classification: 'observed_fact',
        source: 'case_stage_instances',
        confidence: 1.0,
        entity_ref: act.id,
      });
    }
  }

  // ==========================================================================
  // 3. Document Clearance Friction Delay
  // ==========================================================================
  const allDocs = params.documents || [];
  const pendingDocs = allDocs.filter((d) => d.status === 'validation_required');
  let documentFrictionDays = 0;

  if (pendingDocs.length > 0) {
    documentFrictionDays = Math.min(21, pendingDocs.length * policy.document_clearance_delay_days);
    majorContributingFactors.push(
      `${pendingDocs.length} statutory document(s) pending officer verification, estimating +${documentFrictionDays} days clearance buffer.`
    );
    evidenceLedger.push({
      id: 'ev-fact-docs',
      statement: `${pendingDocs.length} legal document(s) await human officer verification in registry vault.`,
      classification: 'observed_fact',
      source: 'documents',
      confidence: 1.0,
      policy_key: 'predictive_delay_policy',
    });
    evidenceLedger.push({
      id: 'ev-pol-doc-delay',
      statement: `Document clearance policy predicts +${documentFrictionDays} days administrative buffer per document_clearance_delay_days.`,
      classification: 'policy_derived_risk',
      source: 'policyEngine',
      confidence: 0.85,
      policy_key: 'predictive_delay_policy',
    });
  }

  // ==========================================================================
  // 4. Cadastral Parcel Litigation Friction Delay
  // ==========================================================================
  const allParcels = params.parcels || [];
  const disputedParcels = allParcels.filter((p) => p.acquisition_status === 'disputed');
  let disputeFrictionDays = 0;

  if (disputedParcels.length > 0) {
    disputeFrictionDays = policy.dispute_tribunal_delay_days;
    majorContributingFactors.push(
      `${disputedParcels.length} disputed cadastral parcel(s) pose Section 64 tribunal reference risk, adding +${disputeFrictionDays} days dispute resolution buffer.`
    );
    evidenceLedger.push({
      id: 'ev-fact-parcels',
      statement: `${disputedParcels.length} parcel(s) [${disputedParcels.map((p) => p.survey_number).join(', ')}] flagged with active title disputes.`,
      classification: 'observed_fact',
      source: 'parcels',
      confidence: 1.0,
    });
    evidenceLedger.push({
      id: 'ev-pol-dispute-delay',
      statement: `Cadastral dispute policy allocates +${disputeFrictionDays} days tribunal reference buffer per dispute_tribunal_delay_days.`,
      classification: 'policy_derived_risk',
      source: 'policyEngine',
      confidence: 0.90,
      policy_key: 'predictive_delay_policy',
    });
  }

  // ==========================================================================
  // 5. External Meteorological Observation Impact
  // ==========================================================================
  let weatherFrictionDays = 0;
  if (params.externalObservation) {
    const obs = params.externalObservation;
    const isStaleOrExpired = obs.freshness_state === 'stale' || obs.freshness_state === 'expired';

    if (isStaleOrExpired && !weatherPolicy.allow_stale_data_influence) {
      limitations.push(
        `External meteorological observation from ${obs.provider} is ${obs.freshness_state} (Observed: ${obs.observed_at}); excluded from predictive delay estimation per weather_risk_policy.`
      );
      evidenceLedger.push({
        id: 'ev-ext-weather-stale',
        statement: `Meteorological data from ${obs.provider} is ${obs.freshness_state}; excluded from predictive delay calculation.`,
        classification: 'policy_derived_risk',
        source: obs.provider,
        confidence: 0.95,
        policy_key: 'weather_risk_policy',
        is_stale_or_excluded: true,
      });
    } else if (obs.quality_score < weatherPolicy.min_quality_score) {
      limitations.push(
        `External observation quality score (${obs.quality_score}/100) is below statutory threshold (${weatherPolicy.min_quality_score}/100); excluded from predictive delay estimation.`
      );
      evidenceLedger.push({
        id: 'ev-ext-weather-lowquality',
        statement: `Observation quality (${obs.quality_score}/100) below minimum acceptance threshold (${weatherPolicy.min_quality_score}/100); excluded.`,
        classification: 'policy_derived_risk',
        source: obs.provider,
        confidence: 0.90,
        policy_key: 'weather_risk_policy',
        is_stale_or_excluded: true,
      });
    } else {
      const vals = obs.normalized_values || {};
      const isSevere =
        (vals.precipitation_mm !== undefined && vals.precipitation_mm >= 50) ||
        (vals.rain_mm !== undefined && vals.rain_mm >= 50) ||
        (vals.wind_speed_kmh !== undefined && vals.wind_speed_kmh >= 60) ||
        (vals.weather_code !== undefined && weatherPolicy.severe_weather_codes.includes(vals.weather_code));

      if (isSevere) {
        weatherFrictionDays = policy.weather_delay_factor_days;
        majorContributingFactors.push(
          `Adverse weather (${vals.weather_condition || 'Severe'}) detected at project location; survey operations project +${weatherFrictionDays} days delay buffer.`
        );
        evidenceLedger.push({
          id: 'ev-ext-weather-severe',
          statement: `Severe weather (${vals.weather_condition || 'Heavy rainfall'}, precipitation: ${vals.precipitation_mm ?? 0}mm, wind: ${vals.wind_speed_kmh ?? 0}km/h) confirmed by ${obs.provider} (Freshness: ${obs.freshness_state}, Quality: ${obs.quality_score}/100).`,
          classification: 'observed_fact',
          source: obs.provider,
          confidence: obs.confidence_score || 0.90,
          timestamp: obs.observed_at,
        });
      } else {
        evidenceLedger.push({
          id: 'ev-ext-weather-normal',
          statement: `Weather conditions reported by ${obs.provider} are normal (${vals.weather_condition || 'Clear'}); no adverse weather delay projected.`,
          classification: 'observed_fact',
          source: obs.provider,
          confidence: obs.confidence_score || 0.90,
          timestamp: obs.observed_at,
        });
      }
    }
  }

  // ==========================================================================
  // 6. Cross-Source Discrepancies Impact
  // ==========================================================================
  let discrepancyFrictionDays = 0;
  if (params.discrepancies && params.discrepancies.length > 0) {
    const unresolved = params.discrepancies.filter((d) => d.resolution_state === 'unresolved');
    if (unresolved.length > 0) {
      const perDiscrepancyDays = policy.discrepancy_reconciliation_delay_days ?? 3;
      discrepancyFrictionDays = Math.min(14, unresolved.length * perDiscrepancyDays);
      majorContributingFactors.push(
        `${unresolved.length} unresolved cross-source discrepancy/discrepancies require revenue verification, projecting +${discrepancyFrictionDays} days reconciliation time.`
      );
      evidenceLedger.push({
        id: 'ev-discrepancy-active',
        statement: `${unresolved.length} cross-source discrepancy/discrepancies (${unresolved.map((u) => u.compared_field).join(', ')}) require joint field reconciliation.`,
        classification: 'observed_fact',
        source: 'data_discrepancies',
        confidence: 0.95,
      });
    }
  }

  // ==========================================================================
  // 7. Composite Additional Delay & Forward Completion Projection
  // ==========================================================================
  const remainingStages = enrichedStages.filter((s) => s.status !== 'completed');
  const stageLookup = new Map<string, WorkflowStage>();
  params.stages.forEach((s) => stageLookup.set(s.id, s));

  let remainingScheduledDays = 0;
  for (const st of remainingStages) {
    const stageDef = stageLookup.get(st.stage_id);
    remainingScheduledDays += st.stage?.default_duration_days || stageDef?.default_duration_days || 20;
  }

  // Velocity expansion on remaining scheduled milestones
  const velocityDelayDays =
    historicalVelocityRatio > 1.0
      ? Math.round(remainingScheduledDays * (historicalVelocityRatio - 1.0) * policy.historical_velocity_weight)
      : 0;

  // Expected additional delay beyond currently accumulated DAG slip
  const expectedAdditionalDelayDays =
    velocityDelayDays + documentFrictionDays + disputeFrictionDays + weatherFrictionDays + discrepancyFrictionDays;

  // Minimum and maximum confidence interval bounds
  const minProjectedDelayDays = impact.projected_net_delay_days;
  const maxProjectedDelayDays =
    impact.projected_net_delay_days +
    Math.round(expectedAdditionalDelayDays * policy.overdue_acceleration_factor);

  // Projected completion date
  const projectedCompletionDate = addDaysToDate(
    impact.projected_completion_date,
    expectedAdditionalDelayDays
  );

  // Probability of further delay (0.0 to 1.0)
  let probabilityOfFurtherDelay = 0.15;
  if (currentStageDelayRiskDays > 0 || majorContributingFactors.length > 0) {
    const riskFactorPoints =
      (currentStageDelayRiskDays > 0 ? 0.35 : 0) +
      (disputedParcels.length > 0 ? 0.25 : 0) +
      (pendingDocs.length > 0 ? 0.15 : 0) +
      (weatherFrictionDays > 0 ? 0.10 : 0) +
      (historicalVelocityRatio > 1.1 ? 0.10 : 0);
    probabilityOfFurtherDelay = Math.min(0.95, Math.round(riskFactorPoints * 100) / 100);
  }

  // Calculate overall confidence score based on data availability
  let confidence = 0.85;
  if (completedStages.length === 0) {
    confidence -= 0.10;
  }
  if (allDocs.length === 0) {
    confidence -= 0.05;
  }
  if (!params.externalObservation) {
    confidence -= 0.05;
  }
  confidence = Math.max(0.60, Math.min(0.98, Math.round(confidence * 100) / 100));

  if (majorContributingFactors.length === 0) {
    majorContributingFactors.push('Case progression is tracking on schedule within statutory SLA tolerances.');
  }

  // Add predictive estimate to evidence ledger
  evidenceLedger.push({
    id: 'ev-pred-completion',
    statement: `Predictive forward-pass estimates completion shifted to ${projectedCompletionDate} (+${expectedAdditionalDelayDays} days expected additional delay; Range: ${minProjectedDelayDays} to ${maxProjectedDelayDays} days).`,
    classification: 'predictive_estimate',
    source: 'predictiveDelayEngine',
    confidence,
    timestamp: currentDate,
  });

  return {
    estimate: {
      current_stage_delay_risk_days: currentStageDelayRiskDays,
      expected_additional_delay_days: expectedAdditionalDelayDays,
      min_projected_delay_days: minProjectedDelayDays,
      max_projected_delay_days: maxProjectedDelayDays,
      confidence,
      probability_of_further_delay: probabilityOfFurtherDelay,
      historical_velocity_ratio: historicalVelocityRatio,
      projected_completion_date: projectedCompletionDate,
      affected_downstream_stages_count: impact.affected_downstream_stages.filter(
        (s) => s.delay_shift_days > 0
      ).length,
      major_contributing_factors: majorContributingFactors,
      limitations,
      methodology,
    },
    evidenceLedger,
  };
}
