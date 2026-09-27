// =======================================================
// BhoomiSetu - Core Domain Types & Data Models
// =======================================================

export type UserRole = 
  | 'admin'
  | 'project_officer'
  | 'lao'               // Land Acquisition Officer / Collector
  | 'revenue_inspector'
  | 'legal_officer'
  | 'approver'
  | 'viewer';

export interface UserProfile {
  id: string;
  auth_user_id?: string;
  email: string;
  full_name: string;
  role: UserRole;
  department: string;
  jurisdiction_state?: string;
  jurisdiction_district?: string;
  jurisdiction_state_lgd_code?: string;
  jurisdiction_district_lgd_code?: string;
  jurisdiction_subdistrict_lgd_code?: string;
  phone?: string;
  created_at: string;
  updated_at: string;
}

export type ProjectType = 
  | 'highway'
  | 'railway'
  | 'irrigation'
  | 'metro'
  | 'industrial'
  | 'urban'
  | 'energy'
  | 'airport';

export type ProjectStatus = 'planning' | 'in_progress' | 'delayed' | 'completed' | 'halted';

export interface Project {
  id: string;
  code: string;
  name: string;
  description?: string;
  project_type: ProjectType;
  sponsoring_agency: string;
  estimated_budget?: number;
  target_completion_date?: string;
  status: ProjectStatus;
  state: string;
  district?: string;
  state_lgd_code?: string;
  district_lgd_code?: string;
  subdistrict_lgd_code?: string;
  geojson_boundary?: any;
  created_at: string;
  updated_at: string;
}

// Configurable Workflow Schema
export interface Workflow {
  id: string;
  code: string;
  name: string;
  description?: string;
  is_active: boolean;
  version: string;
  legal_framework?: string; // e.g. "RFCTLARR Act 2013", "NHAI Act 1956", "State Direct Purchase"
  created_at: string;
  updated_at: string;
  stages?: WorkflowStage[];
}

export interface WorkflowStage {
  id: string;
  workflow_id: string;
  stage_number: number;
  code: string;
  title: string;
  description?: string;
  default_duration_days: number;
  is_mandatory: boolean;
  required_role?: UserRole;
  required_documents: string[]; // List of required document types
  completion_criteria: StageCompletionCriteria;
  escalation_threshold_days: number;
  dependencies?: StageDependency[];
  created_at: string;
}

export interface StageCompletionCriteria {
  requires_all_documents?: boolean;
  requires_approval?: boolean;
  requires_survey_verified?: boolean;
  required_evidence_count?: number;
  required_dependent_stages?: string[];
  required_conditions?: {
    no_active_stay_orders?: boolean;
    no_unresolved_disputes?: boolean;
    all_parcels_mapped?: boolean;
    min_parcels_count?: number;
  };
  custom_rules?: string[];
}

export type DependencyType = 'finish_to_start' | 'start_to_start' | 'finish_to_finish';

export interface StageDependency {
  id: string;
  stage_id: string;
  depends_on_stage_id: string;
  dependency_type: DependencyType;
  lag_days: number;
  depends_on_stage?: WorkflowStage;
}

export type CaseStatus = 'draft' | 'active' | 'under_review' | 'delayed' | 'litigation' | 'completed';
export type CasePriority = 'low' | 'medium' | 'high' | 'critical';

export interface AcquisitionCase {
  id: string;
  case_number: string;
  project_id: string;
  workflow_id: string;
  title: string;
  description?: string;
  state: string;
  district: string;
  tehsil?: string;
  village: string;
  state_lgd_code?: string;
  district_lgd_code?: string;
  subdistrict_lgd_code?: string;
  village_lgd_code?: string;
  total_area_hectares: number;
  estimated_compensation: number;
  status: CaseStatus;
  priority: CasePriority;
  start_date: string;
  expected_completion_date: string;
  actual_completion_date?: string;
  assigned_officer_id?: string;
  geojson_boundary?: Record<string, any>;
  created_at: string;
  updated_at: string;

  // Joined relations
  project?: Project;
  workflow?: Workflow;
  assigned_officer?: UserProfile;
  stage_instances?: CaseStageInstance[];
  parcels?: Parcel[];
  documents?: CaseDocument[];
  audit_logs?: CaseEvent[];
  calculated_metrics?: CaseCalculatedMetrics;
}

export type StageInstanceStatus = 
  | 'not_started'
  | 'in_progress'
  | 'pending_approval'
  | 'completed'
  | 'blocked'
  | 'skipped';

export interface CaseStageInstance {
  id: string;
  case_id: string;
  stage_id: string;
  status: StageInstanceStatus;
  expected_start_date: string;
  expected_end_date: string;
  actual_start_date?: string;
  actual_end_date?: string;
  delay_days: number;
  notes?: string;
  completed_by?: string;
  updated_at: string;

  // Joined stage definition
  stage?: WorkflowStage;
}

export interface Parcel {
  id: string;
  case_id: string;
  survey_number: string;
  khata_number?: string;
  landowner_names: string[];
  land_type: string;
  area_acres: number;
  compensation_amount: number;
  acquisition_status: 'identified' | 'notified' | 'valued' | 'awarded' | 'disbursed' | 'possessed' | 'disputed';
  geojson_geometry?: Record<string, any>;
  created_at: string;
}

export type DocumentType = 
  | 'preliminary_notice'
  | 'sec_11_notification'
  | 'hearing_minutes'
  | 'survey_report'
  | 'valuation_record'
  | 'sec_19_declaration'
  | 'award_order'
  | 'possession_memo'
  | 'litigation_filing'
  | 'miscellaneous';

export type DocumentStatus = 
  | 'uploaded'
  | 'processing'
  | 'processed'
  | 'extracted'
  | 'validation_required'
  | 'verified'
  | 'rejected'
  | 'failed';

export interface CaseDocument {
  id: string;
  case_id: string;
  stage_instance_id?: string;
  title: string;
  document_type: DocumentType;
  file_url: string;
  storage_path?: string;
  file_size_bytes?: number;
  mime_type?: string;
  status: DocumentStatus;
  error_details?: string;
  uploaded_by?: string;
  uploaded_at: string;
  extractions?: DocumentExtraction[];
}

export interface ExtractedFieldItem {
  value: any;
  confidence: number;
  evidence?: string;
  status?: 'accepted' | 'edited' | 'rejected' | 'uncertain';
}

export interface StructuredExtractionData {
  document_type?: string;
  referenced_dates?: Array<{ label: string; date: string; relevance?: string; confidence?: number }>;
  project_identifiers?: string[];
  case_identifiers?: string[];
  parcel_survey_numbers?: string[];
  area_mentioned?: string;
  parties?: Array<{ name: string; role?: string }>;
  authorities?: string[];
  deadlines?: Array<{ label: string; date: string; urgency?: string }>;
  monetary_values?: Array<{ amount: number | string; currency: string; purpose?: string }>;
  missing_or_uncertain_information?: string[];
  summary?: string;
  [key: string]: any;
}

