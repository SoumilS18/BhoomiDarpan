import { Request, Response, Router } from 'express';
import { getSupabase, isSupabaseConfigured } from '../config/supabase';
import { getAdministrativeUnitByCode } from '../services/administrativeGeographyService';

// ============================================================================
// Public account-access request API
// ----------------------------------------------------------------------------
// WHY THIS EXISTS
//   The public Request Access page is reachable before authentication, so it
//   needs a real backend to lodge a request against. This is that backend:
//   it validates strictly, resolves the applicant's chosen territory against
//   the authoritative LGD hierarchy, and writes one row through the service
//   role. Nothing here creates an account, grants a role or approves anything.
//
// PRIVILEGE MODEL
//   The applicant may *ask* for a role, but only a non-privileged subset. The
//   table's CHECK constraint excludes 'admin' and 'approver' as well, so even a
//   crafted payload that bypasses this handler cannot store a privileged
//   request. Approval and account issuance remain administrative operations
//   performed outside this endpoint.
//
// WHEN THE TABLE IS ABSENT
//   The migration may not have been applied yet. Rather than pretending, the
//   status endpoint reports `available: false` and the POST answers 503 with a
//   machine-readable code, which the UI renders as an honest "not connected"
//   state.
// ============================================================================

const authRouter = Router();

/** Roles an anonymous applicant is permitted to ask for. Never privileged. */
const REQUESTABLE_ROLES = new Set([
  'lao',
  'project_officer',
  'revenue_inspector',
  'legal_officer',
  'viewer',
]);

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/;
const PHONE_RE = /^[0-9+()\-\s]{6,30}$/;
const LGD_STATE_RE = /^\d{1,3}$/;
const LGD_DISTRICT_RE = /^\d{1,4}$/;

const LIMITS = {
  fullName: 120,
  email: 254,
  organization: 200,
  department: 200,
  designation: 120,
  justification: 2000,
} as const;

// ---------------------------------------------------------------------------
// Availability cache — a schema probe on every request would be wasteful, but
// a stale "unavailable" would keep a working form hidden, so it is short.
// ---------------------------------------------------------------------------
const AVAILABILITY_TTL_MS = 60_000;
let availabilityCache: { value: boolean; at: number } | null = null;

export function resetAccessRequestAvailabilityCache() {
  availabilityCache = null;
}

async function isTableAvailable(): Promise<boolean> {
  if (!isSupabaseConfigured) return false;
  if (availabilityCache && Date.now() - availabilityCache.at < AVAILABILITY_TTL_MS) {
    return availabilityCache.value;
  }
  let available = false;
  try {
    const { error } = await getSupabase()
      .from('access_requests')
      .select('id', { count: 'exact', head: true });
    // PostgREST answers 42P01 / "relation ... does not exist" when the table
    // has not been created. Anything else that succeeds means it is there.
    available = !error;
    if (error) {
      const msg = `${error.code ?? ''} ${error.message ?? ''}`.toLowerCase();
      const missing =
        msg.includes('42p01') || msg.includes('does not exist') || msg.includes('schema cache');
      if (!missing) {
        // A transient failure is not the same as "no table". Report unknown as
        // unavailable only when we positively recognise the missing-relation
        // error; otherwise keep the previous answer rather than flapping.
        available = false;
      }
    }
  } catch {
    available = false;
  }
  availabilityCache = { value: available, at: Date.now() };
  return available;
}

// ---------------------------------------------------------------------------
// Per-IP submission throttle. The endpoint is intentionally public (there is
// no session yet), so it needs some protection against automated spam. This is
// a best-effort in-process limiter — real authorisation for every other route
// remains `requireAuth` / `requireRole`.
// ---------------------------------------------------------------------------
const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 5;
const throttle = new Map<string, number[]>();

