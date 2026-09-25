import {
  AcquisitionCase,
  CaseStageInstance,
  WorkflowStage,
  StageDependency,
  CaseDocument,
  Parcel,
  RiskAssessment,
  RiskLevel,
  RiskScoringPolicy,
  RiskBandsPolicy,
  ExternalObservation,
  DataDiscrepancy,
  FactorDetailItem,
  CaseDispute,
} from '../../shared/types';
import { calculateStageDeviations, calculateCaseMetrics } from './deviationCalculator';
import { calculateDownstreamDAGImpact } from './impactAnalyzer';
import { getRiskWeightsSync, getRiskBandsSync, getWeatherRiskPolicySync } from './policyEngine';
import { calculatePredictiveDelay } from './predictiveDelayEngine';
import { detectMissingStageDocuments } from './documentExtractor';
import { evaluateGeometryStatus } from './spatialIntelligenceService';

export interface RiskPolicyOptions {
  weights?: Partial<RiskScoringPolicy>;
  bands?: Partial<RiskBandsPolicy>;
}

export function calculateDeterministicRiskAssessment(params: {
  caseItem: AcquisitionCase;
  stageInstances: CaseStageInstance[];
  stages: WorkflowStage[];
  dependencies: StageDependency[];
  documents?: CaseDocument[];
  parcels?: Parcel[];
  disputes?: CaseDispute[];
  currentDateStr?: string;
  policyOverrides?: RiskPolicyOptions;
  externalObservation?: ExternalObservation | null;
  discrepancies?: DataDiscrepancy[];
}): RiskAssessment {
  const defaultWeights = getRiskWeightsSync();
  const defaultBands = getRiskBandsSync();

  const weights: RiskScoringPolicy = {
    ...defaultWeights,
    ...(params.policyOverrides?.weights || {}),
  };

  const bands: RiskBandsPolicy = {
    ...defaultBands,
    ...(params.policyOverrides?.bands || {}),
  };

  const currentDate = params.currentDateStr || new Date().toISOString().split('T')[0];
  const enrichedStages = calculateStageDeviations(params.stageInstances, currentDate);
  const metrics = calculateCaseMetrics({
    startDate: params.caseItem.start_date,
    expectedCompletionDate: params.caseItem.expected_completion_date,
    stageInstances: enrichedStages,
    currentDateStr: currentDate,
  });

  const impact = calculateDownstreamDAGImpact({
    stageInstances: params.stageInstances,
    stages: params.stages,
    dependencies: params.dependencies,
    currentDateStr: currentDate,
  });

  const observedFacts: string[] = [];
  const factorDetails: FactorDetailItem[] = [];

  // -------------------------------------------------------------
  // Dimension 1: Schedule Delay & SLA Breach Score
  // -------------------------------------------------------------
  const totalExpectedDays = Math.max(1, metrics.total_expected_days);
  const netDelayDays = Math.max(0, impact.projected_net_delay_days || metrics.net_delay_days);
  const delayRatio = netDelayDays / totalExpectedDays;
  const scheduleDelayScore = Math.min(100, Math.round(delayRatio * 150)); // >= 66% delay = 100 score

  if (netDelayDays > 0) {
    observedFacts.push(`Case is currently tracking ${netDelayDays} days beyond baseline statutory SLA.`);
    factorDetails.push({
      factor: 'Schedule SLA Slippage',
      category: 'workflow_deviation',
      impact: Math.round(scheduleDelayScore * weights.schedule_delay_weight),
      weight: weights.schedule_delay_weight,
      evidence: `Net timeline delay of ${netDelayDays} days accumulated across critical path stages (Weight: ${Math.round(weights.schedule_delay_weight * 100)}%).`,
      policy_key: 'risk_scoring_weights',
      status: 'included',
    });
  } else {
    observedFacts.push('Workflow progression is currently on schedule or within SLA buffers.');
    factorDetails.push({
      factor: 'Schedule SLA Slippage',
      category: 'workflow_deviation',
      impact: 0,
      weight: weights.schedule_delay_weight,
      evidence: 'All completed and active milestones are within baseline SLA targets.',
      policy_key: 'risk_scoring_weights',
      status: 'included',
    });
  }

  // -------------------------------------------------------------
  // Dimension 2: Dependency Blockage & Stalling Score
  // -------------------------------------------------------------
  const blockedCount = enrichedStages.filter((s) => s.status === 'blocked').length;
  const overdueActiveCount = enrichedStages.filter(
    (s) => (s.status === 'in_progress' || s.status === 'pending_approval') && s.is_overdue
  ).length;

  const dependencyScore = Math.min(100, blockedCount * 40 + overdueActiveCount * 25);

  if (blockedCount > 0) {
    observedFacts.push(`${blockedCount} statutory stage(s) are explicitly blocked pending external prerequisite completion.`);
    factorDetails.push({
      factor: 'Prerequisite Stage Blockage',
      category: 'dependency_blockage',
      impact: Math.round(blockedCount * 40 * weights.dependency_blockage_weight),
      weight: weights.dependency_blockage_weight,
      evidence: `${blockedCount} blocked stage(s) arresting subsequent workflow advancement (Weight: ${Math.round(weights.dependency_blockage_weight * 100)}%).`,
      policy_key: 'risk_scoring_weights',
      status: 'included',
    });
  }
  if (overdueActiveCount > 0) {
    observedFacts.push(`${overdueActiveCount} active stage(s) are operating past their statutory deadline.`);
    factorDetails.push({
      factor: 'Active Stage Overdue',
      category: 'dependency_blockage',
      impact: Math.round(overdueActiveCount * 25 * weights.dependency_blockage_weight),
      weight: weights.dependency_blockage_weight,
      evidence: `${overdueActiveCount} stage(s) in progress exceed configured duration benchmarks.`,
      policy_key: 'risk_scoring_weights',
      status: 'included',
    });
  }

  // -------------------------------------------------------------
  // Dimension 3: Document Verification & Statutory Friction
  // -------------------------------------------------------------
  const allDocs = params.documents || [];
  const pendingDocs = allDocs.filter((d) => d.status === 'validation_required').length;
  const failedDocs = allDocs.filter((d) => d.status === 'failed' || d.status === 'rejected').length;

  const missingDocReports = detectMissingStageDocuments({
    stages: params.stages,
    stageInstances: params.stageInstances,
    documents: allDocs,
  });
  const activeMissingReports = missingDocReports.filter(
    (r) => r.stage_status === 'in_progress' || r.stage_status === 'pending_approval' || r.stage_status === 'completed'
  );
  const missingRequiredDocsCount = activeMissingReports.reduce((sum, r) => sum + r.missing_documents.length, 0);
  const failedRequiredDocs = activeMissingReports.flatMap((r) =>
    (r.failed_documents || []).map((docType) => `${r.stage_code || r.stage_title} (${docType})`)
  );

  let documentScore = 0;
  if (allDocs.length > 0) {
    const unverifiedRatio = (pendingDocs * 1.5 + failedDocs * 2) / allDocs.length;
    documentScore = Math.min(100, Math.round(unverifiedRatio * 80 + (missingRequiredDocsCount + failedRequiredDocs.length) * 10));
  } else if (missingRequiredDocsCount > 0) {
    documentScore = Math.min(100, missingRequiredDocsCount * 15);
  }

  if (missingRequiredDocsCount > 0) {
    observedFacts.push(`${missingRequiredDocsCount} mandatory statutory document(s) missing from active or completed stages.`);
    factorDetails.push({
      factor: 'Missing Statutory Documents',
      category: 'document_friction',
      impact: Math.round(Math.min(100, missingRequiredDocsCount * 15) * weights.document_friction_weight),
      weight: weights.document_friction_weight,
      evidence: `Active/completed workflow stages lack mandatory statutory instruments: ${activeMissingReports.filter((m) => m.missing_documents.length > 0).map((m) => `${m.stage_code || m.stage_title} (${m.missing_documents.join(', ')})`).join('; ')} (Weight: ${Math.round(weights.document_friction_weight * 100)}%).`,
      policy_key: 'risk_scoring_weights',
      status: 'included',
    });
  }

  if (failedRequiredDocs.length > 0) {
    observedFacts.push(`${failedRequiredDocs.length} mandatory statutory document(s) failed verification and must be re-submitted: ${failedRequiredDocs.join('; ')}.`);
  }

  if (pendingDocs > 0 || failedDocs > 0) {
    observedFacts.push(`${pendingDocs} document(s) await officer validation; ${failedDocs} extraction(s) failed or rejected.`);
    factorDetails.push({
      factor: 'Statutory Document Friction',
      category: 'document_friction',
      impact: Math.round(documentScore * weights.document_friction_weight),
      weight: weights.document_friction_weight,
      evidence: `${pendingDocs} unverified and ${failedDocs} failed legal order(s) in vault (Weight: ${Math.round(weights.document_friction_weight * 100)}%).`,
      policy_key: 'risk_scoring_weights',
      status: 'included',
    });
  }

  // -------------------------------------------------------------
  // Dimension 4: Cadastral Parcel Disputes & Statutory Objections
  // -------------------------------------------------------------
  const allParcels = params.parcels || [];
  const disputedParcels = allParcels.filter((p) => p.acquisition_status === 'disputed').length;
  const allDisputes = params.disputes || [];
  const activeDisputes = allDisputes.filter(
    (d) => d.status !== 'settled' && d.status !== 'dismissed'
  );
  const stayedDisputes = allDisputes.filter(
    (d) => d.stay_order_issued || d.dispute_type === 'tribunal_reference'
  ).length;

  let cadastralScore = 0;
  if (allParcels.length > 0) {
    const effectiveDisputes = Math.max(disputedParcels, activeDisputes.length) + stayedDisputes * 2;
    const disputeRatio = Math.min(1, effectiveDisputes / allParcels.length);
    cadastralScore = Math.min(100, Math.round(disputeRatio * 100));
  } else if (activeDisputes.length > 0) {
    cadastralScore = Math.min(100, activeDisputes.length * 25 + stayedDisputes * 25);
  }

  if (disputedParcels > 0 || activeDisputes.length > 0) {
    observedFacts.push(
      `${disputedParcels} parcel(s) and ${activeDisputes.length} statutory dispute(s)/objection(s) logged (${stayedDisputes} judicial stay/tribunal escalation(s)).`
    );
    factorDetails.push({
      factor: 'Cadastral Litigation & Disputes',
      category: 'cadastral_dispute',
      impact: Math.round(cadastralScore * weights.cadastral_dispute_weight),
      weight: weights.cadastral_dispute_weight,
      evidence: `${disputedParcels} disputed land parcel(s) and ${activeDisputes.length} active dispute(s) (${stayedDisputes} judicial stays) creating statutory award litigation exposure (Weight: ${Math.round(weights.cadastral_dispute_weight * 100)}%).`,
      policy_key: 'risk_scoring_weights',
      status: 'included',
    });
  }

  // --------------------------------------------------------------------------
  // Dimension 5: External Environmental / Weather Conditions (Policy-Driven)
  // --------------------------------------------------------------------------
  let weatherImpact = 0;
  if (params.externalObservation) {
    const obs = params.externalObservation;
    const weatherPolicy = getWeatherRiskPolicySync();
    const isStaleOrExpired = obs.freshness_state === 'stale' || obs.freshness_state === 'expired';

    if (isStaleOrExpired && !weatherPolicy.allow_stale_data_influence) {
      observedFacts.push(
        `External weather from ${obs.provider} (Observed: ${obs.observed_at}, Retrieved: ${obs.retrieved_at}): Data is ${obs.freshness_state}; excluded from statutory risk contribution per weather_risk_policy.`
      );
      factorDetails.push({
        factor: 'External Weather Conditions',
        category: 'external_weather',
        impact: 0,
        evidence: `Meteorological observation from ${obs.provider} is ${obs.freshness_state} (Observed: ${obs.observed_at}); excluded per weather_risk_policy.`,
        policy_key: 'weather_risk_policy',
        freshness_state: obs.freshness_state,
        quality_score: obs.quality_score,
        status: 'excluded',
      });
    } else if (obs.quality_score >= weatherPolicy.min_quality_score) {
      const vals = obs.normalized_values || {};
      const isSevere =
        (vals.precipitation_mm !== undefined && vals.precipitation_mm >= 50) ||
        (vals.rain_mm !== undefined && vals.rain_mm >= 50) ||
        (vals.wind_speed_kmh !== undefined && vals.wind_speed_kmh >= 60) ||
        (vals.weather_code !== undefined && weatherPolicy.severe_weather_codes.includes(vals.weather_code));

      if (isSevere) {
        weatherImpact = weatherPolicy.severe_weather_delay_points;
        observedFacts.push(
          `Adverse meteorological conditions (${vals.weather_condition || 'Severe weather'}) detected via ${obs.provider} (Observed: ${obs.observed_at}, Quality: ${obs.quality_score}/100); field survey operations at risk of delay (+${weatherImpact} pts). Policy: weather_risk_policy.`
        );
        factorDetails.push({
          factor: 'Adverse Weather Friction',
          category: 'external_weather',
          impact: weatherImpact,
          evidence: `Severe meteorological conditions detected by ${obs.provider} at project location (Precipitation: ${vals.precipitation_mm ?? 0}mm, Wind: ${vals.wind_speed_kmh ?? 0}km/h). Condition: ${vals.weather_condition || 'Severe'}. Observed: ${obs.observed_at}. Retrieved: ${obs.retrieved_at}. Freshness: ${obs.freshness_state}. Quality: ${obs.quality_score}/100 (Threshold: ${weatherPolicy.min_quality_score}). Field survey delay risk elevated (+${weatherImpact} pts) per weather_risk_policy.`,
          policy_key: 'weather_risk_policy',
          freshness_state: obs.freshness_state,
          quality_score: obs.quality_score,
          status: 'included',
        });
      } else {
        observedFacts.push(
          `External weather from ${obs.provider} (${vals.weather_condition || 'Normal'}, Observed: ${obs.observed_at}): Available as contextual information; normal weather does not add risk points.`
        );
        factorDetails.push({
          factor: 'External Weather Conditions',
          category: 'external_weather',
          impact: 0,
          evidence: `Atmospheric readings from ${obs.provider} (${vals.weather_condition || 'Normal'}, ${vals.precipitation_mm ?? 0}mm) within standard operational tolerance.`,
          policy_key: 'weather_risk_policy',
          freshness_state: obs.freshness_state,
          quality_score: obs.quality_score,
          status: 'included',
        });
      }
    } else {
      observedFacts.push(
        `External weather from ${obs.provider}: Quality score (${obs.quality_score}/100) below statutory threshold (${weatherPolicy.min_quality_score}/100); excluded from statutory risk contribution.`
      );
      factorDetails.push({
        factor: 'External Weather Conditions',
        category: 'external_weather',
        impact: 0,
        evidence: `Observation quality score (${obs.quality_score}/100) from ${obs.provider} is below minimum threshold (${weatherPolicy.min_quality_score}/100); excluded per weather_risk_policy.`,
        policy_key: 'weather_risk_policy',
        freshness_state: obs.freshness_state,
        quality_score: obs.quality_score,
        status: 'excluded',
      });
    }
  }

  // -------------------------------------------------------------
  // Dimension 6: Cross-Source Data Discrepancies
  // -------------------------------------------------------------
  let discrepancyImpact = 0;
  if (params.discrepancies && params.discrepancies.length > 0) {
    const unresolved = params.discrepancies.filter((d) => d.resolution_state === 'unresolved');
    if (unresolved.length > 0) {
      discrepancyImpact = Math.min(10, unresolved.length * 5);
      observedFacts.push(
        `${unresolved.length} cross-source discrepancy/discrepancies pending officer reconciliation.`
      );
      factorDetails.push({
        factor: 'Cross-Source Data Discrepancies',
        category: 'cross_source_discrepancy',
        impact: discrepancyImpact,
        evidence: `${unresolved.length} unresolved cross-source discrepancy/discrepancies (${unresolved.map((u) => u.compared_field).join(', ')}) require revenue officer verification.`,
        policy_key: 'spatial_discrepancy_policy',
        status: 'included',
      });
    }
  }

  // -------------------------------------------------------------
  // Dimension 7: Spatial Geometry Quality & Cadastral Demarcation
  // -------------------------------------------------------------
  let spatialImpact = 0;
  const geomEval = evaluateGeometryStatus(params.caseItem.geojson_boundary, params.parcels || []);

  if (geomEval.status === 'invalid_geometry') {
    spatialImpact = 15;
    observedFacts.push(`Corridor boundary geometry failed statutory GeoJSON validation: ${geomEval.issues.join('; ')} (insufficient spatial evidence).`);
    factorDetails.push({
      factor: 'Spatial Geometry Invalidity',
      category: 'spatial_quality',
      impact: spatialImpact,
      evidence: `Corridor boundary geometry failed polygon closure or coordinate bounds validation (insufficient spatial evidence). Issues: ${geomEval.issues.join('; ')}.`,
      policy_key: 'spatial_discrepancy_policy',
      status: 'included',
    });
  } else if (geomEval.status === 'unmapped') {
    observedFacts.push('Corridor boundary is unmapped; administrative and spatial context is unavailable.');
    factorDetails.push({
      factor: 'Unmapped Spatial Boundary',
      category: 'spatial_quality',
      impact: 0,
      evidence: 'Case boundary geometry is unmapped (administrative and spatial context unavailable).',
      policy_key: 'spatial_discrepancy_policy',
      status: 'contextual',
    });
  } else if (geomEval.status === 'partially_mapped') {
    const unmappedParcels = (params.parcels || []).filter((p) => !p.geojson_geometry).length;
    if (unmappedParcels > 0) {
      spatialImpact = Math.min(8, unmappedParcels * 2);
      observedFacts.push(`Corridor is partially mapped with ${unmappedParcels} parcel(s) lacking spatial demarcation (reduced spatial confidence).`);
      factorDetails.push({
        factor: 'Incomplete Cadastral Demarcation',
        category: 'spatial_quality',
        impact: spatialImpact,
        evidence: `${unmappedParcels} cadastral parcel(s) lack spatial polygon boundary survey (reduced spatial confidence).`,
        policy_key: 'spatial_discrepancy_policy',
        status: 'included',
      });
    } else {
      observedFacts.push('Corridor boundary is partially mapped; reduced spatial confidence.');
      factorDetails.push({
        factor: 'Partially Mapped Boundary',
        category: 'spatial_quality',
        impact: 4,
        evidence: 'Corridor boundary partially demarcated (reduced spatial confidence).',
        policy_key: 'spatial_discrepancy_policy',
        status: 'included',
      });
    }
  } else if (geomEval.status === 'administrative_enrichment_unavailable') {
    observedFacts.push('Administrative GIS enrichment is unavailable for this jurisdiction; administrative context unavailable.');
    factorDetails.push({
      factor: 'Administrative Enrichment Unavailable',
      category: 'spatial_quality',
      impact: 0,
      evidence: 'Administrative directory boundary enrichment unavailable (administrative context unavailable).',
      policy_key: 'spatial_discrepancy_policy',
      status: 'contextual',
    });
  } else if (geomEval.status === 'mapped') {
    observedFacts.push('Corridor boundary and cadastral parcels are fully demarcated with valid GIS coordinates.');
    factorDetails.push({
      factor: 'Verified Spatial Demarcation',
      category: 'spatial_quality',
      impact: 0,
      evidence: 'Boundary polygon and cadastral parcels demarcated with valid GIS coordinates.',
      policy_key: 'spatial_discrepancy_policy',
      status: 'included',
    });
  }

  // -------------------------------------------------------------
  // Composite Weighted Calculation (Data-Driven from Configured Policy)
  // -------------------------------------------------------------
  const baseScore = Math.round(
    scheduleDelayScore * weights.schedule_delay_weight +
    dependencyScore * weights.dependency_blockage_weight +
    documentScore * weights.document_friction_weight +
    cadastralScore * weights.cadastral_dispute_weight
  );
  const compositeScore = Math.min(100, Math.max(0, baseScore + weatherImpact + discrepancyImpact + spatialImpact));

  let riskLevel: RiskLevel = 'low';
  if (compositeScore >= bands.critical_threshold) {
    riskLevel = 'critical';
  } else if (compositeScore >= bands.high_threshold) {
    riskLevel = 'high';
  } else if (compositeScore >= bands.medium_threshold) {
    riskLevel = 'medium';
  }

  // Inferences strictly derived from observed facts
  const aiInferences: string[] = [];
  if (riskLevel === 'critical' || riskLevel === 'high') {
    aiInferences.push(`Projected completion shifted to ${impact.projected_completion_date} (${netDelayDays} days delay) unless parallel administrative intervention is applied.`);
  }
  if (blockedCount > 0) {
    aiInferences.push('Clearing blocked dependencies is the highest leverage mitigation on the critical path.');
  }
  if (disputedParcels > 0) {
    aiInferences.push('Special land acquisition tribunal reference (Section 64/76) recommended to prevent award stay.');
  }
  if (aiInferences.length === 0) {
    aiInferences.push('Statutory milestones proceeding within normal operational tolerances.');
  }

  // Run predictive delay engine to enrich risk assessment
  const { estimate: predictiveDelay, evidenceLedger } = calculatePredictiveDelay({
    caseItem: params.caseItem,
    stageInstances: params.stageInstances,
    stages: params.stages,
    dependencies: params.dependencies,
    documents: params.documents,
    parcels: params.parcels,
    externalObservation: params.externalObservation,
    discrepancies: params.discrepancies,
    currentDateStr: currentDate,
  });

  // Confidence is high when based on complete workflow records
  const confidence = allDocs.length > 0 && allParcels.length > 0 ? 0.95 : 0.85;

  return {
    case_id: params.caseItem.id,
    overall_risk_score: compositeScore,
    risk_level: riskLevel,
    confidence,
    predicted_delay_days: netDelayDays,
    factor_breakdown: {
      schedule_delay_score: scheduleDelayScore,
      dependency_blockage_score: dependencyScore,
      missing_documents_score: documentScore,
      cadastral_dispute_score: cadastralScore,
      weather_impact_score: weatherImpact,
      discrepancy_impact_score: discrepancyImpact,
      spatial_impact_score: spatialImpact,
      missing_document_reports: missingDocReports,
      details: factorDetails,
      predictive_delay: predictiveDelay,
      uncertainty_flags: predictiveDelay.limitations,
    },
    observed_facts: observedFacts,
    ai_inferences: aiInferences,
    evidence_ledger: evidenceLedger,
    model_version: 'bhoomisetu-risk-v3.0-predictive-explainable',
    generated_at: new Date().toISOString(),
  };
}
