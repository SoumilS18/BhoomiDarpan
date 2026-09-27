import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { UserRole, UserProfile } from '../../shared/types';
import { setApiAuthToken } from '../lib/api';
import { roleLabel } from '../lib/domainLabels';
import { supabase, isClientSupabaseConfigured } from '../lib/supabase';

export interface PersonaOption {
  role: UserRole;
  label: string;
  name: string;
  department: string;
  badgeColor: string;
  /**
   * Jurisdiction the account is scoped to, rendered from the profile row
   * (`jurisdiction_state` / `jurisdiction_district` + LGD codes). `null` when
   * the profile has no territorial limit — i.e. national scope.
   */
  jurisdiction: string | null;
}

/**
 * The identity shown when NO verified session exists.
 *
 * It is a fixed, non-selectable placeholder — there is deliberately no list of
 * personas to switch between. A signed-in officer's identity comes from their
 * own `user_profiles` row and is never something the browser chooses; an
 * anonymous visitor is simply "not signed in". Nothing here is presented as an
 * account, and the application shell is gated behind authentication before
 * this value could ever be displayed.
 */
const ANONYMOUS_PERSONA: PersonaOption = {
  role: 'viewer',
  label: 'Not signed in',
  name: 'Not signed in',
  department: '',
  badgeColor: 'bg-slate-100 text-slate-500 border-slate-200',
  jurisdiction: null,
};

/**
 * Builds a `PersonaOption` from the caller's REAL profile row — the only
 * identity the interface ever shows while a session is active.
 */
function personaFromProfile(profile: {
  role: UserRole;
  fullName: string;
  department: string;
  jurisdiction: string | null;
}): PersonaOption {
  return {
    role: profile.role,
    label: roleLabel(profile.role),
    name: profile.fullName,
    department: profile.department,
    badgeColor: 'bg-blue-100 text-blue-800 border-blue-300',
    jurisdiction: profile.jurisdiction,
  };
}

/**
 * Human-readable jurisdiction summary straight from the profile row. Returns
 * `null` when the officer holds no territorial restriction (national scope).
 * Uses LGD codes where they exist, and state/district names where supplied —
 * never an invented place name.
 */
function jurisdictionFromProfile(profile: {
  jurisdiction_state?: string | null;
  jurisdiction_district?: string | null;
  jurisdiction_state_lgd_code?: string | null;
  jurisdiction_district_lgd_code?: string | null;
} | null): string | null {
  if (!profile) return null;
  const state = profile.jurisdiction_state || null;
  const district = profile.jurisdiction_district || null;
  const stateCode = profile.jurisdiction_state_lgd_code || null;
  const districtCode = profile.jurisdiction_district_lgd_code || null;
  if (!state && !district && !stateCode && !districtCode) return null;
  const parts: string[] = [];
  if (district) parts.push(district);
  else if (districtCode) parts.push(`District LGD ${districtCode}`);
  if (state) parts.push(state);
  else if (stateCode) parts.push(`State LGD ${stateCode}`);
  return parts.join(', ');
}

/**
 * A real, verified Supabase session. `null` means no session exists, and the
 * application shell is not reachable at all.
 */
export interface AuthSession {
  userId: string;
  email: string;
  /** Display name from user_profiles; null until the profile resolves. */
  fullName: string | null;
  /** Role from user_profiles; null until the profile resolves. */
  role: UserRole | null;
  department: string | null;
  jurisdiction: string | null;
}

export type SignInResult =
  | { ok: true }
  | {
      ok: false;
      code: 'not-configured' | 'invalid-credentials' | 'network';
      message: string;
    };

