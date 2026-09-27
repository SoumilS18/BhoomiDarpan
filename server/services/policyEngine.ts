import { getSupabase, isSupabaseConfigured } from '../config/supabase';
import { isTestEnvironment } from '../config/runtimeEnv';
import {
  SystemPolicy,
  RiskScoringPolicy,
  RiskBandsPolicy,
  BottleneckThresholdsPolicy,
  AttentionQueuePolicy,
  EscalationRulesPolicy,
  ExternalFreshnessPolicy,
  ExternalDataQualityPolicy,
  SpatialDiscrepancyPolicy,
  WeatherRiskPolicy,
  PredictiveDelayPolicy,
  RecommendationPolicy,
  PortfolioAttentionPolicy,
  PortfolioTrendPolicy,
  NotificationPolicy,
  EscalationPolicy,
  OperationalAttentionPolicy,
  SpatialPolicy,
  IntegrationPolicy,
} from '../../shared/types';
import { logCaseEvent } from './auditLogger';

// ============================================================================
// DEFAULT INSTITUTIONAL SEED CONFIGURATION
// (Explicitly documented, persisted in system_policies table, zero hidden magic numbers)
// ============================================================================

export const DEFAULT_RISK_WEIGHTS: RiskScoringPolicy = {
  schedule_delay_weight: 0.40,
  dependency_blockage_weight: 0.25,
  document_friction_weight: 0.20,
  cadastral_dispute_weight: 0.15,
};

export const DEFAULT_RISK_BANDS: RiskBandsPolicy = {
  critical_threshold: 75,
  high_threshold: 50,
  medium_threshold: 25,
};

export const DEFAULT_BOTTLENECK_THRESHOLDS: BottleneckThresholdsPolicy = {
  active_overdue_threshold_days: 5,
  medium_overdue_days: 5,
  high_overdue_days: 15,
  critical_overdue_days: 30,
  historical_delay_impact_days: 14,
  disputed_parcels_threshold: 3,
};

export const DEFAULT_ATTENTION_QUEUE_CRITERIA: AttentionQueuePolicy = {
  delay_days_threshold: 10,
  flag_unverified_docs: true,
  flag_disputed_parcels: true,
  flag_blocked_stages: true,
  flag_critical_risk: true,
  flag_high_risk: true,
};

export const DEFAULT_ESCALATION_RULES: EscalationRulesPolicy = {
  sla_breach_escalation_days: 15,
  critical_risk_auto_escalate: true,
  unverified_doc_escalation_days: 7,
  dispute_count_escalation_threshold: 2,
};

export const DEFAULT_EXTERNAL_FRESHNESS_POLICY: ExternalFreshnessPolicy = {
  fresh_seconds: 1800, // <= 30 minutes
  aging_seconds: 7200, // 30m - 2h
  stale_seconds: 86400, // 2h - 24h
};

export const DEFAULT_EXTERNAL_DATA_QUALITY_POLICY: ExternalDataQualityPolicy = {
  connectivity_weight: 0.25, // 25%
  freshness_weight: 0.25, // 25%
  completeness_weight: 0.20, // 20%
  spatial_precision_weight: 0.15, // 15%
  plausibility_weight: 0.15, // 15%
  min_acceptable_score: 70, // 70 / 100
};

export const DEFAULT_SPATIAL_DISCREPANCY_POLICY: SpatialDiscrepancyPolicy = {
  acceptable_distance_meters: 50, // <= 50m
  medium_severity_distance_meters: 250, // 50m - 250m
  critical_severity_distance_meters: 1000, // > 1000m
};

export const DEFAULT_WEATHER_RISK_POLICY: WeatherRiskPolicy = {
  severe_weather_delay_points: 10,
  min_quality_score: 70,
  allow_stale_data_influence: false,
  severe_weather_codes: [55, 65, 75, 82, 95, 96, 99],
};

