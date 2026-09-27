import {
  AcquisitionCase,
  CaseStageInstance,
  WorkflowStage,
  StageDependency,
  CaseDocument,
  Parcel,
  PortfolioOperationsData,
  PortfolioFilterParams,
  AttentionQueueItem,
  PortfolioBottleneckSummary,
  WorkflowPerformanceMetric,
  PortfolioGeoItem,
  CaseStatus,
  CasePriority,
  AttentionQueuePolicy,
  PortfolioMetricMetadata,
  PortfolioOverviewData,
  PortfolioDelayIntelligence,
  PortfolioRiskIntelligence,
  PortfolioBottleneckDetail,
  PortfolioTrendData,
  PortfolioOutcomeData,
  GeographicDrilldownNode,
  PortfolioAttentionPolicy,
  PortfolioTrendPolicy,
  UserRole,
} from '../../shared/types';
import { calculateCaseMetrics, calculateStageDeviations } from './deviationCalculator';
import { calculateDeterministicRiskAssessment } from './riskAssessment';
import { detectCaseBottlenecks } from './bottleneckDetector';
import {
  getAttentionQueueCriteriaSync,
  getPortfolioAttentionPolicySync,
  getPortfolioTrendPolicySync,
} from './policyEngine';
import { AuthenticatedUser } from '../middleware/auth.middleware';
import { getSupabase, isSupabaseConfigured } from '../config/supabase';

export interface CaseEnrichedForPortfolio extends AcquisitionCase {
  dependencies?: StageDependency[];
  workflow_stages?: WorkflowStage[];
  metadata?: Record<string, any>;
  latest_risk?: {
    overall_risk_score: number;
    risk_level: 'critical' | 'high' | 'medium' | 'low';
    factor_breakdown?: any;
    observed_facts?: string[];
  };
}

/**
 * Resolves a case's risk level for FILTERING and reporting purposes.
 *
 * WHY THIS HELPER EXISTS
 *   The portfolio routes read `acquisition_cases` with `*`, so `latest_risk`
 *   is normally absent and the level has to be derived with the same
 *   deterministic assessment the analysis itself uses. Filtering against an
 *   unset `latest_risk` would silently drop every case — a control that
 *   appears active in the UI while returning nothing. This keeps one
 *   authoritative resolution path for both the filter and the metric.
 */
export function resolveCaseRiskLevel(
  c: CaseEnrichedForPortfolio,
  currentDateStr: string,
  dependencies?: StageDependency[]
): 'critical' | 'high' | 'medium' | 'low' {
  if (c.latest_risk?.risk_level) {
    return c.latest_risk.risk_level;
  }

  const stageInstances = calculateStageDeviations(c.stage_instances || [], currentDateStr);
  const stagesList = ((c.stage_instances || []).map((i) => i.stage).filter(
    Boolean
  ) as WorkflowStage[]);

  return calculateDeterministicRiskAssessment({
    caseItem: c,
    stageInstances,
    stages: stagesList,
    dependencies: c.dependencies || dependencies || [],
    documents: c.documents || [],
    parcels: c.parcels || [],
    currentDateStr,
  }).risk_level;
}

/**
 * Extracts a mathematical centroid [lat, lng] from GeoJSON Polygon or MultiPolygon.
 * Returns undefined if geometry is absent or invalid (STRICT ZERO HARDCODING).
 */
export function extractGeometryCentroid(geojson: any): [number, number] | undefined {
  if (!geojson || typeof geojson !== 'object') return undefined;

  let coordinates: number[][] = [];

  try {
    if (geojson.type === 'Polygon' && Array.isArray(geojson.coordinates) && geojson.coordinates[0]) {
      coordinates = geojson.coordinates[0];
    } else if (geojson.type === 'MultiPolygon' && Array.isArray(geojson.coordinates) && geojson.coordinates[0]?.[0]) {
      coordinates = geojson.coordinates[0][0];
    } else if (geojson.type === 'Feature' && geojson.geometry) {
      return extractGeometryCentroid(geojson.geometry);
    } else if (geojson.type === 'FeatureCollection' && Array.isArray(geojson.features) && geojson.features[0]) {
      return extractGeometryCentroid(geojson.features[0]);
    } else if (geojson.type === 'Point' && Array.isArray(geojson.coordinates) && geojson.coordinates.length >= 2) {
      const [lng, lat] = geojson.coordinates;
      if (typeof lat === 'number' && typeof lng === 'number' && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
        return [lat, lng];
      }
    }

    if (coordinates.length === 0) return undefined;

    let sumLat = 0;
    let sumLng = 0;
    let validCount = 0;

    for (const pt of coordinates) {
      if (Array.isArray(pt) && pt.length >= 2) {
        const [lng, lat] = pt;
        if (typeof lat === 'number' && typeof lng === 'number' && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
          sumLat += lat;
          sumLng += lng;
          validCount++;
        }
      }
    }

    if (validCount === 0) return undefined;
    return [Math.round((sumLat / validCount) * 1000000) / 1000000, Math.round((sumLng / validCount) * 1000000) / 1000000];
  } catch {
    return undefined;
  }
}

/**
 * Computes portfolio operations intelligence from real database cases.
 */
