import { z } from 'zod';
import { isTestEnvironment } from '../config/runtimeEnv';
import { ImportFormat, ImportSummary, DataImportBatch } from '../../shared/types';
import { registerAdministrativeUnit } from './administrativeGeographyService';
import { recordProvenance } from './provenanceService';
import { getSupabase, isSupabaseConfigured } from '../config/supabase';

// Schema for structured Administrative Unit import record
export const AdministrativeUnitImportSchema = z.object({
  unit_type: z.enum(['state', 'district', 'sub_district', 'locality']),
  code: z.string().min(1, 'Unit code is required'),
  name: z.string().min(1, 'Unit name is required'),
  local_name: z.string().optional(),
  state_code: z.string().optional(),
  district_code: z.string().optional(),
  sub_district_code: z.string().optional(),
  centroid: z.array(z.number()).length(2).optional(),
  boundary_geojson: z.any().optional(),
});

// Schema for structured Parcel import record
export const ParcelImportSchema = z.object({
  case_id: z.string().uuid().optional(),
  survey_number: z.string().min(1, 'Survey number is required'),
  khata_number: z.string().optional(),
  landowner_names: z.array(z.string()).optional(),
  land_type: z.string().default('Agricultural'),
  area_acres: z.number().positive('Area must be a positive number'),
  compensation_amount: z.number().nonnegative().optional(),
  acquisition_status: z.string().default('identified'),
  geojson_geometry: z.any().optional(),
});

export interface ImportOptions {
  batchType: 'administrative_units' | 'parcels';
  format: ImportFormat;
  sourceId: string;
  sourceRecordRef?: string;
  createdBy?: string;
}

/**
 * Reusable Structured Data Import Pipeline
 */
export async function executeImportPipeline(
  rawData: string | Buffer | object[],
  options: ImportOptions
): Promise<ImportSummary> {
  const batchId = `batch-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const timestamp = new Date().toISOString();

  let records: any[] = [];
  const validationErrors: Array<{ line?: number; code?: string; message: string; data?: any }> = [];

  // 1. Parse Input according to format
  try {
    if (typeof rawData === 'string' || Buffer.isBuffer(rawData)) {
      const text = rawData.toString().trim();
      if (options.format === 'json') {
        const parsed = JSON.parse(text);
        records = Array.isArray(parsed) ? parsed : [parsed];
      } else if (options.format === 'geojson') {
        const parsed = JSON.parse(text);
        if (parsed.type === 'FeatureCollection' && Array.isArray(parsed.features)) {
          records = parsed.features.map((f: any) => ({
            ...f.properties,
            geojson_geometry: f.geometry,
            boundary_geojson: f.geometry,
          }));
        } else if (parsed.type === 'Feature') {
          records = [{
            ...parsed.properties,
            geojson_geometry: parsed.geometry,
            boundary_geojson: parsed.geometry,
          }];
        } else {
          throw new Error('Provided GeoJSON is not a valid Feature or FeatureCollection');
        }
      } else if (options.format === 'csv') {
        records = parseSimpleCSV(text);
      }
    } else if (Array.isArray(rawData)) {
      records = rawData;
    }
  } catch (parseErr: any) {
    return {
      batch_id: batchId,
      batch_type: options.batchType,
      format: options.format,
      total_received: 0,
      accepted: 0,
      rejected: 0,
      duplicates: 0,
      status: 'failed',
      validation_errors: [{ message: `Parse error: ${parseErr.message}` }],
      source: options.sourceId,
      timestamp,
    };
  }

  const totalReceived = records.length;
  let acceptedCount = 0;
  let rejectedCount = 0;
  let duplicateCount = 0;

  // 2. Validate, Normalize, and Persist each record
  if (options.batchType === 'administrative_units') {
    const seenCodes = new Set<string>();

    for (let idx = 0; idx < records.length; idx++) {
      const rec = records[idx];
      const parsed = AdministrativeUnitImportSchema.safeParse(rec);

      if (!parsed.success) {
        rejectedCount++;
        validationErrors.push({
          line: idx + 1,
          code: 'SCHEMA_VALIDATION_ERROR',
          message: parsed.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', '),
          data: rec,
        });
        continue;
      }

      const validUnit = parsed.data;
      const dedupeKey = `${validUnit.unit_type}:${validUnit.code}`;
      if (seenCodes.has(dedupeKey)) {
        duplicateCount++;
        validationErrors.push({
          line: idx + 1,
          code: 'DUPLICATE_RECORD',
          message: `Duplicate unit code ${validUnit.code} encountered in batch.`,
        });
        continue;
      }
      seenCodes.add(dedupeKey);

      try {
        const registered = await registerAdministrativeUnit({
          unit_type: validUnit.unit_type,
          code: validUnit.code,
          name: validUnit.name,
          local_name: validUnit.local_name,
          state_code: validUnit.state_code,
          district_code: validUnit.district_code,
          sub_district_code: validUnit.sub_district_code,
          centroid: validUnit.centroid as [number, number] | undefined,
          boundary_geojson: validUnit.boundary_geojson,
          source_id: options.sourceId,
          metadata: { batch_id: batchId },
        });

        // Record Provenance
        await recordProvenance({
          entityType: 'administrative_unit',
          entityId: registered.id,
          provenanceType: 'EXTERNALLY_SOURCED',
          sourceId: options.sourceId,
          sourceRecordRef: options.sourceRecordRef || validUnit.code,
          verificationStatus: 'system_verified',
        });

        acceptedCount++;
      } catch (saveErr: any) {
        rejectedCount++;
        validationErrors.push({
          line: idx + 1,
          code: 'PERSISTENCE_ERROR',
          message: saveErr.message || 'Failed to save unit to database',
        });
      }
    }
  }

  const finalStatus =
    rejectedCount === 0
      ? 'completed'
      : acceptedCount > 0
      ? 'partially_completed'
      : 'failed';

  // 3. Persist import batch record to database if configured
  //    (never from the test harness — fixtures would log fake import batches)
  if (isSupabaseConfigured && !isTestEnvironment()) {
    try {
      const client = getSupabase();
      await client.from('data_import_batches').insert({
        id: batchId,
        source_id: options.sourceId,
        batch_type: options.batchType,
        format: options.format,
        total_records: totalReceived,
        accepted_records: acceptedCount,
        rejected_records: rejectedCount,
        duplicate_records: duplicateCount,
        validation_errors: validationErrors,
        status: finalStatus,
        created_by: options.createdBy || 'Authorized Officer',
      });
    } catch {}
  }

  return {
    batch_id: batchId,
    batch_type: options.batchType,
    format: options.format,
    total_received: totalReceived,
    accepted: acceptedCount,
    rejected: rejectedCount,
    duplicates: duplicateCount,
    status: finalStatus,
    validation_errors: validationErrors,
    source: options.sourceId,
    timestamp,
  };
}

/**
 * Lightweight deterministic CSV parser with header mapping
 */
function parseSimpleCSV(csvText: string): any[] {
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map((h) => h.trim().replace(/^["']|["']$/g, ''));
  const results: any[] = [];

  for (let i = 1; i < lines.length; i++) {
    const rawCols = lines[i].split(',');
    const rowObj: Record<string, any> = {};
    headers.forEach((h, idx) => {
      let val = rawCols[idx] ? rawCols[idx].trim().replace(/^["']|["']$/g, '') : '';
      if (!isNaN(Number(val)) && val !== '') {
        rowObj[h] = Number(val);
      } else {
        rowObj[h] = val;
      }
    });
    results.push(rowObj);
  }

  return results;
}
