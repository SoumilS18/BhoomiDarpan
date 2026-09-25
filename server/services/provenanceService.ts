import { getSupabase, isSupabaseConfigured } from '../config/supabase';
import { DataProvenance, ProvenanceType, VerificationStatus, FreshnessState } from '../../shared/types';

const IN_MEMORY_PROVENANCE: DataProvenance[] = [];

export interface RecordProvenanceParams {
  entityType: string;
  entityId: string;
  fieldName?: string;
  provenanceType: ProvenanceType;
  sourceId?: string;
  sourceRecordRef?: string;
  observedAt?: string;
  verificationStatus?: VerificationStatus;
  verifiedBy?: string;
  verifiedAt?: string;
  freshnessState?: FreshnessState;
  metadata?: Record<string, any>;
}

/**
 * Records an immutable provenance origin trail for any data entity or attribute.
 */
export async function recordProvenance(params: RecordProvenanceParams): Promise<DataProvenance> {
  const newRecord: DataProvenance = {
    id: `prov-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
    entity_type: params.entityType,
    entity_id: params.entityId,
    field_name: params.fieldName || '*',
    provenance_type: params.provenanceType,
    source_id: params.sourceId || null,
    source_record_ref: params.sourceRecordRef || null,
    retrieved_at: new Date().toISOString(),
    observed_at: params.observedAt || null,
    verification_status: params.verificationStatus || 'unverified',
    verified_by: params.verifiedBy || null,
    verified_at: params.verifiedAt || null,
    freshness_state: params.freshnessState || 'fresh',
    metadata: params.metadata || {},
    created_at: new Date().toISOString(),
  };

  IN_MEMORY_PROVENANCE.push(newRecord);

  if (isSupabaseConfigured) {
    try {
      const client = getSupabase();
      const { data, error } = await client
        .from('data_provenance')
        .insert({
          entity_type: newRecord.entity_type,
          entity_id: newRecord.entity_id,
          field_name: newRecord.field_name,
          provenance_type: newRecord.provenance_type,
          source_id: newRecord.source_id,
          source_record_ref: newRecord.source_record_ref,
          retrieved_at: newRecord.retrieved_at,
          observed_at: newRecord.observed_at,
          verification_status: newRecord.verification_status,
          verified_by: newRecord.verified_by,
          verified_at: newRecord.verified_at,
          freshness_state: newRecord.freshness_state,
          metadata: newRecord.metadata,
        })
        .select('*')
        .single();

      if (!error && data) {
        // Update in-memory record with remote id if assigned
        const index = IN_MEMORY_PROVENANCE.findIndex((p) => p.id === newRecord.id);
        if (index >= 0) {
          IN_MEMORY_PROVENANCE[index] = data as DataProvenance;
        }
        return data as DataProvenance;
      }
    } catch {
      // Fall through to memory
    }
  }

  return newRecord;
}

/**
 * Retrieves chronological provenance trail for a given entity.
 */
export async function getProvenanceForEntity(entityType: string, entityId: string): Promise<DataProvenance[]> {
  const remoteRecords: DataProvenance[] = [];

  if (isSupabaseConfigured) {
    try {
      const client = getSupabase();
      const { data, error } = await client
        .from('data_provenance')
        .select('*')
        .eq('entity_type', entityType)
        .eq('entity_id', entityId)
        .order('retrieved_at', { ascending: false });

      if (!error && data && data.length > 0) {
        remoteRecords.push(...(data as DataProvenance[]));
      }
    } catch {}
  }

  const memoryRecords = IN_MEMORY_PROVENANCE.filter(
    (p) => p.entity_type === entityType && p.entity_id === entityId
  );

  // Merge records deduplicating by ID
  const recordMap = new Map<string, DataProvenance>();
  for (const record of [...remoteRecords, ...memoryRecords]) {
    recordMap.set(record.id, record);
  }

  return Array.from(recordMap.values()).sort(
    (a, b) => new Date(b.retrieved_at).getTime() - new Date(a.retrieved_at).getTime()
  );
}

/**
 * Verifies or updates the human audit decision for an existing provenance record.
 */
export async function verifyProvenance(
  provenanceId: string,
  verificationStatus: VerificationStatus,
  verifiedBy: string,
  notes?: string
): Promise<DataProvenance | null> {
  const verifiedAt = new Date().toISOString();

  if (isSupabaseConfigured) {
    try {
      const client = getSupabase();
      const { data, error } = await client
        .from('data_provenance')
        .update({
          verification_status: verificationStatus,
          verified_by: verifiedBy,
          verified_at: verifiedAt,
          metadata: notes ? { notes } : {},
        })
        .eq('id', provenanceId)
        .select('*')
        .single();

      if (!error && data) {
        return data as DataProvenance;
      }
    } catch {}
  }

  const memRecord = IN_MEMORY_PROVENANCE.find((p) => p.id === provenanceId);
  if (memRecord) {
    memRecord.verification_status = verificationStatus;
    memRecord.verified_by = verifiedBy;
    memRecord.verified_at = verifiedAt;
    if (notes) memRecord.metadata = { ...(memRecord.metadata || {}), notes };
    return memRecord;
  }

  return null;
}
