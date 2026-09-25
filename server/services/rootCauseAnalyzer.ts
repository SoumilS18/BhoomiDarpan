import { GoogleGenerativeAI } from '@google/generative-ai';
import { z } from 'zod';
import {
  CaseStageInstance,
  WorkflowStage,
  StageDependency,
  CaseDocument,
  Parcel,
  CaseEvent,
  RootCauseItem,
  ExternalObservation,
  DataDiscrepancy,
} from '../../shared/types';
import { calculateStageDeviations } from './deviationCalculator';
import { getWeatherRiskPolicySync } from './policyEngine';

const RootCauseSchema = z.object({
  cause: z.string(),
  category: z.enum([
    'workflow_dependency',
    'documentation_issue',
    'approval_dependency',
    'dispute_litigation',
    'survey_delay',
    'external_factors',
  ]),
  classification: z.enum([
    'immediate_cause',
    'contributing_factor',
    'upstream_cause',
    'external_contextual_factor',
    'data_quality_limitation',
  ]).optional(),
  evidence: z.string(),
  confidence: z.number().min(0).max(1),
  affected_stage: z.string().optional(),
  relationship_to_delay: z.string(),
});

const RootCauseListSchema = z.array(RootCauseSchema);

export async function analyzeCaseRootCauses(params: {
  caseTitle: string;
  stageInstances: CaseStageInstance[];
  stages: WorkflowStage[];
  dependencies: StageDependency[];
  documents?: CaseDocument[];
  parcels?: Parcel[];
  auditLogs?: CaseEvent[];
  externalObservation?: ExternalObservation | null;
  discrepancies?: DataDiscrepancy[];
  currentDateStr?: string;
  isCaseDelayed?: boolean;
}): Promise<RootCauseItem[]> {
  const currentDate = params.currentDateStr || new Date().toISOString().split('T')[0];
  const enrichedStages = calculateStageDeviations(params.stageInstances, currentDate);

  const deterministicCauses: RootCauseItem[] = [];

  const stageMap = new Map<string, WorkflowStage>();
  params.stages.forEach((s) => stageMap.set(s.id, s));

  // Prerequisite dependency maps: stage_id -> list of dependencies it depends on
  const prereqsMap = new Map<string, StageDependency[]>();
  params.dependencies.forEach((d) => {
    const list = prereqsMap.get(d.stage_id) || [];
    list.push(d);
    prereqsMap.set(d.stage_id, list);
  });

  // 1. Cadastral parcel disputes -> Contributing Factor
  const disputedParcels = (params.parcels || []).filter((p) => p.acquisition_status === 'disputed');
  if (disputedParcels.length > 0) {
    const surveyList = disputedParcels.map((p) => p.survey_number).join(', ');
    deterministicCauses.push({
      cause: `Active title and compensation disputes on ${disputedParcels.length} survey holding(s)`,
      category: 'dispute_litigation',
      classification: 'contributing_factor',
      evidence: `Survey units [${surveyList}] have status "disputed", preventing uncontested award pronouncement and disbursement.`,
      confidence: 0.95,
      relationship_to_delay: 'Direct legal barrier under Section 64/76 preventing disbursement and possession transfer.',
      evidence_sources: ['parcels'],
      policy_ref: 'risk_scoring_weights',
    });
  }

  // 2. Document verification backlogs -> Contributing Factor
  const unverifiedDocs = (params.documents || []).filter((d) => d.status === 'validation_required');
  if (unverifiedDocs.length > 0) {
    deterministicCauses.push({
      cause: `${unverifiedDocs.length} statutory document(s) awaiting mandatory officer verification`,
      category: 'documentation_issue',
      classification: 'contributing_factor',
      evidence: `Legal records including "${unverifiedDocs.map((d) => d.title).slice(0, 2).join('", "')}" require human sign-off before downstream stages proceed.`,
      confidence: 0.90,
      relationship_to_delay: 'Subsequent statutory stages require validated gazette publication and valuation dates.',
      evidence_sources: ['documents'],
      policy_ref: 'risk_scoring_weights',
    });
  }

  // 3. Workflow DAG traversal: Immediate Causes vs Upstream Causes
  for (const inst of enrichedStages) {
    const stageMeta = stageMap.get(inst.stage_id);
    const stageTitle = stageMeta?.title || `Stage ${inst.stage_id}`;

    if (inst.status === 'blocked') {
      const deps = prereqsMap.get(inst.stage_id) || [];
      const unfulfilledDeps = deps.filter((d) => {
        const prereqInst = enrichedStages.find((s) => s.stage_id === d.depends_on_stage_id);
        return !prereqInst || prereqInst.status !== 'completed';
      });

      const prereqTitles = deps
        .map((d) => stageMap.get(d.depends_on_stage_id)?.title)
        .filter(Boolean)
        .join(', ');

      if (unfulfilledDeps.length > 0) {
        // Delayed because prerequisite was not completed -> Upstream Cause
        deterministicCauses.push({
          cause: `Stage "${stageTitle}" blocked by incomplete prerequisite milestone`,
          category: 'workflow_dependency',
          classification: 'upstream_cause',
          evidence: `Prerequisite dependency on [${prereqTitles || 'previous statutory stage'}] is unfulfilled in the workflow DAG; current stage arrested pending clearance.`,
          confidence: 0.93,
          affected_stage: stageTitle,
          relationship_to_delay: 'Downstream workflow progression halted until prerequisite statutory requirements are signed off.',
          evidence_sources: ['stage_dependencies', 'case_stage_instances'],
          policy_ref: 'risk_scoring_weights',
        });
      } else {
        // Blocked on its own active administrative impediment -> Immediate Cause
        deterministicCauses.push({
          cause: `Active administrative blockage on "${stageTitle}"`,
          category: 'workflow_dependency',
          classification: 'immediate_cause',
          evidence: `Stage is marked blocked: ${inst.notes || 'Pending administrative clearance'}.`,
          confidence: 0.91,
          affected_stage: stageTitle,
          relationship_to_delay: 'Directly arrests active critical path advancement.',
          evidence_sources: ['case_stage_instances'],
          policy_ref: 'risk_scoring_weights',
        });
      }
    } else if (inst.status === 'in_progress' && inst.is_overdue && inst.overdue_days >= 5) {
      deterministicCauses.push({
        cause: `Operational SLA exhaustion on "${stageTitle}"`,
        category: 'approval_dependency',
        classification: 'immediate_cause',
        evidence: `Active elapsed duration exceeds SLA target by ${inst.overdue_days} days. Expected completion was ${inst.expected_end_date}.`,
        confidence: 0.88,
        affected_stage: stageTitle,
        relationship_to_delay: `Directly accumulates ${inst.overdue_days} days of critical path delay.`,
        evidence_sources: ['case_stage_instances'],
        policy_ref: 'bottleneck_thresholds',
      });
    }
  }

  // 4. External meteorological observations -> External Contextual Factor or Data Quality Limitation
  if (params.externalObservation) {
    const obs = params.externalObservation;
    const weatherPolicy = getWeatherRiskPolicySync();
    const isStaleOrExpired = obs.freshness_state === 'stale' || obs.freshness_state === 'expired';

    if (isStaleOrExpired) {
      deterministicCauses.push({
        cause: `Outdated meteorological telemetry from ${obs.provider}`,
        category: 'external_factors',
        classification: 'data_quality_limitation',
        evidence: `Observation observed at ${obs.observed_at} is ${obs.freshness_state}; live field weather conditions cannot be confirmed without re-synchronization.`,
        confidence: 0.95,
        relationship_to_delay: 'Uncertainty in live field survey conditions; excluded from statutory delay arithmetic.',
        evidence_sources: [obs.provider],
        policy_ref: 'weather_risk_policy',
      });
    } else if (obs.quality_score >= weatherPolicy.min_quality_score) {
      const vals = obs.normalized_values || {};
      const isSevere =
        (vals.precipitation_mm !== undefined && vals.precipitation_mm >= 50) ||
        (vals.rain_mm !== undefined && vals.rain_mm >= 50) ||
        (vals.wind_speed_kmh !== undefined && vals.wind_speed_kmh >= 60) ||
        (vals.weather_code !== undefined && weatherPolicy.severe_weather_codes.includes(vals.weather_code));

      if (isSevere) {
        deterministicCauses.push({
          cause: `Severe meteorological conditions at site location (${vals.weather_condition || 'Heavy rainfall'})`,
          category: 'external_factors',
          classification: 'external_contextual_factor',
          evidence: `Live weather telemetry from ${obs.provider} reports severe conditions (Precipitation: ${vals.precipitation_mm ?? 0}mm, Wind: ${vals.wind_speed_kmh ?? 0}km/h, Quality: ${obs.quality_score}/100).`,
          confidence: 0.90,
          relationship_to_delay: 'Adverse field weather disrupts on-ground survey, demarcation, and public notice posting.',
          evidence_sources: [obs.provider],
          policy_ref: 'weather_risk_policy',
        });
      }
    }
  }

  // 5. Cross-source data discrepancies -> Data Quality Limitation
  if (params.discrepancies && params.discrepancies.length > 0) {
    const unresolved = params.discrepancies.filter((d) => d.resolution_state === 'unresolved');
    if (unresolved.length > 0) {
      deterministicCauses.push({
        cause: `Unresolved cross-source discrepancy in ${unresolved.map((u) => u.compared_field).join(', ')}`,
        category: 'documentation_issue',
        classification: 'data_quality_limitation',
        evidence: `${unresolved.length} cross-source discrepancy/discrepancies detected between authoritative registry and external sources.`,
        confidence: 0.92,
        relationship_to_delay: 'Requires manual revenue officer field reconciliation before legal notices can be issued.',
        evidence_sources: ['data_discrepancies'],
        policy_ref: 'spatial_discrepancy_policy',
      });
    }
  }

  // 6. Audit log events
  (params.auditLogs || []).forEach((event) => {
    if (event.event_type === 'STAGE_BLOCKED' || event.event_type === 'LITIGATION_STAY_FILED') {
      if (!deterministicCauses.some((c) => c.evidence.includes(event.title))) {
        deterministicCauses.push({
          cause: event.title,
          category: event.event_type === 'LITIGATION_STAY_FILED' ? 'dispute_litigation' : 'workflow_dependency',
          classification: event.event_type === 'LITIGATION_STAY_FILED' ? 'immediate_cause' : 'contributing_factor',
          evidence: event.description || 'Recorded in chronological case event audit ledger.',
          confidence: 0.90,
          relationship_to_delay: 'Historical administrative event contributing to accumulated slippage.',
          evidence_sources: ['case_events'],
        });
      }
    }
  });

  // 7. Insufficient Evidence Rule:
  // If the case is delayed or has delay indications, but ZERO factual evidence items were discovered,
  // return 'insufficient_evidence' rather than inventing plausible causes!
  if (deterministicCauses.length === 0 && params.isCaseDelayed) {
    return [
      {
        cause: 'insufficient_evidence',
        category: 'workflow_dependency',
        classification: 'data_quality_limitation',
        evidence: 'Case timeline exceeds baseline completion date, but no stage blockages, unverified documents, or cadastral disputes are recorded in the system ledger.',
        confidence: 0.50,
        relationship_to_delay: 'Root cause cannot be established without recorded milestone inspection notes.',
        evidence_sources: ['case_stage_instances'],
      },
    ];
  }

  if (deterministicCauses.length === 0) {
    return [];
  }

  // 8. Optional Server-Side Gemini Synthesis
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'your-gemini-api-key' || apiKey.trim() === '') {
    return deterministicCauses;
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const modelName = process.env.GEMINI_MODEL || 'gemini-3.6-flash';
    const model = genAI.getGenerativeModel({
      model: modelName,
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.1,
      },
    });

    const prompt = `You are a specialized statutory land acquisition analyst.
Review the following deterministic evidence items for case "${params.caseTitle}" and synthesize them into concise, structured root cause analyses.
DO NOT invent fictional facts, coordinates, or entities. Rely strictly on the provided evidence.

Evidence Items:
${JSON.stringify(deterministicCauses, null, 2)}

Return a JSON array adhering strictly to this schema:
[
  {
    "cause": "Concise factual root cause summary",
    "category": "workflow_dependency | documentation_issue | approval_dependency | dispute_litigation | survey_delay | external_factors",
    "classification": "immediate_cause | contributing_factor | upstream_cause | external_contextual_factor | data_quality_limitation",
    "evidence": "Factual evidence citing recorded dates, stages, or documents",
    "confidence": 0.0-1.0,
    "affected_stage": "Stage name or undefined",
    "relationship_to_delay": "How this cause translates into downstream delay"
  }
]`;

    const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 2500));
    const result = await Promise.race([model.generateContent(prompt), timeoutPromise]);
    if (result && 'response' in result) {
      const text = result.response.text();
      if (text) {
        const parsed = JSON.parse(text);
        const validation = RootCauseListSchema.safeParse(parsed);
        if (validation.success && validation.data.length > 0) {
          return validation.data as RootCauseItem[];
        }
      }
    }
  } catch (err) {
    console.warn('[RootCauseAnalyzer] Gemini synthesis failed or timed out, returning deterministic causes:', err);
  }

  return deterministicCauses;
}
