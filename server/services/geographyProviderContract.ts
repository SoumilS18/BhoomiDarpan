/**
 * Shared contract between the ingestion pipeline and every administrative
 * geography provider (Phase C).
 *
 * `lgdIngestionService` drives ingestion; providers supply records. Keeping the
 * record shape in its own module means a provider can be added or replaced
 * without importing the pipeline, which is what lets the official LGD source
 * and a temporary reference source coexist behind one interface.
 */

import type { AdminUnitType } from '../../shared/types';
import type { LgdAdministrativeTier } from '../config/lgdConfig';
import type { GeographyAuthority } from '../config/geographySourceRegistry';

/**
 * One administrative unit after provider-specific normalisation. Every tier,
 * from every provider, is reduced to this shape before it reaches storage, so
 * hierarchy validation, de-duplication and reconciliation are written once.
 *
 * `code` is the source's stable identifier (the LGD code) and remains the
 * identity of the row across providers: official LGD and a verified reference
 * mirror address the same unit with the same code, which is what makes the
 * temporary source replaceable without touching stored records or the frontend.
 */
export interface NormalizedLgdRecord {
  unit_type: AdminUnitType;
  code: string;
  name: string;
  local_name?: string | null;
  parent_code?: string | null;
  state_code?: string | null;
  district_code?: string | null;
  sub_district_code?: string | null;
  census_code?: string | null;
  source_resource_id: string;
  last_updated?: string | null;
  metadata?: Record<string, any>;
}

/**
 * Provenance stamped onto every ingested row.
 *
 * A temporary reference row must be able to say, on its own and without
 * consulting the UI, where it came from, when, which dataset version, under
 * what licence, and that it is not authoritative LGD.
 */
export interface RowProvenance {
  source_id: string;
  provider: string;
  dataset: string;
  dataset_version: string | null;
  acquired_at: string;
  source_url: string;
  authority: GeographyAuthority;
  temporary_reference: boolean;
  license: string;
}

export interface GeographyProviderTierResult {
  /** Rows the provider actually supplied for this tier. */
  records: NormalizedLgdRecord[];
  /**
   * Total the source advertises for this tier. `null` means the source does
   * not publish a machine-readable total — never guessed, never inferred from
   * a reference expectation.
   */
  advertised_total: number | null;
}

export interface GeographyProviderContext {
  batchSize: number;
  /** Row provenance to stamp on each record. */
  provenance: RowProvenance;
  /** Abort/stop signal honoured between batches. */
  shouldContinue?: () => boolean;
}
