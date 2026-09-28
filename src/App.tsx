import React, { useCallback, useEffect, useMemo, useReducer, useState, Suspense } from 'react';
import { Header } from './components/layout/Header';
import { Sidebar } from './components/layout/Sidebar';
import { WorkspaceBar } from './components/layout/WorkspaceBar';
import { CreateCaseModal } from './components/cases/CreateCaseModal';
import { fetchProjects, fetchWorkflows, fetchHealth, fetchCases, HealthResponse } from './lib/api';
import { Project, Workflow } from '../shared/types';
import { AlertTriangle } from 'lucide-react';
import {
  buildPath,
  EMPTY_WORKSPACE_STATE,
  getRouteById,
  navigate,
  routeArea,
  usePendingRedirect,
  useRoute,
  workspaceItemFromRoute,
  workspaceReducer,
} from './router';
import { useAuth } from './context/AuthContext';
import { evaluateAppAccessFor } from './lib/appAccess';
import type { WorkspaceItem } from './workspace/workspace';

/**
 * Application shell.
 *
 * Phase 0 contract: routing is now the single driver of "which surface is
 * visible". The previous `useState<ActiveTab>` + conditional-render chain has
 * been replaced by registry lookup, but every page component keeps its
 * original prop signature and the DOM structure is unchanged.
 *
 */