export interface DocumentExtraction {
  id: string;
  document_id: string;
  raw_text?: string;
  structured_data: StructuredExtractionData;
  human_edited_data?: StructuredExtractionData | null;
  validation_notes?: string;
  validation_status: 'pending' | 'accepted' | 'edited' | 'rejected';
  confidence_score: number;
  is_verified: boolean;
  verified_by?: string;
  verified_at?: string;
  created_at: string;
}

export interface CaseEvent {
  id: string;
  case_id?: string | null;
  project_id?: string | null;
  stage_instance_id?: string | null;
  event_type: string; // 'CASE_CREATED', 'PROJECT_CREATED', 'STAGE_STARTED', 'STAGE_COMPLETED', 'STAGE_BLOCKED', 'DOCUMENT_UPLOADED', 'SIMULATION_RUN', 'POLICY_UPDATED'
  title: string;
  description?: string;
  metadata?: Record<string, any>;
  actor_id?: string;
  actor_name: string;
  created_at: string;
}

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export type RootCauseClassification =
  | 'immediate_cause'
  | 'contributing_factor'
  | 'upstream_cause'
  | 'external_contextual_factor'
  | 'data_quality_limitation';

export type EvidenceClassification =
  | 'observed_fact'
  | 'calculated_metric'
  | 'policy_derived_risk'
  | 'predictive_estimate'
  | 'ai_generated_interpretation';

export interface EvidenceItem {
  id: string;
  statement: string;
  classification: EvidenceClassification;
  source: string;
  confidence: number;
  timestamp?: string;
  policy_key?: string;
  entity_ref?: string;
  is_stale_or_excluded?: boolean;
}

export interface PredictiveDelayEstimate {
  current_stage_delay_risk_days: number;
  expected_additional_delay_days: number;
  min_projected_delay_days: number;
  max_projected_delay_days: number;
  confidence: number; // 0.0 - 1.0
  probability_of_further_delay: number; // 0.0 - 1.0
  historical_velocity_ratio: number;
  projected_completion_date: string;
  affected_downstream_stages_count: number;
  major_contributing_factors: string[];
  limitations: string[];
  methodology: 'historical_velocity_and_critical_path_dag' | 'statutory_baseline_only';
}

export interface FactorDetailItem {
  factor: string;
  category?: string;
  impact: number;
  weight?: number;
  evidence: string;
  policy_key?: string;
  provenance_id?: string;
  freshness_state?: string;
  quality_score?: number;
  status?: 'included' | 'excluded' | 'contextual';
}

export interface RiskAssessment {
  id?: string;
  case_id: string;
  overall_risk_score: number; // 0 - 100
  risk_level: RiskLevel;
  confidence: number; // 0.0 - 1.0
  predicted_delay_days: number;
  factor_breakdown: {
    schedule_delay_score: number;
    dependency_blockage_score: number;
    missing_documents_score: number;
    cadastral_dispute_score: number;
    weather_impact_score?: number;
    discrepancy_impact_score?: number;
    spatial_impact_score?: number;
    missing_document_reports?: MissingDocumentReport[];
    details: FactorDetailItem[];
    predictive_delay?: PredictiveDelayEstimate;
    uncertainty_flags?: string[];
  };
  observed_facts: string[];
  ai_inferences: string[];
  evidence_ledger?: EvidenceItem[];
  model_version?: string;
  generated_at: string;
}

export interface BottleneckItem {
  id?: string;
  stage_instance_id: string;
  stage_title: string;
  stage_number?: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  evidence: string;
  deviation_days: number;
  downstream_stages_count: number;
  downstream_stage_titles: string[];
  detected_at: string;
}

export interface RootCauseItem {
  cause: string;
  category: 'workflow_dependency' | 'documentation_issue' | 'approval_dependency' | 'dispute_litigation' | 'survey_delay' | 'external_factors';
  classification?: RootCauseClassification;
  evidence: string;
  confidence: number;
  affected_stage?: string;
  relationship_to_delay: string;
  evidence_sources?: string[];
  policy_ref?: string;
}

export interface StageScheduleProjected {
  stage_id: string;
  stage_title: string;
  original_expected_start: string;
  original_expected_end: string;
  projected_start: string;
  projected_end: string;
  delay_shift_days: number;
  is_on_critical_path: boolean;
  impact_type?: 'direct_delay' | 'propagated_delay';
  slack_days?: number;
}

export interface DownstreamImpactResult {
  current_affected_stage: string;
  projected_net_delay_days: number;
  baseline_completion_date: string;
  projected_completion_date: string;
  affected_downstream_stages: StageScheduleProjected[];
  critical_path_stages_count?: number;
  direct_delay_days?: number;
  propagated_delay_days?: number;
}

export interface Recommendation {
  id: string;
  case_id: string;
  stage_instance_id?: string;
  title: string;
  description: string;
  action_type: string;
  urgency: 'routine' | 'elevated' | 'critical';
  expected_impact: string;
  confidence: number;
  responsible_stakeholder?: string;
  reason?: string;
  supporting_evidence?: string[];
  source?: 'deterministic' | 'ai';
  status?: 'proposed' | 'accepted' | 'rejected' | 'implemented' | 'completed';
  is_implemented: boolean;
  relevant_policy?: string;
  expected_benefit?: string;
  triggering_factors?: string[];
  observed_impact?: ObservedImpact;
  created_at: string;
}

export type OutcomeEvidenceType = 'measured' | 'officer_reported' | 'insufficient_evidence';

export interface SystemCalculatedOutcome {
  measured_delay_reduction_days?: number;
  stage_deviation_before_days?: number;
  stage_deviation_after_days?: number;
  calculation_method: string;
  evidence_status: OutcomeEvidenceType;
  evidence_notes?: string;
  calculated_at: string;
}

export interface OfficerObservation {
  reported_delay_reduction_days?: number;
  completion_notes?: string;
  recorded_by?: string;
  recorded_at: string;
}

export interface ObservedImpact {
  evidence_type?: OutcomeEvidenceType;
  system_calculated?: SystemCalculatedOutcome;
  officer_observation?: OfficerObservation;
  delay_reduction_days?: number;
  post_intervention_delay_days?: number;
  completion_notes?: string;
  recorded_at?: string;
  recorded_by?: string;
}

export type DisputeType =
  | 'title_ownership'
  | 'compensation_quantum'
  | 'boundary_encroachment'
  | 'statutory_eligibility'
  | 'tribunal_reference'
  | 'other';

export type DisputeStatus =
  | 'filed'
  | 'under_review'
  | 'under_investigation'
  | 'hearing_scheduled'
  | 'hearing_held'
  | 'decision_pending'
  | 'resolved'
  | 'settled'
  | 'rejected'
  | 'dismissed'
  | 'escalated'
  | 'referred_to_authority';

