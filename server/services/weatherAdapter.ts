import { getSupabase, isSupabaseConfigured } from '../config/supabase';
import { isTestEnvironment } from '../config/runtimeEnv';
import {
  ExternalObservation,
  NormalizedWeatherValues,
  FreshnessEvaluation,
  DataQualityAssessment,
} from '../../shared/types';
import { recordProvenance } from './provenanceService';
import { evaluateFreshness, getFreshnessConfig } from './freshnessEngine';
import { calculateDataQuality } from './dataQualityService';

// In-memory observation cache for test isolation and offline resilience
const IN_MEMORY_OBSERVATIONS: Map<string, ExternalObservation> = new Map();

/**
 * Maps WMO Weather Interpretation Codes (WW) to standard human-readable conditions.
 * WMO Code Table 4677 standard.
 */
export function decodeWmoWeatherCode(code?: number): string {
  if (code === undefined || code === null) return 'Unknown';
  switch (code) {
    case 0:
      return 'Clear Sky';
    case 1:
      return 'Mainly Clear';
    case 2:
      return 'Partly Cloudy';
    case 3:
      return 'Overcast';
    case 45:
    case 48:
      return 'Fog & Depositing Rime Fog';
    case 51:
    case 53:
    case 55:
      return 'Drizzle (Light/Moderate/Dense)';
    case 61:
      return 'Slight Rain';
    case 63:
      return 'Moderate Rain';
    case 65:
      return 'Heavy Rain';
    case 71:
    case 73:
    case 75:
      return 'Snowfall (Slight/Moderate/Heavy)';
    case 80:
    case 81:
    case 82:
      return 'Rain Showers (Violent/Heavy)';
    case 95:
      return 'Thunderstorm (Slight/Moderate)';
    case 96:
    case 99:
      return 'Thunderstorm with Hail';
    default:
      return `Atmospheric Condition (Code ${code})`;
  }
}

export interface FetchWeatherOptions {
  entityType?: string; // 'case' | 'project' | 'location'
  entityId?: string;
  bypassCache?: boolean;
  endpointUrl?: string; // Custom or simulated provider endpoint
}

export interface WeatherFetchResult {
  observation: ExternalObservation | null;
  freshness: FreshnessEvaluation;
  quality: DataQualityAssessment;
  status: 'operational' | 'degraded' | 'failed' | 'not_configured' | 'data_unavailable' | 'stale';
  is_stale: boolean;
  message: string;
}

/**
 * Validates geographic coordinate values strictly without fabricating fallbacks.
 */
export function validateCoordinates(latitude: number, longitude: number): void {
  if (typeof latitude !== 'number' || typeof longitude !== 'number' || isNaN(latitude) || isNaN(longitude)) {
    throw new Error(`Invalid non-numeric coordinates: lat=${latitude}, lng=${longitude}`);
  }
  if (latitude < -90 || latitude > 90) {
    throw new Error(`Latitude ${latitude} is out of statutory WGS-84 bounds [-90, 90]`);
  }
  if (longitude < -180 || longitude > 180) {
    throw new Error(`Longitude ${longitude} is out of statutory WGS-84 bounds [-180, 180]`);
  }
}

/**
 * Retrieves live weather & atmospheric observations from the genuine Open-Meteo endpoint.
 * Fallback to stale cached record if remote provider is unreachable.
 * Never fabricates values.
 */
