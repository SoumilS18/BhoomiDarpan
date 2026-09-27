import { describe, test, expect } from 'bun:test';
import type { Request, Response } from 'express';
import {
  authenticateRequest,
  requireAuth,
  requireRole,
} from '../server/middleware/auth.middleware';

/**
 * Authentication hardening regression suite.
 *
 * The vulnerability these pin down: `authenticateRequest` used to accept a
 * client-supplied `X-Eval-Role: admin` header for ANY process whose NODE_ENV
 * was not literally 'production'. The ordinary dev server therefore granted
 * the admin audit ledger to an unauthenticated request carrying one header,
 * and `Bearer valid-test-token-admin` did the same. Both paths are now
 * reachable only while the automated harness is running.
 */

function mockRequest(headers: Record<string, string> = {}): Request {
  return { headers, user: undefined } as unknown as Request;
}

function mockResponse() {
  const res: any = {
    statusCode: 200,
    body: null as any,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(data: any) {
      res.body = data;
      return res;
    },
  };
  return res as Response & { statusCode: number; body: any };
}

/**
 * Runs `fn` with every test-harness marker removed, then restores the exact
 * previous environment (deleting keys that did not exist rather than writing
 * the string "undefined").
 */
async function outsideHarness<T>(fn: () => Promise<T> | T): Promise<T> {
  const keys = ['NODE_ENV', 'BUN_ENV', 'VITEST', 'JEST_WORKER_ID'] as const;
  const previous = new Map<string, string | undefined>(keys.map((k) => [k, process.env[k]]));
  try {
    for (const k of keys) delete process.env[k];
    process.env.NODE_ENV = 'production';
    return await fn();
  } finally {
    for (const k of keys) {
      const value = previous.get(k);
      if (value === undefined) delete process.env[k];
      else process.env[k] = value;
    }
  }
}

const adminHeader = {
  'x-eval-role': 'admin',
  'x-eval-user-id': 'attacker-1',
  'x-eval-user-name': 'Spoofed Administrator',
  'x-eval-department': 'project:anything',
};