export interface CaseDispute {
  id: string;
  case_id: string;
  parcel_id?: string | null;
  dispute_type: DisputeType;
  complainant_name: string;
  claimant_name?: string;
  complainant_contact?: string | null;
  filing_date: string;
  description: string;
  statutory_provision?: string | null;
  claimed_amount?: number;
  priority: 'low' | 'medium' | 'high' | 'critical';
  status: DisputeStatus;
  hearing_date?: string | null;
  resolution_notes?: string | null;
  resolution_date?: string | null;
  authority?: string | null;
  decision_summary?: string | null;
  settled_compensation?: number | null;
  court_case_number?: string | null;
  stay_order_issued?: boolean;
  evidence_documents?: Array<{ title: string; url?: string; document_type?: string }>;
  actor_id?: string | null;
  logged_by?: string | null;
  created_at: string;
  updated_at: string;
  parcel?: Parcel;
}

export interface MissingDocumentReport {
  stage_id: string;
  stage_code?: string;
  stage_instance_id: string;
  stage_title: string;
  stage_number: number;
  stage_status: string;
  required_documents: string[];
  missing_documents: string[];
  unverified_documents: string[];
  failed_documents: string[];
  verified_documents: string[];
  is_blocking: boolean;
}

// Dynamic per-requirement guard checklist for statutory stage advancement
export interface StageGuardChecklistItem {
  code:
    | 'DEPENDENCY'
    | 'REQUIRED_ROLE'
    | 'REQUIRED_DOCUMENT'
    | 'REQUIRED_APPROVAL'
    | 'NO_ACTIVE_STAY_ORDERS'
    | 'NO_UNRESOLVED_DISPUTES'
    | 'VERIFIED_GEOMETRY';
  label: string;
  satisfied: boolean;
  detail?: string;
}

export interface StageChecklistDocumentItem {
  document_type: string;
  status: 'verified' | 'pending_verification' | 'missing' | 'rejected';
  detail?: string;
  is_blocking: boolean;
}

export interface StageChecklistCriterionItem {
  criterion: string;
  status: 'satisfied' | 'unsatisfied' | 'requires_officer_confirmation' | 'unavailable';
  description: string;
}

export interface StageChecklistDependencyItem {
  depends_on_stage_id: string;
  stage_title: string;
  status: string;
  is_satisfied: boolean;
}

export interface StageChecklistAuthorization {
  required_role?: UserRole;
  actor_role?: string;
  is_authorized: boolean;
  can_override: boolean;
}

export interface StageAdvancementChecklist {
  documents: StageChecklistDocumentItem[];
  completion_criteria: StageChecklistCriterionItem[];
  dependencies: StageChecklistDependencyItem[];
  authorization: StageChecklistAuthorization;
}

export interface StageAdvancementEvaluation {
  allowed: boolean;
  reasons: string[];
  blockingRequirements: string[];
  evidence: Array<{
    category: 'role' | 'documents' | 'completion_criteria' | 'dependencies' | 'disputes' | 'policy';
    rule: string;
    satisfied: boolean;
    status: 'satisfied' | 'unsatisfied' | 'requires_officer_confirmation' | 'unavailable';
    detail: string;
    blocking: boolean;
  }>;
  checklist: StageAdvancementChecklist;
  unmetRequirements?: { code: string; message: string }[];
}

export interface ScenarioSimulation {
  id?: string;
  case_id: string;
  name: string;
  description?: string;
  is_hypothetical?: boolean;
  proposed_actions: Array<{
    action_type:
      | 'compress_stage_duration'
      | 'fast_track_hearing'
      | 'waive_dependency_lag'
      | 'resolve_active_bottleneck'
      | 'resolve_document_backlog'
      | 'resolve_data_discrepancy'
      | 'disburse_advance_compensation';
    target_stage_id?: string;
    duration_delta_days: number;
    description: string;
  }>;
  original_projected_date: string;
  simulated_projected_date: string;
  delay_recovered_days: number;
  simulation_result: {
    affected_stages: Array<{
      stage_id: string;
      stage_title?: string;
      original_end: string;
      simulated_end: string;
      days_saved: number;
      is_on_critical_path?: boolean;
    }>;
    net_timeline_change_days: number;
    risk_score_delta: number;
    feasibility_notes: string;
    assumptions_applied?: string[];
    evidence_used?: string[];
  };
  created_by?: string;
  created_at: string;
}

export interface CaseIntelligenceBundle {
  case_id: string;
  risk_assessment: RiskAssessment;
  bottlenecks: BottleneckItem[];
  root_causes: RootCauseItem[];
  downstream_impact: DownstreamImpactResult;
  recommendations: Recommendation[];
  predictive_delay?: PredictiveDelayEstimate;
  evidence_ledger?: EvidenceItem[];
}

// Dynamically calculated progress metrics
export interface CaseCalculatedMetrics {
  current_stage_index: number;
  current_stage_title: string;
  total_stages: number;
  completed_stages: number;
  progress_percentage: number;
  total_expected_days: number;
  total_actual_days_elapsed: number;
  net_delay_days: number;
  is_delayed: boolean;
  projected_completion_date: string;
  days_overdue: number;
  blocked_stages_count: number;
}

// Portfolio Analytics
export interface DashboardAnalytics {
  total_cases: number;
  active_cases: number;
  delayed_cases: number;
  completed_cases: number;
  total_area_hectares: number;
  total_compensation_allocated: number;
  average_case_progress: number;
  total_delay_days_accumulated: number;
  cases_by_priority: Record<CasePriority, number>;
  cases_by_status: Record<CaseStatus, number>;
  cases_by_state: Record<string, number>;
  bottleneck_stages: Array<{
    stage_code: string;
    stage_title: string;
    delayed_cases_count: number;
    average_delay_days: number;
  }>;
}

// ============================================================================
// Day 4: National & Portfolio Operations Types
// ============================================================================

export interface AttentionQueueItem {
  case_id: string;
  case_number: string;
  title: string;
  project_id?: string;
  project_name?: string;
  state: string;
  district: string;
  village: string;
  current_stage_title: string;
  status: CaseStatus;
  priority: CasePriority;
  risk_level: 'critical' | 'high' | 'medium' | 'low';
  risk_score: number;
  primary_evidence: string;
  projected_delay_days: number;
  unverified_docs_count: number;
  disputed_parcels_count: number;
  has_active_bottleneck: boolean;
  last_updated_at: string;
}

export interface PortfolioBottleneckSummary {
  stage_code: string;
  stage_title: string;
  delayed_cases_count: number;
  critical_count: number;
  high_count: number;
  medium_count: number;
  average_delay_days: number;
  total_accumulated_delay_days: number;
  downstream_impact_count: number;
  affected_case_ids: string[];
}

export interface WorkflowPerformanceMetric {
  workflow_id: string;
  workflow_name: string;
  total_cases: number;
  active_cases: number;
  completed_cases: number;
  average_progress_pct: number;
  avg_expected_duration_days: number;
  avg_actual_duration_days: number;
  stage_metrics: Array<{
    stage_id: string;
    stage_code: string;
    stage_title: string;
    expected_duration_days: number;
    actual_avg_duration_days: number;
    delay_deviation_days: number;
    overdue_cases_count: number;
    completion_rate_pct: number;
  }>;
}

