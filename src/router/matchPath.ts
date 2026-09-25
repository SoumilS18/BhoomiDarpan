// ============================================================================
// BhoomiSetu - Minimal dependency-free route matching & URL helpers
// ----------------------------------------------------------------------------
// This module is deliberately PURE: it touches no DOM, no React and no
// application state, so it can be unit-tested directly under `bun test`
// without jsdom or @testing-library.
// ============================================================================

export type RouteParams = Record<string, string>;

/**
 * Input type for `buildPath`. Omitted (`undefined`/`null`) values are treated
 * as "not provided" so that optional segments can simply be left out.
 */
export type RouteParamsInput = Record<string, string | number | undefined | null>;

export type QueryValue = string | number | boolean | undefined | null;
export type QueryInput = Record<string, QueryValue>;

type Segment =
  | { kind: 'static'; value: string }
  | { kind: 'param'; name: string; optional: boolean }
  | { kind: 'wildcard' };

const PARAM_PREFIX_RE = /^:/;
const OPTIONAL_SUFFIX_RE = /\?$/;

/** Splits a route pattern such as `/cases/:caseId/:tab?` into typed segments. */
export function parsePattern(pattern: string): Segment[] {
  return pattern
    .split('/')
    .filter((part) => part.length > 0)
    .map<Segment>((part) => {
      if (part === '*') {
        return { kind: 'wildcard' };
      }
      if (PARAM_PREFIX_RE.test(part)) {
        return {
          kind: 'param',
          name: part.replace(PARAM_PREFIX_RE, '').replace(OPTIONAL_SUFFIX_RE, ''),
          optional: OPTIONAL_SUFFIX_RE.test(part),
        };
      }
      return { kind: 'static', value: part };
    });
}

/** Splits a pathname into segments, ignoring any query string, hash or trailing slash. */
export function splitPathname(pathname: string): string[] {
  return pathname
    .split('?')[0]
    .split('#')[0]
    .split('/')
    .filter((part) => part.length > 0);
}

/**
 * `decodeURIComponent` throws on malformed percent-encoding (e.g. `%zz`).
 * Navigation must never crash a government workspace because of a bad URL,
 * so we degrade gracefully to the raw segment.
 */
function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * Matches a pathname against a route pattern.
 * Returns the extracted params, or `null` when the pattern does not match.
 *
 * Supported syntax: literal segments, `:param`, optional `:param?`, and a
 * trailing `*` wildcard.
 */
export function matchPath(pattern: string, pathname: string): RouteParams | null {
  const segments = parsePattern(pattern);
  const parts = splitPathname(pathname);
  const params: RouteParams = {};

  let index = 0;
  for (const segment of segments) {
    if (segment.kind === 'wildcard') {
      // Wildcard consumes the remainder - always matches, including nothing.
      return params;
    }

    if (segment.kind === 'static') {
      if (parts[index] !== segment.value) {
        return null;
      }
      index += 1;
      continue;
    }

    const raw = parts[index];
    if (raw === undefined) {
      if (segment.optional) {
        continue;
      }
      return null;
    }
    params[segment.name] = safeDecode(raw);
    index += 1;
  }

  // Leftover path segments mean the pattern was not specific enough.
  return index === parts.length ? params : null;
}

export interface PatternScore {
  staticCount: number;
  segmentCount: number;
  isWildcard: boolean;
}

/** Ranking metadata used to pick the most specific pattern when several match. */
export function patternScore(pattern: string): PatternScore {
  const segments = parsePattern(pattern);
  return {
    staticCount: segments.filter((s) => s.kind === 'static').length,
    segmentCount: segments.length,
    isWildcard: segments.some((s) => s.kind === 'wildcard'),
  };
}

/** Ranks two candidate patterns; positive means `a` is more specific than `b`. */
export function comparePatternScore(a: PatternScore, b: PatternScore): number {
  if (a.isWildcard !== b.isWildcard) {
    return a.isWildcard ? -1 : 1;
  }
  if (a.staticCount !== b.staticCount) {
    return a.staticCount - b.staticCount;
  }
  return a.segmentCount - b.segmentCount;
}

export interface RouteMatch<T> {
  route: T;
  params: RouteParams;
}

/**
 * Resolves a pathname against an ordered route table, returning the MOST
 * SPECIFIC match. A trailing wildcard route therefore only wins when no
 * concrete pattern matches, which is what makes `/cases/new` beat
 * `/cases/:caseId/:tab?` without relying on declaration order.
 */
export function resolveRouteFrom<T extends { path: string }>(
  routes: T[],
  pathname: string
): RouteMatch<T> | null {
  let best: RouteMatch<T> | null = null;
  let bestScore: PatternScore | null = null;

  for (const route of routes) {
    const params = matchPath(route.path, pathname);
    if (params === null) {
      continue;
    }
    const score = patternScore(route.path);
    if (bestScore === null || comparePatternScore(score, bestScore) > 0) {
      best = { route, params };
      bestScore = score;
    }
  }

  return best;
}


/** Builds a query string from a plain object. Keys are sorted for stable, copy-pasteable URLs. */
export function buildQuery(query: QueryInput = {}): string {
  const params = new URLSearchParams();
  Object.keys(query)
    .sort()
    .forEach((key) => {
      const value = query[key];
      if (value === undefined || value === null || value === '') {
        return;
      }
      params.set(key, String(value));
    });
  const serialised = params.toString();
  return serialised ? `?${serialised}` : '';
}

/** Parses a query string into a plain object. Accepts values with or without a leading `?`. */
export function parseQuery(search: string | undefined | null): Record<string, string> {
  const result: Record<string, string> = {};
  if (!search) {
    return result;
  }
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  params.forEach((value, key) => {
    result[key] = value;
  });
  return result;
}

/**
 * Generates a concrete path for a route pattern.
 *
 * Missing optional params are omitted; missing required params throw, because
 * silently emitting a broken URL would be worse than a loud failure.
 */
export function buildPath(
  pattern: string,
  params: RouteParamsInput = {},
  query: QueryInput = {}
): string {
  const segments = parsePattern(pattern);
  const parts: string[] = [];

  for (const segment of segments) {
    if (segment.kind === 'wildcard') {
      continue;
    }
    if (segment.kind === 'static') {
      parts.push(segment.value);
      continue;
    }
    const value = params[segment.name];
    if (value === undefined || value === null || value === '') {
      if (segment.optional) {
        continue;
      }
      throw new Error(`buildPath: missing required param ":${segment.name}" for pattern "${pattern}"`);
    }
    parts.push(encodeURIComponent(value));
  }

  return `/${parts.join('/')}${buildQuery(query)}`;
}