describe('Auth hardening: no client-chosen identity outside the harness', () => {
  describe('role headers are not a credential', () => {
    test('X-Eval-Role: admin is ignored by a production-mode process', async () => {
      const user = await outsideHarness(() => authenticateRequest(mockRequest(adminHeader)));
      expect(user).toBeNull();
    });

    test('X-Test-User-Role (the legacy alias) is ignored too', async () => {
      const user = await outsideHarness(() =>
        authenticateRequest(mockRequest({ 'x-test-user-role': 'admin' }))
      );
      expect(user).toBeNull();
    });

    test('a role header cannot be combined with an unrelated identity', async () => {
      const user = await outsideHarness(() =>
        authenticateRequest(
          mockRequest({
            ...adminHeader,
            'x-eval-user-id': '00000000-0000-4000-8000-000000000001',
          })
        )
      );
      expect(user).toBeNull();
    });

    test('requireAuth answers 401 AUTH_REQUIRED for a bare role header', async () => {
      await outsideHarness(async () => {
        const res = mockResponse();
        let nextCalled = false;
        await requireAuth(mockRequest(adminHeader), res, () => {
          nextCalled = true;
        });
        expect(nextCalled).toBe(false);
        expect(res.statusCode).toBe(401);
        expect(res.body.code).toBe('AUTH_REQUIRED');
      });
    });

    test('the rejection happens before any role is ever assigned', async () => {
      const req = mockRequest(adminHeader);
      await outsideHarness(async () => {
        const res = mockResponse();
        await requireAuth(req, res, () => undefined);
      });
      expect(req.user).toBeUndefined();
    });
  });

  describe('fixture bearer tokens are not a credential', () => {
    test('valid-test-token-admin is rejected by a production-mode process', async () => {
      const user = await outsideHarness(() =>
        authenticateRequest(mockRequest({ authorization: 'Bearer valid-test-token-admin' }))
      );
      expect(user).toBeNull();
    });

    test('requireAuth answers AUTH_INVALID_TOKEN for it, not success', async () => {
      await outsideHarness(async () => {
        const res = mockResponse();
        let nextCalled = false;
        await requireAuth(
          mockRequest({ authorization: 'Bearer valid-test-token-admin' }),
          res,
          () => {
            nextCalled = true;
          }
        );
        expect(nextCalled).toBe(false);
        expect(res.statusCode).toBe(401);
        expect(res.body.code).toBe('AUTH_INVALID_TOKEN');
      });
    });

    test('the lao fixture token is rejected as well', async () => {
      const user = await outsideHarness(() =>
        authenticateRequest(mockRequest({ authorization: 'Bearer valid-test-token-lao' }))
      );
      expect(user).toBeNull();
    });
  });

  describe('harness behaviour is unchanged (the test suite still runs)', () => {
    test('a fixture bearer token authenticates while the harness is running', async () => {
      const user = await authenticateRequest(
        mockRequest({ authorization: 'Bearer valid-test-token-admin' })
      );
      expect(user).not.toBeNull();
      expect(user?.role).toBe('admin');
    });

    test('a harness persona header still expresses role and jurisdiction', async () => {
      const user = await authenticateRequest(
        mockRequest({
          'x-eval-role': 'project_officer',
          'x-eval-user-id': 'usr-po-1',
          'x-eval-user-name': 'Project Officer',
          'x-eval-department': 'project:prj-alpha-1',
        })
      );
      expect(user?.role).toBe('project_officer');
      expect(user?.department).toBe('project:prj-alpha-1');
      expect(user?.is_eval_persona).toBe(true);
    });

    test('an unknown harness role is still refused', async () => {
      const res = mockResponse();
      let nextCalled = false;
      await requireAuth(
        mockRequest({ 'x-eval-role': 'super_hacker_unauthorized' }),
        res,
        () => {
          nextCalled = true;
        }
      );
      expect(nextCalled).toBe(false);
      expect(res.statusCode).toBe(401);
    });
  });

  describe('a header cannot override a presented token', () => {
    test('the bearer token decides the role, even with X-Eval-Role: admin attached', async () => {
      const user = await authenticateRequest(
        mockRequest({
          authorization: 'Bearer valid-test-token-viewer',
          'x-eval-role': 'admin',
          'x-eval-user-id': 'attacker-1',
        })
      );
      expect(user).not.toBeNull();
      expect(user?.role).toBe('viewer');
    });
  });

  describe('role guards are unaffected', () => {
    test('requireRole still admits a permitted role', () => {
      const req = mockRequest();
      req.user = { id: 'u1', role: 'lao', full_name: 'Officer' };
      const res = mockResponse();
      let nextCalled = false;
      requireRole(['admin', 'lao'])(req, res, () => {
        nextCalled = true;
      });
      expect(nextCalled).toBe(true);
    });

    test('requireRole still refuses a non-permitted role with 403', () => {
      const req = mockRequest();
      req.user = { id: 'u2', role: 'viewer', full_name: 'Viewer' };
      const res = mockResponse();
      let nextCalled = false;
      requireRole(['admin', 'lao'])(req, res, () => {
        nextCalled = true;
      });
      expect(nextCalled).toBe(false);
      expect(res.statusCode).toBe(403);
      expect(res.body.code).toBe('FORBIDDEN_ROLE');
    });

    test('requireRole still refuses an unauthenticated request with 401', () => {
      const req = mockRequest();
      const res = mockResponse();
      let nextCalled = false;
      requireRole(['admin'])(req, res, () => {
        nextCalled = true;
      });
      expect(nextCalled).toBe(false);
      expect(res.statusCode).toBe(401);
      expect(res.body.code).toBe('AUTH_REQUIRED');
    });
  });
});
