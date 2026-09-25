import {
  CaseStageInstance,
  WorkflowStage,
  StageDependency,
  BottleneckItem,
  CaseDocument,
  Parcel,
  BottleneckThresholdsPolicy,
} from '../../shared/types';
import { calculateStageDeviations } from './deviationCalculator';
import { calculateDownstreamDAGImpact } from './impactAnalyzer';
import { getBottleneckThresholdsSync } from './policyEngine';
import { detectMissingStageDocuments } from './documentExtractor';

export function detectCaseBottlenecks(params: {
  caseId: string;
  stageInstances: CaseStageInstance[];
  stages: WorkflowStage[];
  dependencies: StageDependency[];
  documents?: CaseDocument[];
  parcels?: Parcel[];
  currentDateStr?: string;
  policyOverrides?: Partial<BottleneckThresholdsPolicy>;
}): BottleneckItem[] {
  const defaultThresholds = getBottleneckThresholdsSync();
  const thresholds: BottleneckThresholdsPolicy = {
    ...defaultThresholds,
    ...(params.policyOverrides || {}),
  };

  const currentDate = params.currentDateStr || new Date().toISOString().split('T')[0];
  const enrichedStages = calculateStageDeviations(params.stageInstances, currentDate);
  const impact = calculateDownstreamDAGImpact({
    stageInstances: params.stageInstances,
    stages: params.stages,
    dependencies: params.dependencies,
    currentDateStr: currentDate,
  });

  const bottlenecks: BottleneckItem[] = [];

  // Stage lookup
  const stageMap = new Map<string, WorkflowStage>();
  params.stages.forEach((s) => stageMap.set(s.id, s));

  // Documents pending or failed by stage_instance_id
  const docIssuesByStage = new Map<string, string[]>();
  (params.documents || []).forEach((doc) => {
    if (doc.stage_instance_id) {
      if (doc.status === 'validation_required') {
        const list = docIssuesByStage.get(doc.stage_instance_id) || [];
        list.push(`Statutory document "${doc.title}" requires officer validation`);
        docIssuesByStage.set(doc.stage_instance_id, list);
      } else if (doc.status === 'failed') {
        const list = docIssuesByStage.get(doc.stage_instance_id) || [];
        list.push(`Extraction failed for "${doc.title}": ${doc.error_details || 'Unprocessed'}`);
        docIssuesByStage.set(doc.stage_instance_id, list);
      }
    }
  });

  // Missing statutory required documents by stage
  const missingReports = detectMissingStageDocuments({
    stages: params.stages,
    stageInstances: params.stageInstances,
    documents: params.documents || [],
  });
  const missingByStageCode = new Map<string, string[]>();
  missingReports.forEach((r) => {
    if (r.missing_documents.length > 0) {
      if (r.stage_code) missingByStageCode.set(r.stage_code, r.missing_documents);
      missingByStageCode.set(r.stage_id, r.missing_documents);
    }
  });

  // Check disputed and unmapped parcels
  const disputedParcels = (params.parcels || []).filter((p) => p.acquisition_status === 'disputed');
  const unmappedParcels = (params.parcels || []).filter((p) => !p.geojson_geometry);

  // Evaluate each stage
  for (const inst of enrichedStages) {
    const stageMeta = stageMap.get(inst.stage_id);
    const stageTitle = stageMeta?.title || inst.stage?.title || `Stage ${inst.stage_id}`;
    const stageNumber = stageMeta?.stage_number || inst.stage?.stage_number;
    const stageCode = stageMeta?.code || inst.stage?.code;

    const downstreamAffected = impact.affected_downstream_stages.filter(
      (s) => s.stage_id !== inst.stage_id && s.delay_shift_days > 0
    );
    const downstreamCount = downstreamAffected.length;
    const downstreamTitles = downstreamAffected.map((s) => s.stage_title);

    let isBottleneck = false;
    let severity: 'low' | 'medium' | 'high' | 'critical' = 'low';
    const evidenceParts: string[] = [];

    // Condition 1: Stage status is explicitly 'blocked'
    if (inst.status === 'blocked') {
      isBottleneck = true;
      severity = downstreamCount >= 2 ? 'critical' : 'high';
      evidenceParts.push(`Stage is explicitly marked BLOCKED (${inst.notes || 'Awaiting statutory prerequisite resolution'})`);
    }

    // Condition 2: Stage is in-progress and overdue beyond configured SLA threshold
    if (inst.status === 'in_progress' && inst.is_overdue && inst.overdue_days >= thresholds.active_overdue_threshold_days) {
      isBottleneck = true;
      if (inst.overdue_days >= thresholds.critical_overdue_days) {
        severity = 'critical';
      } else if (inst.overdue_days >= thresholds.high_overdue_days) {
        severity = 'high';
      } else {
        severity = 'medium';
      }
      evidenceParts.push(`Stage active for ${inst.duration_actual_days || inst.overdue_days} days, exceeding SLA deadline by ${inst.overdue_days} days`);
    }

    // Condition 3: Completed stage with significant historical deviation that created downstream shift
    if (inst.status === 'completed' && inst.delay_days >= thresholds.historical_delay_impact_days && downstreamCount > 0) {
      isBottleneck = true;
      severity = inst.delay_days >= thresholds.critical_overdue_days ? 'high' : 'medium';
      evidenceParts.push(`Completed with ${inst.delay_days} days statutory delay, cascading into downstream schedules`);
    }

    // Condition 4: Stage has unresolved document backlog or missing statutory mandatory documents
    const docIssues = docIssuesByStage.get(inst.id);
    const missingDocs = stageCode ? missingByStageCode.get(stageCode) : undefined;
    if (
      (inst.status === 'in_progress' || inst.status === 'pending_approval') &&
      ((docIssues && docIssues.length > 0) || (missingDocs && missingDocs.length > 0))
    ) {
      isBottleneck = true;
      if (severity === 'low') severity = 'medium';
      if (docIssues && docIssues.length > 0) {
        evidenceParts.push(...docIssues);
      }
      if (missingDocs && missingDocs.length > 0) {
        evidenceParts.push(`Missing mandatory statutory document(s): ${missingDocs.join(', ')}`);
      }
    }

    // Condition 5: Disputed parcels impact valuation or award stages
    if (disputedParcels.length > 0 && (stageTitle.toLowerCase().includes('award') || stageTitle.toLowerCase().includes('compensation') || stageTitle.toLowerCase().includes('possession'))) {
      if (inst.status === 'in_progress' || inst.status === 'not_started') {
        isBottleneck = true;
        severity = disputedParcels.length >= thresholds.disputed_parcels_threshold ? 'critical' : 'high';
        evidenceParts.push(`${disputedParcels.length} parcel(s) flagged under active legal dispute (${disputedParcels.map((p) => p.survey_number).join(', ')})`);
      }
    }

    // Condition 6: Unmapped cadastral parcels arresting survey or preliminary notification stages
    if (
      unmappedParcels.length > 0 &&
      params.parcels &&
      (stageTitle.toLowerCase().includes('survey') || stageCode?.includes('SURVEY') || stageCode?.includes('SEC_11') || stageTitle.toLowerCase().includes('sia') || stageCode?.includes('SEC_4')) &&
      inst.status === 'in_progress'
    ) {
      isBottleneck = true;
      if (severity === 'low') severity = 'medium';
      evidenceParts.push(`${unmappedParcels.length} of ${params.parcels.length} cadastral parcel(s) lack spatial survey demarcation`);
    }

    if (isBottleneck) {
      if (downstreamCount > 0) {
        evidenceParts.push(`Propagating delay into ${downstreamCount} downstream stage(s): ${downstreamTitles.slice(0, 2).join(', ')}${downstreamCount > 2 ? ` (+${downstreamCount - 2} more)` : ''}`);
      }

      bottlenecks.push({
        stage_instance_id: inst.id,
        stage_title: stageTitle,
        stage_number: stageNumber,
        severity,
        evidence: evidenceParts.join('. ') + '.',
        deviation_days: inst.delay_days,
        downstream_stages_count: downstreamCount,
        downstream_stage_titles: downstreamTitles,
        detected_at: new Date().toISOString(),
      });
    }
  }

  // Sort bottlenecks by severity: critical -> high -> medium -> low
  const severityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
  return bottlenecks.sort((a, b) => severityOrder[b.severity] - severityOrder[a.severity]);
}