export function analyzePortfolioOperations(params: {
  cases: CaseEnrichedForPortfolio[];
  workflows?: Array<{ id: string; name: string; stages?: WorkflowStage[] }>;
  dependencies?: StageDependency[];
  filters?: PortfolioFilterParams;
  currentDateStr?: string;
  policyOverrides?: Partial<PortfolioAttentionPolicy>;
}): PortfolioOperationsData {
  const defaultCriteria = getPortfolioAttentionPolicySync();
  const attentionCriteria: PortfolioAttentionPolicy = {
    ...defaultCriteria,
    ...(params.policyOverrides || {}),
  };
  const currentDate = params.currentDateStr || new Date().toISOString().split('T')[0];
  const filters = params.filters || {};

  // 1. Collect all available filters from full population before filtering
  const allProjectsMap = new Map<string, string>();
  const allStatesSet = new Set<string>();
  const allDistrictsSet = new Set<string>();
  const allWorkflowsMap = new Map<string, string>();
  const allStagesMap = new Map<string, string>();

  for (const c of params.cases) {
    if (c.project?.id && c.project?.name) {
      allProjectsMap.set(c.project.id, c.project.name);
    }
    if (c.state) allStatesSet.add(c.state);
    if (c.district) allDistrictsSet.add(c.district);
    if (c.workflow?.id && c.workflow?.name) {
      allWorkflowsMap.set(c.workflow.id, c.workflow.name);
    }
    (c.stage_instances || []).forEach((inst) => {
      const code = inst.stage?.code || `STAGE_${inst.stage_id}`;
      const title = inst.stage?.title || `Stage ${inst.stage_id}`;
      allStagesMap.set(code, title);
    });
  }

  // 2. Apply multi-dimensional filters
  let filteredCases = params.cases;

  if (filters.project_id) {
    filteredCases = filteredCases.filter((c) => c.project_id === filters.project_id);
  }
  if (filters.state) {
    filteredCases = filteredCases.filter((c) => c.state?.toLowerCase() === filters.state?.toLowerCase());
  }
  if (filters.district) {
    filteredCases = filteredCases.filter((c) => c.district?.toLowerCase() === filters.district?.toLowerCase());
  }
  if (filters.workflow_id) {
    filteredCases = filteredCases.filter((c) => c.workflow_id === filters.workflow_id);
  }
  if (filters.status) {
    filteredCases = filteredCases.filter((c) => c.status === filters.status);
  }
  if (filters.state_lgd_code) {
    filteredCases = filteredCases.filter((c) => c.state_lgd_code === filters.state_lgd_code);
  }
  if (filters.district_lgd_code) {
    filteredCases = filteredCases.filter((c) => c.district_lgd_code === filters.district_lgd_code);
  }
  if (filters.subdistrict_lgd_code) {
    filteredCases = filteredCases.filter(
      (c) => c.subdistrict_lgd_code === filters.subdistrict_lgd_code
    );
  }
  if (filters.village_lgd_code) {
    filteredCases = filteredCases.filter((c) => c.village_lgd_code === filters.village_lgd_code);
  }
  if (filters.risk_level) {
    const wantedRisk = filters.risk_level;
    filteredCases = filteredCases.filter(
      (c) => resolveCaseRiskLevel(c, currentDate, params.dependencies) === wantedRisk
    );
  }
  if (filters.search) {
    const q = filters.search.toLowerCase();
    filteredCases = filteredCases.filter(
      (c) =>
        c.title?.toLowerCase().includes(q) ||
        c.case_number?.toLowerCase().includes(q) ||
        c.village?.toLowerCase().includes(q) ||
        c.district?.toLowerCase().includes(q) ||
        c.project?.name?.toLowerCase().includes(q)
    );
  }

  // 3. Process each case and evaluate real operational metrics
  const attentionQueue: AttentionQueueItem[] = [];
  const geographicCases: PortfolioGeoItem[] = [];
  const bottleneckSummaryMap = new Map<string, {
    stage_code: string;
    stage_title: string;
    delayed_cases: Set<string>;
    critical_count: number;
    high_count: number;
    medium_count: number;
    total_delay_days: number;
    downstream_impact_count: number;
  }>();

  let totalAreaHectares = 0;
  let totalCompensationAllocated = 0;
  let activeCasesCount = 0;
  let delayedCasesCount = 0;
  let atRiskCasesCount = 0;
  let totalProgressSum = 0;
  let totalDelayDaysAccumulated = 0;
  let projectedDelayedCompletionCount = 0;

  const casesByPriority: Record<CasePriority, number> = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
  };

  const casesByStatus: Record<CaseStatus, number> = {
    draft: 0,
    active: 0,
    under_review: 0,
    delayed: 0,
    litigation: 0,
    completed: 0,
  };

  const casesByRisk: Record<string, number> = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
  };

  const casesByState: Record<string, number> = {};
  const casesByStageMap = new Map<string, number>();

  const delayBuckets = {
    on_time: 0,
    minor_1_15d: 0,
    moderate_16_30d: 0,
    severe_over_30d: 0,
  };

  for (const c of filteredCases) {
    totalAreaHectares += Number(c.total_area_hectares || 0);
    totalCompensationAllocated += Number(c.estimated_compensation || 0);

    const status = (c.status || 'active') as CaseStatus;
    if (casesByStatus[status] !== undefined) {
      casesByStatus[status]++;
    }

    const priority = (c.priority || 'medium') as CasePriority;
    if (casesByPriority[priority] !== undefined) {
      casesByPriority[priority]++;
    }

    if (c.state) {
      casesByState[c.state] = (casesByState[c.state] || 0) + 1;
    }

    const enrichedStages = calculateStageDeviations(c.stage_instances || [], currentDate);
    const metrics = calculateCaseMetrics({
      startDate: c.start_date,
      expectedCompletionDate: c.expected_completion_date,
      actualCompletionDate: c.actual_completion_date,
      stageInstances: enrichedStages,
      currentDateStr: currentDate,
    });

    totalProgressSum += metrics.progress_percentage;
    totalDelayDaysAccumulated += metrics.net_delay_days;

    if (status === 'completed') {
      // Completed case
    } else {
      activeCasesCount++;
      if (metrics.is_delayed || status === 'delayed' || status === 'litigation') {
        delayedCasesCount++;
      }
    }

    if (metrics.projected_completion_date > c.expected_completion_date) {
      projectedDelayedCompletionCount++;
    }

    // Delay bucket categorization
    if (metrics.net_delay_days <= 0) {
      delayBuckets.on_time++;
    } else if (metrics.net_delay_days <= 15) {
      delayBuckets.minor_1_15d++;
    } else if (metrics.net_delay_days <= 30) {
      delayBuckets.moderate_16_30d++;
    } else {
      delayBuckets.severe_over_30d++;
    }

    // Track active stage distribution
    const currentStageTitle = metrics.current_stage_title || 'Initiation';
    casesByStageMap.set(currentStageTitle, (casesByStageMap.get(currentStageTitle) || 0) + 1);

    // Compute or read risk assessment
    const unverifiedDocs = (c.documents || []).filter((d) => d.status === 'validation_required' || d.status === 'failed');
    const disputedParcels = (c.parcels || []).filter((p) => p.acquisition_status === 'disputed');

    let riskLevel = c.latest_risk?.risk_level;
    let riskScore = c.latest_risk?.overall_risk_score;

    if (!riskLevel || riskScore === undefined) {
      // Derive deterministically
      const stagesList: WorkflowStage[] = (c.stage_instances || []).map((i) => i.stage).filter(Boolean) as WorkflowStage[];
      const assessment = calculateDeterministicRiskAssessment({
        caseItem: c,
        stageInstances: enrichedStages,
        stages: stagesList,
        dependencies: c.dependencies || params.dependencies || [],
        documents: c.documents || [],
        parcels: c.parcels || [],
        currentDateStr: currentDate,
      });
      riskLevel = assessment.risk_level;
      riskScore = assessment.overall_risk_score;
    }

    casesByRisk[riskLevel] = (casesByRisk[riskLevel] || 0) + 1;
    if (riskLevel === 'critical' || riskLevel === 'high') {
      atRiskCasesCount++;
    }

    // Detect bottlenecks on this case
    const stagesList: WorkflowStage[] = (c.stage_instances || []).map((i) => i.stage).filter(Boolean) as WorkflowStage[];
    const caseBottlenecks = detectCaseBottlenecks({
      caseId: c.id,
      stageInstances: enrichedStages,
      stages: stagesList,
      dependencies: c.dependencies || params.dependencies || [],
      documents: c.documents || [],
      parcels: c.parcels || [],
      currentDateStr: currentDate,
    });

    const hasActiveBottlenecks = caseBottlenecks.length > 0;

    // Aggregate to bottleneckSummaryMap
    for (const b of caseBottlenecks) {
      const code = b.stage_title.replace(/\s+/g, '_').toUpperCase();
      const entry = bottleneckSummaryMap.get(code) || {
        stage_code: code,
        stage_title: b.stage_title,
        delayed_cases: new Set<string>(),
        critical_count: 0,
        high_count: 0,
        medium_count: 0,
        total_delay_days: 0,
        downstream_impact_count: 0,
      };

      entry.delayed_cases.add(c.id);
      entry.total_delay_days += b.deviation_days;
      entry.downstream_impact_count += b.downstream_stages_count;

      if (b.severity === 'critical') entry.critical_count++;
      else if (b.severity === 'high') entry.high_count++;
      else entry.medium_count++;

      bottleneckSummaryMap.set(code, entry);
    }

    // -------------------------------------------------------------
    // Part C: Case Attention Queue Evaluation (Policy-Driven)
    // -------------------------------------------------------------
    const requiresAttention =
      hasActiveBottlenecks ||
      metrics.net_delay_days >= attentionCriteria.delay_days_threshold ||
      status === 'delayed' ||
      status === 'litigation' ||
      (attentionCriteria.flag_critical_risk && riskLevel === 'critical') ||
      (attentionCriteria.flag_high_risk && riskLevel === 'high') ||
      (attentionCriteria.flag_unverified_docs && unverifiedDocs.length > 0) ||
      (attentionCriteria.flag_disputed_parcels && disputedParcels.length > 0) ||
      (attentionCriteria.flag_blocked_stages && metrics.blocked_stages_count > 0) ||
      (attentionCriteria.flag_stale_external_data && (c.metadata as any)?.external_data_stale === true) ||
      (attentionCriteria.flag_cross_source_discrepancies && ((c.metadata as any)?.discrepancy_count || 0) > 0);

    if (requiresAttention) {
      // Build transparent evidence string
      const evidenceParts: string[] = [];
      if (hasActiveBottlenecks) {
        evidenceParts.push(`Active bottleneck on ${caseBottlenecks[0].stage_title} (+${caseBottlenecks[0].deviation_days}d)`);
      } else if (metrics.net_delay_days > 0) {
        evidenceParts.push(`Schedule delayed by ${metrics.net_delay_days} days beyond statutory SLA`);
      }

      if (unverifiedDocs.length > 0) {
        evidenceParts.push(`${unverifiedDocs.length} statutory document(s) awaiting verification`);
      }
      if (disputedParcels.length > 0) {
        evidenceParts.push(`${disputedParcels.length} parcel(s) under active legal dispute`);
      }
      if (metrics.blocked_stages_count > 0) {
        evidenceParts.push(`${metrics.blocked_stages_count} milestone(s) blocked by prerequisite dependencies`);
      }

      attentionQueue.push({
        case_id: c.id,
        case_number: c.case_number,
        title: c.title,
        project_id: c.project_id,
        project_name: c.project?.name,
        state: c.state,
        district: c.district,
        village: c.village,
        current_stage_title: currentStageTitle,
        status,
        priority,
        risk_level: riskLevel,
        risk_score: riskScore,
        primary_evidence: evidenceParts.join(' • ') || 'Calculated high operational risk indicator',
        projected_delay_days: metrics.net_delay_days,
        unverified_docs_count: unverifiedDocs.length,
        disputed_parcels_count: disputedParcels.length,
        has_active_bottleneck: hasActiveBottlenecks,
        last_updated_at: c.updated_at || c.created_at,
      });
    }

    // -------------------------------------------------------------
    // Part B: Geographic Operations Entity
    // -------------------------------------------------------------
    let centroid = extractGeometryCentroid(c.geojson_boundary);
    if (!centroid && (c.parcels || []).length > 0) {
      for (const p of c.parcels || []) {
        centroid = extractGeometryCentroid(p.geojson_geometry);
        if (centroid) break;
      }
    }

    geographicCases.push({
      case_id: c.id,
      case_number: c.case_number,
      title: c.title,
      project_id: c.project_id,
      project_name: c.project?.name,
      state: c.state,
      district: c.district,
      village: c.village,
      status,
      priority,
      risk_level: riskLevel,
      current_stage_title: currentStageTitle,
      total_area_hectares: Number(c.total_area_hectares || 0),
      net_delay_days: metrics.net_delay_days,
      geojson_boundary: c.geojson_boundary || undefined,
      centroid,
    });
  }

  // Sort Attention Queue: critical risk first -> highest delay
  const riskRank = { critical: 4, high: 3, medium: 2, low: 1 };
  attentionQueue.sort((a, b) => {
    const diff = (riskRank[b.risk_level] || 0) - (riskRank[a.risk_level] || 0);
    if (diff !== 0) return diff;
    return b.projected_delay_days - a.projected_delay_days;
  });

  // Convert Bottleneck Summaries
  const bottlenecks: PortfolioBottleneckSummary[] = Array.from(bottleneckSummaryMap.values())
    .map((b) => ({
      stage_code: b.stage_code,
      stage_title: b.stage_title,
      delayed_cases_count: b.delayed_cases.size,
      critical_count: b.critical_count,
      high_count: b.high_count,
      medium_count: b.medium_count,
      average_delay_days: b.delayed_cases.size > 0 ? Math.round(b.total_delay_days / b.delayed_cases.size) : 0,
      total_accumulated_delay_days: b.total_delay_days,
      downstream_impact_count: b.downstream_impact_count,
      affected_case_ids: Array.from(b.delayed_cases),
    }))
    .sort((a, b) => b.delayed_cases_count - a.delayed_cases_count);

  // -------------------------------------------------------------
  // Part E: Workflow Performance Metrics
  // -------------------------------------------------------------
  const workflowPerformance: WorkflowPerformanceMetric[] = [];
  const workflowsList = params.workflows || [];

  // Group filtered cases by workflow
  const casesByWorkflow = new Map<string, CaseEnrichedForPortfolio[]>();
  for (const c of filteredCases) {
    if (c.workflow_id) {
      const list = casesByWorkflow.get(c.workflow_id) || [];
      list.push(c);
      casesByWorkflow.set(c.workflow_id, list);
    }
  }

  for (const [wfId, wfCases] of casesByWorkflow.entries()) {
    const wfDef = workflowsList.find((w) => w.id === wfId);
    const wfName = wfDef?.name || wfCases[0]?.workflow?.name || 'Standard Acquisition';
    const stagesDef = wfDef?.stages || [];

    let completedCount = 0;
    let activeCount = 0;
    let progressSum = 0;

    // Stage duration accumulators
    const stageAccum = new Map<string, {
      stage_id: string;
      code: string;
      title: string;
      expected_days: number;
      actual_days_total: number;
      actual_count: number;
      overdue_count: number;
      completed_count: number;
      total_appearances: number;
    }>();

    for (const c of wfCases) {
      if (c.status === 'completed') completedCount++;
      else activeCount++;

      const enriched = calculateStageDeviations(c.stage_instances || [], currentDate);
      const metrics = calculateCaseMetrics({
        startDate: c.start_date,
        expectedCompletionDate: c.expected_completion_date,
        stageInstances: enriched,
      });
      progressSum += metrics.progress_percentage;

      for (const inst of enriched) {
        const stageId = inst.stage_id;
        const stageMeta = stagesDef.find((s) => s.id === stageId) || inst.stage;
        const code = stageMeta?.code || `STAGE_${stageId}`;
        const title = stageMeta?.title || `Stage ${stageId}`;
        const expectedDays = stageMeta?.default_duration_days || 14;

        const entry = stageAccum.get(stageId) || {
          stage_id: stageId,
          code,
          title,
          expected_days: expectedDays,
          actual_days_total: 0,
          actual_count: 0,
          overdue_count: 0,
          completed_count: 0,
          total_appearances: 0,
        };

        entry.total_appearances++;

        if (inst.status === 'completed' && inst.actual_start_date && inst.actual_end_date) {
          const actualDuration = Math.max(1, Math.round(
            (new Date(inst.actual_end_date).getTime() - new Date(inst.actual_start_date).getTime()) / (1000 * 60 * 60 * 24)
          ));
          entry.actual_days_total += actualDuration;
          entry.actual_count++;
          entry.completed_count++;
        }

        if (inst.delay_days > 0) {
          entry.overdue_count++;
        }

        stageAccum.set(stageId, entry);
      }
    }

    const stageMetrics = Array.from(stageAccum.values()).map((s) => {
      const avgActual = s.actual_count > 0 ? Math.round(s.actual_days_total / s.actual_count) : s.expected_days;
      const deviation = avgActual - s.expected_days;
      const completionRate = s.total_appearances > 0 ? Math.round((s.completed_count / s.total_appearances) * 100) : 0;

      return {
        stage_id: s.stage_id,
        stage_code: s.code,
        stage_title: s.title,
        expected_duration_days: s.expected_days,
        actual_avg_duration_days: avgActual,
        delay_deviation_days: deviation,
        overdue_cases_count: s.overdue_count,
        completion_rate_pct: completionRate,
      };
    });

    workflowPerformance.push({
      workflow_id: wfId,
      workflow_name: wfName,
      total_cases: wfCases.length,
      active_cases: activeCount,
      completed_cases: completedCount,
      average_progress_pct: wfCases.length > 0 ? Math.round(progressSum / wfCases.length) : 0,
      avg_expected_duration_days: stageMetrics.reduce((acc, sm) => acc + sm.expected_duration_days, 0),
      avg_actual_duration_days: stageMetrics.reduce((acc, sm) => acc + sm.actual_avg_duration_days, 0),
      stage_metrics: stageMetrics,
    });
  }

  const totalCases = filteredCases.length;
  const avgProgress = totalCases > 0 ? Math.round(totalProgressSum / totalCases) : 0;

  return {
    summary: {
      total_cases: totalCases,
      active_cases: activeCasesCount,
      delayed_cases: delayedCasesCount,
      at_risk_cases: atRiskCasesCount,
      active_bottlenecks_count: bottlenecks.length,
      projected_delayed_completion_count: projectedDelayedCompletionCount,
      attention_queue_count: attentionQueue.length,
      total_area_hectares: Math.round(totalAreaHectares * 100) / 100,
      total_compensation_allocated: totalCompensationAllocated,
      average_case_progress: avgProgress,
      total_delay_days_accumulated: totalDelayDaysAccumulated,
    },
    attention_queue: attentionQueue,
    bottlenecks,
    workflow_performance: workflowPerformance,
    geographic_cases: geographicCases,
    distributions: {
      by_risk: casesByRisk,
      by_status: casesByStatus,
      by_priority: casesByPriority,
      by_stage: Array.from(casesByStageMap.entries())
        .map(([stage_title, count]) => ({ stage_title, count }))
        .sort((a, b) => b.count - a.count),
      by_state: casesByState,
      delay_buckets: delayBuckets,
    },
    available_filters: {
      projects: Array.from(allProjectsMap.entries()).map(([id, name]) => ({ id, name })),
      states: Array.from(allStatesSet).sort(),
      districts: Array.from(allDistrictsSet).sort(),
      workflows: Array.from(allWorkflowsMap.entries()).map(([id, name]) => ({ id, name })),
      stages: Array.from(allStagesMap.entries()).map(([code, title]) => ({ code, title })),
    },
  };
}

