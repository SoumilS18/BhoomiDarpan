import { Request, Response, Router } from 'express';
import { randomBytes, randomUUID } from 'node:crypto';
import { getSupabase, isSupabaseConfigured } from '../config/supabase';
import { getAdministrativeUnitByCode } from '../services/administrativeGeographyService';
import { requireAuth, requireRole } from '../middleware/auth.middleware';
import { UserRole } from '../../shared/types';

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

// ============================================================================
// Administrative Access-Request Management API
// ----------------------------------------------------------------------------
// Only accessible to authenticated administrators (`requireRole(['admin'])`).
// Allows reviewing, approving (provisioning real accounts), and rejecting.
// ============================================================================

/** Valid application roles that an admin can assign to an approved user */
const ALL_ASSIGNABLE_ROLES: UserRole[] = [
  'admin',
  'lao',
  'project_officer',
  'revenue_inspector',
  'legal_officer',
  'approver',
  'viewer',
];

/** Helper to find existing Auth user by email across pages */
async function findExistingAuthUser(email: string): Promise<string | null> {
  const supabase = getSupabase();
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 100 });
    if (error || !data?.users) break;
    const hit = data.users.find((u) => (u.email || '').toLowerCase() === email.toLowerCase());
    if (hit) return hit.id;
    if (data.users.length < 100) break;
  }
  return null;
}

/**
 * GET /api/auth/access-requests
 * Returns all access requests for administrative review.
 */
const listAccessRequestsHandler = async (req: Request, res: Response) => {
  if (!(await isTableAvailable())) {
    return res.status(503).json({
      error: 'Access requests table is not configured.',
      code: 'NOT_CONFIGURED',
      requests: [],
    });
  }

  const statusFilter = typeof req.query.status === 'string' ? req.query.status.trim() : null;

  try {
    let query = getSupabase()
      .from('access_requests')
      .select('*')
      .order('created_at', { ascending: false });

    if (statusFilter && statusFilter !== 'all') {
      query = query.eq('status', statusFilter);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[AuthRoutes] Failed to fetch access requests:', error.message);
      return res.status(500).json({ error: 'Failed to fetch access requests.', code: 'QUERY_FAILED' });
    }

    return res.json({
      requests: data || [],
      count: data?.length || 0,
    });
  } catch (err: any) {
    console.error('[AuthRoutes] Exception fetching access requests:', err);
    return res.status(500).json({ error: 'Internal server error while fetching requests.' });
  }
};

authRouter.get('/access-requests', requireAuth, requireRole(['admin']), listAccessRequestsHandler);
authRouter.get('/request-access/list', requireAuth, requireRole(['admin']), listAccessRequestsHandler);

/**
 * POST /api/auth/access-requests/:id/approve
 * Approves a request, creates a real Supabase Auth user, and inserts user_profiles row.
 */
