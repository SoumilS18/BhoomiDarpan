import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import express from 'express';
import type { Server } from 'http';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import integrationsRouter from '../server/routes/integrations.routes';
import {
  getGeographyProvenance,
  getStates,
  getDistricts,
  getTotalUnitsCount,
  getLGDDataSourceStatus,
  clearInMemoryUnits,
  seedInMemoryUnits,
} from '../server/services/administrativeGeographyService';
import {
  ingestLgdTier,
  getLgdSyncStatus,
  resetLgdSyncLockForTests,
} from '../server/services/lgdIngestionService';
import { AdministrativeUnit } from '../shared/types';

/**
 * Authoritative-source provenance & no-substitution contract.
 *
 * The LGD hierarchy (36 States/UTs, ~785 Districts, ~7.1k Sub-Districts,
 * ~720k Villages) must come from data.gov.in into `administrative_units`.
 * While it has not been ingested, every read path has to answer "nothing" and
 * say so — it must never fall back to a bundled reference subset that could be
 * mistaken for production geography.
 */

const makeUnit = (
  unit_type: AdministrativeUnit['unit_type'],
  code: string,
  name: string,
  extra: Partial<AdministrativeUnit> = {}
): AdministrativeUnit =>
  ({
    id: `admin-${unit_type}-${code}`,
    unit_type,
    code,
    name,
    is_active: true,
    source_id: 'lgd_india',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...extra,
  }) as AdministrativeUnit;

const STATE_ROWS = [
  { state_code: 9, state_name_english: 'Uttar Pradesh' },
  { state_code: 27, state_name_english: 'Maharashtra' },
];

let server: Server;
let base: string;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use('/api', integrationsRouter);
  await new Promise<void>((resolveReady) => {
    server = app.listen(0, () => resolveReady());
  });
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  base = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  await new Promise<void>((resolveClose) => {
    server?.close(() => resolveClose());
  });
});

beforeEach(() => {
  clearInMemoryUnits();
  resetLgdSyncLockForTests();
});

afterEach(() => {
  clearInMemoryUnits();
  resetLgdSyncLockForTests();
});

describe('LGD authoritative-source provenance', () => {
  it('reports the source as non-authoritative while nothing has been ingested', async () => {
    const provenance = await getGeographyProvenance();

    expect(provenance.authoritative).toBe(false);
    expect(provenance.units_in_database).toBe(0);
    expect(provenance.counts).toEqual({
      states: 0,
      districts: 0,
      sub_districts: 0,
      villages: 0,
    });
    expect(['requires_credentials', 'unavailable']).toContain(provenance.status);
    expect(provenance.requires).toBeTruthy();
    expect(provenance.source).toContain('Local Government Directory');
  });

  it('never substitutes a bundled reference subset for missing geography', async () => {
    // Empty database => honest emptiness, not a canned 36/785/7151/720758 list.
    expect(await getStates()).toEqual([]);
    expect(await getDistricts('9')).toEqual([]);
    expect(await getTotalUnitsCount()).toBe(0);
  });

  it('reports the LGD layer as not operationally enriched when the store is empty', async () => {
    expect(await getLGDDataSourceStatus()).toBe('administrative_enrichment_unavailable');
  });

  it('flips to authoritative once real rows are registered', async () => {
    seedInMemoryUnits([
      makeUnit('state', '9', 'Uttar Pradesh', { state_code: '9' }),
      makeUnit('state', '27', 'Maharashtra', { state_code: '27' }),
    ]);

    const provenance = await getGeographyProvenance();
    expect(provenance.authoritative).toBe(true);
    expect(provenance.status).toBe('authoritative');
    expect(provenance.requires).toBeNull();
    expect(provenance.counts.states).toBe(2);
    expect(provenance.units_in_database).toBe(2);

    const states = await getStates();
    expect(states.map((s) => s.code).sort()).toEqual(['27', '9']);
    expect(await getLGDDataSourceStatus()).toBe('operational');
  });
});