export const App: React.FC = () => {
  const { route, params, pathname, search } = useRoute();
  const { session, sessionStatus, isRealAuthConfigured } = useAuth();

  // Which of the three experience areas (public / auth / app) the current URL
  // belongs to. The registry is the only place that knows this.
  const area = route ? routeArea(route) : 'app';

  // Canonical entry redirects (`/` -> public landing, per ROUTE_REDIRECTS).
  const pendingRedirect = usePendingRedirect();
  useEffect(() => {
    if (pendingRedirect) {
      navigate(pendingRedirect, { replace: true });
    }
  }, [pendingRedirect]);

  // -------------------------------------------------------------------------
  // Application-area access boundary.
  //
  // Mirrors the rule the Express API already enforces (evaluation role context
  // is refused in production builds) — see src/lib/appAccess.ts for the full
  // rationale. Authorisation itself stays server-side on every request.
  // -------------------------------------------------------------------------
  const appAccess = evaluateAppAccessFor(session, sessionStatus, isRealAuthConfigured);

  useEffect(() => {
    if (area !== 'app' || appAccess !== 'deny' || pendingRedirect) {
      return;
    }
    // Preserve the deep link so a successful sign-in returns here.
    const next = `${pathname}${search}`;
    navigate(
      `${getRouteById('auth.login').path}?next=${encodeURIComponent(next)}`,
      { replace: true }
    );
  }, [area, appAccess, pendingRedirect, pathname, search]);

  const [workspace, dispatchWorkspace] = useReducer(
    workspaceReducer,
    EMPTY_WORKSPACE_STATE
  );

  const currentWorkspaceItem = useMemo(() => {
    if (!route || pendingRedirect) {
      return null;
    }
    return workspaceItemFromRoute(route, params, pathname, search);
  }, [route, params, pathname, search, pendingRedirect]);

  useEffect(() => {
    if (currentWorkspaceItem) {
      dispatchWorkspace({ type: 'OPEN_WORKSPACE', item: currentWorkspaceItem });
    }
  }, [currentWorkspaceItem]);

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  // The sidebar collapses into an overlay drawer below the `lg` breakpoint.
  // Its open state lives in the shell so both the header toggle and the route
  // change can drive it.
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);

  useEffect(() => {
    setIsMobileNavOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!isMobileNavOpen) {
      return undefined;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsMobileNavOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isMobileNavOpen]);

  // Pre-loaded projects & workflows for the Create Case modal (unchanged).
  const [projects, setProjects] = useState<Project[]>([]);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [caseCount, setCaseCount] = useState<number>(0);
  const [health, setHealth] = useState<HealthResponse | null>(null);

  const loadInitialData = useCallback(() => {
    fetchHealth().then(setHealth).catch(console.warn);
    fetchProjects().then((r) => setProjects(r.projects || [])).catch(console.warn);
    fetchWorkflows().then((r) => setWorkflows(r.workflows || [])).catch(console.warn);
    fetchCases().then((r) => setCaseCount((r.cases || []).length)).catch(console.warn);
  }, []);

  useEffect(() => {
    // Only the authenticated application needs the workspace bootstrap. The
    // public website and the account pages must not fire operational API calls
    // on first paint.
    if (area === 'app' && appAccess === 'allow') {
      loadInitialData();
    }
  }, [area, appAccess, loadInitialData]);

  const handleCaseCreated = useCallback(() => {
    loadInitialData();
    navigate(getRouteById('module.cases').path);
  }, [loadInitialData]);

  // -------------------------------------------------------------------------
  // Navigation adapters
  //
  // These translate the page components' pre-existing callback props into URL
  // navigation, so that no page component needed rewriting for Phase 0.
  // -------------------------------------------------------------------------

  const caseDetailPath = getRouteById('case.detail').path;

  const openCase = useCallback(
    (caseId: string, tab?: string) => {
      navigate(buildPath(caseDetailPath, { caseId, tab }));
    },
    [caseDetailPath]
  );

  const handleCaseTabChange = useCallback(
    (tab: string) => {
      // In-page tabs are addressable routes, so they push a history entry
      // (Back returns to the previously viewed tab). Filters, by contrast, use
      // `replace` - see useQueryParams.
      navigate(buildPath(caseDetailPath, { caseId: params.caseId, tab }));
    },
    [caseDetailPath, params.caseId]
  );

  const openCreateCaseModal = useCallback(() => setIsCreateModalOpen(true), []);

  const goToCasesRegistry = useCallback(() => {
    navigate(getRouteById('module.cases').path);
  }, []);

  const goToProject = useCallback((projectId: string, view?: string) => {
    navigate(buildPath(getRouteById('project.detail').path, { projectId, view }));
  }, []);

  const goToWorkspaceItem = useCallback((item: WorkspaceItem) => {
    dispatchWorkspace({ type: 'ACTIVATE_WORKSPACE', id: item.id });
    navigate(`${item.pathname}${item.search}`);
  }, []);

  const closeWorkspaceItem = useCallback(
    (item: WorkspaceItem) => {
      if (!item.closable) {
        return;
      }

      const remaining = workspace.items.filter((candidate) => candidate.id !== item.id);
      if (item.id !== workspace.activeId) {
        dispatchWorkspace({ type: 'CLOSE_WORKSPACE', id: item.id });
        return;
      }

      const next = remaining[Math.min(workspace.items.indexOf(item), remaining.length - 1)];
      if (next) {
        dispatchWorkspace({ type: 'CLOSE_WORKSPACE', id: item.id });
        navigate(`${next.pathname}${next.search}`);
        return;
      }

      const dashboard = getRouteById('module.dashboard');
      const fallback = workspaceItemFromRoute(dashboard, {}, dashboard.path, '');
      dispatchWorkspace({ type: 'CLOSE_ALL_WORKSPACES', fallback });
      navigate(dashboard.path, { replace: true });
    },
    [workspace]
  );

  // -------------------------------------------------------------------------
  // Route -> page props
  //
  // The registry owns paths, titles, roles and lazy boundaries. Supplying page
  // props is a shell concern, which keeps the `shared/types` contracts and the
  // page components themselves untouched.
  // -------------------------------------------------------------------------

  const matchedPage = useMemo(() => {
    if (!route) {
      return null;
    }

    const Element = route.element;

    switch (route.id) {
      case 'module.dashboard':
        return (
          <Element
            onSelectCase={openCase}
            onOpenCreateCase={openCreateCaseModal}
            onNavigateToCases={goToCasesRegistry}
          />
        );

      case 'module.cases':
        return <Element onSelectCase={openCase} onOpenCreateCase={openCreateCaseModal} />;

      case 'case.detail': {
        // `:caseId` is a required segment, so this can only be empty for a
        // malformed URL. Bail out rather than render a broken workspace.
        const caseId = params.caseId;
        if (!caseId) {
          return null;
        }
        return (
          <Element
            caseId={caseId}
            initialTab={params.tab}
            onTabChange={handleCaseTabChange}
            onBack={goToCasesRegistry}
          />
        );
      }

      case 'module.projects':
        return (
          <Element
            onSelectCase={openCase}
            onOpenCreateCase={openCreateCaseModal}
            onSelectProject={goToProject}
          />
        );

      case 'project.detail':
        return (
          <Element
            projectId={params.projectId}
            initialView={params.view}
            onSelectCase={openCase}
            onOpenCreateCase={openCreateCaseModal}
            onSelectProject={goToProject}
            onBack={() => navigate(getRouteById('module.projects').path)}
          />
        );

      case 'module.gis':
        return <Element onSelectCase={openCase} />;

      case 'module.intelligence':
        return (
          <Element
            onSelectCase={openCase}
            view={params.view}
            onViewChange={(view: string) =>
              navigate(buildPath(getRouteById('module.intelligence').path, { view }))
            }
          />
        );

      case 'module.analytics':
        return (
          <Element
            onSelectCase={openCase}
            view={params.view}
            onViewChange={(view: string) =>
              navigate(buildPath(getRouteById('module.analytics').path, { view }))
            }
          />
        );

      case 'module.notifications':
        return <Element onSelectCase={openCase} />;

      case 'module.governance':
        return (
          <Element
            onSelectCase={openCase}
            view={params.view}
            onViewChange={(view: string) =>
              navigate(buildPath(getRouteById('module.governance').path, { view }))
            }
          />
        );

      case 'module.admin':
        return (
          <Element
            section={params.section}
            onSectionChange={(section: string) =>
              navigate(buildPath(getRouteById('module.admin').path, { section }))
            }
          />
        );

      default:
        return <Element />;
    }
  }, [
    route,
    params.caseId,
    params.tab,
    params.view,
    params.section,
    openCase,
    handleCaseTabChange,
    openCreateCaseModal,
    goToCasesRegistry,
    goToProject,
  ]);

  // -------------------------------------------------------------------------
  // Area routing.
  //
  // Public website and account pages render WITHOUT the application shell —
  // no operational header, no workspace bar, no module sidebar. Each of those
  // pages owns its own layout (PublicPageLayout / AuthShell), so marketing and
  // account content can never be mistaken for the officer dashboard.
  // -------------------------------------------------------------------------
  if (area !== 'app') {
    return (
      <div className="min-h-screen flex flex-col bg-gov-canvas text-gov-slate">
        {pendingRedirect ? (
          <RouteLoadingFallback />
        ) : (
          <Suspense fallback={<RouteLoadingFallback />}>{matchedPage}</Suspense>
        )}
      </div>
    );
  }

  // A persisted session may still be restoring, or a production build without
  // a session is already navigating to sign-in. Render the neutral surface
  // rather than flashing the shell (or an empty dashboard) for one frame.
  if (appAccess !== 'allow') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gov-canvas text-gov-slate">
        <RouteLoadingFallback />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-gov-canvas text-gov-slate">
      {/* Top Header */}
      <Header
        onOpenCreateCase={openCreateCaseModal}
        isNavigationOpen={isMobileNavOpen}
        onToggleNavigation={() => setIsMobileNavOpen((open) => !open)}
        onSearch={(term) => {
          // Global search now reaches the registry's own `q` filter instead of
          // merely switching surfaces (see Header + CasesListPage).
          const casesPath = getRouteById('module.cases').path;
          navigate(term ? `${casesPath}?q=${encodeURIComponent(term)}` : casesPath);
        }}
      />

      <WorkspaceBar
        items={workspace.items}
        activeId={workspace.activeId}
        onActivate={goToWorkspaceItem}
        onClose={closeWorkspaceItem}
      />

      {/* Supabase Pending Banner (if credentials pending) */}
      {health && !health.database.connected && (
        <div className="bg-amber-500/10 border-b border-amber-300/60 px-4 py-2 text-xs text-amber-900">
          <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-700 shrink-0" />
              <span>
                <strong>Remote Supabase Database Connection Pending:</strong> {health.database.message}
              </span>
            </div>
            <div className="flex items-center gap-2 text-[11px]">
              <span className="font-mono bg-amber-100 px-2 py-0.5 rounded">
                Edit BhoomiDarpan/.env with your Supabase keys
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Main Workspace Layout */}
      <div className="flex-1 flex max-w-[1600px] w-full mx-auto">
        {/* Left Navigation Sidebar */}
        <Sidebar
          activeModule={route?.module ?? null}
          caseCount={caseCount}
          mobileOpen={isMobileNavOpen}
          onCloseMobile={() => setIsMobileNavOpen(false)}
        />

        {/* Content Viewport */}
        <main className="flex-1 p-4 sm:p-6 overflow-y-auto min-w-0">
          {pendingRedirect ? (
            <RouteLoadingFallback />
          ) : (
            <Suspense fallback={<RouteLoadingFallback />}>{matchedPage}</Suspense>
          )}
        </main>
      </div>

      {/* Create Case Modal */}
      <CreateCaseModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        projects={projects}
        workflows={workflows}
        onCaseCreated={handleCaseCreated}
      />
    </div>
  );
};

/** Matches the loading treatment already used by the page-level data loads. */
const RouteLoadingFallback: React.FC = () => (
  <div className="flex flex-col items-center justify-center p-20 space-y-3 bg-white rounded-xl border border-slate-200">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gov-navy" />
    <p className="text-xs text-slate-500 font-medium">Resolving workspace surface...</p>
  </div>
);
