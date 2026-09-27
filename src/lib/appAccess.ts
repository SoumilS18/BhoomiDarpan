// ============================================================================
// BhoomiSetu - Application-area access rule
// ----------------------------------------------------------------------------
// The route registry declares three experience areas ('public' | 'auth' |
// 'app'). This module decides whether the current browser may render an
// 'app'-area surface.
//
// THE RULE
//   1. A session is still being restored  -> wait (never bounce a signing-in
//      officer because the token has not been read yet).
//   2. A verified session exists          -> allow, in any build.
//   3. Client-side authentication is      -> DENY. When Supabase Auth is
//      configured for this deployment         wired up, an anonymous visitor
//      is never shown operational records; they are sent to /login?next=….
//      This holds for development builds too, so what is verified in dev is
//      exactly what ships.
//   4. No auth provider is configured     -> allow ONLY on a non-production
//      build. That is the offline test harness: there is no provider to
//      authenticate against, and such a build has no operational data
//      behind it anyway. A production build with no provider is denied —
//      there would be no way to sign in at all.
//
//   This is a UX boundary only. Authorisation remains exclusively
//   server-side: every API request is independently authenticated and
//   role-checked by `requireAuth` / `requireRole`.
// ============================================================================

export type AppAccessDecision =
  /** Render the application surface. */
  | 'allow'
  /** Redirect to the sign-in route (preserving `?next=`). */
  | 'deny'
  /** A persisted session is still being restored; wait before deciding. */
  | 'wait';

export interface AppAccessInput {
  /** A verified session exists, or `null`. */
  hasSession: boolean;
  /** Session restore status from AuthContext. */
  sessionStatus: 'restoring' | 'ready';
  /** Whether client-side authentication is configured for this deployment. */
  realAuthConfigured: boolean;
  /** `import.meta.env.MODE` — 'production' for a built bundle. */
  buildMode: string;
}

/**
 * Decides whether an 'app'-area route may be rendered.
 *
 * Pure and dependency-injected so the rule is unit-testable without a
 * browser, a session or a build environment.
 */
export function evaluateAppAccess(input: AppAccessInput): AppAccessDecision {
  // Never decide on a half-restored session: bouncing a signed-in officer to
  // the login page because the token has not been read yet is a real bug.
  if (input.sessionStatus === 'restoring') {
    return 'wait';
  }

  // A verified session always grants access to the application shell.
  if (input.hasSession) {
    return 'allow';
  }

  // Authentication is wired up for this deployment, so there is a real way to
  // sign in — and an anonymous visitor must use it. Checked before the build
  // mode on purpose: a development build must exercise the same redirect that
  // production ships, otherwise the guard is only ever tested in the case it
  // will not run in.
  if (input.realAuthConfigured) {
    return 'deny';
  }

  // No auth provider configured: the offline harness. Non-production only —
  // a production bundle with no provider would leave nobody able to sign in,
  // so it is denied rather than rendered as an unusable shell.
  if (input.buildMode !== 'production') {
    return 'allow';
  }

  return 'deny';
}

/** Convenience wrapper over `evaluateAppAccess` for use inside components. */
export function evaluateAppAccessFor(
  session: unknown,
  sessionStatus: 'restoring' | 'ready',
  realAuthConfigured: boolean
): AppAccessDecision {
  return evaluateAppAccess({
    hasSession: Boolean(session),
    sessionStatus,
    realAuthConfigured,
    // `import.meta.env` is supplied by Vite; outside a bundled context it does
    // not exist, and throwing here would take down the guard itself.
    buildMode: (import.meta as { env?: { MODE?: string } }).env?.MODE ?? 'development',
  });
}
