/**
 * Provisions REAL Supabase Auth accounts for every supported application role.
 *
 * Why this exists
 * ---------------
 * The application previously offered a "Switch Evaluation Role" control in the
 * browser, which meant the identity shown in the UI was chosen by the client
 * rather than proven by the server. That control is gone. The only way to
 * demonstrate the role-aware behaviour now is with genuine accounts: a real
 * email, a real password, a real Supabase session, and a `user_profiles` row
 * whose `id` is the Supabase Auth uid (which is exactly the key the API's
 * auth middleware resolves).
 *
 * What it does
 * ------------
 *   1. Creates one Supabase Auth user per `user_role` value (admin, lao,
 *      project_officer, revenue_inspector, legal_officer, approver, viewer)
 *      with `email_confirm: true`.
 *   2. Inserts the matching `user_profiles` row keyed on that uid.
 *   3. Verifies each account by performing an actual password sign-in.
 *   4. Writes credentials to `scripts/demo-accounts.local.json`, which is
 *      git-ignored — passwords are never printed to stdout or committed.
 *
 * Identity is NOT fabricated geography
 * ------------------------------------
 * Jurisdiction is left NULL (national scope) unless the operator passes a real
 * LGD code with `--state-lgd-code` / `--district-lgd-code`. Codes are only
 * applied when they exist in the ingested `administrative_units` hierarchy; if
 * the LGD source has not been ingested the script refuses to guess and says so.
 *
 * Idempotent: re-running reconciles existing accounts instead of duplicating.
 *
 * Usage:
 *   bun run scripts/provision-demo-accounts.ts
 *   bun run scripts/provision-demo-accounts.ts --state-lgd-code=9 --district-lgd-code=140
 */