export const DEFAULT_PREDICTIVE_DELAY_POLICY: PredictiveDelayPolicy = {
  min_evidence_confidence: 0.70,
  historical_velocity_weight: 0.40,
  overdue_acceleration_factor: 1.2,
  weather_delay_factor_days: 5,
  dispute_tribunal_delay_days: 30,
  document_clearance_delay_days: 7,
  initial_blockage_buffer_days: 7,
  discrepancy_reconciliation_delay_days: 3,
};

export const DEFAULT_RECOMMENDATION_POLICY: RecommendationPolicy = {
  critical_urgency_delay_threshold: 14,
  elevated_urgency_delay_threshold: 5,
  auto_suggest_tribunal_reference: true,
  max_active_recommendations: 8,
};

export const DEFAULT_PORTFOLIO_ATTENTION_POLICY: PortfolioAttentionPolicy = {
  delay_days_threshold: 10,
  flag_unverified_docs: true,
  flag_disputed_parcels: true,
  flag_blocked_stages: true,
  flag_critical_risk: true,
  flag_high_risk: true,
  flag_stale_external_data: true,
  flag_cross_source_discrepancies: true,
};

export const DEFAULT_PORTFOLIO_TREND_POLICY: PortfolioTrendPolicy = {
  min_historical_days: 14,
  min_cases_sample_size: 3,
  comparison_window_days: 30,
};

export const DEFAULT_NOTIFICATION_POLICY: NotificationPolicy = {
  eligibility_min_severity: 'info',
  deduplication_window_hours: 24,
  max_active_notifications_per_case: 10,
  stale_data_notification_behavior: 'warn',
  acknowledgement_deadline_hours: {
    urgent: 12,
    critical: 24,
    warning: 48,
    info: 72,
  },
};

export const DEFAULT_ESCALATION_POLICY: EscalationPolicy = {
  sla_breach_escalation_days: 15,
  critical_risk_auto_escalate: true,
  unacknowledged_escalation_hours: {
    urgent: 12,
    critical: 24,
    warning: 48,
  },
  escalation_target_role_map: {
    project_officer: 'lao',
    revenue_inspector: 'lao',
    legal_officer: 'lao',
    viewer: 'project_officer',
    lao: 'admin',
    approver: 'admin',
  },
  repeated_trigger_escalate_count: 3,
  dispute_count_escalation_threshold: 2,
};

export const DEFAULT_OPERATIONAL_ATTENTION_POLICY: OperationalAttentionPolicy = {
  delay_days_threshold: 10,
  downstream_impact_threshold_days: 7,
  flag_unverified_docs: true,
  flag_disputed_parcels: true,
  flag_blocked_stages: true,
  flag_critical_risk: true,
  flag_high_risk: true,
  flag_stale_external_data: true,
  flag_cross_source_discrepancies: true,
};

export const DEFAULT_SPATIAL_POLICY: SpatialPolicy = {
  nearby_search_radius_km: 25,
  max_search_radius_km: 100,
  spatial_cluster_distance_km: 15,
  spatial_freshness_window_hours: 72,
  spatial_concentration_min_cases: 3,
  geographic_attention_threshold_delay_days: 15,
  default_map_zoom: 5,
  coordinate_precision_decimals: 6,
};

export const DEFAULT_INTEGRATION_POLICY: IntegrationPolicy = {
  routing_provider: 'osrm',
  geocoding_provider: 'nominatim',
  map_provider: 'osm',
  satellite_layer_provider: 'bhuvan',
  satellite_metadata_provider: 'copernicus',
  translation_provider: 'bhashini',
  ocr_provider: 'gemini',
  maptiler_style: 'streets-v2',
};

/**
 * Canonical default for every policy in the platform.
 *
 * This is the authority the system falls back to when no database row exists.
 * It is exported so reconciliation tooling can restore a row that has been
 * overwritten (the DB is meant to hold an *override* of these values, never an
 * arbitrary substitute for them).
 */
