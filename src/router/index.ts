// Barrel for the Phase 0 routing foundation.
// Keeping imports shallow here means the rest of `src/` never reaches into
// router internals, which makes the Phase 1 workspace layer a drop-in.

export { Link, type LinkProps } from './Link';
export {
  navigate,
  useLocation,
  useRoute,
  useQueryParams,
  usePendingRedirect,
  buildPath,
  buildQuery,
  parseQuery,
  ROUTES,
  type AppLocation,
  type NavigateOptions,
  type QueryInput,
  type RouteParams,
  type RouteDef,
  type UseRouteResult,
  type UseQueryParamsResult,
} from './router';
export {
  getRouteById,
  isRouteVisibleToRole,
  navRoutesForRole,
  navSectionsForRole,
  publicNavRoutes,
  routeArea,
  ROUTE_BY_ID,
  ROUTE_REDIRECTS,
  resolveRedirect,
  type BadgeSource,
  type IconKey,
  type LazyPage,
  type ModuleId,
  type NavSection,
  type NavSectionDef,
  type RouteArea,
} from './routes';
export {
  comparePatternScore,
  matchPath,
  parsePattern,
  patternScore,
  resolveRouteFrom,
  splitPathname,
  type PatternScore,
  type QueryValue,
  type RouteMatch,
  type RouteParamsInput,
} from './matchPath';
export {
  EMPTY_WORKSPACE_STATE,
  workspaceIdentity,
  workspaceItemFromRoute,
  workspaceReducer,
  type WorkspaceAction,
  type WorkspaceItem,
  type WorkspaceState,
} from '../workspace/workspace';
