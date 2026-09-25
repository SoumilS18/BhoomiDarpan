import { randomUUID } from 'crypto';
import {
  Recommendation,
  BottleneckItem,
  RootCauseItem,
  CaseStageInstance,
  WorkflowStage,
  CaseDocument,
  Parcel,
  ExternalObservation,
  DataDiscrepancy,
} from '../../shared/types';
import { getWeatherRiskPolicySync, getRecommendationPolicySync } from './policyEngine';

export function generateEvidenceBasedRecommendations(params: {
  caseId: string;
  bottlenecks: BottleneckItem[];
  rootCauses: RootCauseItem[];
  stageInstances: CaseStageInstance[];
  stages: WorkflowStage[];
  documents?: CaseDocument[];
  parcels?: Parcel[];
  externalObservation?: ExternalObservation | null;
  discrepancies?: DataDiscrepancy[];
}): Recommendation[] {
  const recommendations: Recommendation[] = [];
  const recPolicy = getRecommendationPolicySync();
  const weatherPolicy = getWeatherRiskPolicySync();

  const stageMap = new Map<string, WorkflowStage>();
  params.stages.forEach((s) => stageMap.set(s.id, s));

  const instMap = new Map<string, CaseStageInstance>();
  params.stageInstances.forEach((inst) => instMap.set(inst.id, inst));

  // 1. Recommendations from Document Verification Friction
  const pendingDocs = (params.documents || []).filter((d) => d.status === 'validation_required');
  if (pendingDocs.length > 0) {
    const docTitles = pendingDocs.map((d) => d.title).slice(0, 2).join('", "');
    recommendations.push({
      id: randomUUID(),
      case_id: params.caseId,
      stage_instance_id: pendingDocs[0].stage_instance_id || undefined,
      title: 'Prioritize Statutory Document Validation in Registry',
      description: `Conduct administrative review and accept extracted legal entities for ${pendingDocs.length} pending statutory document(s) including "${docTitles}".`,
      action_type: 'validate_statutory_notice',
      urgency: 'critical',
      expected_impact: 'Unblocks downstream statutory hearings by establishing verified gazette notification dates.',
      expected_benefit: 'Estimated 7-14 days schedule compression by resolving legal date dependencies.',
      confidence: 0.94,
      responsible_stakeholder: 'Land Acquisition Officer / Revenue Branch',
      reason: 'Statutory stages cannot advance until gazette notice publication dates are verified.',
      supporting_evidence: pendingDocs.map(
        (d) => `Document "${d.title}" (${d.document_type}) awaits verification in vault`
      ),
      triggering_factors: ['Document Verification Backlog'],
      relevant_policy: 'recommendation_policy',
      source: 'deterministic',
      status: 'proposed',
      is_implemented: false,
      created_at: new Date().toISOString(),
    });
  }

  // 2. Recommendations from Active Bottlenecks
  for (const b of params.bottlenecks) {
    const inst = instMap.get(b.stage_instance_id);

    if (b.severity === 'critical' || b.severity === 'high') {
      if (b.evidence.includes('BLOCKED')) {
        recommendations.push({
          id: randomUUID(),
          case_id: params.caseId,
          stage_instance_id: b.stage_instance_id,
          title: `Convene Inter-Agency Clearance Hearing for "${b.stage_title}"`,
          description: `Stage is halted on external dependencies. Schedule a Collector-level coordination meeting to clear prerequisite clearance.`,
          action_type: 'resolve_dependency_blockage',
          urgency: 'critical',
          expected_impact: `Restores workflow progression on critical path, unblocking ${b.downstream_stages_count} downstream stages.`,
          expected_benefit: `Reopens critical path progression for ${b.downstream_stages_count} downstream milestone(s).`,
          confidence: 0.91,
          responsible_stakeholder: 'District Collector / Competent Authority',
          reason: b.evidence,
          supporting_evidence: [b.evidence, ...b.downstream_stage_titles.map((t) => `Unblocks: ${t}`)],
          triggering_factors: ['Blocked Prerequisite Dependency'],
          relevant_policy: 'bottleneck_thresholds',
          source: 'deterministic',
          status: 'proposed',
          is_implemented: false,
          created_at: new Date().toISOString(),
        });
      } else if (b.deviation_days >= recPolicy.elevated_urgency_delay_threshold) {
        const isCritical = b.deviation_days >= recPolicy.critical_urgency_delay_threshold;
        const isSurveyStage = /survey|measurement|field|cadastr/i.test(b.stage_title);
        recommendations.push({
          id: randomUUID(),
          case_id: params.caseId,
          stage_instance_id: b.stage_instance_id,
          title: isSurveyStage
            ? `Deploy Supplementary Survey Teams for "${b.stage_title}"`
            : `Fast-Track Administrative Resources for "${b.stage_title}"`,
          description: isSurveyStage
            ? `Duration has slipped by ${b.deviation_days} days. Assign dedicated Amin/Surveyor teams to compress remaining field operations.`
            : `Duration has slipped by ${b.deviation_days} days. Assign dedicated case officers to compress remaining operational backlog.`,
          action_type: 'compress_stage_duration',
          urgency: isCritical ? 'critical' : 'elevated',
          expected_impact: `Estimated to recover 10-15 days of accumulated delay on the current critical path.`,
          expected_benefit: `Recovers up to ${Math.min(15, b.deviation_days)} days of accumulated slippage.`,
          confidence: 0.88,
          responsible_stakeholder: isSurveyStage ? 'Tehsildar / Sub-Divisional Officer' : 'Competent Authority / Case Officer',
          reason: `Stage exceeded statutory benchmark duration by ${b.deviation_days} days.`,
          supporting_evidence: [b.evidence],
          triggering_factors: ['Stage Duration SLA Overdue'],
          relevant_policy: 'recommendation_policy',
          source: 'deterministic',
          status: 'proposed',
          is_implemented: false,
          created_at: new Date().toISOString(),
        });
      }
    }
  }

  // 3. Recommendations from Disputed Land Holdings
  const disputedParcels = (params.parcels || []).filter((p) => p.acquisition_status === 'disputed');
  if (disputedParcels.length > 0 && recPolicy.auto_suggest_tribunal_reference) {
    recommendations.push({
      id: randomUUID(),
      case_id: params.caseId,
      title: 'Initiate Section 64/76 Tribunal Reference with Court Compensation Deposit',
      description: `Segregate ${disputedParcels.length} disputed parcel(s) and deposit compensation into the Land Acquisition Tribunal/Authority to proceed with possession without contempt.`,
      action_type: 'initiate_tribunal_reference',
      urgency: 'critical',
      expected_impact: 'Enables lawful vesting and possession handover while civil court adjudicates title apportionment.',
      expected_benefit: 'Prevents total stay on project possession by separating disputed compensation into court escrow.',
      confidence: 0.95,
      responsible_stakeholder: 'Legal Cell / Special Land Acquisition Officer',
      reason: `Disputed survey numbers [${disputedParcels.map((p) => p.survey_number).join(', ')}] pose severe litigation stay risk.`,
      supporting_evidence: disputedParcels.map((p) => `Survey ${p.survey_number} is flagged disputed`),
      triggering_factors: ['Cadastral Title Disputes'],
      relevant_policy: 'recommendation_policy',
      source: 'deterministic',
      status: 'proposed',
      is_implemented: false,
      created_at: new Date().toISOString(),
    });
  }

  // 4. Recommendations from Cross-Source Discrepancies
  const unresolvedDiscrepancies = (params.discrepancies || []).filter((d) => d.resolution_state === 'unresolved');
  if (unresolvedDiscrepancies.length > 0) {
    const fields = unresolvedDiscrepancies.map((d) => d.compared_field).join(', ');
    recommendations.push({
      id: randomUUID(),
      case_id: params.caseId,
      title: `Reconcile Cross-Source Discrepancies (${fields})`,
      description: `Cross-source comparison identified conflicting values in ${fields} across external systems. Convene joint ground verification with the Revenue Inspector.`,
      action_type: 'reconcile_data_discrepancy',
      urgency: unresolvedDiscrepancies.some((d) => d.severity === 'critical' || d.severity === 'high')
        ? 'critical'
        : 'elevated',
      expected_impact: 'Eliminates legal title contestation and statutory notice publication invalidation.',
      expected_benefit: 'Guarantees cadastral boundary accuracy before public awards are published.',
      confidence: 0.92,
      responsible_stakeholder: 'Revenue Inspector / Sub-Divisional Officer',
      reason: `${unresolvedDiscrepancies.length} discrepancy/discrepancies detected across authoritative data sources.`,
      supporting_evidence: unresolvedDiscrepancies.map(
        (d) =>
          `Discrepancy in ${d.compared_field}: ${JSON.stringify(d.value_a)} vs ${JSON.stringify(d.value_b)} (${d.source_a} vs ${d.source_b})`
      ),
      triggering_factors: ['Cross-Source Data Mismatch'],
      relevant_policy: 'spatial_discrepancy_policy',
      source: 'deterministic',
      status: 'proposed',
      is_implemented: false,
      created_at: new Date().toISOString(),
    });
  }

  // 5. Recommendations from Adverse Weather Observations
  if (
    params.externalObservation &&
    (params.externalObservation.freshness_state === 'fresh' ||
      params.externalObservation.freshness_state === 'aging')
  ) {
    const vals = params.externalObservation.normalized_values || {};
    const isSevere =
      (vals.precipitation_mm !== undefined && vals.precipitation_mm >= 50) ||
      (vals.rain_mm !== undefined && vals.rain_mm >= 50) ||
      (vals.wind_speed_kmh !== undefined && vals.wind_speed_kmh >= 60) ||
      (vals.weather_code !== undefined && weatherPolicy.severe_weather_codes.includes(vals.weather_code));

    if (isSevere && params.externalObservation.quality_score >= weatherPolicy.min_quality_score) {
      recommendations.push({
        id: randomUUID(),
        case_id: params.caseId,
        title: 'Precautionary Rescheduling of Cadastral Field Operations',
        description: `Severe atmospheric conditions (${vals.weather_condition || 'Heavy rainfall'}) detected by ${params.externalObservation.provider} at case coordinates. Temporarily reschedule field boundary pegging.`,
        action_type: 'weather_reschedule_survey',
        urgency: 'elevated',
        expected_impact: 'Prevents inaccurate boundary survey demarcations and equipment water damage.',
        expected_benefit: 'Avoids costly remeasurement and boundary disputes caused by inclement weather.',
        confidence: 0.89,
        responsible_stakeholder: 'Survey Officer / Competent Authority',
        reason: `Live meteorological data confirms severe weather (${vals.precipitation_mm ?? 0}mm rain, ${vals.wind_speed_kmh ?? 0}km/h wind).`,
        supporting_evidence: [
          `Observation from ${params.externalObservation.provider} at ${params.externalObservation.observed_at}`,
          `Condition: ${vals.weather_condition || 'Adverse conditions'} (Quality: ${params.externalObservation.quality_score}/100)`,
        ],
        triggering_factors: ['Adverse Meteorological Telemetry'],
        relevant_policy: 'weather_risk_policy',
        source: 'deterministic',
        status: 'proposed',
        is_implemented: false,
        created_at: new Date().toISOString(),
      });
    }
  }

  // 6. Default proactive recommendation if no severe bottlenecks
  if (recommendations.length === 0) {
    recommendations.push({
      id: randomUUID(),
      case_id: params.caseId,
      title: 'Maintain Weekly Gazette & Statutory Review Rhythm',
      description: 'Case milestones are currently proceeding within operational buffers. Continue weekly audit compliance checks.',
      action_type: 'maintain_rhythm',
      urgency: 'routine',
      expected_impact: 'Preserves zero-delay trajectory toward projected completion date.',
      expected_benefit: 'Ensures ongoing statutory compliance with statutory timeline buffers.',
      confidence: 0.90,
      responsible_stakeholder: 'Case Officer',
      reason: 'All active stages are progressing within scheduled SLA tolerances.',
      supporting_evidence: ['Zero critical bottlenecks detected', 'Schedule within SLA targets'],
      triggering_factors: ['Normal Workflow Progression'],
      relevant_policy: 'recommendation_policy',
      source: 'deterministic',
      status: 'proposed',
      is_implemented: false,
      created_at: new Date().toISOString(),
    });
  }

  // Cap recommendations count per policy
  return recommendations.slice(0, recPolicy.max_active_recommendations);
}