export interface PortfolioGeoItem {
  case_id: string;
  case_number: string;
  title: string;
  project_id?: string;
  project_name?: string;
  state: string;
  district: string;
  village: string;
  status: CaseStatus;
  priority: CasePriority;
  risk_level: 'critical' | 'high' | 'medium' | 'low';
  current_stage_title: string;
  total_area_hectares: number;
  net_delay_days: number;
  geojson_boundary?: any;
  centroid?: [number, number]; // [lat, lng]
}

export interface PortfolioOperationsData {
  summary: {
    total_cases: number;
    active_cases: number;
    delayed_cases: number;
    at_risk_cases: number;
    active_bottlenecks_count: number;
    projected_delayed_completion_count: number;
    attention_queue_count: number;
    total_area_hectares: number;
    total_compensation_allocated: number;
    average_case_progress: number;
    total_delay_days_accumulated: number;
  };
  attention_queue: AttentionQueueItem[];
  bottlenecks: PortfolioBottleneckSummary[];
  workflow_performance: WorkflowPerformanceMetric[];
  geographic_cases: PortfolioGeoItem[];
  distributions: {
    by_risk: Record<string, number>;
    by_status: Record<string, number>;
    by_priority: Record<string, number>;
    by_stage: Array<{ stage_title: string; count: number }>;
    by_state: Record<string, number>;
    delay_buckets: {
      on_time: number;
      minor_1_15d: number;
      moderate_16_30d: number;
      severe_over_30d: number;
    };
  };
  available_filters: {
    projects: Array<{ id: string; name: string }>;
    states: string[];
    districts: string[];
    workflows: Array<{ id: string; name: string }>;
    stages: Array<{ code: string; title: string }>;
  };
}

export interface PortfolioFilterParams {
  project_id?: string;
  state?: string;
  district?: string;
  state_lgd_code?: string;
  district_lgd_code?: string;
  subdistrict_lgd_code?: string;
  village_lgd_code?: string;
  workflow_id?: string;
  status?: string;
  risk_level?: string;
  search?: string;
}

// ============================================================================
// DAY 4: PORTFOLIO & NATIONAL INTELLIGENCE TYPES
// ============================================================================

export interface PortfolioMetricMetadata {
  definition: string;
  source_tables: string[];
  calculation_method: string;
  time_period?: string;
  sample_size: number;
  evidence_state:
    | 'sufficient_evidence'
    | 'partial_data'
    | 'insufficient_history'
    | 'data_unavailable'
    | 'administrative_enrichment_unavailable';
  notes?: string;
  limitations?: string[];
}

export interface PortfolioOverviewData {
  total_cases: number;
  active_cases: number;
  completed_cases: number;
  blocked_cases: number;
  overdue_cases: number;
  elevated_risk_cases: number;
  critical_risk_cases: number;
  cases_with_insufficient_evidence: number;
  cases_with_stale_external_data: number;
  metadata: PortfolioMetricMetadata;
}

export interface PortfolioDelayIntelligence {
  aggregate_expected_duration_days: number;
  aggregate_actual_duration_days: number;
  aggregate_net_deviation_days: number;
  average_deviation_days: number;
  median_deviation_days: number;
  deteriorating_cases_count: number;
  improving_cases_count: number;
  stage_delay_concentration: Array<{
    stage_code: string;
    stage_title: string;
    accumulated_delay_days: number;
    cases_affected_count: number;
  }>;
  metadata: PortfolioMetricMetadata;
}

export interface PortfolioRiskIntelligence {
  distribution: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  high_risk_case_count: number;
  risk_trend: 'increasing' | 'stable' | 'decreasing' | 'insufficient_history';
  concentration_by_administrative_unit: Array<{
    state: string;
    district?: string;
    high_risk_count: number;
    critical_risk_count: number;
    total_cases: number;
  }>;
  concentration_by_stage_category: Array<{
    category: string;
    total_risk_points: number;
    affected_stages_count: number;
  }>;
  metadata: PortfolioMetricMetadata;
}

export interface PortfolioBottleneckDetail {
  stage_code: string;
  stage_title: string;
  affected_cases_count: number;
  critical_count: number;
  high_count: number;
  medium_count: number;
  total_accumulated_delay_days: number;
  average_delay_days: number;
  recurring_root_causes: Array<{
    cause: string;
    category: string;
    occurrences: number;
  }>;
  evidence_summary: string;
  sample_size_limitation?: string;
}

export interface PortfolioTrendData {
  metric_name: string;
  observation_window_days: number;
  baseline_period: { start: string; end: string };
  current_period: { start: string; end: string };
  baseline_value: number;
  current_value: number;
  delta: number;
  direction: 'improving' | 'stable' | 'deteriorating' | 'insufficient_history';
  reason?: string;
  sample_size: number;
}

export interface PortfolioOutcomeData {
  recommendations: {
    proposed_count: number;
    accepted_count: number;
    rejected_count: number;
    completed_count: number;
  };
  interventions: {
    implemented_count: number;
    observed_post_intervention_delay_days: number;
    expected_savings_days_total: number;
    realized_savings_days_total: number;
    measured_savings_days_total?: number;
    officer_reported_savings_days_total?: number;
    insufficient_evidence_count?: number;
    outcomes_recorded_count?: number;
    outcome_coverage_pct?: number;
    has_insufficient_evidence?: boolean;
    insufficient_historical_evidence?: boolean;
    evidence_breakdown?: {
      measured: number;
      officer_reported: number;
      insufficient_evidence: number;
    };
  };
  state_breakdown: 'simulated' | 'proposed' | 'accepted' | 'implemented' | 'observed_outcome';
  metadata: PortfolioMetricMetadata;
}

export interface GeographicDrilldownNode {
  id: string;
  name: string;
  node_type: 'national' | 'state' | 'district' | 'project' | 'case';
  mapped_state: 'mapped' | 'unmapped' | 'administrative_enrichment_unavailable';
  centroid?: [number, number];
  metrics: {
    total_cases: number;
    active_cases: number;
    delayed_cases: number;
    high_risk_cases: number;
    total_area_hectares: number;
    net_delay_days: number;
  };
  children?: GeographicDrilldownNode[];
}

export interface PortfolioAttentionPolicy {
  delay_days_threshold: number;
  flag_unverified_docs: boolean;
  flag_disputed_parcels: boolean;
  flag_blocked_stages: boolean;
  flag_critical_risk: boolean;
  flag_high_risk: boolean;
  flag_stale_external_data: boolean;
  flag_cross_source_discrepancies: boolean;
}

export interface PortfolioTrendPolicy {
  min_historical_days: number;
  min_cases_sample_size: number;
  comparison_window_days: number;
}

// ============================================================================
// DAY 5: CONFIGURABLE SYSTEM POLICIES & BUSINESS RULES
// ============================================================================

export interface RiskScoringPolicy {
  schedule_delay_weight: number;      // e.g. 0.40
  dependency_blockage_weight: number; // e.g. 0.25
  document_friction_weight: number;   // e.g. 0.20
  cadastral_dispute_weight: number;   // e.g. 0.15
}