interface AuthContextType {
  /** Identity of the authenticated account; a fixed placeholder when signed out. */
  activePersona: PersonaOption;
  /** Real Supabase session; null means no authenticated account. */
  session: AuthSession | null;
  /** 'restoring' while a persisted session is re-checked on load. */
  sessionStatus: 'restoring' | 'ready';
  /** Whether client-side Supabase auth is configured for this deployment. */
  isRealAuthConfigured: boolean;
  signInWithPassword: (email: string, password: string) => Promise<SignInResult>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface ProfileRow {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  department: string;
  jurisdiction_state: string | null;
  jurisdiction_district: string | null;
  jurisdiction_state_lgd_code: string | null;
  jurisdiction_district_lgd_code: string | null;
}

/**
 * Fetches the caller's own profile. Mirrors the server-side lookup in
 * auth.middleware.ts (`user_profiles.id` = Supabase auth user id), so the
 * client-visible role can never disagree with what the API will enforce.
 */
async function fetchOwnProfile(userId: string): Promise<ProfileRow | null> {
  if (!supabase) {
    return null;
  }
  const { data, error } = await supabase
    .from('user_profiles')
    .select(
      'id, email, full_name, role, department, jurisdiction_state, jurisdiction_district, jurisdiction_state_lgd_code, jurisdiction_district_lgd_code'
    )
    .eq('id', userId)
    .maybeSingle();
  if (error) {
    return null;
  }
  return (data as ProfileRow | null) ?? null;
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<AuthSession | null>(null);
  /**
   * The caller's real profile, populated only when a verified session exists.
   * While this is set it — and never anything else — is the identity the
   * interface displays and the `actorName` reported to audit-logged APIs.
   */
  const [sessionProfile, setSessionProfile] = useState<{
    role: UserRole;
    fullName: string;
    department: string;
    jurisdiction: string | null;
  } | null>(null);
  const [sessionStatus, setSessionStatus] = useState<'restoring' | 'ready'>(
    isClientSupabaseConfigured ? 'restoring' : 'ready'
  );

  const activePersona = useMemo(
    () => (sessionProfile ? personaFromProfile(sessionProfile) : ANONYMOUS_PERSONA),
    [sessionProfile]
  );

  const applySession = useCallback(
    async (accessToken: string, user: { id: string; email?: string | null }) => {
      setApiAuthToken(accessToken);
      const profile = await fetchOwnProfile(user.id);
      setSession({
        userId: user.id,
        email: user.email ?? '',
        fullName: profile?.full_name ?? null,
        role: profile?.role ?? null,
        department: profile?.department ?? null,
        jurisdiction: jurisdictionFromProfile(profile),
      });
      // Display identity comes from real data only. When no profile row has
      // been provisioned yet, fall back to the same default the server applies
      // in auth.middleware.ts (role defaults to `viewer`) using the account's
      // own email — never to a placeholder officer.
      setSessionProfile({
        role: profile?.role ?? 'viewer',
        fullName: profile?.full_name || user.email || 'Signed-in user',
        department: profile?.department || '',
        jurisdiction: jurisdictionFromProfile(profile),
      });
    },
    []
  );

  const clearSession = useCallback(() => {
    setApiAuthToken(null);
    setSession(null);
    setSessionProfile(null);
  }, []);

  // Real Supabase session lifecycle: restore any persisted session on load and
  // stay in sync with sign-in / token-refresh / sign-out events.
  useEffect(() => {
    if (!supabase) {
      setSessionStatus('ready');
      return;
    }

    let cancelled = false;

    supabase.auth
      .getSession()
      .then(async ({ data }) => {
        if (data.session) {
          await applySession(data.session.access_token, data.session.user);
        }
        if (!cancelled) {
          setSessionStatus('ready');
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSessionStatus('ready');
        }
      });

    const { data: subscription } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (event === 'SIGNED_OUT' || !nextSession) {
        clearSession();
        return;
      }
      void applySession(nextSession.access_token, nextSession.user);
    });

    return () => {
      cancelled = true;
      subscription.subscription.unsubscribe();
    };
  }, [applySession, clearSession]);

  const signInWithPassword = useCallback(
    async (email: string, password: string): Promise<SignInResult> => {
      if (!supabase || !isClientSupabaseConfigured) {
        return {
          ok: false,
          code: 'not-configured',
          message:
            'Real authentication is not configured for this deployment. This build runs in evaluation mode.',
        };
      }
      try {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error || !data.session) {
          return {
            ok: false,
            code: 'invalid-credentials',
            message: error?.message ?? 'Sign-in failed. Check your credentials and try again.',
          };
        }
        await applySession(data.session.access_token, data.session.user);
        return { ok: true };
      } catch {
        return {
          ok: false,
          code: 'network',
          message: 'Authentication service could not be reached. Please try again.',
        };
      }
    },
    [applySession]
  );

  const signOut = useCallback(async () => {
    if (supabase) {
      await supabase.auth.signOut();
    }
    clearSession();
  }, [clearSession]);

  return (
    <AuthContext.Provider
      value={{
        activePersona,
        session,
        sessionStatus,
        isRealAuthConfigured: isClientSupabaseConfigured,
        signInWithPassword,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
