import { describe, expect, it } from 'bun:test';
import {
  buildPath,
  buildQuery,
  comparePatternScore,
  matchPath,
  parsePattern,
  parseQuery,
  patternScore,
  resolveRouteFrom,
  splitPathname,
} from '../src/router/matchPath';

/**
 * Phase 0 routing foundation: pure path matching / generation.
 *
 * These tests are DOM-free on purpose - the router core has no React or
 * history dependency, so it can be verified directly here.
 */

describe('Route Matching - path parsing', () => {
  it('splits a pattern into literal, param, optional and wildcard segments', () => {
    expect(parsePattern('/dashboard')).toEqual([{ kind: 'static', value: 'dashboard' }]);

    expect(parsePattern('/cases/:caseId/:tab?')).toEqual([
      { kind: 'static', value: 'cases' },
      { kind: 'param', name: 'caseId', optional: false },
      { kind: 'param', name: 'tab', optional: true },
    ]);

    expect(parsePattern('*')).toEqual([{ kind: 'wildcard' }]);
    expect(parsePattern('/')).toEqual([]);
  });

  it('ignores trailing slashes, query strings and hash fragments in a pathname', () => {
    expect(splitPathname('/cases/')).toEqual(['cases']);
    expect(splitPathname('/cases?q=x')).toEqual(['cases']);
    expect(splitPathname('/cases#section')).toEqual(['cases']);
    expect(splitPathname('/cases/abc/gis')).toEqual(['cases', 'abc', 'gis']);
    expect(splitPathname('/')).toEqual([]);
  });
});

describe('Route Matching - matchPath', () => {
  it('matches literal paths exactly', () => {
    expect(matchPath('/dashboard', '/dashboard')).toEqual({});
    expect(matchPath('/dashboard', '/dashboards')).toBeNull();
    expect(matchPath('/dashboard', '/dashboard/extra')).toBeNull();
    expect(matchPath('/dashboard', '/gis')).toBeNull();
  });

  it('extracts required and optional params', () => {
    expect(matchPath('/cases/:caseId/:tab?', '/cases/abc')).toEqual({ caseId: 'abc' });
    expect(matchPath('/cases/:caseId/:tab?', '/cases/abc/gis')).toEqual({
      caseId: 'abc',
      tab: 'gis',
    });
    expect(matchPath('/analytics/:view?', '/analytics')).toEqual({});
    expect(matchPath('/analytics/:view?', '/analytics/trends')).toEqual({ view: 'trends' });
  });

  it('requires a value for non-optional params', () => {
    expect(matchPath('/cases/:caseId/:tab?', '/cases')).toBeNull();
    expect(matchPath('/cases/:caseId', '/cases')).toBeNull();
  });

  it('rejects paths with surplus segments', () => {
    expect(matchPath('/cases/:caseId/:tab?', '/cases/a/b/c')).toBeNull();
    expect(matchPath('/intelligence/:view?', '/intelligence/a/b')).toBeNull();
  });

  it('treats a wildcard as matching any remainder, including nothing', () => {
    expect(matchPath('*', '/')).toEqual({});
    expect(matchPath('*', '/anything/at/all')).toEqual({});
  });

  it('decodes percent-encoded segments and survives malformed encoding', () => {
    expect(matchPath('/cases/:caseId', '/cases/a%20b')).toEqual({ caseId: 'a b' });
    expect(matchPath('/cases/:caseId', '/cases/a%2Fb')).toEqual({ caseId: 'a/b' });

    // A malformed escape must degrade to the raw value instead of throwing,
    // because a bad URL must never crash a government workspace.
    expect(() => matchPath('/cases/:caseId', '/cases/%zz')).not.toThrow();
    expect(matchPath('/cases/:caseId', '/cases/%zz')).toEqual({ caseId: '%zz' });
  });

  it('round-trips non-ASCII identifiers', () => {
    const hindi = 'अधिसूचना';
    const generated = buildPath('/cases/:caseId', { caseId: hindi });
    expect(matchPath('/cases/:caseId', generated)).toEqual({ caseId: hindi });
  });
});