// ============================================================================
// DAY 4: PORTFOLIO & NATIONAL INTELLIGENCE SUB-ANALYZERS
// ============================================================================

export interface AuthorizedScopeFilter {
  isRestricted: boolean;
  projectIds?: string[];
  allowedStates?: string[];
  allowedDistricts?: string[];
  allowedStateLgdCodes?: string[];
  allowedDistrictLgdCodes?: string[];
  userRole: UserRole;
  scopeDescription: string;
}

/**
 * Derives role-aware scope constraints to enforce server-side data partitioning.
 */
export function getAuthorizedScopeFilter(user?: AuthenticatedUser): AuthorizedScopeFilter {
  if (!user) {
    return {
      isRestricted: false,
      userRole: 'viewer',
      scopeDescription: 'Unauthenticated / Default Viewer Scope',
    };
  }

  // Admin and LAO have unrestricted national portfolio visibility
  if (user.role === 'admin' || user.role === 'lao') {
    return {
      isRestricted: false,
      userRole: user.role,
      scopeDescription: 'National / Full Portfolio Unrestricted Scope',
    };
  }

  // Project Officer: scope can be constrained to department/assigned project
  if (user.role === 'project_officer') {
    if (user.department && user.department.startsWith('project:')) {
      const projId = user.department.replace('project:', '').trim();
      return {
        isRestricted: true,
        projectIds: [projId],
        userRole: user.role,
        scopeDescription: `Project Officer Scope: Project ${projId}`,
      };
    }
    return {
      isRestricted: false,
      userRole: user.role,
      scopeDescription: 'Project Officer Operational Scope (All Assigned Projects)',
    };
  }

  // Revenue Inspector: scope can be constrained to assigned state or district (by name or LGD code)
  if (user.role === 'revenue_inspector') {
    if ((user as any).jurisdiction_district_lgd_code) {
      const distCode = String((user as any).jurisdiction_district_lgd_code).trim();
      return {
        isRestricted: true,
        allowedDistrictLgdCodes: [distCode],
        userRole: user.role,
        scopeDescription: `Revenue Inspector Scope: District LGD Code ${distCode}`,
      };
    }
    if ((user as any).jurisdiction_state_lgd_code) {
      const stateCode = String((user as any).jurisdiction_state_lgd_code).trim();
      return {
        isRestricted: true,
        allowedStateLgdCodes: [stateCode],
        userRole: user.role,
        scopeDescription: `Revenue Inspector Scope: State LGD Code ${stateCode}`,
      };
    }
    if (user.department && (user.department.startsWith('lgd_district:') || user.department.startsWith('district_code:'))) {
      const distCode = user.department.replace(/^(lgd_district:|district_code:)/, '').trim();
      return {
        isRestricted: true,
        allowedDistrictLgdCodes: [distCode],
        userRole: user.role,
        scopeDescription: `Revenue Inspector Scope: District LGD Code ${distCode}`,
      };
    }
    if (user.department && (user.department.startsWith('lgd_state:') || user.department.startsWith('state_code:'))) {
      const stateCode = user.department.replace(/^(lgd_state:|state_code:)/, '').trim();
      return {
        isRestricted: true,
        allowedStateLgdCodes: [stateCode],
        userRole: user.role,
        scopeDescription: `Revenue Inspector Scope: State LGD Code ${stateCode}`,
      };
    }
    if ((user as any).jurisdiction_district) {
      const dist = String((user as any).jurisdiction_district).trim();
      return {
        isRestricted: true,
        allowedDistricts: [dist],
        userRole: user.role,
        scopeDescription: `Revenue Inspector Scope: District ${dist}`,
      };
    }
    if ((user as any).jurisdiction_state) {
      const st = String((user as any).jurisdiction_state).trim();
      return {
        isRestricted: true,
        allowedStates: [st],
        userRole: user.role,
        scopeDescription: `Revenue Inspector Scope: State ${st}`,
      };
    }
    if (user.department && user.department.startsWith('state:')) {
      const state = user.department.replace('state:', '').trim();
      return {
        isRestricted: true,
        allowedStates: [state],
        userRole: user.role,
        scopeDescription: `Revenue Inspector Scope: State ${state}`,
      };
    }
    if (user.department && user.department.startsWith('district:')) {
      const district = user.department.replace('district:', '').trim();
      return {
        isRestricted: true,
        allowedDistricts: [district],
        userRole: user.role,
        scopeDescription: `Revenue Inspector Scope: District ${district}`,
      };
    }
    return {
      isRestricted: false,
      userRole: user.role,
      scopeDescription: 'Revenue Inspector Field Operational Scope',
    };
  }

  // Viewer: support departmental/project restrictions or public view
  if (user.role === 'viewer') {
    if (user.department === 'unauthorized' || user.department === 'restricted') {
      return {
        isRestricted: true,
        projectIds: [],
        allowedStates: [],
        allowedDistricts: [],
        allowedStateLgdCodes: [],
        allowedDistrictLgdCodes: [],
        userRole: user.role,
        scopeDescription: 'Restricted / Unauthorized Viewer Scope',
      };
    }
    if (user.department && user.department.startsWith('project:')) {
      const projId = user.department.replace('project:', '').trim();
      return {
        isRestricted: true,
        projectIds: [projId],
        userRole: user.role,
        scopeDescription: `Viewer Scope: Project ${projId}`,
      };
    }
    if (user.department && user.department.startsWith('state:')) {
      const state = user.department.replace('state:', '').trim();
      return {
        isRestricted: true,
        allowedStates: [state],
        userRole: user.role,
        scopeDescription: `Viewer Scope: State ${state}`,
      };
    }
    return {
      isRestricted: false,
      userRole: user.role,
      scopeDescription: 'Viewer Operational Scope (All Public Records)',
    };
  }

  // Approver / Default
  return {
    isRestricted: false,
    userRole: user.role,
    scopeDescription: `${user.role.toUpperCase()} Operational Scope`,
  };
}

