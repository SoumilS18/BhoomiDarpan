import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'bun:test';
import { startLiveApi, type LiveApi } from './helpers/liveApi';
import { isTestEnvironment } from '../server/config/runtimeEnv';
import { clearInMemoryUnits } from '../server/services/administrativeGeographyService';

/**
 * Geography & administration endpoint RBAC tamper resistance.
 *
 * Two contracts are locked here:
 *
 *  1. The deliberately public `/api/geography/*` reads stay reachable for the
 *     UI's provenance banner WITHOUT ever emitting credential material —
 *     provenance is public, secrets are not.
 *  2. Every operational surface (`/api/administration/*`, `/api/portfolio/*`)
 *     rejects anonymous callers, near-miss forged bearer tokens and non-admin
 *     roles, and the test-harness role header (`x-eval-role`) stops working the
 *     moment the process is not the test harness — the exact regression the
 *     delivery report recorded against `/api/administration/audit`.
 *
 * All requests run against `createApiApp()` on an ephemeral port (see
 * `helpers/liveApi`), so the routing, middleware and RBAC chain under test is
 * byte-for-byte the real application, never the developer's running server.
 */

let api: LiveApi;

/** Configured secrets that must never appear in a public response body. */
const secretValues = (): string[] =>
  [
    process.env.LGD_DATA_GOV_API_KEY,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    process.env.SUPABASE_ANON_KEY,
    process.env.GEMINI_API_KEY,
  ].filter((value): value is string => Boolean(value && value.trim().length >= 8));

beforeAll(async () => {
  clearInMemoryUnits();
  api = await startLiveApi();
});

afterAll(async () => {
  clearInMemoryUnits();
  await api?.close();
});

beforeEach(() => {
  clearInMemoryUnits();
});

afterEach(() => {
  clearInMemoryUnits();
});

describe('1. Public geography reads stay reachable without leaking credentials', () => {
  it('GET /api/geography/status answers anonymous callers with honest provenance and zero secret material', async () => {
    const res = await fetch(`${api.url}/api/geography/status`);
    expect(res.status).toBe(200);

    const raw = await res.text();
    for (const secret of secretValues()) {
      expect(raw).not.toContain(secret);
    }
    // No credential-shaped query fragments either (e.g. `api-key=...`).
    expect(raw).not.toMatch(/api-key=[A-Za-z0-9]/i);

    const body = JSON.parse(raw);
    expect(['authoritative', 'temporary_reference', 'mixed', 'requires_credentials', 'unavailable']).toContain(
      body.provenance.status
    );
    // The harness store is empty and never polls the database, so an
    // "authoritative" claim here would be fabricated.
    expect(body.provenance.authoritative).toBe(false);
  });

  it('GET /api/geography/states answers anonymous callers without secret material', async () => {
    const res = await fetch(`${api.url}/api/geography/states`);
    expect(res.status).toBe(200);

    const raw = await res.text();
    for (const secret of secretValues()) {
      expect(raw).not.toContain(secret);
    }

    const body = JSON.parse(raw);
    expect(Array.isArray(body.states)).toBe(true);
    expect(body.provenance).toBeTruthy();
  });
});

describe('2. Operational surfaces reject anonymous callers', () => {
  const anonymousGets: Array<[string, string]> = [
    ['enrichment', '/api/administration/enrichment?state_lgd_code=27'],
    ['sync status', '/api/administration/sync/status'],
    ['portfolio geography drill-down', '/api/portfolio/geography'],
    ['audit ledger with injected role query params', '/api/administration/audit?role=admin&user_role=admin'],
  ];

  for (const [label, path] of anonymousGets) {
    it(`GET ${label} → 401 AUTH_REQUIRED without a credential`, async () => {
      const res = await fetch(`${api.url}${path}`);
      expect(res.status).toBe(401);

      const body = await res.json();
      expect(body.code).toBe('AUTH_REQUIRED');
      // A 401 body must not leak what the protected resource contains.
      expect(body.events).toBeUndefined();
      expect(body.status).toBeUndefined();
    });
  }
});

describe('3. Audit ledger enforces admin-only RBAC for verified identities', () => {
  it('viewer fixture token → 403 FORBIDDEN_ROLE', async () => {
    const res = await fetch(`${api.url}/api/administration/audit`, {
      headers: { Authorization: 'Bearer valid-test-token-viewer' },
    });
    expect(res.status).toBe(403);

    const body = await res.json();
    expect(body.code).toBe('FORBIDDEN_ROLE');
    expect(body.user_role).toBe('viewer');
    expect(body.events).toBeUndefined();
  });

  it('admin fixture token → 200 with an explicit durable-source label', async () => {
    const res = await fetch(`${api.url}/api/administration/audit`, {
      headers: { Authorization: 'Bearer valid-test-token-admin' },
    });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(Array.isArray(body.events)).toBe(true);
    // The ledger must say whether records are durable or process-memory only.
    expect(['database', 'memory']).toContain(body.source);
  });

  it('near-miss forged bearer tokens are rejected with 401 AUTH_INVALID_TOKEN', async () => {
    const forged = ['valid-test-token-root', 'valid-test-token-admin2', 'valid-test-token-', 'forged-random-jwt'];
    for (const token of forged) {
      const res = await fetch(`${api.url}/api/administration/audit`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(res.status).toBe(401);

      const body = await res.json();
      expect(body.code).toBe('AUTH_INVALID_TOKEN');
      expect(body.events).toBeUndefined();
    }
  });
});

describe('4. Client-chosen role headers are a harness-only facility', () => {
  it('x-eval-role: admin is honoured inside the test harness (positive control)', async () => {
    const res = await fetch(`${api.url}/api/administration/audit`, {
      headers: { 'x-eval-role': 'admin' },
    });
    expect(res.status).toBe(200);
  });

  it('x-eval-role stops authenticating the moment the process is not the test harness', async () => {
    const saved = {
      NODE_ENV: process.env.NODE_ENV,
      BUN_ENV: process.env.BUN_ENV,
      VITEST: process.env.VITEST,
      JEST_WORKER_ID: process.env.JEST_WORKER_ID,
    };

    try {
      process.env.NODE_ENV = 'production';
      delete process.env.BUN_ENV;
      delete process.env.VITEST;
      delete process.env.JEST_WORKER_ID;
      expect(isTestEnvironment()).toBe(false);

      const res = await fetch(`${api.url}/api/administration/audit`, {
        headers: { 'x-eval-role': 'admin' },
      });
      expect(res.status).toBe(401);

      const body = await res.json();
      expect(body.code).toBe('AUTH_REQUIRED');
      expect(body.events).toBeUndefined();
    } finally {
      if (saved.NODE_ENV === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = saved.NODE_ENV;
      if (saved.BUN_ENV === undefined) delete process.env.BUN_ENV;
      else process.env.BUN_ENV = saved.BUN_ENV;
      if (saved.VITEST === undefined) delete process.env.VITEST;
      else process.env.VITEST = saved.VITEST;
      if (saved.JEST_WORKER_ID === undefined) delete process.env.JEST_WORKER_ID;
      else process.env.JEST_WORKER_ID = saved.JEST_WORKER_ID;
    }

    // Restored: the rest of the suite still runs as the harness it is.
    expect(isTestEnvironment()).toBe(true);
  });
});