describe('Route Matching - specificity ranking', () => {
  it('scores static segments above parameters and ranks wildcards last', () => {
    expect(patternScore('/cases/new').staticCount).toBe(2);
    expect(patternScore('/cases/:caseId').staticCount).toBe(1);
    expect(patternScore('*').isWildcard).toBe(true);

    expect(
      comparePatternScore(patternScore('/cases/new'), patternScore('/cases/:caseId'))
    ).toBeGreaterThan(0);

    expect(comparePatternScore(patternScore('*'), patternScore('/cases'))).toBeLessThan(0);
  });

  it('selects a static route over a parameterised one regardless of declaration order', () => {
    const routes = [{ path: '/cases/:caseId/:tab?' }, { path: '/cases/new' }];
    const match = resolveRouteFrom(routes, '/cases/new');
    expect(match?.route.path).toBe('/cases/new');
    expect(match?.params).toEqual({});
  });

  it('returns null when nothing matches at all', () => {
    expect(resolveRouteFrom([{ path: '/dashboard' }], '/nope')).toBeNull();
  });
});

describe('Route Generation - buildPath', () => {
  it('generates literal and parameterised paths', () => {
    expect(buildPath('/dashboard')).toBe('/dashboard');
    expect(buildPath('/cases/:caseId', { caseId: 'abc' })).toBe('/cases/abc');
    expect(buildPath('/cases/:caseId/:tab?', { caseId: 'abc', tab: 'gis' })).toBe('/cases/abc/gis');
  });

  it('omits optional segments that were not supplied', () => {
    expect(buildPath('/cases/:caseId/:tab?', { caseId: 'abc' })).toBe('/cases/abc');
    expect(buildPath('/cases/:caseId/:tab?', { caseId: 'abc', tab: undefined })).toBe('/cases/abc');
    expect(buildPath('/analytics/:view?')).toBe('/analytics');
  });

  it('throws for a missing required param rather than emitting a broken URL', () => {
    expect(() => buildPath('/cases/:caseId', {})).toThrow();
    expect(() => buildPath('/cases/:caseId/:tab?', { tab: 'gis' })).toThrow();
  });

  it('percent-encodes parameter values', () => {
    expect(buildPath('/cases/:caseId', { caseId: 'a b' })).toBe('/cases/a%20b');
    expect(buildPath('/cases/:caseId', { caseId: 'a/b' })).toBe('/cases/a%2Fb');
    expect(buildPath('/cases/:caseId', { caseId: 'x&y=z' })).toBe('/cases/x%26y%3Dz');
  });

  it('appends a query string when provided', () => {
    expect(buildPath('/cases', {}, { q: 'sonipat' })).toBe('/cases?q=sonipat');
    expect(
      buildPath('/cases/:caseId/:tab?', { caseId: 'a', tab: 'gis' }, { layer: 'bhuvan' })
    ).toBe('/cases/a/gis?layer=bhuvan');
  });
});

describe('Route Generation - query parameters', () => {
  it('serialises with sorted keys for stable, copy-pasteable URLs', () => {
    expect(buildQuery({ b: '2', a: '1' })).toBe('?a=1&b=2');
    expect(buildQuery({})).toBe('');
  });

  it('omits empty, null and undefined values but keeps 0 and false', () => {
    expect(buildQuery({ q: '', x: undefined, n: null })).toBe('');
    expect(buildQuery({ y: 0, z: false })).toBe('?y=0&z=false');
  });

  it('parses query strings with or without a leading question mark', () => {
    expect(parseQuery('?q=sonipat&state=Haryana')).toEqual({ q: 'sonipat', state: 'Haryana' });
    expect(parseQuery('q=sonipat')).toEqual({ q: 'sonipat' });
    expect(parseQuery('')).toEqual({});
    expect(parseQuery(undefined)).toEqual({});
  });

  it('decodes values and resolves duplicate keys last-wins', () => {
    expect(parseQuery('?q=a%20b')).toEqual({ q: 'a b' });
    expect(parseQuery('?a=1&a=2')).toEqual({ a: '2' });
  });

  it('round-trips generated query strings', () => {
    const query = { q: 'NH-44 bypass', sort: 'delay', delay: '1' };
    expect(parseQuery(buildQuery(query))).toEqual(query);
  });
});
