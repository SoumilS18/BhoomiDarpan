/**
 * Administrative-geography source registry (Phase C).
 *
 * Which source currently feeds State → District → Sub-District → Village is a
 * *configuration* decision, not an `if` buried in a read path. Everything the
 * rest of the server needs to know about the active source — who publishes it,
 * how it was obtained, under what terms, and whether its rows may be described
 * as authoritative — lives here, server-side, once.
 *
 * Two sources are registered:
 *
 *   `lgd_india`              the official LGD hierarchy published by the
 *                            Ministry of Panchayati Raj through data.gov.in.
 *                            Only this source is allowed to be described as
 *                            "Authoritative LGD".
 *
 *   `lgd_reference_mirror`   a temporary, replaceable LGD-derived mirror used
 *                            while official credentials are unavailable. Its
 *                            rows are ALWAYS `temporary_reference`: the UI may
 *                            never present them as authoritative LGD.
 *
 * Selection is driven by `GEOGRAPHY_ACTIVE_SOURCE` (`auto`, `lgd_india`,
 * `lgd_reference_mirror`) rather than by a constant, so moving to official LGD
 * later is a configuration change and requires no code or frontend edit.
 *
 * This registry deliberately contains no geography — no states, districts,
 * sub-districts, villages, codes, coordinates or counts. Those come from the
 * database, which is the source of truth.
 */

import { getLgdServerConfig } from './lgdConfig';
import { isTestEnvironment } from './runtimeEnv';

export type GeographyAuthority = 'authoritative' | 'temporary_reference';

export type GeographySourceId = 'lgd_india' | 'lgd_reference_mirror';

export type GeographySourceAvailability =
  /** Reachable and selected: ingestion can run right now. */
  | 'available'
  /** Configured as the active source, but a credential it needs is missing. */
  | 'requires_credentials'
  /** Not selected as the active source. */
  | 'inactive'
  /** No database to read from, so the source cannot serve anything. */
  | 'unavailable';

export interface GeographySourceDescriptor {
  id: GeographySourceId;
  /** Short display name. Never implies authority it does not have. */
  label: string;
  authority: GeographyAuthority;
  availability: GeographySourceAvailability;
  /** What an operator must supply to make an unusable source usable. */
  requires: string | null;
  /**
   * How records from this source come into being — written out so provenance
   * is a fact the API can report rather than a claim the UI invents.
   */
  lineage: string;
  /** Redistribution basis for the records this source supplies. */
  license: string;
  /** Public landing page for the dataset. Server-side registry only. */
  source_url: string;
  /** Machine-readable dataset version, when the source publishes one. */
  dataset_version: string | null;
}

const OFFICIAL_LABEL = 'Local Government Directory (LGD), Ministry of Panchayati Raj';

/**
 * Official LGD via the Open Government Data Platform.
 */
function officialSource(): GeographySourceDescriptor {
  const configured = getLgdServerConfig().isConfigured;
  return {
    id: 'lgd_india',
    label: OFFICIAL_LABEL,
    authority: 'authoritative',
    availability: configured ? 'available' : 'requires_credentials',
    requires: configured ? null : 'LGD_DATA_GOV_API_KEY',
    lineage:
      'Read from the LGD resources published on api.data.gov.in by the Ministry of Panchayati ' +
      'Raj, Government of India.',
    license:
      'Government Open Data License – India (GODL-India) under NDSAP; LGD also permits free ' +
      'reproduction of its material with the source prominently acknowledged.',
    source_url: 'https://data.gov.in/catalog/local-government-directory-lgd',
    dataset_version: null,
  };
}

/**
 * Temporary LGD-derived mirror.
 *
 * Ingestion is only ever allowed when an operator has independently verified
 * the mirror. `GEOGRAPHY_REFERENCE_MIRROR_VERIFIED=1` records that decision in
 * configuration; without it the source reports itself as unverified and the
 * ingestion path refuses to run. This keeps the human judgement that preceded
 * ingestion an explicit, auditable input rather than an assumption.
 */
