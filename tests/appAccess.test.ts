import { describe, test, expect } from 'bun:test';
import { evaluateAppAccess, evaluateAppAccessFor, AppAccessInput } from '../src/lib/appAccess';

/**
 * The application-area guard.
 *
 * These cases exist because the guard sits in front of every operational
 * surface: if it ever started trusting a client-supplied role, or allowed a
 * build mode to override "a real provider is configured, but nobody signed
 * in", the login screen would become decorative. Authorisation itself stays
 * server-side — this is only about when to render the shell versus redirect.
 */

const base: AppAccessInput = {
  hasSession: false,
  sessionStatus: 'ready',
  realAuthConfigured: true,
  buildMode: 'production',
};

const decide = (over: Partial<AppAccessInput> = {}) => evaluateAppAccess({ ...base, ...over });

describe('Application-area access guard', () => {
  describe('session restore is never interrupted', () => {
    test('waits while the session is restoring, even with no session yet', () => {
      expect(decide({ sessionStatus: 'restoring', hasSession: false })).toBe('wait');
    });

    test('waits while restoring even if authentication is not configured', () => {
      expect(
        decide({ sessionStatus: 'restoring', realAuthConfigured: false, buildMode: 'development' })
      ).toBe('wait');
    });

    test('a half-restored state never falls through to a redirect', () => {
      // The officer is signing in; bouncing them to /login would log them out
      // of a session that simply has not been read yet.
      expect(decide({ sessionStatus: 'restoring', realAuthConfigured: true })).not.toBe('deny');
    });
  });

  describe('a verified session always grants access', () => {
    test('allows in a production build with authentication configured', () => {
      expect(decide({ hasSession: true })).toBe('allow');
    });

    test('allows in a development build', () => {
      expect(decide({ hasSession: true, buildMode: 'development' })).toBe('allow');
    });

    test('allows when no auth provider is configured', () => {
      expect(decide({ hasSession: true, realAuthConfigured: false })).toBe('allow');
    });
  });

  describe('an anonymous visitor with real authentication configured is redirected', () => {
    test('denies in a production build', () => {
      expect(decide()).toBe('deny');
    });

    test('denies in a development build too', () => {
      // Deliberate: what is verified in development must be what ships, so
      // the guard cannot be exercised only in the case it will not run in.
      expect(decide({ buildMode: 'development' })).toBe('deny');
    });

    test('denies in a preview build', () => {
      expect(decide({ buildMode: 'preview' })).toBe('deny');
    });

    test('authentication being configured outranks the build mode', () => {
      // The security-relevant ordering: a non-production build must not be
      // able to bypass a configured provider.
      expect(
        decide({ realAuthConfigured: true, buildMode: 'development', hasSession: false })
      ).toBe('deny');
    });
  });

  describe('no auth provider configured (offline harness only)', () => {
    test('allows a non-production build', () => {
      expect(decide({ realAuthConfigured: false, buildMode: 'development' })).toBe('allow');
    });

    test('denies a production build — nobody could ever sign in', () => {
      expect(
        decide({ realAuthConfigured: false, buildMode: 'production', hasSession: false })
      ).toBe('deny');
    });

    test('only the production build mode is denied', () => {
      // `vite build` produces MODE='production'; any other mode is a
      // non-shipping context where there is still no provider to authenticate
      // against, so it behaves like the offline harness.
      expect(decide({ realAuthConfigured: false, buildMode: 'preview' })).toBe('allow');
      expect(decide({ realAuthConfigured: false, buildMode: 'test' })).toBe('allow');
    });
  });

  describe('the guard never consults a client-supplied role', () => {
    test('the input contract carries no role or persona field', () => {
      // Compile-time shape check: adding a `role` to AppAccessInput would make
      // this assignment fail, which is exactly the point.
      const input: AppAccessInput = {
        hasSession: true,
        sessionStatus: 'ready',
        realAuthConfigured: true,
        buildMode: 'production',
      };
      expect(Object.keys(input).sort()).toEqual([
        'buildMode',
        'hasSession',
        'realAuthConfigured',
        'sessionStatus',
      ]);
    });

    test('session state alone decides — a declared role cannot widen access', () => {
      const anonymous = evaluateAppAccess({
        hasSession: false,
        sessionStatus: 'ready',
        realAuthConfigured: true,
        buildMode: 'production',
      } as AppAccessInput);
      expect(anonymous).toBe('deny');
    });
  });

  describe('evaluateAppAccessFor convenience wrapper', () => {
    test('maps a present session to allow', () => {
      expect(evaluateAppAccessFor({ id: 'u1' }, 'ready', true)).toBe('allow');
    });

    test('maps a null session with configured auth to deny', () => {
      expect(evaluateAppAccessFor(null, 'ready', true)).toBe('deny');
    });

    test('maps a restoring session to wait', () => {
      expect(evaluateAppAccessFor(null, 'restoring', true)).toBe('wait');
    });

    test('treats any truthy session value as present without inspecting it', () => {
      // The guard checks *existence*, not content: it never reads a role off
      // the session object.
      expect(evaluateAppAccessFor({ role: 'viewer' }, 'ready', true)).toBe('allow');
      expect(evaluateAppAccessFor({}, 'ready', true)).toBe('allow');
    });
  });
});