export interface RiskBandsPolicy {
  critical_threshold: number; // e.g. 75
  high_threshold: number;     // e.g. 50
  medium_threshold: number;   // e.g. 25
}

export interface BottleneckThresholdsPolicy {
  active_overdue_threshold_days: number; // e.g. 5
  medium_overdue_days: number;          // e.g. 5
  high_overdue_days: number;            // e.g. 15
  critical_overdue_days: number;        // e.g. 30
  historical_delay_impact_days: number; // e.g. 14
  disputed_parcels_threshold: number;   // e.g. 3
}

export interface AttentionQueuePolicy {
  delay_days_threshold: number;   // e.g. 10
  flag_unverified_docs: boolean;  // e.g. true
  flag_disputed_parcels: boolean; // e.g. true
  flag_blocked_stages: boolean;   // e.g. true
  flag_critical_risk: boolean;    // e.g. true
  flag_high_risk: boolean;        // e.g. true
}

export interface EscalationRulesPolicy {
  sla_breach_escalation_days: number;          // e.g. 15
  critical_risk_auto_escalate: boolean;        // e.g. true
  unverified_doc_escalation_days: number;      // e.g. 7
  dispute_count_escalation_threshold: number;  // e.g. 2
}

export interface ExternalFreshnessPolicy {
  fresh_seconds: number; // e.g. 1800 (30m)
  aging_seconds: number; // e.g. 7200 (2h)
  stale_seconds: number; // e.g. 86400 (24h)
}

export interface ExternalDataQualityPolicy {
  connectivity_weight: number;      // e.g. 0.25 (25%)
  freshness_weight: number;         // e.g. 0.25 (25%)
  completeness_weight: number;      // e.g. 0.20 (20%)
  spatial_precision_weight: number; // e.g. 0.15 (15%)
  plausibility_weight: number;       // e.g. 0.15 (15%)
  min_acceptable_score: number;     // e.g. 70
}

export interface SpatialDiscrepancyPolicy {
  acceptable_distance_meters: number;      // e.g. 50m
  medium_severity_distance_meters: number; // e.g. 250m
  critical_severity_distance_meters: number; // e.g. 1000m
}

export interface WeatherRiskPolicy {
  severe_weather_delay_points: number; // e.g. 10
  min_quality_score: number;          // e.g. 70
  allow_stale_data_influence: boolean; // e.g. false
  severe_weather_codes: number[];     // [55, 65, 75, 82, 95, 96, 99]
}

export interface PredictiveDelayPolicy {
  min_evidence_confidence: number;       // e.g. 0.70
  historical_velocity_weight: number;    // e.g. 0.40
  overdue_acceleration_factor: number;   // e.g. 1.2
  weather_delay_factor_days: number;     // e.g. 5
  dispute_tribunal_delay_days: number;   // e.g. 30
  document_clearance_delay_days: number; // e.g. 7
  initial_blockage_buffer_days: number;  // e.g. 7
  discrepancy_reconciliation_delay_days: number; // e.g. 3
}

export interface RecommendationPolicy {
  critical_urgency_delay_threshold: number; // e.g. 14
  elevated_urgency_delay_threshold: number; // e.g. 5
  auto_suggest_tribunal_reference: boolean; // e.g. true
  max_active_recommendations: number;       // e.g. 8
}

export interface NotificationPolicy {
  eligibility_min_severity: NotificationSeverity;
  deduplication_window_hours: number;
  max_active_notifications_per_case: number;
  stale_data_notification_behavior: 'warn' | 'suppress' | 'flag_as_unverified';
  acknowledgement_deadline_hours: {
    urgent: number;
    critical: number;
    warning: number;
    info: number;
  };
}

export interface EscalationPolicy {
  sla_breach_escalation_days: number;
  critical_risk_auto_escalate: boolean;
  unacknowledged_escalation_hours: {
    urgent: number;
    critical: number;
    warning: number;
  };
  escalation_target_role_map: Record<string, string>;
  repeated_trigger_escalate_count: number;
  dispute_count_escalation_threshold: number;
}

export interface OperationalAttentionPolicy {
  delay_days_threshold: number;
  downstream_impact_threshold_days: number;
  flag_unverified_docs: boolean;
  flag_disputed_parcels: boolean;
  flag_blocked_stages: boolean;
  flag_critical_risk: boolean;
  flag_high_risk: boolean;
  flag_stale_external_data: boolean;
  flag_cross_source_discrepancies: boolean;
}

export interface SystemPolicy<T = any> {
  id: string;
  category: 'risk' | 'bottleneck' | 'attention' | 'escalation' | 'sla' | 'freshness' | 'quality' | 'discrepancy' | 'external_data' | 'gis';
  title: string;
  description?: string;
  config_value: T;
  updated_at: string;
  updated_by?: string;
}

// ============================================================================
// DAY 5: NOTIFICATIONS & ESCALATIONS
// ============================================================================

export type NotificationSeverity = 'info' | 'warning' | 'critical' | 'urgent';

export type NotificationEventType =
  | 'stage_overdue'
  | 'critical_risk'
  | 'blocked_dependency'
  | 'document_awaiting_verification'
  | 'cadastral_dispute'
  | 'workflow_escalation'
  | 'predicted_delay'
  | 'active_bottleneck'
  | 'workflow_deviation'
  | 'stale_external_data'
  | 'data_discrepancy'
  | 'document_issue'
  | 'downstream_impact'
  | 'unresolved_recommendation';

export type NotificationStatus = 'unread' | 'acknowledged' | 'resolved' | 'dismissed';

export type NotificationAction = 'acknowledge' | 'resolve' | 'dismiss' | 'escalate';

export interface CaseNotification {
  id: string;
  case_id: string;
  stage_instance_id?: string | null;
  title: string;
  message: string;
  severity: NotificationSeverity;
  event_type: NotificationEventType;
  recipient_role: string;
  recipient_user_id?: string | null;
  status: NotificationStatus;
  acknowledged_at?: string | null;
  acknowledged_by?: string | null;
  resolved_at?: string | null;
  resolved_by?: string | null;
  action_taken?: string | null;
  action_taken_at?: string | null;
  action_taken_by?: string | null;
  dismissed_at?: string | null;
  dismissed_by?: string | null;
  dismissal_reason?: string | null;
  escalation_level?: number;
  escalated_at?: string | null;
  escalated_to_role?: string | null;
  escalated_by?: string | null;
  dedup_key?: string | null;
  evidence?: EvidenceItem[];
  metadata?: Record<string, any>;
  created_at: string;
  // Optional enriched fields
  case_number?: string;
  case_title?: string;
  project_id?: string;
  project_name?: string;
  state?: string;
  district?: string;
}

export interface NotificationCounts {
  total_count: number;
  unread_count: number;
  acknowledged_count: number;
  resolved_count: number;
  dismissed_count: number;
  urgent_count: number;
  critical_count: number;
  warning_count: number;
  info_count: number;
  escalated_count: number;
  by_event_type: Record<string, number>;
}

// ============================================================================
// DAY 5: INTEGRATION DIAGNOSTICS
// ============================================================================

