import { FreshnessEvaluation, FreshnessState, SourceFreshnessConfig } from '../../shared/types';

/**
 * Default statutory & empirical freshness policies per source and observation type.
 * Thresholds are configurable and data-driven, never buried as ad-hoc magic numbers.
 */
export const DEFAULT_FRESHNESS_CONFIGS: Record<string, SourceFreshnessConfig> = {
  // Weather observations: rapid change rate
  weather: {
    fresh_seconds: 1800,   // < 30 minutes: Fresh
    aging_seconds: 7200,   // 30m - 2 hours: Aging
    stale_seconds: 86400,  // 2h - 24 hours: Stale; > 24 hours: Expired
  },
  // Open-Meteo specific
  open_meteo: {
    fresh_seconds: 1800,   // < 30 minutes
    aging_seconds: 7200,   // 2 hours
    stale_seconds: 86400,  // 24 hours
  },
  // Spatial Geocoding: moderate change rate
  geocoding: {
    fresh_seconds: 86400,   // < 24 hours
    aging_seconds: 604800,  // 1 - 7 days
    stale_seconds: 2592000, // 7 - 30 days
  },
  nominatim_osm: {
    fresh_seconds: 86400,
    aging_seconds: 604800,
    stale_seconds: 2592000,
  },
  // Administrative master records: slow change rate
  administrative_data: {
    fresh_seconds: 2592000,  // < 30 days
    aging_seconds: 7776000,  // 30 - 90 days
    stale_seconds: 31536000, // 90 - 365 days
  },
  lgd_india: {
    fresh_seconds: 2592000,
    aging_seconds: 7776000,
    stale_seconds: 31536000,
  },
};

import { getFreshnessPolicySync } from './policyEngine';

/**
 * Returns the effective freshness policy for a source or data type.
 * Priority: Configured policyEngine -> Source-specific policy -> Default SLA.
 */
export function getFreshnessConfig(sourceIdOrType: string): SourceFreshnessConfig {
  if (sourceIdOrType === 'weather' || sourceIdOrType === 'open_meteo') {
    try {
      const configuredPolicy = getFreshnessPolicySync();
      if (configuredPolicy) {
        return {
          fresh_seconds: configuredPolicy.fresh_seconds,
          aging_seconds: configuredPolicy.aging_seconds,
          stale_seconds: configuredPolicy.stale_seconds,
        };
      }
    } catch {}
  }

  if (DEFAULT_FRESHNESS_CONFIGS[sourceIdOrType]) {
    return DEFAULT_FRESHNESS_CONFIGS[sourceIdOrType];
  }
  // Default fallback policy
  return {
    fresh_seconds: 3600,   // 1 hour
    aging_seconds: 14400,  // 4 hours
    stale_seconds: 86400,  // 24 hours
  };
}

/**
 * Formats a timestamp into human-readable relative time without external libraries.
 */
export function formatRelativeAge(isoDateStr?: string | null): string {
  if (!isoDateStr) return 'unknown';

  const timestamp = new Date(isoDateStr).getTime();
  if (isNaN(timestamp)) return 'invalid date';

  const diffMs = Date.now() - timestamp;
  if (diffMs < 0) return 'just now';

  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return `${diffSec}s ago`;

  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;

  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

/**
 * Evaluates the precise freshness state of an external observation.
 * Evaluates both the observation time (when the data occurred) and retrieval time (when BhoomiDarpan fetched it).
 */
export function evaluateFreshness(
  observedAt: string,
  retrievedAt: string,
  configOrSourceId?: SourceFreshnessConfig | string
): FreshnessEvaluation {
  const effectiveConfig =
    typeof configOrSourceId === 'string'
      ? getFreshnessConfig(configOrSourceId)
      : configOrSourceId || getFreshnessConfig('weather');

  const observedTime = new Date(observedAt).getTime();
  const retrievedTime = new Date(retrievedAt).getTime();
  const now = Date.now();

  // If timestamp is invalid or in the future by more than 5 minutes
  if (isNaN(observedTime) || isNaN(retrievedTime)) {
    return {
      state: 'unknown',
      age_seconds: 0,
      observed_age_formatted: 'unknown',
      retrieved_age_formatted: 'unknown',
      is_fresh: false,
      is_stale: true,
      is_expired: false,
      freshness_label: 'Unknown Freshness',
    };
  }

  // Age is calculated relative to observation time
  const ageSeconds = Math.max(0, Math.floor((now - observedTime) / 1000));
  const observedAgeFormatted = formatRelativeAge(observedAt);
  const retrievedAgeFormatted = formatRelativeAge(retrievedAt);

  let state: FreshnessState = 'fresh';
  let freshnessLabel = `Observed ${observedAgeFormatted} • Fresh`;

  if (ageSeconds > effectiveConfig.stale_seconds) {
    state = 'expired';
    freshnessLabel = `Data Expired (${observedAgeFormatted})`;
  } else if (ageSeconds > effectiveConfig.aging_seconds) {
    state = 'stale';
    freshnessLabel = `Data Stale (${observedAgeFormatted})`;
  } else if (ageSeconds > effectiveConfig.fresh_seconds) {
    state = 'aging';
    freshnessLabel = `Observed ${observedAgeFormatted} • Aging`;
  }

  return {
    state,
    age_seconds: ageSeconds,
    observed_age_formatted: observedAgeFormatted,
    retrieved_age_formatted: retrievedAgeFormatted,
    is_fresh: state === 'fresh',
    is_stale: state === 'stale' || state === 'expired',
    is_expired: state === 'expired',
    freshness_label: freshnessLabel,
  };
}
