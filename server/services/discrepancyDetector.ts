import { getSupabase, isSupabaseConfigured } from '../config/supabase';
import {
  DataDiscrepancy,
  DiscrepancyType,
  DiscrepancySeverity,
  DiscrepancyResolutionState,
} from '../../shared/types';
import { getSpatialDiscrepancyPolicySync } from './policyEngine';

const IN_MEMORY_DISCREPANCIES: DataDiscrepancy[] = [];

export interface SourceCandidate {
  sourceId: string;
  sourceName: string;
  timestamp?: string;
  coordinates?: { latitude: number; longitude: number } | null;
  administrativeLocation?: {
    state?: string;
    district?: string;
    sub_district?: string;
    village?: string;
  } | null;
  measurements?: Record<string, number>;
}

export interface DiscrepancyCheckResult {
  status: 'insufficient_sources' | 'discrepancies_detected' | 'consistent';
  message: string;
  discrepancies: DataDiscrepancy[];
}

/**
 * Calculates genuine great-circle distance between two coordinate pairs in kilometers (Haversine formula).
 */
export function calculateHaversineDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Detects cross-source discrepancies across multiple genuine external or statutory sources.
 * Strictly adheres to requirement: If < 2 sources, reports "Insufficient sources for cross-source comparison".
 */