export interface IntegrationDiagnostics {
  status: 'healthy' | 'degraded' | 'unconfigured';
  timestamp: string;
  supabase: {
    configured: boolean;
    operational: boolean;
    database_reachable: boolean;
    auth_configured: boolean;
    storage_available: boolean;
    realtime_available: boolean;
    message: string;
  };
  gemini: {
    configured: boolean;
    operational: boolean;
    server_side_only: boolean;
    model: string;
    message: string;
  };
  geocoding: {
    configured: boolean;
    operational: boolean;
    provider: string;
    rate_limit_rps: number;
    message: string;
  };
  administrative_data: {
    configured: boolean;
    operational: boolean;
    provider: string;
    total_units_loaded: number;
    message: string;
  };
  data_sources: {
    total_registered: number;
    operational_count: number;
    unconfigured_count: number;
  };
  diagnostic_summary: string;
  environment: {
    node_env: string;
    port: number;
    platform: string;
  };
}

// ============================================================================
// DAY 1 FOUNDATION: DATA SOURCE REGISTRY, PROVENANCE & GEOGRAPHY
// ============================================================================

export type DataSourceType =
  | 'database'
  | 'ai'
  | 'geocoding'
  | 'routing'
  | 'satellite'
  | 'translation'
  | 'administrative_data'
  | 'gis'
  | 'weather'
  | 'document_source'
  | 'government_open_data';

export type DataSourceStatus =
  | 'not_configured'
  | 'requires_credentials'
  | 'configured'
  | 'operational'
  | 'degraded'
  | 'stale'
  | 'rate_limited'
  | 'error'
  | 'failed'
  | 'disabled'
  | 'unavailable';

export type SyncMode = 'realtime' | 'scheduled' | 'manual_import' | 'on_demand';