export const DEFAULT_POLICIES_MAP: Record<string, SystemPolicy> = {
  risk_scoring_weights: {
    id: 'risk_scoring_weights',
    category: 'risk',
    title: 'Explainable Multi-Factor Risk Weights',
    description: 'Relative mathematical weights assigned to each operational dimension for composite risk scoring.',
    config_value: DEFAULT_RISK_WEIGHTS,
    updated_at: new Date().toISOString(),
    updated_by: 'System Default',
  },
  risk_bands: {
    id: 'risk_bands',
    category: 'risk',
    title: 'Institutional Risk Score Classification Bands',
    description: 'Composite score boundaries (0-100) separating risk levels.',
    config_value: DEFAULT_RISK_BANDS,
    updated_at: new Date().toISOString(),
    updated_by: 'System Default',
  },
  bottleneck_thresholds: {
    id: 'bottleneck_thresholds',
    category: 'bottleneck',
    title: 'Active Bottleneck & SLA Delay Detection Thresholds',
    description: 'Statutory delay thresholds (in days) that flag active bottlenecks and determine severity.',
    config_value: DEFAULT_BOTTLENECK_THRESHOLDS,
    updated_at: new Date().toISOString(),
    updated_by: 'System Default',
  },
  attention_queue_criteria: {
    id: 'attention_queue_criteria',
    category: 'attention',
    title: 'National Attention Queue Qualification Rules',
    description: 'Operational criteria and delay thresholds determining which cases require immediate officer intervention.',
    config_value: DEFAULT_ATTENTION_QUEUE_CRITERIA,
    updated_at: new Date().toISOString(),
    updated_by: 'System Default',
  },
  escalation_rules: {
    id: 'escalation_rules',
    category: 'escalation',
    title: 'Automated Escalation & Alert Trigger Rules',
    description: 'Criteria governing automatic generation of persistent notifications and high-priority escalation flags.',
    config_value: DEFAULT_ESCALATION_RULES,
    updated_at: new Date().toISOString(),
    updated_by: 'System Default',
  },
  external_freshness_policy: {
    id: 'external_freshness_policy',
    category: 'sla',
    title: 'External Data Freshness SLA Policy',
    description: 'Statutory age thresholds determining whether external observations are classified as fresh, aging, stale, or expired.',
    config_value: DEFAULT_EXTERNAL_FRESHNESS_POLICY,
    updated_at: new Date().toISOString(),
    updated_by: 'System Default',
  },
  external_data_quality_policy: {
    id: 'external_data_quality_policy',
    category: 'sla',
    title: '5-Dimension External Data Quality Weighting Policy',
    description: 'Dimensional weighting factors governing composite data quality scores (0-100) and acceptance criteria.',
    config_value: DEFAULT_EXTERNAL_DATA_QUALITY_POLICY,
    updated_at: new Date().toISOString(),
    updated_by: 'System Default',
  },
  spatial_discrepancy_policy: {
    id: 'spatial_discrepancy_policy',
    category: 'risk',
    title: 'Cross-Source Spatial Discrepancy Distance Thresholds',
    description: 'Distance variance thresholds (in meters) governing discrepancy detection and severity classification.',
    config_value: DEFAULT_SPATIAL_DISCREPANCY_POLICY,
    updated_at: new Date().toISOString(),
    updated_by: 'System Default',
  },
  weather_risk_policy: {
    id: 'weather_risk_policy',
    category: 'risk',
    title: 'Meteorological & Environmental Decision Intelligence Policy',
    description: 'Rules governing how severe weather observations contribute to project schedule delay risk.',
    config_value: DEFAULT_WEATHER_RISK_POLICY,
    updated_at: new Date().toISOString(),
    updated_by: 'System Default',
  },
  predictive_delay_policy: {
    id: 'predictive_delay_policy',
    category: 'sla',
    title: 'Empirical Predictive Delay & Velocity Policy',
    description: 'Parameters governing historical velocity weighting, overdue acceleration, and environmental schedule projection.',
    config_value: DEFAULT_PREDICTIVE_DELAY_POLICY,
    updated_at: new Date().toISOString(),
    updated_by: 'System Default',
  },
  recommendation_policy: {
    id: 'recommendation_policy',
    category: 'risk',
    title: 'Statutory Action Recommendation Urgency Policy',
    description: 'Thresholds governing priority classification, tribunal recommendations, and advisory limits.',
    config_value: DEFAULT_RECOMMENDATION_POLICY,
    updated_at: new Date().toISOString(),
    updated_by: 'System Default',
  },
  portfolio_attention_policy: {
    id: 'portfolio_attention_policy',
    category: 'attention',
    title: 'National Operations Attention Queue Qualification Policy',
    description: 'Statutory criteria and data-quality triggers governing case inclusion in the executive attention queue.',
    config_value: DEFAULT_PORTFOLIO_ATTENTION_POLICY,
    updated_at: new Date().toISOString(),
    updated_by: 'System Default',
  },
  portfolio_trend_policy: {
    id: 'portfolio_trend_policy',
    category: 'sla',
    title: 'Portfolio Trend Analysis & Historical Observation Policy',
    description: 'Minimum observation windows, baseline spans, and sample sizes required for statistically valid trend reporting.',
    config_value: DEFAULT_PORTFOLIO_TREND_POLICY,
    updated_at: new Date().toISOString(),
    updated_by: 'System Default',
  },
  notification_policy: {
    id: 'notification_policy',
    category: 'attention',
    title: 'Operational Notification & Deduplication Policy',
    description: 'Configurable thresholds governing notification eligibility, deduplication time windows, and active case alert quotas.',
    config_value: DEFAULT_NOTIFICATION_POLICY,
    updated_at: new Date().toISOString(),
    updated_by: 'System Default',
  },
  escalation_policy: {
    id: 'escalation_policy',
    category: 'escalation',
    title: 'Statutory Multi-Tier Operational Escalation Policy',
    description: 'Rules governing deadline-based automated escalation, supervisory role progression, and statutory alert elevation.',
    config_value: DEFAULT_ESCALATION_POLICY,
    updated_at: new Date().toISOString(),
    updated_by: 'System Default',
  },
  operational_attention_policy: {
    id: 'operational_attention_policy',
    category: 'attention',
    title: 'National Executive Attention Qualification Policy',
    description: 'Unified statutory criteria governing case qualification for priority attention queues and proactive alerts.',
    config_value: DEFAULT_OPERATIONAL_ATTENTION_POLICY,
    updated_at: new Date().toISOString(),
    updated_by: 'System Default',
  },
  spatial_policy: {
    id: 'spatial_policy',
    category: 'attention',
    title: 'Spatial Analysis & Proximity Clustering Policy',
    description: 'Statutory search radii, spatial clustering thresholds, geodetic precision and geographic attention trigger thresholds.',
    config_value: DEFAULT_SPATIAL_POLICY,
    updated_at: new Date().toISOString(),
    updated_by: 'System Default',
  },
  integration_policy: {
    id: 'integration_policy',
    category: 'sla',
    title: 'Provider-Agnostic External Integration Policy',
    description: 'Statutory policy governing active providers for routing, geocoding, satellite layers, metadata, translation, and OCR.',
    config_value: DEFAULT_INTEGRATION_POLICY,
    updated_at: new Date().toISOString(),
    updated_by: 'System Default',
  },
};