/**
 * Applies role-based scope constraints to an array of cases.
 */
export function applyScopeFilter(
  cases: CaseEnrichedForPortfolio[],
  scope: AuthorizedScopeFilter
): CaseEnrichedForPortfolio[] {
  if (!scope.isRestricted) return cases;

  return cases.filter((c) => {
    if (scope.projectIds !== undefined) {
      if (scope.projectIds.length === 0) return false;
      if (!c.project_id || !scope.projectIds.includes(c.project_id)) {
        return false;
      }
    }
    if (scope.allowedStates !== undefined) {
      if (scope.allowedStates.length === 0) return false;
      if (!c.state || !scope.allowedStates.some((s) => s.toLowerCase() === c.state?.toLowerCase())) {
        return false;
      }
    }
    if (scope.allowedDistricts !== undefined) {
      if (scope.allowedDistricts.length === 0) return false;
      if (!c.district || !scope.allowedDistricts.some((d) => d.toLowerCase() === c.district?.toLowerCase())) {
        return false;
      }
    }
    if (scope.allowedStateLgdCodes !== undefined) {
      if (scope.allowedStateLgdCodes.length === 0) return false;
      if (!c.state_lgd_code || !scope.allowedStateLgdCodes.includes(c.state_lgd_code)) {
        return false;
      }
    }
    if (scope.allowedDistrictLgdCodes !== undefined) {
      if (scope.allowedDistrictLgdCodes.length === 0) return false;
      if (!c.district_lgd_code || !scope.allowedDistrictLgdCodes.includes(c.district_lgd_code)) {
        return false;
      }
    }
    return true;
  });
}

/**
 * Authorizes an authenticated user against a specific case according to their project and territorial scope.
 */
export async function authorizeUserForCase(
  user: AuthenticatedUser | undefined,
  caseId: string,
  preloadedCase?: AcquisitionCase
): Promise<{ authorized: boolean; caseItem?: AcquisitionCase; errorStatus: number; errorMessage?: string }> {
  if (!user) {
    return { authorized: false, errorStatus: 401, errorMessage: 'Authentication required' };
  }

  const scope = getAuthorizedScopeFilter(user);

  let targetCase: AcquisitionCase | undefined = preloadedCase;

  if (!targetCase) {
    if (isSupabaseConfigured) {
      try {
        const supabase = getSupabase();
        const { data, error } = await supabase
          .from('acquisition_cases')
          .select('*')
          .eq('id', caseId)
          .single();
        if (!error && data) {
          targetCase = data as AcquisitionCase;
        }
      } catch {
        // Fall through to memory store check
      }
    }
  }

  if (!targetCase) {
    // Check spatial memory store cases if available
    try {
      const { getScopedCases } = await import('./spatialIntelligenceService');
      const allCases = await getScopedCases({ role: 'admin', id: 'sys', full_name: 'System Admin' });
      targetCase = allCases.find((c) => c.id === caseId);
    } catch {
      // Ignore
    }
  }

  // Unrestricted roles (admin, lao, unconstrained project_officer) have nationwide portfolio authority
  if (!scope.isRestricted) {
    return { authorized: true, caseItem: targetCase, errorStatus: 200 };
  }

  if (!targetCase) {
    return { authorized: false, errorStatus: 404, errorMessage: `Case not found: ${caseId}` };
  }

  if (scope.projectIds !== undefined) {
    if (scope.projectIds.length === 0 || !scope.projectIds.includes(targetCase.project_id)) {
      return {
        authorized: false,
        errorStatus: 403,
        errorMessage: `Access denied: User is restricted to project(s) [${scope.projectIds.join(', ')}] but target case belongs to project "${targetCase.project_id}".`,
      };
    }
  }

  if (scope.allowedStates !== undefined) {
    const caseState = (targetCase.state || '').toLowerCase();
    const hasState = scope.allowedStates.some((s) => s.toLowerCase() === caseState);
    if (!hasState) {
      return {
        authorized: false,
        errorStatus: 403,
        errorMessage: `Access denied: User jurisdiction is restricted to state(s) [${scope.allowedStates.join(', ')}] but target case is in "${targetCase.state}".`,
      };
    }
  }

  if (scope.allowedDistricts !== undefined) {
    const caseDist = (targetCase.district || '').toLowerCase();
    const hasDist = scope.allowedDistricts.some((d) => d.toLowerCase() === caseDist);
    if (!hasDist) {
      return {
        authorized: false,
        errorStatus: 403,
        errorMessage: `Access denied: User jurisdiction is restricted to district(s) [${scope.allowedDistricts.join(', ')}] but target case is in "${targetCase.district}".`,
      };
    }
  }

  if (scope.allowedStateLgdCodes !== undefined) {
    const caseStateLgd = targetCase.state_lgd_code;
    if (!caseStateLgd || !scope.allowedStateLgdCodes.includes(caseStateLgd)) {
      return {
        authorized: false,
        errorStatus: 403,
        errorMessage: `Access denied: User jurisdiction is restricted to state LGD code(s) [${scope.allowedStateLgdCodes.join(', ')}] but target case has state LGD code "${targetCase.state_lgd_code}".`,
      };
    }
  }

  if (scope.allowedDistrictLgdCodes !== undefined) {
    const caseDistLgd = targetCase.district_lgd_code;
    if (!caseDistLgd || !scope.allowedDistrictLgdCodes.includes(caseDistLgd)) {
      return {
        authorized: false,
        errorStatus: 403,
        errorMessage: `Access denied: User jurisdiction is restricted to district LGD code(s) [${scope.allowedDistrictLgdCodes.join(', ')}] but target case has district LGD code "${targetCase.district_lgd_code}".`,
      };
    }
  }

  return { authorized: true, caseItem: targetCase, errorStatus: 200 };
}

/**
 * Applies both server-side role scope and query parameters, strictly preventing query param bypass.
 */