export async function getLiveWeatherObservation(
  latitude: number,
  longitude: number,
  options: FetchWeatherOptions = {}
): Promise<WeatherFetchResult> {
  validateCoordinates(latitude, longitude);

  const entityType = options.entityType || 'location';
  const entityId = options.entityId || `geo-${latitude.toFixed(4)}_${longitude.toFixed(4)}`;
  const cacheKey = `${entityType}:${entityId}`;

  // 1. Check existing cached observation if not explicitly bypassing cache
  const cachedObservation = await getCachedObservation(entityType, entityId);
  if (cachedObservation && !options.bypassCache) {
    const freshness = evaluateFreshness(cachedObservation.observed_at, cachedObservation.retrieved_at);
    // If still fresh (< 30 minutes old), return cached observation
    if (freshness.is_fresh) {
      const quality = calculateDataQuality({
        observation: cachedObservation,
        freshness,
        sourceOperational: true,
      });
      return {
        observation: cachedObservation,
        freshness,
        quality,
        status: 'operational',
        is_stale: false,
        message: `Current fresh observation retrieved from cache (${freshness.observed_age_formatted}).`,
      };
    }
  }

  // 2. Query Live Open-Meteo API (or custom endpointUrl)
  const endpoint =
    options.endpointUrl ||
    `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,precipitation,rain,weather_code,wind_speed_10m,surface_pressure&timezone=auto`;
  const startTime = Date.now();

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    const response = await fetch(endpoint, {
      headers: {
        'User-Agent': 'BhoomiSetu-Government-Land-Platform/2.0 (contact: tech@bhoomisetu.gov.in)',
      },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Open-Meteo API returned HTTP ${response.status}: ${response.statusText}`);
    }

    const payload = await response.json();
    if (!payload.current) {
      throw new Error('Malformed Open-Meteo API response: missing "current" observation block.');
    }

    const current = payload.current;
    const currentUnits = payload.current_units || {};

    // Strictly normalize fields actually returned
    const normalizedValues: NormalizedWeatherValues = {};
    if ('temperature_2m' in current) normalizedValues.temperature_c = current.temperature_2m;
    if ('relative_humidity_2m' in current) normalizedValues.relative_humidity_pct = current.relative_humidity_2m;
    if ('precipitation' in current) normalizedValues.precipitation_mm = current.precipitation;
    if ('rain' in current) normalizedValues.rain_mm = current.rain;
    if ('weather_code' in current) {
      normalizedValues.weather_code = current.weather_code;
      normalizedValues.weather_condition = decodeWmoWeatherCode(current.weather_code);
    }
    if ('wind_speed_10m' in current) normalizedValues.wind_speed_kmh = current.wind_speed_10m;
    if ('surface_pressure' in current) normalizedValues.surface_pressure_hpa = current.surface_pressure;

    const units: Record<string, string> = {
      temperature_c: currentUnits.temperature_2m || '°C',
      relative_humidity_pct: currentUnits.relative_humidity_2m || '%',
      precipitation_mm: currentUnits.precipitation || 'mm',
      rain_mm: currentUnits.rain || 'mm',
      wind_speed_kmh: currentUnits.wind_speed_10m || 'km/h',
      surface_pressure_hpa: currentUnits.surface_pressure || 'hPa',
    };

    const observedAt = current.time ? new Date(current.time).toISOString() : new Date().toISOString();
    const retrievedAt = new Date().toISOString();

    const freshness = evaluateFreshness(observedAt, retrievedAt);

    // Record statutory provenance
    const provRecord = await recordProvenance({
      entityType,
      entityId,
      fieldName: 'weather_environmental_conditions',
      provenanceType: 'EXTERNALLY_SOURCED',
      sourceId: 'open_meteo',
      sourceRecordRef: `OpenMeteo-lat${latitude.toFixed(2)}-lng${longitude.toFixed(2)}-${Date.now()}`,
      observedAt,
      freshnessState: freshness.state,
      metadata: {
        provider: 'Open-Meteo API',
        coordinates: [latitude, longitude],
        elapsed_ms: Date.now() - startTime,
      },
    });

    const quality = calculateDataQuality({
      observation: {
        provider: 'Open-Meteo',
        normalized_values: normalizedValues,
        coordinates: { latitude, longitude },
      },
      freshness,
      sourceOperational: true,
    });

    const newObservation: ExternalObservation = {
      id: `obs-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      source_id: 'open_meteo',
      provider: 'Open-Meteo',
      observation_type: 'weather',
      entity_type: entityType,
      entity_id: entityId,
      coordinates: { latitude, longitude },
      observed_at: observedAt,
      retrieved_at: retrievedAt,
      valid_from: observedAt,
      valid_until: new Date(Date.now() + 1800 * 1000).toISOString(),
      raw_payload_ref: `open_meteo:${latitude},${longitude}`,
      normalized_values: normalizedValues,
      units,
      confidence_score: 1.0,
      quality_score: quality.overall_score,
      quality_breakdown: quality,
      freshness_state: freshness.state,
      provenance_id: provRecord.id,
      metadata: {
        elevation: payload.elevation,
        timezone: payload.timezone,
        generationtime_ms: payload.generationtime_ms,
      },
      created_at: new Date().toISOString(),
    };

    // Persist observation to Supabase and in-memory cache
    await persistObservation(newObservation);

    return {
      observation: newObservation,
      freshness,
      quality,
      status: 'operational',
      is_stale: false,
      message: `Live meteorological observation retrieved successfully (${Date.now() - startTime}ms).`,
    };
  } catch (err: any) {
    // 3. Error Fallback: Check if cached observation is available
    if (cachedObservation) {
      const freshness = evaluateFreshness(cachedObservation.observed_at, cachedObservation.retrieved_at);
      const quality = calculateDataQuality({
        observation: cachedObservation,
        freshness,
        sourceOperational: false,
      });

      return {
        observation: {
          ...cachedObservation,
          freshness_state: 'stale',
        },
        freshness: {
          ...freshness,
          state: 'stale',
          is_fresh: false,
          is_stale: true,
          freshness_label: `Data Stale (Last retrieved ${freshness.retrieved_age_formatted})`,
        },
        quality,
        status: 'stale',
        is_stale: true,
        message: `Provider unreachable (${err.message}). Displaying last valid cached observation.`,
      };
    }

    // 4. No cached observation exists: honest DATA_UNAVAILABLE state without fabricating
    const emptyFreshness = evaluateFreshness(new Date(0).toISOString(), new Date(0).toISOString());
    const emptyQuality = calculateDataQuality({
      observation: { provider: 'Open-Meteo' },
      freshness: emptyFreshness,
      sourceOperational: false,
    });

    return {
      observation: null,
      freshness: emptyFreshness,
      quality: emptyQuality,
      status: 'data_unavailable',
      is_stale: false,
      message: `Data unavailable: Weather provider failed (${err.message}) and no cached observation exists.`,
    };
  }
}

