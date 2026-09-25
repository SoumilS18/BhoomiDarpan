import { Request, Response, NextFunction } from 'express';
import { getSupabase, isSupabaseConfigured } from '../config/supabase';
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
 * Parses authentication credentials from Bearer JWT or evaluation persona headers.
 */
export async function authenticateRequest(req: Request): Promise<AuthenticatedUser | null> {
  const authHeader = req.headers.authorization;

  // 1. If Bearer token is provided
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1]?.trim();
    if (process.env.NODE_ENV !== 'production' && token.startsWith('valid-test-token-')) {
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
    } else {
      // Mock/test JWT verification in offline test harness
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
  }

  // 2. Evaluation / Institutional Role Switcher header support (Development & test environments only)
  const isDevOrTest = process.env.NODE_ENV !== 'production';
  const evalRole = (req.headers['x-eval-role'] || req.headers['x-test-user-role']) as string;
  if (isDevOrTest && evalRole && VALID_ROLES.includes(evalRole as UserRole)) {
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

  // If evaluation headers are supplied
  if (evalRole) {
    const user = await authenticateRequest(req);
    if (!user) {
      return res.status(401).json({
        error: `Invalid evaluation role specified: "${evalRole}"`,
        code: 'AUTH_INVALID_ROLE',
      });
    }
    req.user = user;
    return next();
  }

  // No credentials supplied
  return res.status(401).json({
    error: 'Authentication required. Please provide a valid Authorization Bearer token or select an evaluation role.',
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
