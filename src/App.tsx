import React, { useCallback, useEffect, useMemo, useState, Suspense } from 'react';
import { Header } from './components/layout/Header';
import { Sidebar } from './components/layout/Sidebar';
import { CreateCaseModal } from './components/cases/CreateCaseModal';
import { fetchProjects, fetchWorkflows, fetchHealth, fetchCases, HealthResponse } from './lib/api';
import { Project, Workflow } from '../shared/types';
import { AlertTriangle } from 'lucide-react';
import { buildPath, getRouteById, navigate, usePendingRedirect, useRoute } from './router';

/**
 * Application shell.
 *
 * Phase 0 contract: routing is now the single driver of "which surface is
 * visible". The previous `useState<ActiveTab>` + conditional-render chain has
 * been replaced by registry lookup, but every page component keeps its
 * original prop signature and the DOM structure is unchanged.
 *
 * ---------------------------------------------------------------------------
 * PHASE 3 INTEGRATION POINT (documented, NOT implemented)
 * ---------------------------------------------------------------------------
 * The workspace tab strip and keep-alive host will be introduced here, between
 * `<Header />` and the `<main>` element:
 *
 *   <Header ... />
 *   <WorkspaceTabStrip />          <-- Phase 1/3: one tab per open route
 *   <div className="flex-1 flex ...">
 *     <Sidebar ... />
 *     <KeepAliveHost>              <-- Phase 3: LRU-capped mounted views,
 *       {matchedPage}                  hidden with `visibility: hidden`
 *     </KeepAliveHost>                 (NEVER `display: none`, which yields a
 *   </div>                             0x0 Leaflet container + blank tiles)
 *
 * Realtime case channels will likewise be owned by a provider at this level,
 * keyed on the set of currently open case routes, so that N views of one case
 * share a single reference-counted `case:<id>` Supabase channel
 * (see src/lib/realtime.ts).
 * ---------------------------------------------------------------------------
 */
export const App: React.FC = () => {
  const { route, params, pathname } = useRoute();

  // Canonical entry redirects (`/` -> `/dashboard`).
  const pendingRedirect = usePendingRedirect();
  useEffect(() => {
    if (pendingRedirect) {
      navigate(pendingRedirect, { replace: true });
    }
  }, [pendingRedirect]);

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

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
    loadInitialData();
  }, [loadInitialData]);

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
        return <Element onSelectCase={openCase} onOpenCreateCase={openCreateCaseModal} />;

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
  ]);

  return (
    <div className="min-h-screen flex flex-col bg-gov-canvas text-gov-slate">
      {/* Top Header */}
      <Header
        onOpenCreateCase={openCreateCaseModal}
        onSearch={(term) => {
          // Global search now reaches the registry's own `q` filter instead of
          // merely switching surfaces (see Header + CasesListPage).
          const casesPath = getRouteById('module.cases').path;
          navigate(term ? `${casesPath}?q=${encodeURIComponent(term)}` : casesPath);
        }}
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
                Edit BhoomiSetu/.env with your Supabase keys
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Main Workspace Layout */}
      <div className="flex-1 flex max-w-7xl w-full mx-auto">
        {/* Left Navigation Sidebar */}
        <Sidebar activeModule={route?.module ?? null} caseCount={caseCount} />

        {/* Content Viewport */}
        <main className="flex-1 p-6 overflow-y-auto">
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