// In-memory cache for ultra-fast evaluations without repeated DB roundtrips
let cachedPolicies: Map<string, SystemPolicy> = new Map(Object.entries(DEFAULT_POLICIES_MAP));
let lastCacheSync = 0;
const CACHE_TTL_MS = 60_000; // 1 minute cache TTL

/**
 * Synchronize policy cache from Supabase database if configured and reachable.
 */
export async function syncPoliciesFromDatabase(): Promise<void> {
  // The test harness must never load live production policy rows: fixtures
  // mutate policies in memory and expect read-after-write to see their own
  // change. Reading the real database here would both break that contract and
  // make tests depend on data nobody put there.
  if (!isSupabaseConfigured || isTestEnvironment()) {
    return;
  }

  const now = Date.now();
  if (now - lastCacheSync < CACHE_TTL_MS && cachedPolicies.size > 0) {
    return;
  }

  try {
    const supabase = getSupabase();
    const queryPromise = supabase.from('system_policies').select('*');
    const timeoutPromise = new Promise<any>((_, reject) =>
      setTimeout(() => reject(new Error('Database policy sync timed out')), 2000)
    );
    const { data, error } = await Promise.race([queryPromise, timeoutPromise]);
    if (error) {
      console.warn('[PolicyEngine] Could not sync policies from database:', error.message);
      return;
    }

    if (data && data.length > 0) {
      for (const row of data) {
        cachedPolicies.set(row.id, row as SystemPolicy);
      }
      lastCacheSync = now;
    }
  } catch (err: any) {
    console.warn('[PolicyEngine] Sync error (using memory cache):', err.message);
  }
}