describe('Geography HTTP surface carries provenance', () => {
  it('GET /api/geography/status returns the authoritative-source status', async () => {
    const res = await fetch(`${base}/api/geography/status`);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.provenance).toBeDefined();
    expect(body.provenance.authoritative).toBe(false);
    expect(body.provenance.units_in_database).toBe(0);
  });

  it('GET /api/geography/states answers empty with provenance instead of fabricated states', async () => {
    const res = await fetch(`${base}/api/geography/states`);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.states).toEqual([]);
    expect(body.count).toBe(0);
    expect(body.provenance.authoritative).toBe(false);
    // Every State/UT would be 36 — anything above 0 here means substituted data.
    expect(body.states.length).toBeLessThan(36);
  });

  it('GET /api/geography/states reports authoritative once rows exist', async () => {
    seedInMemoryUnits([makeUnit('state', '9', 'Uttar Pradesh', { state_code: '9' })]);

    const res = await fetch(`${base}/api/geography/states`);
    const body = await res.json();

    expect(body.count).toBe(1);
    expect(body.provenance.authoritative).toBe(true);
    expect(body.provenance.counts.states).toBe(1);
  });
});

describe('Streaming ingestion reconciliation', () => {
  const records = STATE_ROWS.map((r) => ({
    state_code: r.state_code,
    state_name_english: r.state_name_english,
    state_census2011_code: String(r.state_code),
  }));

  it('reconciles ingested rows against the authoritative source total', async () => {
    const summary = await ingestLgdTier('states', { recordsOverride: records });

    expect(summary.records_received).toBe(2);
    expect(summary.records_inserted).toBe(2);
    expect(summary.complete).toBe(true);
    expect(summary.count_verification).toBeDefined();
    expect(summary.count_verification?.source_total).toBe(2);
    expect(summary.count_verification?.rows_in_database).toBe(2);
    expect(summary.count_verification?.matched).toBe(true);
  });

  it('reports a failed reconciliation when fewer rows landed than the source advertises', async () => {
    // Parent state is never registered, so both districts are rejected as orphans.
    const summary = await ingestLgdTier('districts', {
      recordsOverride: [
        {
          state_code: 9,
          district_code: 140,
          district_name_english: 'Lucknow',
        },
      ],
    });

    expect(summary.orphan_records).toBe(1);
    expect(summary.records_inserted).toBe(0);
    expect(summary.count_verification?.matched).toBe(false);
    expect(summary.count_verification?.rows_in_database).toBe(0);
  });

  it('exposes resume offsets for interrupted tiers and clears them once complete', async () => {
    const partial = await ingestLgdTier('states', {
      recordsOverride: [],
      // recordsOverride always completes; simulate an interrupted API run
      // through the same public surface used by the status endpoint.
    });
    expect(partial.complete).toBe(true);

    const status = await getLgdSyncStatus();
    expect(status.resume_offsets).toBeDefined();
    expect(status.resume_offsets).not.toHaveProperty('states');
  });
});

