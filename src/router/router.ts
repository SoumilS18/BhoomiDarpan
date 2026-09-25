// ============================================================================
// BhoomiSetu - Browser history store & routing hooks
// ----------------------------------------------------------------------------
// A deliberately small store built on the native History API. There is no
// provider component and no context: subscriber notification is handled by
// `useSyncExternalStore`, which is the correct React 18 primitive for an
// external store and avoids tearing / re-render cascades.
//
// Scope confirmed for Phase 0:
//   - pushState / replaceState / popstate
//   - refresh-safe deep links (the URL fully describes the view)
//   - unknown routes resolve to the registry's wildcard entry
// ============================================================================

import { useCallback, useMemo, useSyncExternalStore } from 'react';
import {
  buildQuery,
  buildPath,
  parseQuery,
  resolveRouteFrom,
  type QueryInput,
  type RouteParams,
} from './matchPath';
import { ROUTES, resolveRedirect, type RouteDef } from './routes';

export interface AppLocation {
  pathname: string;
  search: string;
  /** Fully resolved href, handy for `key` props and debugging. */
  href: string;
}

const isBrowser = typeof window !== 'undefined' && typeof window.history !== 'undefined';

function readLocation(): AppLocation {
  if (!isBrowser) {
    return { pathname: '/', search: '', href: '/' };
  }
  const { pathname, search } = window.location;
  return { pathname, search, href: `${pathname}${search}` };
}

let currentLocation: AppLocation = readLocation();
const listeners = new Set<() => void>();

function emit(): void {
  currentLocation = readLocation();
  listeners.forEach((listener) => listener());
}

if (isBrowser) {
  window.addEventListener('popstate', emit);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export interface NavigateOptions {
  /** Replace the current history entry instead of pushing a new one. */
  replace?: boolean;
  /** Arbitrary history state, retrievable via `window.history.state`. */
  state?: Record<string, unknown>;
}

/**
 * Imperative navigation. `to` is a full path (optionally with a query
 * string); use `buildPath` to generate it from registry patterns so that
 * parameter encoding stays consistent.
 */
export function navigate(to: string, options: NavigateOptions = {}): void {
  if (!isBrowser) {
    return;
  }
  if (options.replace) {
    window.history.replaceState(options.state ?? {}, '', to);
  } else {
    window.history.pushState(options.state ?? {}, '', to);
  }
  emit();
}

/** Current location, re-rendering subscribers on push/replace/popstate. */
export function useLocation(): AppLocation {
  const pathname = useSyncExternalStore(
    subscribe,
    () => currentLocation.pathname,
    () => currentLocation.pathname
  );
  const search = useSyncExternalStore(
    subscribe,
    () => currentLocation.search,
    () => currentLocation.search
  );
  return useMemo(() => {
    const href = `${pathname}${search}`;
    return { pathname, search, href };
  }, [pathname, search]);
}

export interface UseRouteResult {
  pathname: string;
  search: string;
  /** Parsed query parameters, e.g. `{ q: 'sonipat' }`. */
  query: Record<string, string>;
  /** The matched registry entry, or `null` before hydration. */
  route: RouteDef | null;
  /** Route params extracted from the pathname, e.g. `{ caseId: 'abc', tab: 'gis' }`. */
  params: RouteParams;
}

/** Resolves the current URL into a registry route + params + query. */
export function useRoute(): UseRouteResult {
  const { pathname, search } = useLocation();
  return useMemo(() => {
    const match = resolveRouteFrom(ROUTES, pathname);
    return {
      pathname,
      search,
      query: parseQuery(search),
      route: match?.route ?? null,
      params: match?.params ?? {},
    };
  }, [pathname, search]);
}

export interface UseQueryParamsResult {
  query: Record<string, string>;
  /**
   * Merges `patch` into the current query string. Empty/undefined values are
   * removed. Defaults to `replace: true` because filter changes are view
   * state, not navigation, and must not flood the back/forward history.
   */
  setQuery: (patch: QueryInput, options?: NavigateOptions) => void;
}

export function useQueryParams(): UseQueryParamsResult {
  /**
   * Reads the LIVE location at call time rather than the render-time snapshot.
   * This matters because a single event handler may issue several updates in a
   * row (e.g. "change state" + "clear district"); merging onto a stale snapshot
   * would silently drop the earlier key.
   */
  const setQuery = useCallback(
    (patch: QueryInput, options: NavigateOptions = { replace: true }) => {
      if (!isBrowser) {
        return;
      }
      const live = parseQuery(window.location.search);
      const next: QueryInput = { ...live, ...patch };
      Object.keys(next).forEach((key) => {
        const value = next[key];
        if (value === undefined || value === null || value === '') {
          delete next[key];
        }
      });
      navigate(`${window.location.pathname}${buildQuery(next)}`, options);
    },
    []
  );

  const { query } = useRoute();
  return { query, setQuery };
}

/**
 * Applies the canonical entry redirects (e.g. `/` -> `/dashboard`).
 * Returns the target path when a redirect is pending, otherwise `null`.
 */
export function usePendingRedirect(): string | null {
  const { pathname } = useLocation();
  return resolveRedirect(pathname);
}

export { buildPath, buildQuery, parseQuery, ROUTES };
export type { QueryInput, RouteParams, RouteDef };
