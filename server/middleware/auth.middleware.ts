import { Request, Response, NextFunction } from 'express';
import { getSupabase, isSupabaseConfigured } from '../config/supabase';
import { isTestEnvironment } from '../config/runtimeEnv';
import { UserRole } from '../../shared/types';

export interface AuthenticatedUser {
  id: string;
  email?: string;
  role: UserRole;
  full_name: string;
  department?: string;
  is_eval_persona?: boolean;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

const VALID_ROLES: UserRole[] = [
  'admin',
  'lao',
  'project_officer',
  'revenue_inspector',
  'legal_officer',
  'approver',
  'viewer',
];

/**
 * Parses authentication credentials from a Bearer JWT.
 *
 * Identity and role come ONLY from a token that Supabase verifies plus the
 * profile row stored for that account. There is deliberately no header a
 * caller can send to choose its own role: the previous `X-Eval-Role` persona
 * path was reachable from any non-production process, so a plain
 * `X-Eval-Role: admin` request reached the admin audit ledger unauthenticated.
 */
export async function authenticateRequest(req: Request): Promise<AuthenticatedUser | null> {
  const authHeader = req.headers.authorization;

  // 1. If Bearer token is provided
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1]?.trim();
    // Fixture tokens exist so the in-process test harness can exercise role
    // guards without a live IdP. They are accepted only while the process IS
    // that harness — never by a dev or production server.
    if (isTestEnvironment() && token?.startsWith('valid-test-token-')) {
      if (token === 'valid-test-token-admin') {
        return { id: 'test-admin-id', role: 'admin', full_name: 'Test Administrator' };
      }
      if (token === 'valid-test-token-lao') {
        return { id: 'test-lao-id', role: 'lao', full_name: 'Test LAO' };
      }
      if (token === 'valid-test-token-viewer') {
        return { id: 'test-viewer-id', role: 'viewer', full_name: 'Test Viewer' };
      }
      return null;
    }

    if (isSupabaseConfigured) {
      try {
        const supabase = getSupabase();
        const { data, error } = await supabase.auth.getUser(token);

        if (error || !data.user) {
          return null; // Invalid or expired token
        }

        const authUser = data.user;

        // Fetch user profile from database
        const { data: profile } = await supabase
          .from('user_profiles')
          .select('*')
          .eq('id', authUser.id)
          .single();

        return {
          id: authUser.id,
          email: authUser.email,
          role: (profile?.role as UserRole) || 'viewer',
          full_name: profile?.full_name || authUser.email?.split('@')[0] || 'Authenticated Officer',
          department: profile?.department,
          is_eval_persona: false,
        };
      } catch (err) {
        console.warn('[AuthMiddleware] Supabase auth check error:', err);
        return null;
      }
    } else if (isTestEnvironment()) {
      // Offline test harness (no Supabase configured): fixture tokens only.
      if (token === 'valid-test-token-admin') {
        return { id: 'test-admin-id', role: 'admin', full_name: 'Test Administrator' };
      }
      if (token === 'valid-test-token-lao') {
        return { id: 'test-lao-id', role: 'lao', full_name: 'Test LAO' };
      }
      if (token === 'valid-test-token-viewer') {
        return { id: 'test-viewer-id', role: 'viewer', full_name: 'Test Viewer' };
      }
      return null;
    }

    return null;
  }

  // 2. Test-harness personas. These used to be accepted by ANY process whose
  //    NODE_ENV was not 'production' — which meant the ordinary dev server
  //    granted `X-Eval-Role: admin` (and a fixture bearer token) to anyone who
  //    asked. They now exist only while the automated harness is running, so a
  //    real server has exactly one authentication path: a verified token.
  if (isTestEnvironment()) {
    const evalRole = (req.headers['x-eval-role'] || req.headers['x-test-user-role']) as string;
    if (evalRole && VALID_ROLES.includes(evalRole as UserRole)) {
      const rawUserId = req.headers['x-eval-user-id'] || req.headers['x-test-user-id'];
      const evalUserId = (Array.isArray(rawUserId) ? rawUserId[0] : rawUserId) || `eval-${evalRole}-id`;

      const rawUserName = req.headers['x-eval-user-name'] || req.headers['x-test-user-name'];
      const evalUserName = (Array.isArray(rawUserName) ? rawUserName[0] : rawUserName) || `Officer (${evalRole})`;

      const rawDept = req.headers['x-eval-department'];
      const evalDepartment = (Array.isArray(rawDept) ? rawDept[0] : rawDept) || undefined;

      return {
        id: String(evalUserId),
        role: evalRole as UserRole,
        full_name: String(evalUserName),
        department: evalDepartment ? String(evalDepartment) : undefined,
        is_eval_persona: true,
      };
    }
  }

  // 3. No credential was supplied. Client-chosen roles are never accepted
  //    outside the harness: a header such as `X-Eval-Role: admin` is ignored
  //    outright, so the only way to obtain a role is a verified session plus
  //    the profile stored for that account.
  return null;
}

/**
 * Middleware: Strictly requires authenticated identity (401 if missing or invalid).
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const evalRole = req.headers['x-eval-role'];

  // If a Bearer token was provided but failed verification
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const user = await authenticateRequest(req);
    if (!user) {
      return res.status(401).json({
        error: 'Invalid or expired authentication token. Please re-authenticate.',
        code: 'AUTH_INVALID_TOKEN',
      });
    }
    req.user = user;
    return next();
  }

  // Test-harness personas only — never a running server.
  if (evalRole && isTestEnvironment()) {
    const user = await authenticateRequest(req);
    if (!user) {
      return res.status(401).json({
        error: `Invalid test role specified: "${evalRole}"`,
        code: 'AUTH_INVALID_ROLE',
      });
    }
    req.user = user;
    return next();
  }

  // No credentials supplied (or a role header was presented without one)
  return res.status(401).json({
    error: 'Authentication required. Please provide a valid Authorization Bearer token.',
    code: 'AUTH_REQUIRED',
  });
}

/**
 * Middleware: Optional authentication (attaches req.user if present, but doesn't block).
 */
export async function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const user = await authenticateRequest(req);
  if (user) {
    req.user = user;
  }
  next();
}

/**
 * Middleware: Role-Based Authorization Guard (403 if user lacks required role).
 */
export function requireRole(allowedRoles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Authentication required before checking authorization.',
        code: 'AUTH_REQUIRED',
      });
    }

    // Admins always have full authorization
    if (req.user.role === 'admin' || allowedRoles.includes(req.user.role)) {
      return next();
    }

    return res.status(403).json({
      error: `Access Denied: Role "${req.user.role}" does not have permission for this operational action. Required: ${allowedRoles.join(', ')}.`,
      code: 'FORBIDDEN_ROLE',
      user_role: req.user.role,
      required_roles: allowedRoles,
    });
  };
}
