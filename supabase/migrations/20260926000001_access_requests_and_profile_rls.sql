-- ============================================================================
-- BhoomiSetu - Access requests + hardening of user_profiles row-level security
-- ----------------------------------------------------------------------------
-- WHY THIS MIGRATION EXISTS
--
--   1. ACCESS REQUESTS
--      The public Request Access page previously had no backend at all, so it
--      had to admit "not connected". This adds the one minimal table needed to
--      persist a real request. It deliberately stores a *requested* role only
--      from a non-privileged whitelist, and never an assigned role: approving
--      a request and issuing an account remains an administrative operation.
--
--   2. ROLE SPOOFING FIX ON user_profiles
--      The initial schema granted `USING (true)` / `WITH CHECK (true)` on
--      user_profiles to anon and authenticated. Because the API resolves a
--      caller's role from that table (`auth.middleware.ts`), anybody holding
--      the public anon key could INSERT or UPDATE a row setting
--      `role = 'admin'` for their own id and gain administrator authority.
--      That is client-side privilege escalation, so the permissive policies
--      are dropped: the table is now readable only by its own owner (the
--      signed-in officer reading their own profile) and writable only by the
--      service role, which the server uses and which bypasses RLS.
--
--   Everything else (workflow engine, cases, parcels, documents, audit,
--   intelligence) is untouched.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. ACCESS REQUESTS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS access_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Requester identity (what they state about themselves).
    full_name TEXT NOT NULL
        CHECK (char_length(btrim(full_name)) BETWEEN 2 AND 120),
    email TEXT NOT NULL
        CHECK (email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
               AND char_length(email) <= 254),
    organization TEXT NOT NULL
        CHECK (char_length(btrim(organization)) BETWEEN 2 AND 200),
    department TEXT CHECK (department IS NULL OR char_length(btrim(department)) <= 200),
    designation TEXT CHECK (designation IS NULL OR char_length(btrim(designation)) <= 120),
    contact_phone TEXT CHECK (contact_phone IS NULL OR contact_phone ~ '^[0-9+()\-\s]{6,30}$'),

    -- Territorial interest, expressed with official LGD codes where the
    -- requester supplied them. Names are only ever what the requester typed.
    jurisdiction_state_lgd_code TEXT
        CHECK (jurisdiction_state_lgd_code IS NULL
               OR jurisdiction_state_lgd_code ~ '^[0-9]{1,3}$'),
    jurisdiction_state_name TEXT
        CHECK (jurisdiction_state_name IS NULL OR char_length(btrim(jurisdiction_state_name)) <= 120),
    jurisdiction_district_lgd_code TEXT
        CHECK (jurisdiction_district_lgd_code IS NULL
               OR jurisdiction_district_lgd_code ~ '^[0-9]{1,4}$'),
    jurisdiction_district_name TEXT
        CHECK (jurisdiction_district_name IS NULL OR char_length(btrim(jurisdiction_district_name)) <= 120),

    justification TEXT NOT NULL
        CHECK (char_length(btrim(justification)) BETWEEN 20 AND 2000),

    -- A *requested* role, never an assigned one. The CHECK is the privilege
    -- boundary: 'admin' and 'approver' cannot be asked for through this table
    -- at all, so no request — however it is crafted — can become an
    -- administrator. Role assignment happens only when an administrator
    -- creates the account.
    requested_role user_role
        CHECK (requested_role IS NULL OR requested_role IN
               ('lao', 'project_officer', 'revenue_inspector', 'legal_officer', 'viewer')),

    -- Workflow state. 'pending' is the only value a request may arrive with.
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'in_review', 'approved', 'rejected', 'withdrawn')),

    -- Reviewer attribution, populated exclusively by an administrator.
    reviewed_by UUID REFERENCES user_profiles (id) ON DELETE SET NULL,
    reviewed_at TIMESTAMPTZ,
    review_note TEXT CHECK (review_note IS NULL OR char_length(btrim(review_note)) <= 1000),

    -- A request must never arrive already reviewed or already approved.
    CONSTRAINT access_requests_unreviewed_on_creation
        CHECK (status = 'pending' AND reviewed_by IS NULL AND reviewed_at IS NULL
              OR status <> 'pending'),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE access_requests IS
    'Publicly submitted requests for platform access. Stores only what the requester stated; no account, no role and no permission is created by inserting a row.';
COMMENT ON COLUMN access_requests.requested_role IS
    'Non-privileged role the requester asked for. Excludes admin and approver by CHECK constraint; approval and account issuance are separate administrative actions.';
COMMENT ON COLUMN access_requests.status IS
    'Lifecycle of the review. Rows are always created as pending.';

CREATE INDEX IF NOT EXISTS idx_access_requests_status_created
    ON access_requests (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_access_requests_email
    ON access_requests (lower(email));
CREATE INDEX IF NOT EXISTS idx_access_requests_jurisdiction_state_lgd
    ON access_requests (jurisdiction_state_lgd_code);

DROP TRIGGER IF EXISTS set_access_requests_updated_at ON access_requests;
CREATE TRIGGER set_access_requests_updated_at
    BEFORE UPDATE ON access_requests
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

ALTER TABLE access_requests ENABLE ROW LEVEL SECURITY;

-- Backend only: the API writes with the service role, which bypasses RLS.
-- No anon/authenticated policy means a browser holding the public anon key
-- cannot insert, alter or erase a request directly, and cannot read anybody
-- else's request. Deliberately no INSERT / UPDATE / DELETE policy exists.
DROP POLICY IF EXISTS "access_requests_admin_read" ON access_requests;
CREATE POLICY "access_requests_admin_read" ON access_requests
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM user_profiles up
            WHERE up.id = auth.uid()
              AND up.role = 'admin'
        )
    );

-- ----------------------------------------------------------------------------
-- 2. HARDEN user_profiles ROW LEVEL SECURITY
-- ----------------------------------------------------------------------------
-- Drop the blanket policies the initial schema created for this table.
DROP POLICY IF EXISTS "Allow select for all" ON user_profiles;
DROP POLICY IF EXISTS "Allow insert for all" ON user_profiles;
DROP POLICY IF EXISTS "Allow update for all" ON user_profiles;
DROP POLICY IF EXISTS "Allow delete for all" ON user_profiles;

-- The signed-in officer may read their OWN profile row and nothing else.
-- `user_profiles.id` is the Supabase Auth user id (see auth.middleware.ts),
-- so auth.uid() matches it for the row's owner.
DROP POLICY IF EXISTS "user_profiles_read_own" ON user_profiles;
CREATE POLICY "user_profiles_read_own" ON user_profiles
    FOR SELECT TO authenticated
    USING (id = auth.uid());

-- No INSERT / UPDATE / DELETE policy is granted to anon or authenticated.
-- Profiles are provisioned by an administrator through the service role;
-- a browser can neither create a profile nor change its role, department or
-- jurisdiction. Service-role requests bypass RLS entirely.