/**
 * Retrieves cached observation from Supabase or in-memory fallback.
 */
export async function getCachedObservation(
  entityType: string,
  entityId: string
): Promise<ExternalObservation | null> {
  if (isSupabaseConfigured) {
    try {
      const client = getSupabase();
      const { data, error } = await client
        .from('external_observations')
        .select('*')
        .eq('entity_type', entityType)
        .eq('entity_id', entityId)
        .order('retrieved_at', { ascending: false })
        .limit(1)
        .single();

      if (!error && data) {
        return data as ExternalObservation;
      }
    } catch {
      // Fall through to memory
    }
  }

  const mem = IN_MEMORY_OBSERVATIONS.get(`${entityType}:${entityId}`);
  return mem || null;
}

/**
 * Persists normalized external observation.
 */
export async function persistObservation(obs: ExternalObservation): Promise<ExternalObservation> {
  const key = `${obs.entity_type}:${obs.entity_id}`;
  IN_MEMORY_OBSERVATIONS.set(key, obs);

  if (isSupabaseConfigured && !isTestEnvironment()) {
    try {
      const client = getSupabase();
      const { data, error } = await client
        .from('external_observations')
        .insert({
          source_id: obs.source_id,
          provider: obs.provider,
          observation_type: obs.observation_type,
          entity_type: obs.entity_type,
          entity_id: obs.entity_id,
          coordinates: obs.coordinates,
          observed_at: obs.observed_at,
          retrieved_at: obs.retrieved_at,
          valid_from: obs.valid_from,
          valid_until: obs.valid_until,
          raw_payload_ref: obs.raw_payload_ref,
          normalized_values: obs.normalized_values,
          units: obs.units,
          confidence_score: obs.confidence_score,
          quality_score: obs.quality_score,
          quality_breakdown: obs.quality_breakdown,
          freshness_state: obs.freshness_state,
          provenance_id: obs.provenance_id,
          request_id: obs.request_id,
          metadata: obs.metadata,
        })
        .select('*')
        .single();

      if (!error && data) {
        return data as ExternalObservation;
      }
    } catch {
      // Retained in memory
    }
  }

  return obs;
}

/**
 * Clears the in-memory observation cache (useful in tests).
 */
export function clearInMemoryObservations(): void {
  IN_MEMORY_OBSERVATIONS.clear();
}