export function applyScopeAndQueryParams(
  cases: CaseEnrichedForPortfolio[],
  scope: AuthorizedScopeFilter,
  filters?: PortfolioFilterParams
): CaseEnrichedForPortfolio[] {
  let result = applyScopeFilter(cases, scope);

  if (!filters) return result;

  if (filters.project_id) {
    result = result.filter((c) => c.project_id === filters.project_id);
  }
  if (filters.state) {
    result = result.filter((c) => c.state?.toLowerCase() === filters.state?.toLowerCase());
  }
  if (filters.district) {
    result = result.filter((c) => c.district?.toLowerCase() === filters.district?.toLowerCase());
  }
  if (filters.state_lgd_code) {
    result = result.filter((c) => c.state_lgd_code === filters.state_lgd_code);
  }
  if (filters.district_lgd_code) {
    result = result.filter((c) => c.district_lgd_code === filters.district_lgd_code);
  }
  if (filters.subdistrict_lgd_code) {
    result = result.filter((c) => c.subdistrict_lgd_code === filters.subdistrict_lgd_code);
  }
  if (filters.village_lgd_code) {
    result = result.filter((c) => c.village_lgd_code === filters.village_lgd_code);
  }
  if (filters.workflow_id) {
    result = result.filter((c) => c.workflow_id === filters.workflow_id);
  }
  if (filters.status) {
    result = result.filter((c) => c.status === filters.status);
  }
  if (filters.risk_level) {
    const wantedRisk = filters.risk_level;
    const today = new Date().toISOString().split('T')[0];
    result = result.filter((c) => resolveCaseRiskLevel(c, today) === wantedRisk);
  }
  if (filters.search) {
    const q = filters.search.toLowerCase();
    result = result.filter(
      (c) =>
        c.title?.toLowerCase().includes(q) ||
        c.case_number?.toLowerCase().includes(q) ||
        c.village?.toLowerCase().includes(q) ||
        c.district?.toLowerCase().includes(q) ||
        c.project?.name?.toLowerCase().includes(q)
    );
  }

  return result;
}

/**
 * Executive Portfolio Overview with explicit provenance metadata.
 */
export function analyzePortfolioOverview(params: {
  cases: CaseEnrichedForPortfolio[];
  currentDateStr?: string;
  user?: AuthenticatedUser;
  filters?: PortfolioFilterParams;
}): PortfolioOverviewData {
  const currentDate = params.currentDateStr || new Date().toISOString().split('T')[0];
  const scope = getAuthorizedScopeFilter(params.user);
  const scopedCases = applyScopeAndQueryParams(params.cases, scope, params.filters);

  let activeCount = 0;
  let completedCount = 0;
  let blockedCount = 0;
  let overdueCount = 0;
  let criticalRiskCount = 0;
  let elevatedRiskCount = 0;
  let insufficientEvidenceCount = 0;
  let staleExternalCount = 0;

  for (const c of scopedCases) {
    const status = c.status || 'active';
    if (status === 'completed') {
      completedCount++;
    } else {
      activeCount++;
    }

    const enrichedStages = calculateStageDeviations(c.stage_instances || [], currentDate);
    const metrics = calculateCaseMetrics({
      startDate: c.start_date,
      expectedCompletionDate: c.expected_completion_date,
      actualCompletionDate: c.actual_completion_date,
      stageInstances: enrichedStages,
      currentDateStr: currentDate,
    });

    if (metrics.blocked_stages_count > 0) {
      blockedCount++;
    }

    if (metrics.is_delayed || status === 'delayed' || status === 'litigation') {
      overdueCount++;
    }

    let riskLevel = c.latest_risk?.risk_level;
    if (!riskLevel) {
      const stagesList = (c.stage_instances || []).map((i) => i.stage).filter(Boolean) as WorkflowStage[];
      const assessment = calculateDeterministicRiskAssessment({
        caseItem: c,
        stageInstances: enrichedStages,
        stages: stagesList,
        dependencies: c.dependencies || [],
        documents: c.documents || [],
        parcels: c.parcels || [],
        currentDateStr: currentDate,
      });
      riskLevel = assessment.risk_level;
    }

    if (riskLevel === 'critical') {
      criticalRiskCount++;
      elevatedRiskCount++;
    } else if (riskLevel === 'high') {
      elevatedRiskCount++;
    }

    const docCount = (c.documents || []).length;
    const verifiedDocs = (c.documents || []).filter((d) => d.status === 'verified').length;
    if (docCount === 0 || (docCount > 0 && verifiedDocs === 0)) {
      insufficientEvidenceCount++;
    }

    if (c.metadata?.external_data_stale || c.metadata?.weather_stale) {
      staleExternalCount++;
    }
  }

  const sampleSize = scopedCases.length;
  const evidenceState = sampleSize > 0 ? 'sufficient_evidence' : 'insufficient_history';

  return {
    total_cases: sampleSize,
    active_cases: activeCount,
    completed_cases: completedCount,
    blocked_cases: blockedCount,
    overdue_cases: overdueCount,
    elevated_risk_cases: elevatedRiskCount,
    critical_risk_cases: criticalRiskCount,
    cases_with_insufficient_evidence: insufficientEvidenceCount,
    cases_with_stale_external_data: staleExternalCount,
    metadata: {
      definition: 'Executive operational overview tracking lifecycle progress, milestone bottlenecks, and critical risk flags across acquisition cases.',
      source_tables: ['acquisition_cases', 'case_stage_instances', 'documents', 'parcels'],
      calculation_method: 'Server-side aggregation of live case records, milestone deviation models, and multi-factor risk assessments.',
      time_period: `As of ${currentDate}`,
      sample_size: sampleSize,
      evidence_state: evidenceState,
      notes: scope.isRestricted ? `Filtered by ${scope.scopeDescription}` : undefined,
    },
  };
}

/**
 * Portfolio-level Delay Intelligence with exact median calculation and stage concentration.
 */
export function analyzePortfolioDelays(params: {
  cases: CaseEnrichedForPortfolio[];
  currentDateStr?: string;
  user?: AuthenticatedUser;
  filters?: PortfolioFilterParams;
}): PortfolioDelayIntelligence {
  const currentDate = params.currentDateStr || new Date().toISOString().split('T')[0];
  const scope = getAuthorizedScopeFilter(params.user);
  const scopedCases = applyScopeAndQueryParams(params.cases, scope, params.filters);

  let totalExpectedDuration = 0;
  let totalActualDuration = 0;
  let totalNetDeviation = 0;
  let deterioratingCasesCount = 0;
  let improvingCasesCount = 0;

  const stageDelayMap = new Map<
    string,
    { stage_code: string; stage_title: string; accumulated_delay_days: number; cases_affected: Set<string> }
  >();
  const netDeviations: number[] = [];

  for (const c of scopedCases) {
    const enrichedStages = calculateStageDeviations(c.stage_instances || [], currentDate);
    const metrics = calculateCaseMetrics({
      startDate: c.start_date,
      expectedCompletionDate: c.expected_completion_date,
      actualCompletionDate: c.actual_completion_date,
      stageInstances: enrichedStages,
      currentDateStr: currentDate,
    });

    totalExpectedDuration += metrics.total_expected_days || 0;
    totalActualDuration += metrics.total_actual_days_elapsed || 0;
    totalNetDeviation += metrics.net_delay_days;
    netDeviations.push(metrics.net_delay_days);

    const velocity = metrics.total_stages > 0 ? metrics.completed_stages / metrics.total_stages : 1;
    if (
      metrics.net_delay_days > 0 &&
      (velocity < 0.9 || metrics.projected_completion_date > c.expected_completion_date)
    ) {
      deterioratingCasesCount++;
    } else if (metrics.net_delay_days <= 0 || velocity >= 1.0) {
      improvingCasesCount++;
    }

    for (const inst of enrichedStages) {
      if (inst.delay_days > 0) {
        const code = inst.stage?.code || `STAGE_${inst.stage_id}`;
        const title = inst.stage?.title || `Stage ${inst.stage_id}`;
        const existing = stageDelayMap.get(code) || {
          stage_code: code,
          stage_title: title,
          accumulated_delay_days: 0,
          cases_affected: new Set<string>(),
        };
        existing.accumulated_delay_days += inst.delay_days;
        existing.cases_affected.add(c.id);
        stageDelayMap.set(code, existing);
      }
    }
  }

  // Exact mathematical median
  netDeviations.sort((a, b) => a - b);
  let medianDeviation = 0;
  if (netDeviations.length > 0) {
    const mid = Math.floor(netDeviations.length / 2);
    if (netDeviations.length % 2 === 1) {
      medianDeviation = netDeviations[mid];
    } else {
      medianDeviation = Math.round(((netDeviations[mid - 1] + netDeviations[mid]) / 2) * 10) / 10;
    }
  }

  const sampleSize = scopedCases.length;
  const avgDeviation = sampleSize > 0 ? Math.round((totalNetDeviation / sampleSize) * 10) / 10 : 0;

  const stageConcentration = Array.from(stageDelayMap.values())
    .map((s) => ({
      stage_code: s.stage_code,
      stage_title: s.stage_title,
      accumulated_delay_days: s.accumulated_delay_days,
      cases_affected_count: s.cases_affected.size,
    }))
    .sort((a, b) => b.accumulated_delay_days - a.accumulated_delay_days);

  return {
    aggregate_expected_duration_days: totalExpectedDuration,
    aggregate_actual_duration_days: totalActualDuration,
    aggregate_net_deviation_days: totalNetDeviation,
    average_deviation_days: avgDeviation,
    median_deviation_days: medianDeviation,
    deteriorating_cases_count: deterioratingCasesCount,
    improving_cases_count: improvingCasesCount,
    stage_delay_concentration: stageConcentration,
    metadata: {
      definition: 'Mathematical distribution of schedule delays and milestone deviations across acquisition cases.',
      source_tables: ['case_stage_instances', 'workflow_stages', 'acquisition_cases'],
      calculation_method: 'Median and arithmetic mean of statutory milestone deviations; stage concentration calculated via accumulated delay hours converted to statutory days.',
      time_period: `As of ${currentDate}`,
      sample_size: sampleSize,
      evidence_state: sampleSize > 0 ? 'sufficient_evidence' : 'insufficient_history',
      notes: scope.isRestricted ? `Filtered by ${scope.scopeDescription}` : undefined,
    },
  };
}