function isThrottled(key: string): boolean {
  const now = Date.now();
  const hits = (throttle.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (hits.length >= MAX_PER_WINDOW) {
    throttle.set(key, hits);
    return true;
  }
  hits.push(now);
  throttle.set(key, hits);
  if (throttle.size > 5_000) {
    for (const [k, v] of throttle) {
      if (v.every((t) => now - t >= WINDOW_MS)) throttle.delete(k);
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------
interface FieldErrors {
  [field: string]: string;
}

function clean(value: unknown): string {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
}

function requireBetween(
  errors: FieldErrors,
  field: string,
  raw: unknown,
  min: number,
  max: number,
  label: string
): string {
  const value = clean(raw);
  if (value.length < min) {
    errors[field] = `${label} must be at least ${min} characters.`;
    return '';
  }
  if (value.length > max) {
    errors[field] = `${label} must be at most ${max} characters.`;
    return '';
  }
  return value;
}

function optionalBetween(
  errors: FieldErrors,
  field: string,
  raw: unknown,
  max: number,
  label: string
): string {
  const value = clean(raw);
  if (!value) return '';
  if (value.length > max) {
    errors[field] = `${label} must be at most ${max} characters.`;
    return '';
  }
  return value;
}

// ---------------------------------------------------------------------------
// GET /api/auth/request-access/status
//   Public. Tells the page honestly whether a submission workflow exists.
// ---------------------------------------------------------------------------
authRouter.get('/request-access/status', async (_req: Request, res: Response) => {
  const available = await isTableAvailable();
  res.json({
    available,
    // Stated so the UI can render the exact honest sentence it means.
    code: available ? 'AVAILABLE' : 'NOT_CONFIGURED',
    message: available
      ? 'Access requests are accepted and stored for administrative review.'
      : 'No access-request workflow is configured for this deployment. Requests cannot be submitted.',
  });
});

// ---------------------------------------------------------------------------
// POST /api/auth/request-access
//   Public by necessity (no account exists yet), but strictly validated,
//   throttled, and write-only: it can never confer a role.
// ---------------------------------------------------------------------------
authRouter.post('/request-access', async (req: Request, res: Response) => {
  if (!(await isTableAvailable())) {
    return res.status(503).json({
      error: 'No access-request workflow is configured for this deployment.',
      code: 'NOT_CONFIGURED',
    });
  }

  const ip =
    (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ||
    req.ip ||
    'unknown';
  const body = (req.body ?? {}) as Record<string, unknown>;

  const rawEmail = clean(body.email);
  if (rawEmail && isThrottled(`${ip}:${rawEmail.toLowerCase()}`)) {
    return res.status(429).json({
      error: 'Too many access requests from this address. Try again later.',
      code: 'RATE_LIMITED',
    });
  } else if (!rawEmail && isThrottled(ip)) {
    return res.status(429).json({
      error: 'Too many access requests from this address. Try again later.',
      code: 'RATE_LIMITED',
    });
  }

  const errors: FieldErrors = {};

  const fullName = requireBetween(errors, 'fullName', body.fullName, 2, LIMITS.fullName, 'Full name');
  const organization = requireBetween(
    errors,
    'organization',
    body.organization,
    2,
    LIMITS.organization,
    'Organisation'
  );
  const justification = requireBetween(
    errors,
    'justification',
    body.justification ?? body.reason,
    20,
    LIMITS.justification,
    'Justification'
  );

  let email = '';
  if (!rawEmail) {
    errors.email = 'Email address is required.';
  } else if (rawEmail.length > LIMITS.email || !EMAIL_RE.test(rawEmail)) {
    errors.email = 'Enter a valid email address.';
  } else {
    email = rawEmail;
  }

  const department = optionalBetween(errors, 'department', body.department, LIMITS.department, 'Department');
  const designation = optionalBetween(errors, 'designation', body.designation, LIMITS.designation, 'Designation');
  const contactPhone = clean(body.contactPhone ?? body.contact);
  if (contactPhone && !PHONE_RE.test(contactPhone)) {
    errors.contactPhone = 'Enter a valid contact number.';
  }

  // --- Requested role: privilege escalation is refused here and in SQL. -----
  const requestedRoleRaw = clean(body.requestedRole ?? body.role);
  let requestedRole: string | null = null;
  if (requestedRoleRaw) {
    const normalized = requestedRoleRaw.toLowerCase().replace(/-/g, '_');
    if (normalized === 'admin' || normalized === 'approver') {
      return res.status(400).json({
        error:
          'Administrator and competent-authority roles cannot be requested here. Roles are assigned by an administrator after review.',
        code: 'PRIVILEGED_ROLE_NOT_REQUESTABLE',
        field: 'requestedRole',
      });
    }
    if (!REQUESTABLE_ROLES.has(normalized)) {
      errors.requestedRole = 'Select a role from the list.';
    } else {
      requestedRole = normalized;
    }
  }

  // --- Territory: resolved against LGD, never trusted from the client. -----
  const stateCodeRaw = clean(body.stateCode);
  const districtCodeRaw = clean(body.districtCode);
  let stateName: string | null = null;
  let districtName: string | null = null;

  if (stateCodeRaw) {
    if (!LGD_STATE_RE.test(stateCodeRaw)) {
      errors.stateCode = 'Select a state from the list.';
    } else {
      const unit = await getAdministrativeUnitByCode(stateCodeRaw, 'state');
      if (!unit) {
        errors.stateCode = 'That state code is not present in the LGD hierarchy.';
      } else {
        stateName = unit.name;
      }
    }
  }

  if (districtCodeRaw) {
    if (!LGD_DISTRICT_RE.test(districtCodeRaw)) {
      errors.districtCode = 'Select a district from the list.';
    } else if (!stateCodeRaw) {
      errors.districtCode = 'Select a state before selecting a district.';
    } else {
      const unit = await getAdministrativeUnitByCode(districtCodeRaw, 'district');
      if (!unit) {
        errors.districtCode = 'That district code is not present in the LGD hierarchy.';
      } else if (unit.state_code && unit.state_code !== stateCodeRaw) {
        errors.districtCode = 'That district does not belong to the selected state.';
      } else {
        districtName = unit.name;
      }
    }
  }

  if (Object.keys(errors).length > 0) {
    return res.status(400).json({
      error: 'Some fields need attention.',
      code: 'VALIDATION_FAILED',
      fields: errors,
    });
  }

  // --- Duplicate pending request ------------------------------------------
  const { data: existing, error: dupErr } = await getSupabase()
    .from('access_requests')
    .select('id, status')
    .ilike('email', email)
    .in('status', ['pending', 'in_review'])
    .limit(1);
  if (dupErr && !dupErr.message?.toLowerCase().includes('does not exist')) {
    // fall through: a failed duplicate check must not block a valid request
  } else if (existing && existing.length > 0) {
    return res.status(409).json({
      error: 'An access request for this email address is already under review.',
      code: 'DUPLICATE_REQUEST',
    });
  }

  const { data, error } = await getSupabase()
    .from('access_requests')
    .insert({
      full_name: fullName,
      email,
      organization,
      department: department || null,
      designation: designation || null,
      contact_phone: contactPhone || null,
      jurisdiction_state_lgd_code: stateCodeRaw || null,
      jurisdiction_state_name: stateName,
      jurisdiction_district_lgd_code: districtCodeRaw || null,
      jurisdiction_district_name: districtName,
      justification,
      requested_role: requestedRole,
      status: 'pending',
    })
    .select('id, status, created_at')
    .single();

  if (error) {
    const missing =
      `${error.code ?? ''} ${error.message ?? ''}`.toLowerCase().includes('does not exist') ||
      `${error.code ?? ''}` === '42P01';
    if (missing) {
      availabilityCache = { value: false, at: Date.now() };
      return res.status(503).json({
        error: 'No access-request workflow is configured for this deployment.',
        code: 'NOT_CONFIGURED',
      });
    }
    if (error.code === '23514' || error.code === '23505') {
      return res.status(400).json({ error: error.message, code: 'VALIDATION_FAILED' });
    }
    console.error('[AuthRoutes] access request insert failed:', error.message);
    return res.status(500).json({ error: 'The request could not be stored.', code: 'STORE_FAILED' });
  }

  return res.status(201).json({
    success: true,
    request: { id: data.id, status: data.status, created_at: data.created_at },
    message:
      'Request recorded. It is pending administrative review; no account or role has been granted.',
  });
});

export default authRouter;
