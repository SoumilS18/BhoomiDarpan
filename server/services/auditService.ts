import { AuditTrailEvent, AuditTrailFilterParams } from '../../shared/types';
import { getSupabase, isSupabaseConfigured } from '../config/supabase';

let mockAuditEvents: AuditTrailEvent[] = [
  {
    id: 'aud-ev-101',
    timestamp: '2026-03-24T15:30:00Z',
    sequence_id: 10842,
    entity_type: 'rehab_plan',
    entity_id: 'rp-pune-ring-001',
    entity_title: 'Wagholi-Manjri Resettlement & Economic Rehabilitation Scheme',
    action: 'REHABILITATION_PLAN_APPROVED',
    actor_name: 'Dr. Suresh Patil',
    actor_email: 'lao.pune@bhoomidarpan.gov.in',
    actor_role: 'lao',
    actor_ip: '10.14.22.81',
    severity: 'info',
    changes_summary: 'Statutory approval granted under Section 19 for 142 affected families with ₹8.5 Cr budget allocation.',
    statutory_ref: 'RFCTLARR Act 2013 Section 19',
    hash_signature: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
  },
  {
    id: 'aud-ev-102',
    timestamp: '2026-03-24T12:15:00Z',
    sequence_id: 10841,
    entity_type: 'case',
    entity_id: 'case-harden-pune-001',
    entity_title: 'Case MH-PUN-2026-0089',
    action: 'STAGE_ADVANCED_SEC19_DECLARATION',
    actor_name: 'Dr. Suresh Patil',
    actor_email: 'lao.pune@bhoomidarpan.gov.in',
    actor_role: 'lao',
    actor_ip: '10.14.22.81',
    severity: 'info',
    changes_summary: 'Case advanced from Section 15 Hearing to Section 19 Declaration following Gazette publication.',
    statutory_ref: 'RFCTLARR Act 2013 Section 19',
    hash_signature: '7d5be52445b7e229c1583d73bc79b9a6745582f3fb8f3d1b84931a547b744d08',
  },
  {
    id: 'aud-ev-103',
    timestamp: '2026-03-23T18:45:00Z',
    sequence_id: 10840,
    entity_type: 'policy',
    entity_id: 'risk_bands',
    entity_title: 'System Risk Weights Policy',
    action: 'POLICY_PARAM_MODIFIED',
    actor_name: 'Platform Administrator',
    actor_email: 'admin@bhoomidarpan.gov.in',
    actor_role: 'admin',
    actor_ip: '10.10.1.5',
    severity: 'warning',
    changes_summary: 'Dispute weight adjusted to 0.28; bottleneck threshold updated to 45 days.',
    statutory_ref: 'Platform Governance Manual v2.4',
    hash_signature: 'b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9',
  },
  {
    id: 'aud-ev-104',
    timestamp: '2026-03-22T10:10:00Z',
    sequence_id: 10839,
    entity_type: 'document',
    entity_id: 'doc-v-001',
    entity_title: 'Gazette Preliminary Notification Section 11',
    action: 'DOCUMENT_CRYPTO_VERIFIED',
    actor_name: 'Dr. Suresh Patil',
    actor_email: 'lao.pune@bhoomidarpan.gov.in',
    actor_role: 'lao',
    actor_ip: '10.14.22.81',
    severity: 'info',
    changes_summary: 'SHA-256 hash verified against official government gazette ledger with 98.6% OCR entity accuracy.',
    statutory_ref: 'Information Technology Act Section 65B',
    hash_signature: 'a3f89e2c4b8109d7e5621fb042e88a31c5d9921473be9f1165bc9801824a7ef1',
  },
  {
    id: 'aud-ev-105',
    timestamp: '2026-03-21T14:20:00Z',
    sequence_id: 10838,
    entity_type: 'affected_family',
    entity_id: 'paf-001',
    entity_title: 'Tukaram Pandurang Jadhav (PAF-001)',
    action: 'ENTITLEMENT_DISBURSEMENT_RECORDED',
    actor_name: 'Dr. Suresh Patil',
    actor_email: 'lao.pune@bhoomidarpan.gov.in',
    actor_role: 'lao',
    actor_ip: '10.14.22.81',
    severity: 'info',
    changes_summary: '₹8,50,000 package disbursed via PFMS direct benefit transfer with Aadhaar verification.',
    statutory_ref: 'RFCTLARR Second Schedule Para 1',
    hash_signature: '6b86b273ff34fce19d6b804eff5a3f5747ada4eaa22f1d49c01e52ddb7875b4b',
  },
];

export async function getAuditTrailEvents(filters?: AuditTrailFilterParams): Promise<{ events: AuditTrailEvent[]; total: number }> {
  let events = [...mockAuditEvents];

  if (filters?.entity_type && filters.entity_type !== 'all') {
    events = events.filter((e) => e.entity_type === filters.entity_type);
  }
  if (filters?.severity && (filters.severity as string) !== 'all') {
    events = events.filter((e) => e.severity === filters.severity);
  }
  if (filters?.actor_email) {
    events = events.filter((e) => e.actor_email.toLowerCase().includes(filters.actor_email!.toLowerCase()));
  }
  if (filters?.search) {
    const q = filters.search.toLowerCase();
    events = events.filter(
      (e) =>
        e.action.toLowerCase().includes(q) ||
        (e.entity_title && e.entity_title.toLowerCase().includes(q)) ||
        (e.changes_summary && e.changes_summary.toLowerCase().includes(q)) ||
        e.hash_signature.toLowerCase().includes(q)
    );
  }

  const total = events.length;
  const limit = filters?.limit || 50;
  const offset = filters?.offset || 0;
  const paginated = events.slice(offset, offset + limit);

  return { events: paginated, total };
}

export async function logAuditEvent(event: Omit<AuditTrailEvent, 'id' | 'timestamp' | 'sequence_id' | 'hash_signature'>): Promise<AuditTrailEvent> {
  const newSeq = (mockAuditEvents[0]?.sequence_id || 10000) + 1;
  const newEvent: AuditTrailEvent = {
    ...event,
    id: `aud-ev-${Date.now()}`,
    timestamp: new Date().toISOString(),
    sequence_id: newSeq,
    hash_signature: `hash-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
  };

  mockAuditEvents.unshift(newEvent);
  return newEvent;
}