authRouter.post('/access-requests/:id/approve', requireAuth, requireRole(['admin']), async (req: Request, res: Response) => {
  if (!isSupabaseConfigured) {
    return res.status(503).json({
      error: 'Supabase is not configured on this server.',
      code: 'SUPABASE_NOT_CONFIGURED',
    });
  }

  const requestId = req.params.id;
  const body = (req.body || {}) as Record<string, unknown>;
  const adminUser = req.user!;
  const supabase = getSupabase();

  try {
    // 1. Fetch access request
    const { data: request, error: fetchErr } = await supabase
      .from('access_requests')
      .select('*')
      .eq('id', requestId)
      .single();

    if (fetchErr || !request) {
      return res.status(404).json({
        error: 'Access request not found.',
        code: 'NOT_FOUND',
      });
    }

    if (request.status === 'approved') {
      return res.status(400).json({
        error: 'This access request has already been approved.',
        code: 'ALREADY_APPROVED',
      });
    }

    // 2. Determine target role
    let assignedRole: UserRole = (request.requested_role as UserRole) || 'viewer';
    if (typeof body.role === 'string' && ALL_ASSIGNABLE_ROLES.includes(body.role as UserRole)) {
      assignedRole = body.role as UserRole;
    }

    // 3. Password handling
    const rawPass = clean(body.temporaryPassword);
    const temporaryPassword = rawPass || `${randomBytes(8).toString('hex')}@Bhoomi1`;

    const email = request.email.trim().toLowerCase();
    let authUid: string | null = null;

    // 4. Check if auth user already exists
    authUid = await findExistingAuthUser(email);

    if (!authUid) {
      // Create new Supabase Auth user
      const { data: createdUser, error: createErr } = await supabase.auth.admin.createUser({
        email,
        password: temporaryPassword,
        email_confirm: true,
        user_metadata: {
          full_name: request.full_name,
          role: assignedRole,
          department: request.department || undefined,
          approved_by: adminUser.id,
        },
      });

      if (createErr || !createdUser?.user) {
        console.error('[AuthRoutes] Failed to create auth user:', createErr?.message);
        // Fallback: search again in case of race
        authUid = await findExistingAuthUser(email);
        if (!authUid) {
          return res.status(500).json({
            error: `Failed to provision authentication account: ${createErr?.message || 'Unknown error'}`,
            code: 'AUTH_PROVISION_FAILED',
          });
        }
      } else {
        authUid = createdUser.user.id;
      }
    } else {
      // User existed: update their password if provided
      if (rawPass) {
        await supabase.auth.admin.updateUserById(authUid, { password: rawPass });
      }
    }

    // 5. Upsert user_profiles row
    const { error: profileErr } = await supabase.from('user_profiles').upsert(
      {
        id: authUid,
        auth_user_id: authUid,
        email,
        full_name: request.full_name,
        role: assignedRole,
        department: request.department || `${request.organization} — ${request.designation || 'Staff'}`,
        jurisdiction_state_lgd_code: request.jurisdiction_state_lgd_code || null,
        jurisdiction_district_lgd_code: request.jurisdiction_district_lgd_code || null,
      },
      { onConflict: 'id' }
    );

    if (profileErr) {
      console.error('[AuthRoutes] user_profiles upsert failed:', profileErr.message);
      return res.status(500).json({
        error: `Account created but failed to save user profile: ${profileErr.message}`,
        code: 'PROFILE_CREATION_FAILED',
      });
    }

    // 6. Mark access_requests as approved
    const reviewNote = clean(body.reviewNote) || `Approved as ${assignedRole} by ${adminUser.full_name || 'Admin'}`;
    const { error: updateErr } = await supabase
      .from('access_requests')
      .update({
        status: 'approved',
        reviewed_by: adminUser.id,
        reviewed_at: new Date().toISOString(),
        review_note: reviewNote,
      })
      .eq('id', requestId);

    if (updateErr) {
      console.warn('[AuthRoutes] Status update warning on access_requests:', updateErr.message);
    }

    return res.json({
      success: true,
      message: `Account for ${request.full_name} (${email}) has been approved and provisioned as ${assignedRole}.`,
      credentials: {
        uid: authUid,
        email,
        role: assignedRole,
        temporaryPassword,
      },
    });
  } catch (err: any) {
    console.error('[AuthRoutes] Approval exception:', err);
    return res.status(500).json({
      error: 'An unexpected error occurred while approving the access request.',
      details: err?.message,
    });
  }
});

/**
 * POST /api/auth/access-requests/:id/reject
 * Rejects an access request with an optional reason note.
 */
authRouter.post('/access-requests/:id/reject', requireAuth, requireRole(['admin']), async (req: Request, res: Response) => {
  const requestId = req.params.id;
  const body = (req.body || {}) as Record<string, unknown>;
  const adminUser = req.user!;
  const supabase = getSupabase();

  try {
    const reviewNote = clean(body.reviewNote) || 'Request declined by administrator.';

    const { error } = await supabase
      .from('access_requests')
      .update({
        status: 'rejected',
        reviewed_by: adminUser.id,
        reviewed_at: new Date().toISOString(),
        review_note: reviewNote,
      })
      .eq('id', requestId);

    if (error) {
      console.error('[AuthRoutes] Rejection update failed:', error.message);
      return res.status(500).json({ error: 'Failed to update request status.', code: 'UPDATE_FAILED' });
    }

    return res.json({
      success: true,
      message: 'Access request has been rejected.',
    });
  } catch (err: any) {
    console.error('[AuthRoutes] Rejection exception:', err);
    return res.status(500).json({ error: 'Internal server error while rejecting request.' });
  }
});

export default authRouter;

