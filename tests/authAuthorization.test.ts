import { describe, test, expect } from 'bun:test';
import {
  authenticateRequest,
  requireAuth,
  requireRole,
} from '../server/middleware/auth.middleware';

function createMockRequest(headers: Record<string, string> = {}) {
  return {
    headers,
    user: undefined,
  } as any;
}

function createMockResponse() {
  const res: any = {
    statusCode: 200,
    body: null,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(data: any) {
      res.body = data;
      return res;
    },
  };
  return res;
}

describe('Day 5 Authentication & Authorization Verification', () => {
  test('authenticates request using valid mock JWT in test environment', async () => {
    const req = createMockRequest({
      authorization: 'Bearer valid-test-token-admin',
    });
    const user = await authenticateRequest(req);

    expect(user).not.toBeNull();
    expect(user?.role).toBe('admin');
    expect(user?.full_name).toBe('Test Administrator');
  });

  test('rejects unauthenticated request with 401 when no token or persona supplied', async () => {
    const req = createMockRequest();
    const res = createMockResponse();
    let nextCalled = false;

    await requireAuth(req, res, () => {
      nextCalled = true;
    });

    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(401);
    expect(res.body.code).toBe('AUTH_REQUIRED');
  });

  test('rejects invalid or expired token with 401', async () => {
    const req = createMockRequest({
      authorization: 'Bearer invalid-or-expired-token-123',
    });
    const res = createMockResponse();
    let nextCalled = false;

    await requireAuth(req, res, () => {
      nextCalled = true;
    });

    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(401);
    expect(res.body.code).toBe('AUTH_INVALID_TOKEN');
  });

  test('successfully authenticates with evaluation persona headers', async () => {
    const req = createMockRequest({
      'x-eval-role': 'lao',
      'x-eval-user-name': 'Dr. Vikramaditya Rao, IAS',
      'x-eval-user-id': 'eval-lao-1',
    });
    const res = createMockResponse();
    let nextCalled = false;

    await requireAuth(req, res, () => {
      nextCalled = true;
    });

    expect(nextCalled).toBe(true);
    expect(req.user).toBeDefined();
    expect(req.user?.role).toBe('lao');
    expect(req.user?.full_name).toBe('Dr. Vikramaditya Rao, IAS');
  });

  test('rejects unsupported or fraudulent evaluation role', async () => {
    const req = createMockRequest({
      'x-eval-role': 'super_hacker_unauthorized',
    });
    const res = createMockResponse();
    let nextCalled = false;

    await requireAuth(req, res, () => {
      nextCalled = true;
    });

    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(401);
    expect(res.body.code).toBe('AUTH_INVALID_ROLE');
  });

  test('requireRole allows users with permitted role', () => {
    const req = createMockRequest();
    req.user = { id: 'u1', role: 'lao', full_name: 'Officer Rao' };
    const res = createMockResponse();
    let nextCalled = false;

    const guard = requireRole(['admin', 'lao', 'project_officer']);
    guard(req, res, () => {
      nextCalled = true;
    });

    expect(nextCalled).toBe(true);
    expect(res.statusCode).toBe(200);
  });

  test('requireRole blocks unauthorized role with 403 Forbidden', () => {
    const req = createMockRequest();
    req.user = { id: 'u2', role: 'viewer', full_name: 'Public Viewer' };
    const res = createMockResponse();
    let nextCalled = false;

    const guard = requireRole(['admin', 'project_officer', 'lao']);
    guard(req, res, () => {
      nextCalled = true;
    });

    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN_ROLE');
    expect(res.body.user_role).toBe('viewer');
  });

  test('admin role bypasses role restrictions safely', () => {
    const req = createMockRequest();
    req.user = { id: 'admin-1', role: 'admin', full_name: 'Super Admin' };
    const res = createMockResponse();
    let nextCalled = false;

    const guard = requireRole(['revenue_inspector']); // restricted to revenue inspector
    guard(req, res, () => {
      nextCalled = true;
    });

    expect(nextCalled).toBe(true);
  });
});