/**
 * Portfolio-level Risk Intelligence aggregating multi-factor risk and administrative concentration.
 */
export function analyzePortfolioRisks(params: {
  cases: CaseEnrichedForPortfolio[];
  currentDateStr?: string;
  user?: AuthenticatedUser;
  filters?: PortfolioFilterParams;
}): PortfolioRiskIntelligence {
  const currentDate = params.currentDateStr || new Date().toISOString().split('T')[0];
  const scope = getAuthorizedScopeFilter(params.user);
  const scopedCases = applyScopeAndQueryParams(params.cases, scope, params.filters);

  const distribution = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
  };

  const adminMap = new Map<
    string,
    { state: string; district?: string; high_risk_count: number; critical_risk_count: number; total_cases: number }
  >();
  const stageCategoryMap = new Map<string, { category: string; total_risk_points: number; stages: Set<string> }>();

  let highRiskCount = 0;

  for (const c of scopedCases) {
    const enrichedStages = calculateStageDeviations(c.stage_instances || [], currentDate);
    let riskLevel = c.latest_risk?.risk_level;
    let riskScore = c.latest_risk?.overall_risk_score;

    if (!riskLevel || riskScore === undefined) {
      const stagesList = (c.stage_instances || []).map((i) => i.stage).filter(Boolean) as WorkflowStage[];
      const assessment = calculateDeterministicRiskAssessment({
        caseItem: c,
        stageInstances: enrichedStages,
        stages: stagesList,
        dependencies: c.dependencies || [],
        documents: c.documents || [],
        parcels: c.parcels || [],
        currentDateStr: currentDate,
      });
      riskLevel = assessment.risk_level;
      riskScore = assessment.overall_risk_score;
    }

    if (distribution[riskLevel] !== undefined) {
      distribution[riskLevel]++;
    }

    if (riskLevel === 'critical' || riskLevel === 'high') {
      highRiskCount++;
    }

    // Administrative concentration
    const stateKey = c.state || 'Unassigned';
    const distKey = c.district || undefined;
    const adminKey = `${stateKey}|${distKey || ''}`;
    const adminEntry = adminMap.get(adminKey) || {
      state: stateKey,
      district: distKey,
      high_risk_count: 0,
      critical_risk_count: 0,
      total_cases: 0,
    };
    adminEntry.total_cases++;
    if (riskLevel === 'critical') adminEntry.critical_risk_count++;
    if (riskLevel === 'high') adminEntry.high_risk_count++;
    adminMap.set(adminKey, adminEntry);

    // Stage category concentration
    for (const inst of enrichedStages) {
      if (inst.delay_days > 0) {
        const cat =
          (inst.stage as any)?.category ||
          (inst.stage?.code?.startsWith('SEC_') ? 'statutory' : 'process');
        const code = inst.stage?.code || `STAGE_${inst.stage_id}`;
        const catEntry = stageCategoryMap.get(cat) || {
          category: cat,
          total_risk_points: 0,
          stages: new Set<string>(),
        };
        catEntry.total_risk_points += inst.delay_days * 2;
        catEntry.stages.add(code);
        stageCategoryMap.set(cat, catEntry);
      }
    }
  }

  const sampleSize = scopedCases.length;
  let riskTrend: 'increasing' | 'stable' | 'decreasing' | 'insufficient_history' = 'insufficient_history';
  if (sampleSize < 3) {
    riskTrend = 'insufficient_history';
  } else {
    const elevatedRatio = highRiskCount / sampleSize;
    if (elevatedRatio > 0.4) {
      riskTrend = 'increasing';
    } else if (elevatedRatio < 0.15) {
      riskTrend = 'decreasing';
    } else {
      riskTrend = 'stable';
    }
  }

  const concentrationByAdmin = Array.from(adminMap.values()).sort(
    (a, b) => b.critical_risk_count - a.critical_risk_count || b.high_risk_count - a.high_risk_count
  );

  const concentrationByStageCategory = Array.from(stageCategoryMap.values())
    .map((c) => ({
      category: c.category,
      total_risk_points: c.total_risk_points,
      affected_stages_count: c.stages.size,
    }))
    .sort((a, b) => b.total_risk_points - a.total_risk_points);

  return {
    distribution,
    high_risk_case_count: highRiskCount,
    risk_trend: riskTrend,
    concentration_by_administrative_unit: concentrationByAdmin,
    concentration_by_stage_category: concentrationByStageCategory,
    metadata: {
      definition: 'Multi-factor explainable risk profile aggregating statutory, procedural, cadastral, and dependency risks.',
      source_tables: ['risk_assessments', 'acquisition_cases', 'case_stage_instances', 'documents', 'parcels'],
      calculation_method: 'Deterministic scoring across 4 weighted risk dimensions: schedule delay (40%), dependency blockage (25%), document friction (20%), and cadastral disputes (15%).',
      time_period: `As of ${currentDate}`,
      sample_size: sampleSize,
      evidence_state: sampleSize > 0 ? 'sufficient_evidence' : 'insufficient_history',
      notes: scope.isRestricted ? `Filtered by ${scope.scopeDescription}` : undefined,
    },
  };
}

/**
 * Portfolio Bottleneck Detection with recurring root causes and sample size indicators.
 */
export function analyzePortfolioBottlenecks(params: {
  cases: CaseEnrichedForPortfolio[];
  dependencies?: StageDependency[];
  currentDateStr?: string;
  user?: AuthenticatedUser;
  filters?: PortfolioFilterParams;
}): PortfolioBottleneckDetail[] {
  const currentDate = params.currentDateStr || new Date().toISOString().split('T')[0];
  const scope = getAuthorizedScopeFilter(params.user);
  const scopedCases = applyScopeAndQueryParams(params.cases, scope, params.filters);

  const bottleneckStageMap = new Map<
    string,
    {
      stage_code: string;
      stage_title: string;
      affected_cases: Set<string>;
      critical_count: number;
      high_count: number;
      medium_count: number;
      total_delay_days: number;
      root_cause_counts: Map<string, { category: string; count: number }>;
    }
  >();

  for (const c of scopedCases) {
    const enrichedStages = calculateStageDeviations(c.stage_instances || [], currentDate);
    const stagesList = (c.stage_instances || []).map((i) => i.stage).filter(Boolean) as WorkflowStage[];

    const caseBottlenecks = detectCaseBottlenecks({
      caseId: c.id,
      stageInstances: enrichedStages,
      stages: stagesList,
      dependencies: c.dependencies || params.dependencies || [],
      documents: c.documents || [],
      parcels: c.parcels || [],
      currentDateStr: currentDate,
    });

    for (const b of caseBottlenecks) {
      const code = b.stage_title.replace(/\s+/g, '_').toUpperCase();
      const entry = bottleneckStageMap.get(code) || {
        stage_code: code,
        stage_title: b.stage_title,
        affected_cases: new Set<string>(),
        critical_count: 0,
        high_count: 0,
        medium_count: 0,
        total_delay_days: 0,
        root_cause_counts: new Map<string, { category: string; count: number }>(),
      };

      entry.affected_cases.add(c.id);
      entry.total_delay_days += b.deviation_days;

      if (b.severity === 'critical') entry.critical_count++;
      else if (b.severity === 'high') entry.high_count++;
      else entry.medium_count++;

      if ((b as any).root_causes && Array.isArray((b as any).root_causes)) {
        for (const rc of (b as any).root_causes) {
          const rcKey = rc.cause;
          const existing = entry.root_cause_counts.get(rcKey) || { category: rc.category || 'process', count: 0 };
          existing.count++;
          entry.root_cause_counts.set(rcKey, existing);
        }
      } else {
        const defaultCause = b.evidence || 'Milestone schedule overrun';
        const existing = entry.root_cause_counts.get(defaultCause) || { category: 'schedule', count: 0 };
        existing.count++;
        entry.root_cause_counts.set(defaultCause, existing);
      }

      bottleneckStageMap.set(code, entry);
    }
  }

  return Array.from(bottleneckStageMap.values())
    .map((b) => {
      const affectedCount = b.affected_cases.size;
      const recurringRootCauses = Array.from(b.root_cause_counts.entries())
        .map(([cause, val]) => ({
          cause,
          category: val.category,
          occurrences: val.count,
        }))
        .sort((x, y) => y.occurrences - x.occurrences);

      const topCause = recurringRootCauses[0]?.cause || 'Milestone schedule overrun';
      const sampleSizeLimitation =
        affectedCount < 3
          ? 'Preliminary observation: sample size (< 3 cases) is insufficient for high-confidence systemic root cause attribution.'
          : undefined;

      return {
        stage_code: b.stage_code,
        stage_title: b.stage_title,
        affected_cases_count: affectedCount,
        critical_count: b.critical_count,
        high_count: b.high_count,
        medium_count: b.medium_count,
        total_accumulated_delay_days: b.total_delay_days,
        average_delay_days: affectedCount > 0 ? Math.round(b.total_delay_days / affectedCount) : 0,
        recurring_root_causes: recurringRootCauses,
        evidence_summary: `${affectedCount} case(s) delayed with aggregate ${b.total_delay_days} days. Leading recurring factor: ${topCause}.`,
        sample_size_limitation: sampleSizeLimitation,
      };
    })
    .sort(
      (a, b) =>
        b.affected_cases_count - a.affected_cases_count ||
        b.total_accumulated_delay_days - a.total_accumulated_delay_days
    );
}

/**
 * Portfolio Trend Analysis with explicit handling of insufficient history.
 */