/**
 * Retrieve a specific policy by key.
 */
export async function getPolicy<T = any>(key: string): Promise<SystemPolicy<T>> {
  await syncPoliciesFromDatabase();
  const policy = cachedPolicies.get(key) || DEFAULT_POLICIES_MAP[key];
  if (!policy) {
    throw new Error(`Policy not found: ${key}`);
  }
  return policy as SystemPolicy<T>;
}

/**
 * Synchronous accessor for high-frequency calculation loops.
 */
export function getPolicySync<T = any>(key: string): SystemPolicy<T> {
  const policy = cachedPolicies.get(key) || DEFAULT_POLICIES_MAP[key];
  if (!policy) {
    throw new Error(`Policy not found: ${key}`);
  }
  return policy as SystemPolicy<T>;
}

export function getRiskWeightsSync(): RiskScoringPolicy {
  return getPolicySync<RiskScoringPolicy>('risk_scoring_weights').config_value;
}

export function getRiskBandsSync(): RiskBandsPolicy {
  return getPolicySync<RiskBandsPolicy>('risk_bands').config_value;
}

export function getBottleneckThresholdsSync(): BottleneckThresholdsPolicy {
  return getPolicySync<BottleneckThresholdsPolicy>('bottleneck_thresholds').config_value;
}

export function getAttentionQueueCriteriaSync(): AttentionQueuePolicy {
  return getPolicySync<AttentionQueuePolicy>('attention_queue_criteria').config_value;
}

export function getEscalationRulesSync(): EscalationRulesPolicy {
  return getPolicySync<EscalationRulesPolicy>('escalation_rules').config_value;
}

export function getFreshnessPolicySync(): ExternalFreshnessPolicy {
  return getPolicySync<ExternalFreshnessPolicy>('external_freshness_policy').config_value;
}

export function getDataQualityPolicySync(): ExternalDataQualityPolicy {
  return getPolicySync<ExternalDataQualityPolicy>('external_data_quality_policy').config_value;
}

export function getSpatialDiscrepancyPolicySync(): SpatialDiscrepancyPolicy {
  return getPolicySync<SpatialDiscrepancyPolicy>('spatial_discrepancy_policy').config_value;
}

export function getWeatherRiskPolicySync(): WeatherRiskPolicy {
  return getPolicySync<WeatherRiskPolicy>('weather_risk_policy').config_value;
}

export function getPredictiveDelayPolicySync(): PredictiveDelayPolicy {
  return getPolicySync<PredictiveDelayPolicy>('predictive_delay_policy').config_value;
}

export function getRecommendationPolicySync(): RecommendationPolicy {
  return getPolicySync<RecommendationPolicy>('recommendation_policy').config_value;
}

export function getPortfolioAttentionPolicySync(): PortfolioAttentionPolicy {
  return getPolicySync<PortfolioAttentionPolicy>('portfolio_attention_policy').config_value;
}

export function getPortfolioTrendPolicySync(): PortfolioTrendPolicy {
  return getPolicySync<PortfolioTrendPolicy>('portfolio_trend_policy').config_value;
}

export function getNotificationPolicySync(): NotificationPolicy {
  return getPolicySync<NotificationPolicy>('notification_policy').config_value;
}

export function getEscalationPolicySync(): EscalationPolicy {
  return getPolicySync<EscalationPolicy>('escalation_policy').config_value;
}

export function getOperationalAttentionPolicySync(): OperationalAttentionPolicy {
  return getPolicySync<OperationalAttentionPolicy>('operational_attention_policy').config_value;
}

