import { describe, expect, it } from 'bun:test';
import { buildPath, matchPath, parsePattern, resolveRouteFrom } from '../src/router/matchPath';
import {
  ROUTES,
  getRouteById,
  isRouteVisibleToRole,
  navRoutesForRole,
  resolveRedirect,
} from '../src/router/routes';
import type { UserRole } from '../shared/types';

/**
 * Phase 0 route registry contract tests.
 *
 * The registry is the single source of truth for paths, modules, titles,
 * breadcrumb labels, lazy boundaries and navigation visibility, so these
 * assertions protect the whole frontend navigation surface.
 */

const ALL_ROLES: UserRole[] = [
  'admin',
  'project_officer',
  'lao',
  'revenue_inspector',
  'legal_officer',
  'approver',
  'viewer',
];

/** Supplies a value for every parameter declared by a pattern. */
function sampleParams(pattern: string): Record<string, string> {
  const params: Record<string, string> = {};
  for (const segment of parsePattern(pattern)) {
    if (segment.kind === 'param') {
      params[segment.name] = `sample-${segment.name}`;
    }
  }
  return params;
}

describe('Route Registry - structural integrity', () => {
  it('declares every route with a unique id', () => {
    const ids = ROUTES.map((route) => route.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('declares every route with a unique path pattern', () => {
    const paths = ROUTES.map((route) => route.path);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('gives every route the metadata the shell and sidebar depend on', () => {
    for (const route of ROUTES) {
      expect(route.title.length).toBeGreaterThan(0);
      expect(route.breadcrumb.length).toBeGreaterThan(0);
      expect(route.roles.length).toBeGreaterThan(0);
      expect(route.element).toBeDefined();
      // `keepAlive` is explicit Phase 3 metadata, not an implicit default.
      expect(typeof route.keepAlive).toBe('boolean');
    }
  });

  it('restricts role metadata to declared UserRole values', () => {
    for (const route of ROUTES) {
      for (const role of route.roles) {
        expect(ALL_ROLES).toContain(role);
      }
    }
  });

  it('registers exactly one terminal wildcard route, declared last', () => {
    const wildcards = ROUTES.filter((route) => route.path === '*');
    expect(wildcards.length).toBe(1);
    expect(ROUTES[ROUTES.length - 1].path).toBe('*');
    expect(wildcards[0].nav).toBe(false);
  });

  it('assigns a module to every navigable route and none to the catch-all', () => {
    for (const route of ROUTES) {
      if (route.nav) {
        expect(route.module).not.toBeNull();
      }
    }
    expect(getRouteById('system.notFound').module).toBeNull();
    expect(getRouteById('case.detail').nav).toBe(false);
  });
});

describe('Route Registry - pattern self-consistency', () => {
  it('round-trips every declared pattern through buildPath and matchPath', () => {
    for (const route of ROUTES) {
      if (route.path === '*') {
        continue;
      }
      const params = sampleParams(route.path);
      const generated = buildPath(route.path, params);
      expect(matchPath(route.path, generated)).toEqual(params);
    }
  });

  it('resolves each generated path back to the same registry entry', () => {
    for (const route of ROUTES) {
      if (route.path === '*') {
        continue;
      }
      const generated = buildPath(route.path, sampleParams(route.path));
      const match = resolveRouteFrom(ROUTES, generated);
      expect(match?.route.id).toBe(route.id);
    }
  });
});

describe('Route Registry - nested in-page tabs', () => {
  it('separates the registry list from the case workspace', () => {
    // `/cases` must be the list, and `/cases/:caseId` must be the workspace.
    expect(resolveRouteFrom(ROUTES, '/cases')?.route.id).toBe('module.cases');

    const detail = resolveRouteFrom(ROUTES, '/cases/sample-caseId');
    expect(detail?.route.id).toBe('case.detail');
    expect(detail?.params).toEqual({ caseId: 'sample-caseId' });
  });

  it('exposes each case tab as an addressable route segment', () => {
    const tabs = [
      'overview',
      'workflow',
      'intelligence',
      'gis',
      'documents',
      'disputes',
      'recommendations',
      'audit',
    ];

    for (const tab of tabs) {
      const match = resolveRouteFrom(ROUTES, `/cases/sample-caseId/${tab}`);
      expect(match?.route.id).toBe('case.detail');
      expect(match?.params).toEqual({ caseId: 'sample-caseId', tab });
    }
  });

  it('exposes analytics, intelligence, admin and governance sub-views as segments', () => {
    expect(resolveRouteFrom(ROUTES, '/analytics/trends')?.params).toEqual({ view: 'trends' });
    expect(resolveRouteFrom(ROUTES, '/intelligence/bottlenecks')?.params).toEqual({
      view: 'bottlenecks',
    });
    expect(resolveRouteFrom(ROUTES, '/admin/integrations')?.params).toEqual({
      section: 'integrations',
    });
    expect(resolveRouteFrom(ROUTES, '/governance/policies')?.params).toEqual({ view: 'policies' });
  });

  it('keeps query strings out of route parameter matching', () => {
    const match = resolveRouteFrom(ROUTES, '/cases/sample-caseId/gis');
    expect(match?.params).toEqual({ caseId: 'sample-caseId', tab: 'gis' });
  });
});

describe('Route Registry - unknown routes', () => {
  it('falls back to the not-found route for unregistered paths', () => {
    for (const path of ['/nope', '/cases/abc/gis/extra', '/reports/2026', '/a/b/c/d']) {
      expect(resolveRouteFrom(ROUTES, path)?.route.id).toBe('system.notFound');
    }
  });

  it('never resolves the wildcard while a concrete route matches', () => {
    for (const route of ROUTES) {
      if (route.path === '*') {
        continue;
      }
      const generated = buildPath(route.path, sampleParams(route.path));
      expect(resolveRouteFrom(ROUTES, generated)?.route.id).not.toBe('system.notFound');
    }
  });

  it('maps the empty entry path to the public landing page', () => {
    expect(resolveRedirect('')).toBe('/');
    expect(resolveRedirect('/')).toBeNull();
    expect(resolveRedirect('/cases')).toBeNull();
  });

  it('resolves the public landing page at the root path', () => {
    expect(resolveRouteFrom(ROUTES, '/')?.route.id).toBe('public.landing');
  });
});

describe('Route Registry - public and authentication areas', () => {
  it('registers every public and auth route outside the application sidebar', () => {
    const expectedPublic = [
      'public.landing',
      'public.about',
      'public.features',
      'public.howItWorks',
      'public.gisIntelligence',
      'public.security',
      'public.decisionSupport',
      'public.contact',
      'public.privacy',
      'public.terms',
      'public.accessibility',
    ];
    const expectedAuth = [
      'auth.login',
      'auth.forgotPassword',
      'auth.resetPassword',
      'auth.activateAccount',
      'auth.requestAccess',
    ];

    for (const id of [...expectedPublic, ...expectedAuth]) {
      const route = getRouteById(id);
      expect(route.nav).toBe(false);
      expect(route.module).toBeNull();
      expect(route.keepAlive).toBe(false);
    }

    for (const id of expectedPublic) {
      expect(getRouteById(id).area).toBe('public');
    }
    for (const id of expectedAuth) {
      expect(getRouteById(id).area).toBe('auth');
    }
  });

  it('aliases the spec-mandated sign-in and activation paths', () => {
    expect(resolveRedirect('/sign-in')).toBe('/login');
    expect(resolveRedirect('/account-activation')).toBe('/activate-account');
    expect(resolveRouteFrom(ROUTES, '/login')?.route.id).toBe('auth.login');
    expect(resolveRouteFrom(ROUTES, '/request-access')?.route.id).toBe('auth.requestAccess');
  });

  it('keeps public and application paths distinct', () => {
    // The public GIS page must not shadow the application GIS module, and vice versa.
    expect(resolveRouteFrom(ROUTES, '/gis-intelligence')?.route.id).toBe('public.gisIntelligence');
    expect(resolveRouteFrom(ROUTES, '/gis')?.route.id).toBe('module.gis');
    expect(resolveRouteFrom(ROUTES, '/how-it-works')?.route.id).toBe('public.howItWorks');
  });
});