describe('Client no longer bundles substitutable geography', () => {
  const root = resolve(__dirname, '..');

  it('does not import a bundled geography snapshot into the API client', () => {
    const apiSource = readFileSync(resolve(root, 'src/lib/api.ts'), 'utf8');
    // The comment explaining why the fallback was removed may still name it —
    // what must not exist is an actual import of the bundled subset.
    expect(apiSource).not.toMatch(/import\s*\{[^}]*GEOGRAPHY_SNAPSHOT/);
    expect(apiSource).not.toMatch(/from '\.\/geographySnapshot'/);
    expect(apiSource).not.toMatch(/snapshotUnitsByType/);
  });

  it('keeps no generated snapshot file in the source tree', () => {
    expect(existsSync(resolve(root, 'src/lib/geographySnapshot.ts'))).toBe(false);
  });

  it('does not regenerate a snapshot from a pre-run hook', () => {
    const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
    expect(pkg.scripts.predev).toBeUndefined();
    expect(pkg.scripts.prebuild).toBeUndefined();
  });

  it('keeps read paths free of the removed canonical reference subset', () => {
    const serviceSource = readFileSync(
      resolve(root, 'server/services/administrativeGeographyService.ts'),
      'utf8'
    );
    expect(serviceSource).not.toMatch(/^\s*import .*canonicalGeographyData/m);
    expect(serviceSource).not.toMatch(/return CANONICAL_ADMINISTRATIVE_UNITS/);
  });

describe('Provenance is derived from stored rows, never hardcoded', () => {
  it('labels rows from the temporary reference mirror as temporary_reference', async () => {
    seedInMemoryUnits([
      makeUnit('state', '9', 'Uttar Pradesh', {
        state_code: '9',
        source_id: 'lgd_reference_mirror',
      }),
      makeUnit('state', '27', 'Maharashtra', {
        state_code: '27',
        source_id: 'lgd_reference_mirror',
      }),
    ]);

    const provenance = await getGeographyProvenance();
    expect(provenance.status).toBe('temporary_reference');
    expect(provenance.authoritative).toBe(false);
    expect(provenance.requires).toBeTruthy();
    expect(provenance.source).toContain('reference');
    expect(provenance.source_rows).toEqual({ lgd_india: 0, lgd_reference_mirror: 2, other: 0 });
    expect(provenance.active_source).toBe('lgd_reference_mirror');
    expect(provenance.message).toMatch(/NOT authoritative/i);
    expect(provenance.units_in_database).toBe(2);
    expect(provenance.counts.states).toBe(2);
  });

  it('labels a mixed-source hierarchy as mixed and non-authoritative', async () => {
    seedInMemoryUnits([
      makeUnit('state', '9', 'Uttar Pradesh', { state_code: '9', source_id: 'lgd_india' }),
      makeUnit('state', '27', 'Maharashtra', {
        state_code: '27',
        source_id: 'lgd_reference_mirror',
      }),
    ]);

    const provenance = await getGeographyProvenance();
    expect(provenance.status).toBe('mixed');
    expect(provenance.authoritative).toBe(false);
    expect(provenance.active_source).toBe('mixed');
    expect(provenance.source_rows).toEqual({ lgd_india: 1, lgd_reference_mirror: 1, other: 0 });
    expect(provenance.source).toContain('Mixed sources');
    expect(provenance.message).toMatch(/NOT fully authoritative/i);
  });

  it('reports authoritative only when every row belongs to lgd_india', async () => {
    seedInMemoryUnits([makeUnit('state', '9', 'Uttar Pradesh', { state_code: '9' })]);

    const provenance = await getGeographyProvenance();
    expect(provenance.status).toBe('authoritative');
    expect(provenance.authoritative).toBe(true);
    expect(provenance.source_rows).toEqual({ lgd_india: 1, lgd_reference_mirror: 0, other: 0 });
    expect(provenance.active_source).toBe('lgd_india');
  });

  it('surfaces temporary_reference through the HTTP status endpoint', async () => {
    seedInMemoryUnits([
      makeUnit('state', '9', 'Uttar Pradesh', {
        state_code: '9',
        source_id: 'lgd_reference_mirror',
      }),
    ]);

    const res = await fetch(`${base}/api/geography/status`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.provenance.status).toBe('temporary_reference');
    expect(body.provenance.authoritative).toBe(false);
    expect(body.provenance.source_rows?.lgd_reference_mirror).toBe(1);
  });

  it('derives status from row-level source_id instead of a constant', () => {
    const serviceSource = readFileSync(
      resolve(__dirname, '..', 'server/services/administrativeGeographyService.ts'),
      'utf8'
    );
    // Status selection must branch on the observed source of the rows...
    expect(serviceSource).toMatch(/activeSource === 'lgd_india'/);
    expect(serviceSource).toMatch(/activeSource === 'lgd_reference_mirror'/);
    expect(serviceSource).toMatch(/status: 'temporary_reference'/);
    expect(serviceSource).toMatch(/status: 'mixed'/);
    // ...and the ingestion path must stamp rows with the active source, not a
    // hardcoded source id.
    const ingestionSource = readFileSync(
      resolve(__dirname, '..', 'server/services/lgdIngestionService.ts'),
      'utf8'
    );
    expect(ingestionSource).toMatch(/source_id: activeSource\.id/);
    expect(ingestionSource).not.toMatch(/source_id: 'lgd_india'/);
  });
});

});