export function getSpatialPolicySync(): SpatialPolicy {
  return getPolicySync<SpatialPolicy>('spatial_policy').config_value;
}

export function getIntegrationPolicySync(): IntegrationPolicy {
  return getPolicySync<IntegrationPolicy>('integration_policy').config_value;
}

export async function getIntegrationPolicy(): Promise<IntegrationPolicy> {
  const policy = await getPolicy<IntegrationPolicy>('integration_policy');
  return policy.config_value;
}

export async function updateIntegrationPolicy(
  patch: Partial<IntegrationPolicy>,
  actorName?: string,
  actorId?: string
): Promise<IntegrationPolicy> {
  // Read from the synchronous in-memory cache so the state change, cache update and
  // audit append all apply within the caller's tick — async-only state application
  // previously caused read-after-write races for synchronous consumers (e.g.
  // getAvailableLayers) and could leak a late audit event into unrelated flows when
  // callers intentionally did not await the returned persistence promise.
  const current = getIntegrationPolicySync();
  const updated: IntegrationPolicy = { ...current, ...patch };
  const saved = await updatePolicy<IntegrationPolicy>({
    key: 'integration_policy',
    config_value: updated,
    actor_name: actorName,
    actor_id: actorId,
  });
  return saved.config_value;
}

/**
 * Retrieve all registered system policies.
 */
export async function getAllPolicies(): Promise<SystemPolicy[]> {
  await syncPoliciesFromDatabase();
  return Array.from(cachedPolicies.values());
}

/**
 * Update a system policy persistently with audit logging.
 */
export async function updatePolicy<T = any>(params: {
  key: string;
  config_value: T;
  actor_name?: string;
  actor_id?: string;
}): Promise<SystemPolicy<T>> {
  const existing = cachedPolicies.get(params.key) || DEFAULT_POLICIES_MAP[params.key];
  if (!existing) {
    throw new Error(`Unknown policy key: ${params.key}`);
  }

  const updatedPolicy: SystemPolicy<T> = {
    ...existing,
    config_value: params.config_value,
    updated_at: new Date().toISOString(),
    updated_by: params.actor_name || 'System Administrator',
  };

  // 1. Update in-memory cache
  cachedPolicies.set(params.key, updatedPolicy);

  // 2. Log audit event BEFORE async persistence: logCaseEvent appends to the
  //    in-memory audit trail synchronously, so the event is recorded in the
  //    caller's tick even when the caller does not await this function.
  await logCaseEvent({
    event_type: 'POLICY_UPDATED',
    title: `Policy Updated: ${existing.title}`,
    description: `Policy "${params.key}" modified by ${params.actor_name || 'System Administrator'}.`,
    actor_name: params.actor_name || 'System Administrator',
    actor_id: params.actor_id,
    metadata: {
      policy_id: params.key,
      category: existing.category,
      previous_value: existing.config_value,
      new_value: params.config_value,
    },
  });

  // 3. Persist to Supabase if configured.
  //    The test harness shares `.env` credentials: a fixture updating a policy
  //    in memory must not rewrite the live policy rows.
  if (isSupabaseConfigured && !isTestEnvironment()) {
    try {
      const supabase = getSupabase();
      const { error } = await supabase
        .from('system_policies')
        .upsert({
          id: params.key,
          category: existing.category,
          title: existing.title,
          description: existing.description,
          config_value: params.config_value,
          updated_at: updatedPolicy.updated_at,
          updated_by: updatedPolicy.updated_by,
        });

      if (error) {
        console.error('[PolicyEngine] Error saving policy to DB:', error.message);
      }
    } catch (err: any) {
      console.warn('[PolicyEngine] Database update failed:', err.message);
    }
  }

  return updatedPolicy;
}

/**
 * Reset policies back to institutional defaults (useful in tests).
 */
export function resetPoliciesToDefaults(): void {
  cachedPolicies = new Map(Object.entries(DEFAULT_POLICIES_MAP));
  lastCacheSync = 0;
}
