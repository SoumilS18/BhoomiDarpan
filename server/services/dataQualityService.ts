import { DataQualityAssessment, DataQualityDimension, ExternalObservation, FreshnessEvaluation } from '../../shared/types';
import { getDataQualityPolicySync } from './policyEngine';

export interface QualityEvaluationParams {
  observation: Partial<ExternalObservation>;
  freshness: FreshnessEvaluation;
  sourceOperational?: boolean;
  expectedFields?: string[];
}

/**
 * Transparent, explainable Data Quality scoring engine.
 * Calculates an auditable 0-100 quality score with dimensional explanations.
 * Weights and acceptance thresholds are dynamically loaded from configured system policy.
 */
export function calculateDataQuality(params: QualityEvaluationParams): DataQualityAssessment {
  const dimensions: DataQualityDimension[] = [];
  const { observation, freshness, sourceOperational = true } = params;
  const qualityPolicy = getDataQualityPolicySync();

  // --------------------------------------------------------------------------
  // Dimension 1: Source Health & Operational State
  // --------------------------------------------------------------------------
  const weight1 = qualityPolicy.connectivity_weight;
  let score1 = 0;
  let status1: 'passed' | 'warning' | 'failed' = 'failed';
  let explanation1 = 'Data source is unreachable or reports degraded connectivity.';

  if (sourceOperational) {
    score1 = 100;
    status1 = 'passed';
    explanation1 = `Source "${observation.provider || 'Provider'}" is operational with active network handshake.`;
  } else {
    score1 = 20;
    status1 = 'failed';
    explanation1 = `Source reported error or offline state. Observation loaded from stale cache.`;
  }

  dimensions.push({
    dimension: 'Source Health & Connectivity',
    score: score1,
    weight: weight1,
    weighted_score: Math.round(score1 * weight1),
    status: status1,
    explanation: explanation1,
  });

  // --------------------------------------------------------------------------
  // Dimension 2: Temporal Freshness
  // --------------------------------------------------------------------------
  const weight2 = qualityPolicy.freshness_weight;
  let score2 = 0;
  let status2: 'passed' | 'warning' | 'failed' = 'failed';
  let explanation2 = 'Data is stale or expired beyond statutory validity thresholds.';

  if (freshness.state === 'fresh') {
    score2 = 100;
    status2 = 'passed';
    explanation2 = `Observation is fresh (${freshness.observed_age_formatted}), well within configured SLA window.`;
  } else if (freshness.state === 'aging') {
    score2 = 75;
    status2 = 'warning';
    explanation2 = `Observation is aging (${freshness.observed_age_formatted}). Re-synchronization recommended soon.`;
  } else if (freshness.state === 'stale') {
    score2 = 30;
    status2 = 'warning';
    explanation2 = `Observation is stale (${freshness.observed_age_formatted}). Should not be relied upon for critical operations.`;
  } else {
    score2 = 0;
    status2 = 'failed';
    explanation2 = `Observation has expired (${freshness.observed_age_formatted}). Requires urgent refresh.`;
  }

  dimensions.push({
    dimension: 'Temporal Freshness',
    score: score2,
    weight: weight2,
    weighted_score: Math.round(score2 * weight2),
    status: status2,
    explanation: explanation2,
  });

  // --------------------------------------------------------------------------
  // Dimension 3: Field Completeness
  // --------------------------------------------------------------------------
  const weight3 = qualityPolicy.completeness_weight;
  const values = observation.normalized_values || {};
  const defaultExpected = params.expectedFields || ['temperature_c', 'relative_humidity_pct', 'wind_speed_kmh'];
  
  let populatedCount = 0;
  defaultExpected.forEach((field) => {
    const val = (values as any)[field];
    if (val !== undefined && val !== null && !Number.isNaN(val)) {
      populatedCount++;
    }
  });

  const completenessRatio = defaultExpected.length > 0 ? populatedCount / defaultExpected.length : 1;
  const score3 = Math.round(completenessRatio * 100);
  const status3: 'passed' | 'warning' | 'failed' = score3 >= 80 ? 'passed' : score3 >= 50 ? 'warning' : 'failed';
  const explanation3 = `${populatedCount} of ${defaultExpected.length} expected fields successfully normalized (${score3}% completeness).`;

  dimensions.push({
    dimension: 'Payload Completeness',
    score: score3,
    weight: weight3,
    weighted_score: Math.round(score3 * weight3),
    status: status3,
    explanation: explanation3,
  });

  // --------------------------------------------------------------------------
  // Dimension 4: Spatial & Coordinate Validity
  // --------------------------------------------------------------------------
  const weight4 = qualityPolicy.spatial_precision_weight;
  let score4 = 0;
  let status4: 'passed' | 'warning' | 'failed' = 'failed';
  let explanation4 = 'Coordinates missing or invalid.';

  const coords = observation.coordinates;
  if (coords && typeof coords.latitude === 'number' && typeof coords.longitude === 'number') {
    const { latitude: lat, longitude: lng } = coords;
    const isLatValid = !isNaN(lat) && lat >= -90 && lat <= 90;
    const isLngValid = !isNaN(lng) && lng >= -180 && lng <= 180;
    const isNullIsland = Math.abs(lat) < 0.0001 && Math.abs(lng) < 0.0001;

    if (isLatValid && isLngValid && !isNullIsland) {
      score4 = 100;
      status4 = 'passed';
      explanation4 = `Valid WGS-84 coordinates verified: [${lat.toFixed(4)}, ${lng.toFixed(4)}].`;
    } else if (isNullIsland) {
      score4 = 20;
      status4 = 'warning';
      explanation4 = 'Coordinates point to (0,0) (Null Island), likely an uninitialized GIS coordinate.';
    } else {
      score4 = 0;
      status4 = 'failed';
      explanation4 = `Coordinates [${lat}, ${lng}] exceed statutory WGS-84 geographic boundaries.`;
    }
  } else {
    score4 = 0;
    status4 = 'failed';
    explanation4 = 'No spatial coordinates provided with external observation.';
  }

  dimensions.push({
    dimension: 'Spatial & Coordinate Validity',
    score: score4,
    weight: weight4,
    weighted_score: Math.round(score4 * weight4),
    status: status4,
    explanation: explanation4,
  });

  // --------------------------------------------------------------------------
  // Dimension 5: Physical & Statutory Plausibility
  // --------------------------------------------------------------------------
  const weight5 = qualityPolicy.plausibility_weight;
  let plausibilityViolations = 0;
  let plausibilityChecks = 0;

  // Temperature plausibility (-50°C to 65°C)
  if ('temperature_c' in values && typeof values.temperature_c === 'number') {
    plausibilityChecks++;
    if (values.temperature_c < -50 || values.temperature_c > 65) plausibilityViolations++;
  }

  // Relative humidity (0% to 100%)
  if ('relative_humidity_pct' in values && typeof values.relative_humidity_pct === 'number') {
    plausibilityChecks++;
    if (values.relative_humidity_pct < 0 || values.relative_humidity_pct > 100) plausibilityViolations++;
  }

  // Precipitation (>= 0 mm)
  if ('precipitation_mm' in values && typeof values.precipitation_mm === 'number') {
    plausibilityChecks++;
    if (values.precipitation_mm < 0 || values.precipitation_mm > 1000) plausibilityViolations++;
  }

  // Wind speed (0 to 400 km/h)
  if ('wind_speed_kmh' in values && typeof values.wind_speed_kmh === 'number') {
    plausibilityChecks++;
    if (values.wind_speed_kmh < 0 || values.wind_speed_kmh > 400) plausibilityViolations++;
  }

  // Surface pressure (300 to 1100 hPa)
  if ('surface_pressure_hpa' in values && typeof values.surface_pressure_hpa === 'number') {
    plausibilityChecks++;
    if (values.surface_pressure_hpa < 300 || values.surface_pressure_hpa > 1100) plausibilityViolations++;
  }

  const score5 = plausibilityChecks === 0 ? 100 : Math.round(((plausibilityChecks - plausibilityViolations) / plausibilityChecks) * 100);
  const status5: 'passed' | 'warning' | 'failed' = score5 === 100 ? 'passed' : score5 >= 50 ? 'warning' : 'failed';
  const explanation5 = plausibilityViolations === 0
    ? `All ${plausibilityChecks} numeric measurements fall within physically authentic ranges.`
    : `${plausibilityViolations} measurement(s) exceed plausible atmospheric physical limits.`;

  dimensions.push({
    dimension: 'Measurement Plausibility',
    score: score5,
    weight: weight5,
    weighted_score: Math.round(score5 * weight5),
    status: status5,
    explanation: explanation5,
  });

  // --------------------------------------------------------------------------
  // Overall Composite Score
  // --------------------------------------------------------------------------
  const overallScore = Math.min(100, Math.max(0, dimensions.reduce((acc, d) => acc + d.weighted_score, 0)));
  const isAcceptable = overallScore >= qualityPolicy.min_acceptable_score;

  let summary = `High quality observation (${overallScore}/100): verified source, fresh payload, and authentic measurement ranges.`;
  if (overallScore < 50) {
    summary = `Low quality observation (${overallScore}/100): degraded by ${dimensions.filter((d) => d.status === 'failed').map((d) => d.dimension).join(', ')}.`;
  } else if (overallScore < 70) {
    summary = `Moderate quality observation (${overallScore}/100): usable with caution; flagged for ${dimensions.filter((d) => d.status === 'warning').map((d) => d.dimension).join(', ')}.`;
  }

  return {
    overall_score: overallScore,
    is_acceptable: isAcceptable,
    dimensions,
    summary,
    evaluated_at: new Date().toISOString(),
  };
}