export function analyzePortfolioTrends(params: {
  cases: CaseEnrichedForPortfolio[];
  metricName?: string;
  currentDateStr?: string;
  user?: AuthenticatedUser;
  filters?: PortfolioFilterParams;
  policyOverrides?: Partial<PortfolioTrendPolicy>;
}): PortfolioTrendData {
  const defaultPolicy = getPortfolioTrendPolicySync();
  const policy: PortfolioTrendPolicy = {
    ...defaultPolicy,
    ...(params.policyOverrides || {}),
  };
  const metricName = params.metricName || 'schedule_deviation';
  const scope = getAuthorizedScopeFilter(params.user);
  const scopedCases = applyScopeAndQueryParams(params.cases, scope, params.filters);

  const sampleSize = scopedCases.length;

  if (sampleSize < policy.min_cases_sample_size) {
    return {
      metric_name: metricName,
      observation_window_days: 0,
      baseline_period: { start: '', end: '' },
      current_period: { start: '', end: '' },
      baseline_value: 0,
      current_value: 0,
      delta: 0,
      direction: 'insufficient_history',
      reason: `Insufficient operational history: sample size (${sampleSize}) is fewer than required minimum of ${policy.min_cases_sample_size} cases.`,
      sample_size: sampleSize,
    };
  }

  let minTime = Infinity;
  let maxTime = -Infinity;

  for (const c of scopedCases) {
    const dates = [c.created_at, c.updated_at, c.start_date].filter(Boolean) as string[];
    for (const d of dates) {
      const t = new Date(d).getTime();
      if (!isNaN(t)) {
        if (t < minTime) minTime = t;
        if (t > maxTime) maxTime = t;
      }
    }
  }

  if (minTime === Infinity || maxTime === -Infinity || minTime === maxTime) {
    return {
      metric_name: metricName,
      observation_window_days: 0,
      baseline_period: { start: '', end: '' },
      current_period: { start: '', end: '' },
      baseline_value: 0,
      current_value: 0,
      delta: 0,
      direction: 'insufficient_history',
      reason: 'Missing historical timestamp records to establish an observation window.',
      sample_size: sampleSize,
    };
  }

  const observationWindowDays = Math.round((maxTime - minTime) / (1000 * 60 * 60 * 24));
  const midTime = minTime + (maxTime - minTime) / 2;

  const baselinePeriod = {
    start: new Date(minTime).toISOString().split('T')[0],
    end: new Date(midTime).toISOString().split('T')[0],
  };

  const currentPeriod = {
    start: new Date(midTime).toISOString().split('T')[0],
    end: new Date(maxTime).toISOString().split('T')[0],
  };

  if (observationWindowDays < policy.min_historical_days) {
    return {
      metric_name: metricName,
      observation_window_days: observationWindowDays,
      baseline_period: baselinePeriod,
      current_period: currentPeriod,
      baseline_value: 0,
      current_value: 0,
      delta: 0,
      direction: 'insufficient_history',
      reason: `Observation window (${observationWindowDays} days) is less than statutory policy minimum of ${policy.min_historical_days} days.`,
      sample_size: sampleSize,
    };
  }

  let baselineTotalDelay = 0;
  let baselineCount = 0;
  let currentTotalDelay = 0;
  let currentCount = 0;

  for (const c of scopedCases) {
    const enrichedStages = calculateStageDeviations(c.stage_instances || [], params.currentDateStr);
    const metrics = calculateCaseMetrics({
      startDate: c.start_date,
      expectedCompletionDate: c.expected_completion_date,
      actualCompletionDate: c.actual_completion_date,
      stageInstances: enrichedStages,
      currentDateStr: params.currentDateStr,
    });

    const cTime = new Date(c.created_at || c.start_date).getTime();
    if (cTime < midTime) {
      baselineTotalDelay += metrics.net_delay_days;
      baselineCount++;
    } else {
      currentTotalDelay += metrics.net_delay_days;
      currentCount++;
    }
  }

  const baselineAvg = baselineCount > 0 ? Math.round((baselineTotalDelay / baselineCount) * 10) / 10 : 0;
  const currentAvg = currentCount > 0 ? Math.round((currentTotalDelay / currentCount) * 10) / 10 : baselineAvg;
  const delta = Math.round((currentAvg - baselineAvg) * 10) / 10;

  let direction: 'improving' | 'stable' | 'deteriorating' = 'stable';
  if (delta < -2) {
    direction = 'improving';
  } else if (delta > 2) {
    direction = 'deteriorating';
  } else {
    direction = 'stable';
  }

  return {
    metric_name: metricName,
    observation_window_days: observationWindowDays,
    baseline_period: baselinePeriod,
    current_period: currentPeriod,
    baseline_value: baselineAvg,
    current_value: currentAvg,
    delta,
    direction,
    sample_size: sampleSize,
  };
}

/**
 * Portfolio Outcome Analytics separating simulated, proposed, accepted, and observed outcome states.
 */
export function analyzePortfolioOutcomes(params: {
  cases: CaseEnrichedForPortfolio[];
  recommendations?: any[];
  currentDateStr?: string;
  user?: AuthenticatedUser;
  filters?: PortfolioFilterParams;
}): PortfolioOutcomeData {
  const currentDate = params.currentDateStr || new Date().toISOString().split('T')[0];
  const scope = getAuthorizedScopeFilter(params.user);
  const scopedCases = applyScopeAndQueryParams(params.cases, scope, params.filters);
  const scopedCaseIds = new Set(scopedCases.map((c) => c.id));
  const rawRecs = params.recommendations || [];
  const recs = scope.isRestricted
    ? rawRecs.filter((r) => r.case_id && scopedCaseIds.has(r.case_id))
    : rawRecs;

  let proposedCount = 0;
  let acceptedCount = 0;
  let rejectedCount = 0;
  let completedCount = 0;
  let implementedCount = 0;
  let expectedSavingsTotal = 0;
  let realizedSavingsTotal = 0;
  let observedPostInterventionDelay = 0;
  let measuredSavingsTotal = 0;
  let officerReportedSavingsTotal = 0;
  let insufficientEvidenceCount = 0;
  let measuredCount = 0;
  let officerReportedCount = 0;

  for (const r of recs) {
    const status = r.status || 'proposed';
    if (status === 'proposed' || status === 'active') proposedCount++;
    else if (status === 'accepted') acceptedCount++;
    else if (status === 'rejected') rejectedCount++;
    else if (status === 'completed' || status === 'implemented') {
      completedCount++;
      implementedCount++;
    }

    // Accumulate projected expected savings
    if (r.expected_impact) {
      if (typeof r.expected_impact === 'object' && r.expected_impact.delay_reduction_days !== undefined) {
        expectedSavingsTotal += Number(r.expected_impact.delay_reduction_days) || 0;
      } else if (typeof r.expected_impact === 'number') {
        expectedSavingsTotal += r.expected_impact;
      } else if (typeof r.expected_impact === 'string') {
        const match = r.expected_impact.match(/(\d+)/);
        if (match) {
          expectedSavingsTotal += Number(match[1]) || 0;
        }
      }
    }

    let realizedSavingsForThisRec = 0;
    let hasRecordedOutcome = false;

    if (r.observed_impact) {
      if (r.observed_impact.delay_reduction_days !== undefined) {
        realizedSavingsForThisRec = Number(r.observed_impact.delay_reduction_days);
        realizedSavingsTotal += realizedSavingsForThisRec;
        hasRecordedOutcome = true;
      }
      if (r.observed_impact.post_intervention_delay_days !== undefined) {
        observedPostInterventionDelay += Number(r.observed_impact.post_intervention_delay_days);
        hasRecordedOutcome = true;
      }
      if (r.observed_impact.completion_notes) {
        hasRecordedOutcome = true;
      }
    }

    if (hasRecordedOutcome) {
      // Distinguish measured empirical outcomes from officer qualitative observations
      const evidenceType = r.observed_impact?.evidence_type;
      if (evidenceType === 'measured' || r.observed_impact?.system_calculated?.measured_delay_reduction_days !== undefined) {
        measuredSavingsTotal += Number(r.observed_impact?.system_calculated?.measured_delay_reduction_days ?? realizedSavingsForThisRec);
        measuredCount++;
      } else if (evidenceType === 'officer_reported' || r.observed_impact?.officer_observation?.reported_delay_reduction_days !== undefined) {
        officerReportedSavingsTotal += Number(r.observed_impact?.officer_observation?.reported_delay_reduction_days ?? realizedSavingsForThisRec);
        officerReportedCount++;
      } else if (evidenceType === 'insufficient_evidence') {
        insufficientEvidenceCount++;
      } else if (realizedSavingsForThisRec > 0) {
        officerReportedSavingsTotal += realizedSavingsForThisRec;
        officerReportedCount++;
      }
    }
  }

  const outcomesRecordedCount = measuredCount + officerReportedCount + (insufficientEvidenceCount > 0 && realizedSavingsTotal > 0 ? 1 : 0);
  const outcomeCoveragePct = implementedCount > 0 ? Math.round((outcomesRecordedCount / implementedCount) * 100) : 0;
  const hasInsufficientEvidence = outcomesRecordedCount === 0;

  let stateBreakdown: 'simulated' | 'proposed' | 'accepted' | 'implemented' | 'observed_outcome' = 'proposed';
  if (realizedSavingsTotal > 0 || observedPostInterventionDelay > 0) {
    stateBreakdown = 'observed_outcome';
  } else if (implementedCount > 0) {
    stateBreakdown = 'implemented';
  } else if (acceptedCount > 0) {
    stateBreakdown = 'accepted';
  } else if (proposedCount > 0) {
    stateBreakdown = 'proposed';
  } else {
    stateBreakdown = 'simulated';
  }

  return {
    recommendations: {
      proposed_count: proposedCount,
      accepted_count: acceptedCount,
      rejected_count: rejectedCount,
      completed_count: completedCount,
    },
    interventions: {
      implemented_count: implementedCount,
      outcomes_recorded_count: outcomesRecordedCount,
      outcome_coverage_pct: outcomeCoveragePct,
      has_insufficient_evidence: hasInsufficientEvidence,
      insufficient_historical_evidence: hasInsufficientEvidence,
      observed_post_intervention_delay_days: observedPostInterventionDelay,
      expected_savings_days_total: expectedSavingsTotal,
      realized_savings_days_total: realizedSavingsTotal,
      measured_savings_days_total: measuredSavingsTotal,
      officer_reported_savings_days_total: officerReportedSavingsTotal,
      insufficient_evidence_count: insufficientEvidenceCount,
      evidence_breakdown: {
        measured: measuredCount,
        officer_reported: officerReportedCount,
        insufficient_evidence: insufficientEvidenceCount,
      },
    },
    state_breakdown: stateBreakdown,
    metadata: {
      definition: 'Traceable outcome analysis comparing simulated projections against proposed, accepted, and observed intervention results.',
      source_tables: ['recommendations', 'case_events', 'case_stage_instances'],
      calculation_method: 'Direct status census across case recommendations and post-intervention milestone duration tracking.',
      time_period: `As of ${currentDate}`,
      sample_size: recs.length,
      evidence_state: hasInsufficientEvidence ? 'insufficient_history' : 'sufficient_evidence',
      limitations: hasInsufficientEvidence ? ['insufficient historical evidence: No observed intervention outcomes recorded in portfolio.'] : undefined,
    },
  };
}