export async function detectCrossSourceDiscrepancies(params: {
  entityType: string;
  entityId: string;
  sources: SourceCandidate[];
}): Promise<DiscrepancyCheckResult> {
  const { entityType, entityId, sources } = params;

  // 1. Single source check
  if (!sources || sources.length < 2) {
    return {
      status: 'insufficient_sources',
      message: 'Insufficient sources for cross-source comparison',
      discrepancies: [],
    };
  }

  const detected: DataDiscrepancy[] = [];

  // 2. Pairwise comparison
  for (let i = 0; i < sources.length; i++) {
    for (let j = i + 1; j < sources.length; j++) {
      const srcA = sources[i];
      const srcB = sources[j];

      // A. Coordinates comparison
      if (srcA.coordinates && srcB.coordinates) {
        const distKm = calculateHaversineDistanceKm(
          srcA.coordinates.latitude,
          srcA.coordinates.longitude,
          srcB.coordinates.latitude,
          srcB.coordinates.longitude
        );

        const spatialPolicy = getSpatialDiscrepancyPolicySync();
        const distMeters = distKm * 1000;

        // Threshold from configured policy
        if (distMeters > spatialPolicy.acceptable_distance_meters) {
          let severity: DiscrepancySeverity = 'low';
          if (distMeters > spatialPolicy.critical_severity_distance_meters) severity = 'critical';
          else if (distMeters > spatialPolicy.medium_severity_distance_meters) severity = 'medium';
          else severity = 'low';

          detected.push({
            id: `disc-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
            entity_type: entityType,
            entity_id: entityId,
            source_a: srcA.sourceId,
            source_b: srcB.sourceId,
            compared_field: 'coordinates',
            value_a: srcA.coordinates,
            value_b: srcB.coordinates,
            timestamp_a: srcA.timestamp || null,
            timestamp_b: srcB.timestamp || null,
            discrepancy_type: 'coordinates_mismatch',
            severity,
            detected_at: new Date().toISOString(),
            resolution_state: 'unresolved',
            metadata: {
              distance_delta_km: parseFloat(distKm.toFixed(3)),
              source_a_name: srcA.sourceName,
              source_b_name: srcB.sourceName,
            },
            created_at: new Date().toISOString(),
          });
        }
      }

      // B. Administrative boundary naming comparison
      if (srcA.administrativeLocation && srcB.administrativeLocation) {
        const locA = srcA.administrativeLocation;
        const locB = srcB.administrativeLocation;

        if (
          locA.district &&
          locB.district &&
          locA.district.trim().toLowerCase() !== locB.district.trim().toLowerCase()
        ) {
          detected.push({
            id: `disc-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
            entity_type: entityType,
            entity_id: entityId,
            source_a: srcA.sourceId,
            source_b: srcB.sourceId,
            compared_field: 'district',
            value_a: locA.district,
            value_b: locB.district,
            timestamp_a: srcA.timestamp || null,
            timestamp_b: srcB.timestamp || null,
            discrepancy_type: 'administrative_boundary_mismatch',
            severity: 'high',
            detected_at: new Date().toISOString(),
            resolution_state: 'unresolved',
            metadata: {
              source_a_name: srcA.sourceName,
              source_b_name: srcB.sourceName,
            },
            created_at: new Date().toISOString(),
          });
        }
      }

      // C. Numeric measurements comparison (e.g. temperature or precipitation differences)
      if (srcA.measurements && srcB.measurements) {
        for (const [field, valA] of Object.entries(srcA.measurements)) {
          if (field in srcB.measurements) {
            const valB = srcB.measurements[field];
            const diff = Math.abs(valA - valB);
            // Example: Temperature difference > 5 degrees between two weather sources
            if (field.includes('temperature') && diff > 5.0) {
              detected.push({
                id: `disc-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
                entity_type: entityType,
                entity_id: entityId,
                source_a: srcA.sourceId,
                source_b: srcB.sourceId,
                compared_field: field,
                value_a: valA,
                value_b: valB,
                timestamp_a: srcA.timestamp || null,
                timestamp_b: srcB.timestamp || null,
                discrepancy_type: 'measurement_variance',
                severity: diff > 10 ? 'high' : 'medium',
                detected_at: new Date().toISOString(),
                resolution_state: 'unresolved',
                metadata: { variance_delta: diff },
                created_at: new Date().toISOString(),
              });
            }
          }
        }
      }
    }
  }

  // Persist detected discrepancies
  for (const d of detected) {
    await persistDiscrepancy(d);
  }

  if (detected.length > 0) {
    return {
      status: 'discrepancies_detected',
      message: `${detected.length} cross-source discrepancy/discrepancies detected between ${sources.length} sources. Flagged for officer review.`,
      discrepancies: detected,
    };
  }

  return {
    status: 'consistent',
    message: `Cross-source comparison between ${sources.length} sources verified consistent.`,
    discrepancies: [],
  };
}

/**
 * Persists discrepancy record to Supabase and in-memory cache.
 */
export async function persistDiscrepancy(d: DataDiscrepancy): Promise<DataDiscrepancy> {
  IN_MEMORY_DISCREPANCIES.push(d);

  if (isSupabaseConfigured) {
    try {
      const client = getSupabase();
      const { data, error } = await client
        .from('data_discrepancies')
        .insert({
          entity_type: d.entity_type,
          entity_id: d.entity_id,
          source_a: d.source_a,
          source_b: d.source_b,
          compared_field: d.compared_field,
          value_a: d.value_a,
          value_b: d.value_b,
          timestamp_a: d.timestamp_a,
          timestamp_b: d.timestamp_b,
          discrepancy_type: d.discrepancy_type,
          severity: d.severity,
          detected_at: d.detected_at,
          resolution_state: d.resolution_state,
          metadata: d.metadata,
        })
        .select('*')
        .single();

      if (!error && data) {
        return data as DataDiscrepancy;
      }
    } catch {
      // Retained in memory
    }
  }

  return d;
}

/**
 * Lists discrepancies, optionally filtered by entity.
 */
export async function listDiscrepancies(filter?: {
  entityType?: string;
  entityId?: string;
  resolutionState?: DiscrepancyResolutionState;
}): Promise<DataDiscrepancy[]> {
  if (isSupabaseConfigured) {
    try {
      const client = getSupabase();
      let query = client.from('data_discrepancies').select('*').order('detected_at', { ascending: false });

      if (filter?.entityType) query = query.eq('entity_type', filter.entityType);
      if (filter?.entityId) query = query.eq('entity_id', filter.entityId);
      if (filter?.resolutionState) query = query.eq('resolution_state', filter.resolutionState);

      const { data, error } = await query;
      if (!error && data) {
        return data as DataDiscrepancy[];
      }
    } catch {}
  }

  return IN_MEMORY_DISCREPANCIES.filter((d) => {
    if (filter?.entityType && d.entity_type !== filter.entityType) return false;
    if (filter?.entityId && d.entity_id !== filter.entityId) return false;
    if (filter?.resolutionState && d.resolution_state !== filter.resolutionState) return false;
    return true;
  });
}

/**
 * Resolves a discrepancy with officer notes and audit attribution.
 */
export async function resolveDiscrepancy(
  id: string,
  resolution: {
    state: DiscrepancyResolutionState;
    notes?: string;
    resolvedBy: string;
  }
): Promise<DataDiscrepancy | null> {
  const resolvedAt = new Date().toISOString();

  if (isSupabaseConfigured) {
    try {
      const client = getSupabase();
      const { data, error } = await client
        .from('data_discrepancies')
        .update({
          resolution_state: resolution.state,
          resolution_notes: resolution.notes || null,
          resolved_by: resolution.resolvedBy,
          resolved_at: resolvedAt,
        })
        .eq('id', id)
        .select('*')
        .single();

      if (!error && data) {
        return data as DataDiscrepancy;
      }
    } catch {}
  }

  const mem = IN_MEMORY_DISCREPANCIES.find((d) => d.id === id);
  if (mem) {
    mem.resolution_state = resolution.state;
    mem.resolution_notes = resolution.notes || null;
    mem.resolved_by = resolution.resolvedBy;
    mem.resolved_at = resolvedAt;
    return mem;
  }

  return null;
}

/**
 * Clears in-memory discrepancies (useful in tests).
 */
export function clearInMemoryDiscrepancies(): void {
  IN_MEMORY_DISCREPANCIES.length = 0;
}
