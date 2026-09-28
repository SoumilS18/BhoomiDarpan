import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { createApiApp } from '../server/index';
import type { Server } from 'http';

describe('BhoomiDarpan Rehabilitation, Statutory Reports, Vault & Audit Suite', () => {
  let server: Server;
  let baseUrl: string;
  const authHeaders = {
    Authorization: 'Bearer valid-test-token-admin',
  };

  beforeAll(async () => {
    const app = createApiApp();
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const addr = server.address();
        if (typeof addr === 'object' && addr !== null) {
          baseUrl = `http://127.0.0.1:${addr.port}`;
        }
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  describe('1. Rehabilitation & Resettlement (RFCTLARR Chapter V)', () => {
    it('GET /api/rehabilitation/plans returns authoritative R&R schemes', async () => {
      const res = await fetch(`${baseUrl}/api/rehabilitation/plans`, { headers: authHeaders });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.plans).toBeArray();
      expect(data.plans.length).toBeGreaterThan(0);

      const plan = data.plans[0];
      expect(plan.plan_number).toBeDefined();
      expect(plan.affected_families_count).toBeGreaterThan(0);
      expect(plan.budget_allocated_inr).toBeGreaterThan(0);
      expect(plan.resettlement_colonies).toBeArray();
    });

    it('GET /api/rehabilitation/families returns PAF census with vulnerability data', async () => {
      const res = await fetch(`${baseUrl}/api/rehabilitation/families`, { headers: authHeaders });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.families).toBeArray();
      expect(data.families.length).toBeGreaterThan(0);

      const fam = data.families[0];
      expect(fam.family_head_name).toBeDefined();
      expect(fam.vulnerability_category).toBeDefined();
      expect(fam.total_package_inr).toBeGreaterThan(0);
      expect(fam.disbursement_status).toBeDefined();
    });

    it('GET /api/rehabilitation/summary calculates aggregated metrics', async () => {
      const res = await fetch(`${baseUrl}/api/rehabilitation/summary`, { headers: authHeaders });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.summary).toBeDefined();
      expect(data.summary.total_plans).toBeGreaterThan(0);
      expect(data.summary.total_affected_families).toBeGreaterThan(0);
      expect(data.summary.total_budget_allocated_inr).toBeGreaterThan(0);
    });

    it('POST /api/rehabilitation/plans allows drafting a new scheme', async () => {
      const res = await fetch(`${baseUrl}/api/rehabilitation/plans`, {
        method: 'POST',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Nagpur-Goa Expressway R&R Scheme Wardha Package',
          case_number: 'MH-WAR-2026-0012',
          affected_families_count: 55,
          displaced_families_count: 22,
          budget_allocated_inr: 45000000,
        }),
      });
      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.plan.id).toBeDefined();
      expect(data.plan.title).toBe('Nagpur-Goa Expressway R&R Scheme Wardha Package');
    });
  });

  describe('2. MIS Statutory Reports (RFCTLARR Form I to IV & Sec 30 Solatium)', () => {
    it('GET /api/reports/catalogue lists all 9 statutory report formats', async () => {
      const res = await fetch(`${baseUrl}/api/reports/catalogue`, { headers: authHeaders });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.catalogue).toBeArray();
      expect(data.catalogue.length).toBe(9);

      const codes = data.catalogue.map((c: any) => c.code);
      expect(codes).toContain('RFCT-FORM-I');
      expect(codes).toContain('RFCT-FORM-II');
      expect(codes).toContain('RFCT-SEC-30');
      expect(codes).toContain('CAG-NITI-QTR');
    });

    it('GET /api/reports/generate/sec30_solatium computes 100% Solatium & Multiplier', async () => {
      const res = await fetch(`${baseUrl}/api/reports/generate/sec30_solatium`, { headers: authHeaders });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.report).toBeDefined();
      expect(data.report.rows).toBeArray();
      expect(data.report.rows.length).toBeGreaterThan(0);

      const firstRow = data.report.rows[0];
      expect(firstRow.base_market_value).toBeGreaterThan(0);
      expect(firstRow.solatium_100).toBeGreaterThan(0);
      expect(firstRow.total_compensation).toBeGreaterThan(firstRow.base_market_value);
    });

    it('GET /api/reports/export/form_1_sia exports CSV data', async () => {
      const res = await fetch(`${baseUrl}/api/reports/export/form_1_sia`, { headers: authHeaders });
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/csv');
      const csv = await res.text();
      expect(csv).toContain('Case Number');
      expect(csv).toContain('MH-PUN-2026-0089');
    });
  });

  describe('3. Document Vault & Cryptographic Verification', () => {
    it('GET /api/vault returns indexed statutory documents with SHA-256 hashes', async () => {
      const res = await fetch(`${baseUrl}/api/vault`, { headers: authHeaders });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.documents).toBeArray();
      expect(data.documents.length).toBeGreaterThan(0);

      const doc = data.documents[0];
      expect(doc.sha256_hash).toBeDefined();
      expect(doc.category).toBeDefined();
      expect(doc.verification_status).toBe('verified');
    });

    it('GET /api/vault/stats returns storage & category distribution', async () => {
      const res = await fetch(`${baseUrl}/api/vault/stats`, { headers: authHeaders });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.stats.total_documents).toBeGreaterThan(0);
      expect(data.stats.verified_documents).toBeGreaterThan(0);
    });
  });

  describe('4. Immutable Audit Trail', () => {
    it('GET /api/audit-trail returns tamper-evident event stream', async () => {
      const res = await fetch(`${baseUrl}/api/audit-trail`, { headers: authHeaders });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.events).toBeArray();
      expect(data.events.length).toBeGreaterThan(0);

      const ev = data.events[0];
      expect(ev.sequence_id).toBeDefined();
      expect(ev.action).toBeDefined();
      expect(ev.actor_email).toBeDefined();
      expect(ev.hash_signature).toBeDefined();
    });

    it('GET /api/audit-trail/export exports audit records to CSV', async () => {
      const res = await fetch(`${baseUrl}/api/audit-trail/export`, { headers: authHeaders });
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/csv');
      const csv = await res.text();
      expect(csv).toContain('Sequence ID');
      expect(csv).toContain('Hash Signature');
    });
  });
});