function referenceMirrorSource(): GeographySourceDescriptor {
  const enabled = referenceMirrorEnabled();
  const verified = referenceMirrorVerified();
  return {
    id: 'lgd_reference_mirror',
    label: 'LGD-derived reference mirror (temporary, non-authoritative)',
    authority: 'temporary_reference',
    availability: !enabled ? 'inactive' : verified ? 'available' : 'requires_credentials',
    requires: !enabled
      ? null
      : verified
        ? null
        : 'GEOGRAPHY_REFERENCE_MIRROR_VERIFIED=1 after independent coverage/licence verification',
    lineage:
      'Extracted from the Local Government Directory Download Directory by a published, auditable ' +
      'extractor and republished as dated archives; re-hosted for download. Records carry the ' +
      'LGD codes of the directory they were extracted from.',
    license:
      'Government Open Data License – India (GODL-India) under NDSAP, and the LGD Copyright ' +
      'Policy permitting free reproduction with the source prominently acknowledged. Attribution ' +
      'is recorded on every ingested row.',
    source_url: 'https://github.com/ramSeraph/opendata/releases',
    dataset_version: null, // resolved from the archive manifest at sync time
  };
}

/** True when the operator allows the temporary mirror to be considered at all. */
export function referenceMirrorEnabled(): boolean {
  const raw = process.env.GEOGRAPHY_REFERENCE_MIRROR_ENABLED?.trim().toLowerCase();
  if (raw === '0' || raw === 'false' || raw === 'no') return false;
  if (raw === '1' || raw === 'true' || raw === 'yes') return true;
  return true;
}

/** True when the operator records that independent verification was completed. */
export function referenceMirrorVerified(): boolean {
  const raw = process.env.GEOGRAPHY_REFERENCE_MIRROR_VERIFIED?.trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes';
}

/** Both registered sources, in the order an operator would normally consider them. */
export function listGeographySources(): GeographySourceDescriptor[] {
  return [officialSource(), referenceMirrorSource()];
}

export function getGeographySource(id: string): GeographySourceDescriptor | null {
  return listGeographySources().find((source) => source.id === id) ?? null;
}

/**
 * Resolves the source that currently feeds administrative geography.
 *
 * `auto` prefers official LGD whenever credentials exist, so enabling a real
 * data.gov.in key switches the application back to the authoritative source
 * without touching this file or any frontend code. Under the test harness the
 * official source is always selected unless a test opts in explicitly, which
 * keeps automated runs off the network.
 */
export function resolveActiveGeographySourceId(): GeographySourceId {
  const explicit = process.env.GEOGRAPHY_ACTIVE_SOURCE?.trim();
  if (explicit === 'lgd_india' || explicit === 'lgd_reference_mirror') return explicit;

  if (explicit && explicit !== 'auto') {
    // An unrecognised setting must not silently enable a temporary source.
    return 'lgd_india';
  }

  if (isTestEnvironment()) return 'lgd_india';
  if (getLgdServerConfig().isConfigured) return 'lgd_india';
  if (referenceMirrorEnabled()) return 'lgd_reference_mirror';
  return 'lgd_india';
}

export function getActiveGeographySource(): GeographySourceDescriptor {
  const id = resolveActiveGeographySourceId();
  return getGeographySource(id) ?? officialSource();
}

/**
 * Controlled server-side endpoints the temporary mirror is read from.
 *
 * Fixed here rather than accepted from a request, so ingestion can only ever
 * talk to these hosts: a caller cannot supply an arbitrary URL (no SSRF), and
 * no browser ever sees them (no client-side geography endpoint).
 */
export const REFERENCE_MIRROR_ENDPOINTS = {
  /** Monthly archives covering every LGD component, newest month first. */
  monthlyManifest: 'https://ramseraph.github.io/opendata/lgd/archives/listing_files.csv',
  /** Short-window daily archives for the high-volume tiers. */
  dailyManifest: 'https://ramseraph.github.io/opendata/lgd/listing_files.csv',
} as const;

/** Source ids whose rows must be presented as `temporary_reference`. */
export const TEMPORARY_REFERENCE_SOURCE_IDS: readonly GeographySourceId[] = ['lgd_reference_mirror'];

export function isTemporaryReferenceSourceId(id: string | null | undefined): boolean {
  return Boolean(id) && (TEMPORARY_REFERENCE_SOURCE_IDS as readonly string[]).includes(String(id));
}