/**
 * Geographic drill-down tree building: National -> State -> District -> Case.
 */
export function analyzePortfolioGeography(params: {
  cases: CaseEnrichedForPortfolio[];
  totalUnitsCount?: number;
  currentDateStr?: string;
  user?: AuthenticatedUser;
  filters?: PortfolioFilterParams;
}): GeographicDrilldownNode {
  const currentDate = params.currentDateStr || new Date().toISOString().split('T')[0];
  const isEnrichmentUnavailable = params.totalUnitsCount === 0;
  const mappedState = isEnrichmentUnavailable ? 'administrative_enrichment_unavailable' : 'mapped';
  const scope = getAuthorizedScopeFilter(params.user);
  const scopedCases = applyScopeAndQueryParams(params.cases, scope, params.filters);

  let natTotalCases = 0;
  let natActiveCases = 0;
  let natDelayedCases = 0;
  let natHighRiskCases = 0;
  let natAreaHectares = 0;
  let natNetDelayDays = 0;

  const stateGroups = new Map<string, CaseEnrichedForPortfolio[]>();

  for (const c of scopedCases) {
    const sName = c.state || 'Unassigned State';
    const list = stateGroups.get(sName) || [];
    list.push(c);
    stateGroups.set(sName, list);

    natTotalCases++;
    if (c.status !== 'completed') {
      natActiveCases++;
    }

    const enrichedStages = calculateStageDeviations(c.stage_instances || [], currentDate);
    const metrics = calculateCaseMetrics({
      startDate: c.start_date,
      expectedCompletionDate: c.expected_completion_date,
      actualCompletionDate: c.actual_completion_date,
      stageInstances: enrichedStages,
      currentDateStr: currentDate,
    });

    if (metrics.is_delayed || c.status === 'delayed' || c.status === 'litigation') {
      natDelayedCases++;
    }

    const riskLevel = c.latest_risk?.risk_level;
    if (riskLevel === 'critical' || riskLevel === 'high') {
      natHighRiskCases++;
    }

    natAreaHectares += Number(c.total_area_hectares || 0);
    natNetDelayDays += metrics.net_delay_days;
  }

  const stateNodes: GeographicDrilldownNode[] = [];

  for (const [stateName, stateCases] of stateGroups.entries()) {
    let stateTotalCases = 0;
    let stateActiveCases = 0;
    let stateDelayedCases = 0;
    let stateHighRiskCases = 0;
    let stateAreaHectares = 0;
    let stateNetDelayDays = 0;

    const districtGroups = new Map<string, CaseEnrichedForPortfolio[]>();

    for (const c of stateCases) {
      const dName = c.district || 'Unassigned District';
      const dList = districtGroups.get(dName) || [];
      dList.push(c);
      districtGroups.set(dName, dList);

      stateTotalCases++;
      if (c.status !== 'completed') stateActiveCases++;

      const enrichedStages = calculateStageDeviations(c.stage_instances || [], currentDate);
      const metrics = calculateCaseMetrics({
        startDate: c.start_date,
        expectedCompletionDate: c.expected_completion_date,
        stageInstances: enrichedStages,
        currentDateStr: currentDate,
      });

      if (metrics.is_delayed || c.status === 'delayed' || c.status === 'litigation') {
        stateDelayedCases++;
      }

      if (c.latest_risk?.risk_level === 'critical' || c.latest_risk?.risk_level === 'high') {
        stateHighRiskCases++;
      }

      stateAreaHectares += Number(c.total_area_hectares || 0);
      stateNetDelayDays += metrics.net_delay_days;
    }

    const districtNodes: GeographicDrilldownNode[] = [];

    for (const [districtName, distCases] of districtGroups.entries()) {
      let distTotalCases = 0;
      let distActiveCases = 0;
      let distDelayedCases = 0;
      let distHighRiskCases = 0;
      let distAreaHectares = 0;
      let distNetDelayDays = 0;

      const caseNodes: GeographicDrilldownNode[] = [];

      for (const c of distCases) {
        distTotalCases++;
        if (c.status !== 'completed') distActiveCases++;

        const enrichedStages = calculateStageDeviations(c.stage_instances || [], currentDate);
        const metrics = calculateCaseMetrics({
          startDate: c.start_date,
          expectedCompletionDate: c.expected_completion_date,
          stageInstances: enrichedStages,
          currentDateStr: currentDate,
        });

        const isDelayed = metrics.is_delayed || c.status === 'delayed' || c.status === 'litigation';
        if (isDelayed) distDelayedCases++;

        const isHighRisk = c.latest_risk?.risk_level === 'critical' || c.latest_risk?.risk_level === 'high';
        if (isHighRisk) distHighRiskCases++;

        const area = Number(c.total_area_hectares || 0);
        distAreaHectares += area;
        distNetDelayDays += metrics.net_delay_days;

        const cCentroid = extractGeometryCentroid(c.geojson_boundary);

        caseNodes.push({
          id: `case-${c.id}`,
          name: c.case_number ? `${c.case_number}: ${c.title}` : c.title,
          node_type: 'case',
          mapped_state: cCentroid
            ? 'mapped'
            : isEnrichmentUnavailable
            ? 'administrative_enrichment_unavailable'
            : 'unmapped',
          centroid: cCentroid,
          metrics: {
            total_cases: 1,
            active_cases: c.status !== 'completed' ? 1 : 0,
            delayed_cases: isDelayed ? 1 : 0,
            high_risk_cases: isHighRisk ? 1 : 0,
            total_area_hectares: Math.round(area * 100) / 100,
            net_delay_days: metrics.net_delay_days,
          },
        });
      }

      const distCentroid = caseNodes.find((cn) => cn.centroid)?.centroid;

      districtNodes.push({
        id: `district-${stateName.toLowerCase().replace(/\s+/g, '-')}-${districtName.toLowerCase().replace(/\s+/g, '-')}`,
        name: districtName,
        node_type: 'district',
        mapped_state: mappedState,
        centroid: distCentroid,
        metrics: {
          total_cases: distTotalCases,
          active_cases: distActiveCases,
          delayed_cases: distDelayedCases,
          high_risk_cases: distHighRiskCases,
          total_area_hectares: Math.round(distAreaHectares * 100) / 100,
          net_delay_days: distNetDelayDays,
        },
        children: caseNodes,
      });
    }

    const stateCentroid = districtNodes.find((dn) => dn.centroid)?.centroid;

    stateNodes.push({
      id: `state-${stateName.toLowerCase().replace(/\s+/g, '-')}`,
      name: stateName,
      node_type: 'state',
      mapped_state: mappedState,
      centroid: stateCentroid,
      metrics: {
        total_cases: stateTotalCases,
        active_cases: stateActiveCases,
        delayed_cases: stateDelayedCases,
        high_risk_cases: stateHighRiskCases,
        total_area_hectares: Math.round(stateAreaHectares * 100) / 100,
        net_delay_days: stateNetDelayDays,
      },
      children: districtNodes,
    });
  }

  const nationalCentroid = stateNodes.find((sn) => sn.centroid)?.centroid;

  return {
    id: 'national-root',
    name: 'National Portfolio Overview',
    node_type: 'national',
    mapped_state: mappedState,
    centroid: nationalCentroid,
    metrics: {
      total_cases: natTotalCases,
      active_cases: natActiveCases,
      delayed_cases: natDelayedCases,
      high_risk_cases: natHighRiskCases,
      total_area_hectares: Math.round(natAreaHectares * 100) / 100,
      net_delay_days: natNetDelayDays,
    },
    children: stateNodes,
  };
}