import dotenv from 'dotenv';
import path from 'node:path';
import { randomUUID, randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const SUPABASE_URL = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const ROOT = process.cwd();
const CREDENTIALS_PATH = path.join(ROOT, 'scripts', 'demo-accounts.local.json');

const ROLES = [
  'admin',
  'lao',
  'project_officer',
  'revenue_inspector',
  'legal_officer',
  'approver',
  'viewer',
] as const;
type DemoRole = (typeof ROLES)[number];

/**
 * Departments are explicitly labelled as demonstration units so that a reader
 * of the profile menu can never mistake these for real government offices.
 */
const PRESENTATION: Record<DemoRole, { fullName: string; department: string }> = {
  admin: {
    fullName: 'Demo Administrator',
    department: 'Demonstration — System Administration',
  },
  lao: {
    fullName: 'Demo Land Acquisition Officer',
    department: 'Demonstration — Land Acquisition Office',
  },
  project_officer: {
    fullName: 'Demo Project Officer',
    department: 'Demonstration — Project Execution Cell',
  },
  revenue_inspector: {
    fullName: 'Demo Revenue Inspector',
    department: 'Demonstration — Revenue Survey Cell',
  },
  legal_officer: {
    fullName: 'Demo Legal Officer',
    department: 'Demonstration — Legal & Claims Cell',
  },
  approver: {
    fullName: 'Demo Approver',
    department: 'Demonstration — Approvals Committee',
  },
  viewer: {
    fullName: 'Demo Viewer',
    department: 'Demonstration — Read-only Observers',
  },
};

interface CredentialsFile {
  generated_at: string;
  note: string;
  accounts: Record<string, { password: string; uid: string }>;
}

interface ProvisionResult {
  role: DemoRole;
  email: string;
  uid: string;
  action: 'created' | 'reconciled';
  signed_in: boolean;
  jurisdiction: string;
}

function fail(message: string): never {
  console.error(`\n[provision-demo-accounts] FATAL: ${message}\n`);
  process.exit(1);
}

function argValue(name: string): string | undefined {
  const hit = process.argv.slice(2).find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=').slice(1).join('=') : undefined;
}

function generatePassword(): string {
  // 24 url-safe characters; high entropy so demo credentials are still real
  // credentials rather than a guessable pattern.
  return randomBytes(18).toString('base64url');
}

function loadCredentials(): CredentialsFile {
  if (!existsSync(CREDENTIALS_PATH)) {
    return { generated_at: new Date().toISOString(), note: '', accounts: {} };
  }
  try {
    return JSON.parse(readFileSync(CREDENTIALS_PATH, 'utf8')) as CredentialsFile;
  } catch {
    return { generated_at: new Date().toISOString(), note: '', accounts: {} };
  }
}

function saveCredentials(file: CredentialsFile): void {
  file.generated_at = new Date().toISOString();
  file.note =
    'Local-only demonstration credentials for BhoomiSetu. Git-ignored — do not commit or share. ' +
    'These are non-deliverable @example.org addresses for a demonstration environment.';
  writeFileSync(CREDENTIALS_PATH, `${JSON.stringify(file, null, 2)}\n`, { mode: 0o600 });
  try {
    // Re-assert restrictive permissions on platforms that honour them.
    writeFileSync(CREDENTIALS_PATH, `${JSON.stringify(file, null, 2)}\n`, { mode: 0o600 });
  } catch {
    /* best effort */
  }
}

async function rest<T>(method: string, urlPath: string, body?: unknown): Promise<{ status: number; json: T }> {
  const res = await fetch(`${SUPABASE_URL}${urlPath}`, {
    method,
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json: T = null as unknown as T;
  try {
    json = (await res.json()) as T;
  } catch {
    /* non-JSON body */
  }
  return { status: res.status, json };
}

async function signIn(email: string, password: string): Promise<boolean> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_ROLE_KEY,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) return false;
  try {
    const body = (await res.json()) as { access_token?: string; user?: { id?: string } };
    return Boolean(body.access_token && body.user?.id);
  } catch {
    return false;
  }
}

/**
 * Resolves an existing Auth user by email. Needed so a partially-finished
 * earlier run (auth user created, profile insert failed) is reconciled instead
 * of producing a second `email_exists` error on the next attempt.
 */
async function findAuthUserByEmail(email: string): Promise<string | null> {
  for (let page = 1; page <= 20; page++) {
    const { status, json } = await rest<{ users?: Array<{ id?: string; email?: string }> }>(
      'GET',
      `/auth/v1/admin/users?page=${page}&per_page=200`
    );
    if (status !== 200) return null;
    const users = Array.isArray(json) ? (json as Array<{ id?: string; email?: string }>) : json?.users || [];
    const hit = users.find((u) => (u.email || '').toLowerCase() === email.toLowerCase());
    if (hit?.id) return hit.id;
    if (users.length < 200) return null; // last page
  }
  return null;
}

/**
 * Confirms a supplied LGD code actually exists in the ingested hierarchy.
 * Returns `null` when the hierarchy has not been ingested, so the caller can
 * decline to set a jurisdiction instead of inventing one.
 */
async function resolveLgdCode(
  unitType: 'state' | 'district',
  code: string
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const { status, json } = await rest<Array<{ code: string }>>(
    'GET',
    `/rest/v1/administrative_units?unit_type=eq.${unitType}&code=eq.${encodeURIComponent(code)}&select=code`
  );
  if (status !== 200) {
    return { ok: false, reason: `unable to verify LGD code (HTTP ${status})` };
  }
  if (!Array.isArray(json) || json.length === 0) {
    return {
      ok: false,
      reason: `code ${code} is not present in administrative_units — the authoritative LGD hierarchy has not been ingested, so no jurisdiction can be verified`,
    };
  }
  return { ok: true };
}

async function main(): Promise<void> {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    fail('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must both be set in .env');
  }

  const stateLgdCode = argValue('state-lgd-code');
  const districtLgdCode = argValue('district-lgd-code');

  // Only set jurisdiction when the operator supplies a code AND the code is
  // verifiable against ingested LGD data. Otherwise leave it NULL (national).
  let stateOk = stateLgdCode ? await resolveLgdCode('state', stateLgdCode) : null;
  let districtOk = districtLgdCode ? await resolveLgdCode('district', districtLgdCode) : null;

  if (stateLgdCode && stateOk && !stateOk.ok) fail(`--state-lgd-code rejected: ${stateOk.reason}`);
  if (districtLgdCode && districtOk && !districtOk.ok) fail(`--district-lgd-code rejected: ${districtOk.reason}`);

  // Probe the profile table so a missing migration is reported up front.
  const probe = await rest<unknown>('GET', '/rest/v1/user_profiles?select=id&limit=1');
  if (probe.status === 404 || (probe.status === 400 && JSON.stringify(probe.json).includes('user_profiles'))) {
    fail('user_profiles table is not available. Apply supabase/migrations first.');
  }
  if (probe.status === 401 || probe.status === 403) {
    fail(`Supabase rejected the service-role key (HTTP ${probe.status}).`);
  }

  const credentials = loadCredentials();
  const results: ProvisionResult[] = [];

  for (const role of ROLES) {
    const email = `demo-${role}@example.org`;
    const presentation = PRESENTATION[role];

    const existing = await rest<Array<{ id: string }>>(
      'GET',
      `/rest/v1/user_profiles?email=eq.${encodeURIComponent(email)}&select=id`
    );

    const stored = credentials.accounts[email];
    let uid: string | undefined = stored?.uid;
    let password = stored?.password ?? generatePassword();

    // Whether the *profile row* exists is tracked separately from whether the
    // Auth user exists: only the profile decides if an INSERT is still needed.
    const profileExists =
      existing.status === 200 && Array.isArray(existing.json) && existing.json.length > 0;
    let action: ProvisionResult['action'] = profileExists ? 'reconciled' : 'created';

    if (profileExists) {
      uid = (existing.json as Array<{ id: string }>)[0].id;
    }

    // An earlier run may have created the Auth user and then failed before the
    // profile insert — adopt that uid rather than colliding on the email.
    if (!uid) {
      uid = (await findAuthUserByEmail(email)) ?? undefined;
    }

    if (!uid) {
      uid = randomUUID();
    }

    // 1. Ensure the Supabase Auth user exists with this exact uid.
    const authUser = await rest<{ id?: string; msg?: string }>('GET', `/auth/v1/admin/users/${uid}`);
    if (authUser.status !== 200) {
      const created = await rest<{ id?: string; msg?: string }>('POST', '/auth/v1/admin/users', {
        id: uid,
        email,
        password,
        email_confirm: true,
        user_metadata: { provisioned_by: 'provision-demo-accounts', role },
      });
      if (created.status >= 400) {
        const byEmail = await findAuthUserByEmail(email);
        if (!byEmail) {
          fail(`could not create Auth user for ${email}: ${JSON.stringify(created.json)}`);
        }
        uid = byEmail;
      } else {
        uid = created.json?.id || uid;
      }
    }

    // 2. Ensure the profile row exists, keyed on the Auth uid (the API resolves
    //    `user_profiles.id = authUser.id`).
    if (!profileExists) {
      const insert = await rest<{ id?: string }>('POST', '/rest/v1/user_profiles', {
        id: uid,
        auth_user_id: uid,
        email,
        full_name: presentation.fullName,
        role,
        department: presentation.department,
        jurisdiction_state_lgd_code: stateLgdCode ?? null,
        jurisdiction_district_lgd_code: districtLgdCode ?? null,
      });
      if (insert.status >= 400 && insert.status !== 409) {
        fail(`could not insert user_profiles row for ${email}: ${JSON.stringify(insert.json)}`);
      }
    }

    // 3. Prove the account actually works with a real password sign-in.
    let signedIn = await signIn(email, password);
    if (!signedIn) {
      // Reconcile: reset to a freshly generated password so re-runs converge
      // on an account that is demonstrably usable. GoTrue's admin update is PUT.
      password = generatePassword();
      const updated = await rest<{ id?: string; msg?: string }>(
        'PUT',
        `/auth/v1/admin/users/${uid}`,
        { email, password, email_confirm: true }
      );
      if (updated.status >= 400) {
        fail(
          `could not reset password for ${email} (HTTP ${updated.status}): ${JSON.stringify(updated.json)}`
        );
      }
      signedIn = await signIn(email, password);
      if (!signedIn) {
        fail(`sign-in verification failed for ${email} after password reset`);
      }
    }

    credentials.accounts[email] = { password, uid };
    results.push({
      role,
      email,
      uid,
      action,
      signed_in: signedIn,
      jurisdiction:
        stateLgdCode || districtLgdCode
          ? `state=${stateLgdCode || '—'} district=${districtLgdCode || '—'}`
          : 'national (no jurisdiction set — LGD hierarchy not ingested)',
    });
  }

  saveCredentials(credentials);

  console.log('\nDemonstration accounts provisioned against real Supabase Auth:\n');
  for (const r of results) {
    console.log(
      `  ${r.role.padEnd(17)} ${r.email.padEnd(30)} ${r.action.padEnd(10)} sign-in=${r.signed_in ? 'OK' : 'FAILED'}  ${r.jurisdiction}`
    );
  }
  console.log(`\nCredentials file: ${CREDENTIALS_PATH} (git-ignored, not printed to stdout)`);
  if (!stateLgdCode && !districtLgdCode) {
    console.log(
      'Jurisdiction left NULL because no verifiable LGD code was supplied and/or the\n' +
        '  authoritative LGD hierarchy has not been ingested. Pass --state-lgd-code / --district-lgd-code\n' +
        '  once administrative_units is populated to scope these accounts to a district.'
    );
  }
}

await main();