export interface DataSource {
  id: string;
  name: string;
  type: DataSourceType;
  provider: string;
  endpoint_ref?: string | null;
  env_secret_keys: string[];
  status: DataSourceStatus;
  is_enabled: boolean;
  sync_mode: SyncMode;
  last_attempted_sync?: string | null;
  last_successful_sync?: string | null;
  error_details?: string | null;
  data_scope?: string | null;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export type ProvenanceType =
  | 'USER_ENTERED'
  | 'DATABASE_DERIVED'
  | 'EXTERNALLY_SOURCED'
  | 'AI_EXTRACTED'
  | 'AI_GENERATED_ASSISTED'
  | 'SYSTEM_CALCULATED';

export type VerificationStatus =
  | 'unverified'
  | 'human_verified'
  | 'rejected'
  | 'system_verified';

export type FreshnessState = 'fresh' | 'aging' | 'stale' | 'expired' | 'unknown';

export interface DataProvenance {
  id: string;
  entity_type: string;
  entity_id: string;
  field_name: string;
  provenance_type: ProvenanceType;
  source_id?: string | null;
  source_record_ref?: string | null;
  retrieved_at: string;
  observed_at?: string | null;
  verification_status: VerificationStatus;
  verified_by?: string | null;
  verified_at?: string | null;
  freshness_state: FreshnessState;
  metadata?: Record<string, any>;
  created_at: string;
}

export type AdminUnitType = 'state' | 'district' | 'sub_district' | 'locality' | 'village';

export interface AdministrativeUnit {
  id: string;
  parent_id?: string | null;
  unit_type: AdminUnitType;
  code: string;
  name: string;
  local_name?: string | null;
  state_code?: string | null;
  district_code?: string | null;
  sub_district_code?: string | null;
  census_code?: string | null;
  is_active?: boolean;
  centroid?: [number, number] | null;
  boundary_geojson?: any | null;
  source_id?: string | null;
  source_resource_id?: string | null;
  source_record_ref?: string | null;
  last_synced_at?: string | null;
  metadata?: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface LgdSyncTierSummary {
  tier: 'states' | 'districts' | 'subDistricts' | 'villages';
  resource_id: string;
  total_available: number;
  records_received: number;
  records_inserted: number;
  records_updated: number;
  records_unchanged: number;
  records_rejected: number;
  orphan_records: number;
  duration_ms: number;
  status: 'completed' | 'partial' | 'failed';
  validation_errors: Array<{ code: string; message: string; data?: any }>;
  /**
   * Offset the next page would be read from. A `partial` tier resumes here;
   * an absent value means the tier ran to the end of the authoritative source.
   */
  next_offset?: number;
  /** True only when every record advertised by the source was fetched and processed. */
  complete?: boolean;
  /** Independent reconciliation of ingested rows against the authoritative source total. */
  count_verification?: {
    source_total: number;
    rows_in_database: number;
    matched: boolean;
    checked_at: string;
  };
  /**
   * Completeness reconciliation for this tier (Phase K).
   *
   * States explicitly how `source_rows_observed` was obtained so a missing
   * machine-readable total from the source is reported as such rather than
   * back-filled from a published or reference expectation.
   */
  completeness?: {
    tier: LgdSyncTierSummary['tier'];
    unit_type: AdminUnitType;
    source_rows_observed: number;
    source_total_kind: 'advertised_by_source' | 'observed_rows' | 'not_provided';
    source_total_note: string;
    rows_in_database_total: number;
    rows_in_database_from_source: number;
    rows_missing_from_database: number;
    rows_from_other_sources: number;
    orphan_rows_rejected: number;
    parent_integrity: 'verified' | 'failed' | 'not_checked';
    complete: boolean;
    checked_at: string;
  };
}

export interface LgdSyncSummary {
  sync_id: string;
  started_at: string;
  completed_at: string;
  duration_ms: number;
  status: 'completed' | 'partial' | 'failed';
  total_received: number;
  total_inserted: number;
  total_updated: number;
  total_unchanged: number;
  total_rejected: number;
  total_orphans: number;
  tiers: Record<string, LgdSyncTierSummary>;
  validation_errors: Array<{ code: string; message: string; data?: any }>;
  /**
   * Which registered geography source produced this run (Phase C). Present so
   * a run against the temporary reference mirror can never be mistaken for an
   * authoritative LGD synchronisation after the fact.
   */
  source_id?: string;
  source_label?: string;
  source_authority?: 'authoritative' | 'temporary_reference';
  /**
   * Overall completeness reconciliation across every tier that ran (Phase K).
   * The run is only `complete` when every tier reconciled and no parent-child
   * violation was observed.
   */
  reconciliation?: {
    complete: boolean;
    tiers_checked: number;
    tiers_complete: number;
    source_rows_observed: number;
    rows_missing_from_database: number;
    rows_from_other_sources: number;
    orphan_rows_rejected: number;
    parent_integrity: 'verified' | 'failed' | 'not_checked';
    source_total_kind: 'advertised_by_source' | 'observed_rows' | 'not_provided';
    note: string;
    checked_at: string;
  };
}

export interface LgdSyncStatus {
  operational_status: 'operational' | 'stale' | 'never_synced' | 'error' | 'syncing';
  last_successful_sync?: string;
  last_attempted_sync?: string;
  is_sync_in_progress: boolean;
  current_lock_owner?: string;
  tier_counts: {
    states: number;
    districts: number;
    sub_districts: number;
    villages: number;
    total: number;
  };
  /**
   * Per-tier offset a `partial` sync can be resumed from. Keys are absent for
   * tiers that completed; `0` means that tier has not started.
   */
  resume_offsets?: Partial<Record<'states' | 'districts' | 'subDistricts' | 'villages', number>>;
  /**
   * The registered source currently feeding administrative geography, so the
   * console can show whether reads are authoritative LGD or a temporary
   * reference extract without inferring it from row counts.
   */
  active_source?: {
    id: string;
    label: string;
    authority: 'authoritative' | 'temporary_reference';
    availability: string;
    requires: string | null;
    source_url: string;
    lineage: string;
    license: string;
  };
  sync_history: LgdSyncSummary[];
}

export type ImportFormat = 'json' | 'csv' | 'geojson';

export type ImportBatchStatus =
  | 'processing'
  | 'completed'
  | 'partially_completed'
  | 'failed';

export interface DataImportBatch {
  id: string;
  source_id?: string | null;
  batch_type: string;
  format: ImportFormat;
  total_records: number;
  accepted_records: number;
  rejected_records: number;
  duplicate_records: number;
  validation_errors: Array<{ line?: number; code?: string; message: string; data?: any }>;
  status: ImportBatchStatus;
  created_by?: string | null;
  created_at: string;
}

export interface ImportSummary {
  batch_id: string;
  batch_type: string;
  format: ImportFormat;
  total_received: number;
  accepted: number;
  rejected: number;
  duplicates: number;
  status: ImportBatchStatus;
  validation_errors: Array<{ line?: number; code?: string; message: string; data?: any }>;
  source: string;
  timestamp: string;
}

export interface NormalizedGeocodeResult {
  latitude: number;
  longitude: number;
  display_name: string;
  state?: string;
  district?: string;
  sub_district?: string;
  locality?: string;
  boundingbox?: [number, number, number, number]; // [minLat, maxLat, minLon, maxLon]
  provider: string;
  retrieved_at: string;
}

export interface NormalizedLocationResult {
  latitude: number;
  longitude: number;
  display_name: string;
  state?: string;
  district?: string;
  sub_district?: string;
  locality?: string;
  postcode?: string;
  provider: string;
  retrieved_at: string;
}

// ============================================================================
// DAY 2: NORMALIZED EXTERNAL OBSERVATIONS, FRESHNESS & DISCREPANCY TYPES
// ============================================================================

export type ObservationType =
  | 'weather'
  | 'geocoding'
  | 'environmental'
  | 'administrative'
  | 'satellite_index';

export interface NormalizedWeatherValues {
  temperature_c?: number;
  relative_humidity_pct?: number;
  precipitation_mm?: number;
  rain_mm?: number;
  weather_code?: number;
  weather_condition?: string;
  wind_speed_kmh?: number;
  surface_pressure_hpa?: number;
  [key: string]: any;
}

export interface ExternalObservation {
  id: string;
  source_id?: string | null;
  provider: string;
  observation_type: ObservationType;
  entity_type: string;
  entity_id: string;
  coordinates?: { latitude: number; longitude: number } | null;
  observed_at: string;
  retrieved_at: string;
  valid_from: string;
  valid_until?: string | null;
  raw_payload_ref?: string | null;
  normalized_values: NormalizedWeatherValues | Record<string, any>;
  units: Record<string, string>;
  confidence_score: number;
  quality_score: number;
  quality_breakdown?: DataQualityAssessment | null;
  freshness_state: FreshnessState;
  provenance_id?: string | null;
  request_id?: string | null;
  metadata?: Record<string, any>;
  created_at: string;
}

export interface SourceFreshnessConfig {
  fresh_seconds: number;
  aging_seconds: number;
  stale_seconds: number;
}

export interface FreshnessEvaluation {
  state: FreshnessState;
  age_seconds: number;
  observed_age_formatted: string;
  retrieved_age_formatted: string;
  is_fresh: boolean;
  is_stale: boolean;
  is_expired: boolean;
  freshness_label: string;
}

export interface DataQualityDimension {
  dimension: string;
  score: number; // 0 to 100
  weight: number; // 0 to 1
  weighted_score: number;
  status: 'passed' | 'warning' | 'failed';
  explanation: string;
}

export interface DataQualityAssessment {
  overall_score: number; // 0 to 100
  is_acceptable: boolean;
  dimensions: DataQualityDimension[];
  summary: string;
  evaluated_at: string;
}

export type DiscrepancyType =
  | 'coordinates_mismatch'
  | 'administrative_boundary_mismatch'
  | 'measurement_variance'
  | 'status_conflict'
  | 'freshness_divergence';

export type DiscrepancySeverity = 'low' | 'medium' | 'high' | 'critical';
export type DiscrepancyResolutionState = 'unresolved' | 'acknowledged' | 'resolved' | 'dismissed';

export interface DataDiscrepancy {
  id: string;
  entity_type: string;
  entity_id: string;
  source_a: string;
  source_b: string;
  compared_field: string;
  value_a: any;
  value_b: any;
  timestamp_a?: string | null;
  timestamp_b?: string | null;
  discrepancy_type: DiscrepancyType;
  severity: DiscrepancySeverity;
  detected_at: string;
  resolution_state: DiscrepancyResolutionState;
  resolution_notes?: string | null;
  resolved_by?: string | null;
  resolved_at?: string | null;
  metadata?: Record<string, any>;
  created_at: string;
}

export interface CaseExternalContextBundle {
  case_id: string;
  coordinates?: { latitude: number; longitude: number } | null;
  location_source: 'case_boundary' | 'parcel_geometry' | 'geocoded_address' | 'none';
  weather?: {
    observation: ExternalObservation | null;
    freshness: FreshnessEvaluation;
    quality: DataQualityAssessment;
    status: 'operational' | 'degraded' | 'failed' | 'not_configured' | 'data_unavailable' | 'stale';
    message?: string;
  } | null;
  discrepancies: {
    status: 'insufficient_sources' | 'discrepancies_detected' | 'consistent';
    message: string;
    items: DataDiscrepancy[];
  };
  provenance_trail: DataProvenance[];
  intelligence_impact: {
    contributes_to_risk: boolean;
    reason: string;
    risk_factor?: {
      factor: string;
      impact: number;
      evidence: string;
    };
  };
  retrieved_at: string;
}

// ============================================================================
// DAY 6: GIS & SPATIAL INTELLIGENCE LAYER
// ============================================================================

export interface SpatialPolicy {
  nearby_search_radius_km: number;
  max_search_radius_km: number;
  spatial_cluster_distance_km: number;
  spatial_freshness_window_hours: number;
  spatial_concentration_min_cases: number;
  geographic_attention_threshold_delay_days: number;
  default_map_zoom: number;
  coordinate_precision_decimals: number;
}

export type SpatialGeometryStatus =
  | 'mapped'
  | 'partially_mapped'
  | 'unmapped'
  | 'invalid_geometry'
  | 'administrative_enrichment_unavailable';

export interface CaseSpatialContext {
  case_id: string;
  case_number: string;
  title: string;
  project_id: string;
  project_name?: string;
  state: string;
  district: string;
  tehsil?: string;
  village: string;
  centroid: [number, number] | null;
  bbox: [number, number, number, number] | null;
  total_area_hectares: number;
  geometry_status: SpatialGeometryStatus;
  geometry_quality_score: number; // 0-100
  geometry_type?: string;
  parcels_summary: {
    total: number;
    mapped: number;
    unmapped: number;
    disputed: number;
    disputed_with_geometry: number;
  };
  project_geometry_available: boolean;
  nearby_cases: Array<{
    id: string;
    case_number: string;
    title: string;
    distance_km: number;
    status: string;
    risk_level?: string;
  }>;
  administrative_hierarchy: {
    state: string;
    district: string;
    sub_district?: string;
    locality?: string;
    lgd_status: 'mapped' | 'administrative_enrichment_unavailable';
  };
  provenance: DataProvenance;
}

export interface SpatialCluster {
  cluster_id: string;
  center: [number, number];
  radius_km: number;
  case_ids: string[];
  case_count: number;
  aggregate_area_hectares: number;
  risk_concentration: Record<string, number>;
  status_concentration: Record<string, number>;
  sample_size_note: string;
}

export interface SpatialLayerInfo {
  id: string;
  name: string;
  layer_type: 'cases' | 'projects' | 'parcels' | 'clusters' | 'administrative' | 'weather';
  feature_count: number;
  is_visible_by_default: boolean;
  status: 'operational' | 'empty' | 'unavailable';
  description: string;
}

export interface GISOverview {
  total_cases: number;
  mapped_cases: number;
  partially_mapped_cases: number;
  unmapped_cases: number;
  invalid_geometry_cases: number;
  total_projects: number;
  projects_with_geometry: number;
  total_parcels: number;
  mapped_parcels: number;
  portfolio_bbox: [number, number, number, number] | null;
  spatial_clusters_count: number;
  clusters: SpatialCluster[];
  layer_manifest: SpatialLayerInfo[];
  lgd_status: 'operational' | 'administrative_enrichment_unavailable';
}

export interface NearbySpatialEntity {
  id: string;
  entity_type: 'case' | 'project';
  name: string;
  code?: string;
  distance_km: number;
  centroid: [number, number];
  state: string;
  district?: string;
  status: string;
  risk_level?: string;
  geometry_type: string;
}

// ============================================================================
// DAY 8: EXTERNAL PROVIDER INTEGRATION ARCHITECTURE & POLICIES
// ============================================================================

export interface IntegrationPolicy {
  routing_provider: 'osrm' | 'google_routes';
  geocoding_provider: 'nominatim' | 'google_geocoding';
  map_provider?: 'osm' | 'maptiler' | 'carto_positron' | 'carto_dark' | 'google';
  satellite_layer_provider: 'bhuvan' | 'google_hybrid' | 'maptiler_satellite';
  satellite_metadata_provider: 'copernicus' | 'none';
  translation_provider: 'bhashini' | 'gemini' | 'none';
  ocr_provider: 'gemini' | 'tesseract_offline';
  maptiler_style?: 'streets-v2' | 'basic-v2' | 'satellite' | 'hybrid' | 'topo-v2' | 'outdoor-v2' | 'dataviz-light' | 'dataviz-dark';
}

export interface LatLngPoint {
  lat: number;
  lng: number;
}

export interface CalculateRouteInput {
  origin: LatLngPoint;
  destination: LatLngPoint;
  profile?: 'driving' | 'walking' | 'cycling';
  waypoints?: LatLngPoint[];
}

export interface RouteStep {
  instruction: string;
  distance_meters: number;
  duration_seconds: number;
}

export interface RouteCapabilityTracking {
  traffic_aware: boolean;
  toll_info_available: boolean;
  elevation_profile: boolean;
  snapped_to_road_network: boolean;
  fallback_occurred: boolean;
  lost_capabilities: string[];
}

export interface NormalizedRouteResult {
  distance_meters: number;
  distance_km: number;
  duration_seconds: number;
  duration_minutes: number;
  geometry_geojson?: {
    type: 'LineString';
    coordinates: [number, number][];
  };
  steps?: RouteStep[];
  provider: 'osrm' | 'google_routes' | string;
  capabilities: RouteCapabilityTracking;
  attribution: string;
  calculated_at: string;
}

export interface SatelliteLayerConfig {
  id: string;
  name: string;
  provider: 'bhuvan' | 'google_hybrid' | 'copernicus' | string;
  layer_type: 'wms' | 'tile' | 'stac';
  url: string;
  layers?: string;
  format?: string;
  transparent?: boolean;
  attribution: string;
  description: string;
  is_base_layer: boolean;
  opacity?: number;
  max_zoom?: number;
  requires_credentials: boolean;
  status: 'operational' | 'configured' | 'not_configured' | 'unavailable' | 'degraded';
}

export interface SatelliteGranuleMetadata {
  id: string;
  collection: string;
  datetime: string;
  cloud_cover_percentage?: number;
  platform?: string;
  bbox: [number, number, number, number];
  thumbnail_url?: string;
  quicklook_url?: string;
  data_access_url?: string;
}

export interface SatelliteMetadataResult {
  granules: SatelliteGranuleMetadata[];
  total_results: number;
  provider: string;
  query_bbox: [number, number, number, number];
  status: 'operational' | 'not_configured' | 'requires_credentials' | 'unavailable';
  message?: string;
  retrieved_at: string;
}

export type TranslationStatus = 
  | 'translated' 
  | 'not_configured' 
  | 'requires_credentials' 
  | 'provider_error' 
  | 'unavailable';

export type TranslationType =
  | 'machine_translation'
  | 'ai_assisted_translation'
  | 'untranslated_passthrough'
  | 'identity';

export interface TranslateTextInput {
  text: string;
  source_language?: string;
  target_language: string;
  domain?: 'legal' | 'land_revenue' | 'general';
}

export interface NormalizedTranslationResult {
  original_text: string;
  translated_text: string;
  source_language: string;
  target_language: string;
  provider: 'bhashini' | 'gemini' | 'offline_passthrough' | string;
  status: TranslationStatus;
  translation_type: TranslationType;
  disclaimer: string;
  detected_source_language?: string;
  latency_ms?: number;
  message?: string;
  attribution: string;
  timestamp: string;
}

export interface AccessRequest {
  id: string;
  full_name: string;
  email: string;
  organization: string;
  department?: string | null;
  designation?: string | null;
  contact_phone?: string | null;
  jurisdiction_state_lgd_code?: string | null;
  jurisdiction_state_name?: string | null;
  jurisdiction_district_lgd_code?: string | null;
  jurisdiction_district_name?: string | null;
  justification: string;
  requested_role?: UserRole | null;
  status: 'pending' | 'in_review' | 'approved' | 'rejected' | 'withdrawn';
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  review_note?: string | null;
  created_at: string;
  updated_at: string;
}


