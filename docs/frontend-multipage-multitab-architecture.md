# BhoomiSetu Frontend: Multi-Page + Multi-Tab Architecture Proposal

> Status: **Proposal for review** (no source files changed yet)
> Scope: `src/` only. Server (`server/`), schema (`supabase/`), and `shared/types` are already
> complete and are treated as fixed contracts.
> Baseline verified on this machine: `bun x tsc --noEmit` → **clean**, Bun `1.3.14`, Node `v24.19.0`,
> npm registry reachable (so adding one router dependency is technically possible).

---

## 1. Audit — what actually exists today

The React app is currently a **single-page, state-switched** application. There is no router
dependency installed (`react-router-dom`, `zustand`, `@tanstack/*` are all absent from
`node_modules`), and no URL ever changes while navigating.

| Area | File | Current state |
| :--- | :--- | :--- |
| App shell | `src/App.tsx` (185 lines) | `useState<ActiveTab>` + one long `{activeTab === 'x' && ...}` chain. `selectedCaseId` is also local state. |
| Navigation | `src/components/layout/Sidebar.tsx` | Hardcoded `allDestinations[]` array + `ROLE_AUTHORIZED_DESTINATIONS` role→tab map. |
| Case workspace | `src/pages/CaseDetailPage.tsx` (745 lines) | 8 canonical tabs (`overview, workflow, intelligence, gis, documents, disputes, recommendations, audit`) driven by local `useState`. |
| Admin console | `src/pages/AdministrationPage.tsx` | 5 sub-tabs (`users, workflows, policies, integrations, audit`); embeds `WorkflowConfigPage` and `IntegrationsPage`. |
| Analytics | `src/pages/AnalyticsPage.tsx` | 4 tabs (`portfolio, trends, geography, outcomes`). |
| Intelligence | `src/pages/IntelligencePage.tsx` | `subTab: 'drilldown' \| 'bottlenecks' \| 'risk_concentration'`. |
| Search | `src/components/layout/Header.tsx` | **Dead end**: typing only flips `activeTab` to `cases`; the term is never passed to `CasesListPage`. |
| Realtime | `src/lib/realtime.ts` | Fully built, reference-counted per `case:<id>` topic — but **used by zero components**. |
| Maps | `src/components/gis/CaseMapView.tsx`, `dashboard/PortfolioMapView.tsx` | Leaflet instances in `useRef`; **no `invalidateSize()` and no `ResizeObserver` anywhere in the repo**. |

### Concrete gaps this proposal closes

1. **No URL contract.** Nothing is deep-linkable, shareable, bookmarkable, or refresh-safe. Reload always dumps the officer back to `dashboard`.
2. **No browser history.** Back/forward do nothing; `CaseDetailPage`'s "Back to Registry" is a hardcoded `setActiveTab('cases')` that loses the officer's filter/sort/scroll context.
3. **No parallel work.** An LAO comparing two cases, or an officer watching a GIS layer while a workflow stage advances, must destroy and rebuild one screen to see another.
4. **`GovernancePage.tsx` is orphaned.** `walkthrough.md:661` claims a `'governance'` tab was added to `Sidebar` + `App.tsx`; in reality the page is imported nowhere, so an entire policy/alert surface is unreachable.
5. **Header search is non-functional** — a high-visibility failure in any live demo.
6. **Realtime is unplugged.** The reference-counted channel registry in `realtime.ts` is exactly the right primitive for a multi-tab UI, and is currently dead code.
7. **Role gating is duplicated** client-side (`ROLE_AUTHORIZED_DESTINATIONS`) and server-side (`requireRole([...])`), with no route-level guard and no 403 surface.
8. **No route-level code splitting.** `dist/assets/` ships a 664 kB `index-*.js` plus eager
   `vendor-leaflet` (146 kB), `vendor-recharts` (527 kB) and `vendor-icons` (43 kB) — **~1.38 MB of JS
   parsed on first paint**, because `vite.config.ts` splits *vendors* but nothing is `React.lazy`,
   so every page is in the critical path even for a viewer who only opens the dashboard.

---

## 2. Target navigation model — three layers

The right mental model for a statutory land-acquisition platform is not "tabs *or* pages".
It is a **three-layer hierarchy**, where each layer has a distinct job:

```
┌─ Layer 1: MODULE RAIL (multi-page, URL-addressable) ───────────────────────┐
│  Sidebar: Dashboard · Cases · Projects · GIS · Intelligence · Analytics ·  │
│           Notifications · Governance · Administration                      │
│  → 9 real routes, role-filtered, lazy-loaded, deep-linkable.               │
└────────────────────────────────────────────────────────────────────────────┘
┌─ Layer 2: WORKSPACE TAB STRIP (multi-tab, URL-synced) ─────────────────────┐
│  [📊 Dashboard] [📄 Case RFCT/2026/114 ▾] [🗺 GIS Survey-44] [📈 Analytics]│
│  → Every tab is a real route path. Officers keep 6–10 investigative         │
│    contexts alive without losing map state, filters, or scroll position.    │
└────────────────────────────────────────────────────────────────────────────┘
┌─ Layer 3: IN-PAGE TABS (already built, now URL-driven) ────────────────────┐
│  Case: Overview · Workflow · Intelligence · GIS · Documents · Disputes ...  │
│  → Converted from `useState` to `:tab` route segments.                      │
└────────────────────────────────────────────────────────────────────────────┘
```

**Why both, and not just one:**
- *Pages only* → an officer loses context constantly (current pain).
- *Tabs only (a SPA with no URLs)* → nothing is shareable, refresh-proof, or auditable; and you
  cannot email an MLA a link to a specific case tab.
- Together: the **URL is the single source of truth**, and the tab strip is a *view* of the URL
  history. That is what makes reload-safety, back/forward, and "open in new tab" all fall out for free.

---

## 3. Route map (the URL contract)

Every row is a real address. Optional segments are `?`, and all filter state lives in the query
string so that a filtered registry view is itself a link.

| Route | Component | Query params | Roles |
| :--- | :--- | :--- | :--- |
| `/` | → redirect `/dashboard` | – | all |
| `/dashboard` | `DashboardPage` | `state, district, project_id, stage_category, window` | all |
| `/cases` | `CasesListPage` | `q, state, district, status, priority, stage, project_id, view=table\|cards, sort, order, page` | all |
| `/cases/new` | `CreateCaseModal` (route-owned) | – | `admin, project_officer, lao` |
| `/cases/:caseId` | → redirect to `/cases/:caseId/overview` | – | all |
| `/cases/:caseId/:tab` | `CaseDetailPage` | `tab=overview\|workflow\|intelligence\|gis\|documents\|disputes\|recommendations\|audit` | all |
| `/projects` | `ProjectsPage` | `q, agency, project_type` | all except `revenue_inspector` |
| `/projects/:projectId` | `ProjectsPage` (selected) | – | all except `revenue_inspector` |
| `/gis` | `GISSpatialIntelligencePage` | `case_id, layer, basemap, state, district, risk, mapping` | all |
| `/intelligence` | → redirect `/intelligence/drilldown` | – | `admin, lao, approver, project_officer` |
| `/intelligence/:view` | `IntelligencePage` | `view=drilldown\|bottlenecks\|risk_concentration` | `admin, lao, approver, project_officer` |
| `/analytics` | → redirect `/analytics/overview` | – | `admin, lao, approver` |
| `/analytics/:view` | `AnalyticsPage` | `view=overview\|delays\|risk\|bottlenecks\|trends\|geography\|outcomes` | `admin, lao, approver` |
| `/notifications` | `NotificationsPage` | `status, severity, event_type` | all |
| `/governance/:view` | `GovernancePage` **(resurrected)** | `view=alerts\|policies` | `admin, approver` |
| `/admin/:section` | `AdministrationPage` | `section=users\|workflows\|policies\|integrations\|audit` | `admin` |
| `/admin/workflows` | `WorkflowConfigPage` (standalone) | – | `admin, project_officer` |
| `/admin/integrations` | `IntegrationsPage` (standalone) | – | `admin` |
| `/search` | **new** `SearchResultsPage` | `q, scope=cases\|projects\|villages` | all |
| `/diagnostics` | **new** `SystemDiagnosticsPage` (`/api/diagnostics`, `/api/health`) | – | `admin` |
| `/403` | **new** `ForbiddenPage` | `from` | all |
| `*` | **new** `NotFoundPage` | – | all |

Two wins are immediate once this exists:
- `/analytics` today exposes 4 of the **7 analytics endpoints that already exist** on the server
  (`/api/portfolio/overview`, `/delays`, `/risk`, `/bottlenecks`, `/trends`, `/geography`, `/outcomes`).
  The `delays` and `bottlenecks` endpoints have **no UI at all** right now, even though
  `PortfolioBottlenecks.tsx` and `PortfolioVisualizations.tsx` are already written.
- `/cases/:caseId/gis` becomes a link an officer can paste into a WhatsApp group.

---

## 4. Multi-tab workspace specification

### 4.1 Tab model

A tab is a *serialisable descriptor*, not a component instance. This is what makes persistence and
URL sync trivial.

```ts
// src/workspace/types.ts  (sketch)
export type TabKind = 'module' | 'case' | 'search';

export interface WorkspaceTab {
  id: string;              // `${kind}:${path}` — deterministic, so re-opening focuses instead of duplicating
  kind: TabKind;
  path: string;            // '/cases/9f2.../gis?layer=bhuvan'  ← full path incl. query
  title: string;           // 'Cases' | 'RFCT/2026/114' | 'Search: "Sonipat"'
  subtitle?: string;       // 'Sonipat, Haryana' | 'NHAI NH-44 Bypass'
  iconKey: IconKey;        // resolved via route registry, not a component ref (serialisable)
  pinned: boolean;         // module tabs default true
  closable: boolean;       // pinned module tabs: false
  scrollY?: number;        // captured on deactivate, restored on activate
  openedAt: number;
  lastActiveAt: number;
}

export interface WorkspaceState {
  tabs: WorkspaceTab[];
  activeTabId: string | null;
  splitTabId: string | null;   // Phase 4 — side-by-side compare
  alive: string[];             // LRU-ordered ids currently mounted (keep-alive)
}
```

### 4.2 Behaviour rules (the contract an officer can rely on)

| # | Rule | Rationale |
| :-- | :--- | :--- |
| 1 | Module routes are **singleton tabs** (`id = module:cases`). Re-navigating focuses the existing tab and updates its query. | Prevents 12 identical "Cases" tabs. |
| 2 | Case routes are **multi-instance** (`id = case:<uuid>`). Opening `RFCT/2026/114` twice focuses the first. | The core multi-tab use case. |
| 3 | `Ctrl/Cmd+click` and **middle-click** on any case row, attention-queue item, or drill-down node opens it in a **new tab** (plain click navigates in-place inside the active tab). | The single most-loved browser affordance; officers expect it. |
| 4 | Any tab may be opened via a **"Open in new tab"** row action and a `↗` icon in the tab context menu. | Discoverability for non-power users. |
| 5 | Active tab ⇄ browser URL are **bidirectional**: activating a tab pushes `history.pushState`; back/forward re-activates the matching tab (or creates it if it was closed). | Back/forward become real. |
| 6 | Closing the active tab activates the **most-recently-used** neighbour, not the next index. | Matches IDE behaviour. |
| 7 | Context menu: *Pin/Unpin · Duplicate · Open in new tab · Copy link · Refresh data · Close · Close others · Close to the right · Close all*. | Full workspace control. |
| 8 | Closing a tab with **unsaved work** (e.g. `StageAdvanceModal` open with a draft, or an un-submitted policy JSON edit) prompts a confirm before close. | Avoids silent data loss — important for statutory actions. |
| 9 | Switching officer role **closes tabs the new role is not authorised for**, with a toast listing what was closed. | Prevents rendering data through a stale authorisation view. Server-side `requireRole` remains the real gate. |
| 10 | Tab set persists in `localStorage` under a **versioned key** `bhoomisetu.workspace.v1`; a schema-version mismatch discards it rather than crashing. | Deterministic reload behaviour. |
| 11 | Two browser windows stay coherent via the `storage` event (last-writer-wins per tab id). | Prevents confusing divergence. |
| 12 | Keyboard shortcuts: `Ctrl+T` (new tab on current module), `Ctrl+W` (close), `Ctrl+Tab` / `Ctrl+Shift+Tab` (cycle), `Ctrl+1…9` (jump), `Alt+←/→` (history), `Ctrl+K` (command palette). | Demo-visible polish. |

### 4.3 Keep-alive — the part that must not be done naively

Filter state, table sort, and especially **Leaflet map instances** must survive tab switching.
A naive `<div style={{display:'none'}}>` breaks Leaflet: a hidden container reports `0×0`, tiles
never render, and the map is blank on return. There is currently **no `invalidateSize()` call and no
`ResizeObserver` anywhere in the repo**, so this failure would be silent and total.

Two mitigations, both required:

1. **Size-preserving hide.** Hidden panes stay mounted at full box size and are removed from flow
   with `position:absolute; inset:0; visibility:hidden; pointer-events:none` (not `display:none`).
   Leaflet keeps valid dimensions and its tile cache.
2. **Reactivation hook.** `useKeepAliveVisibility()` returns a boolean; `CaseMapView` and
   `PortfolioMapView` call `mapInstanceRef.current?.invalidateSize()` when it flips to `true`.
   Adding the `ResizeObserver` that is currently missing also fixes a **latent bug today** —
   collapsing the sidebar (which changes map width) currently does not re-render tiles correctly.

Keep-alive budget: LRU-capped at **8 live views**, evicting the least-recently-used non-active
view. `keepAlive: true` is declared per route in the registry (recommended: `gis`, `analytics`,
`cases`, `intelligence`, `dashboard`; **not** `admin`/`governance`, which are cheap to remount).

### 4.4 Split view (Phase 4, optional but high-demo-value)

`WorkspaceState.splitTabId` renders two panes side by side with a draggable divider.
Primary use case: **compare two cases' workflow timelines** (`TimelineGantt` × 2) or a case next to
its GIS parcel map. This is the strongest single visual argument that the product is
"decision-support", not "a form".

---

## 5. Realtime × multi-tab — plug in the code that already exists

`src/lib/realtime.ts` is complete, correct, and **currently imported by zero components**
(only `tests/day1Integrations.test.ts` references `subscribeToCaseEvents`). Its design is already
ideal for a multi-tab UI:

```
activeChannels: Map<'case:<id>', { channel, subscribers: Set<callback> }>
```

Because the topic key is derived from the case id (not the component), **N open tabs on the same
case share one websocket channel**, and one `CASE_UPDATE` fans out to all of them. Teardown is
reference-counted, so closing the last tab on a case removes the channel cleanly.

**Recommended wiring** — one subscription per *open case id in the workspace*, owned by the shell,
not by `CaseDetailPage`:

```tsx
// src/context/RealtimeProvider.tsx (sketch)
const openCaseIds = useMemo(
  () => unique(workspace.tabs.filter(t => t.kind === 'case').map(t => t.caseId)),
  [workspace.tabs]
);

useEffect(() => {
  const unsubs = openCaseIds.map(caseId =>
    subscribeToCaseEvents(caseId, (evt) => {
      // fan out to a tiny pub/sub; screens subscribe and refetch/patch
      emitCaseEvent(caseId, evt);
    })
  );
  return () => unsubs.forEach(u => u());
}, [openCaseIds.join('|')]);
```

Then `CaseDetailPage` / `DisputesTab` / `DocumentsTab` consume `useCaseEventStream(caseId)` to
show a non-intrusive **"Updated 2s ago · Refresh"** affordance instead of silently swapping data
under an officer who is reading a legal notice. Two guardrails:

- The existing hook signature `useCaseRealtime(caseId, onUpdate)` has `onUpdate` in its dependency
  array — callers **must** wrap callbacks in `useCallback`, or it will resubscribe on every render.
  The provider approach sidesteps this entirely.
- Auto-refetch must be **opt-in per screen** and must not clobber in-progress form state
  (`StageAdvanceModal`, `CreateCaseModal`, policy JSON editing).

---

## 6. State architecture — keep it dependency-free

The codebase has a deliberate minimal-dependency character (hand-built router-less nav, hand-built
auth shim, `manualChunks` tuned by hand). Three options, with a clear recommendation:

| Option | Deps added | Fit with this codebase | Verdict |
| :--- | :--- | :--- | :--- |
| **A. Zero-dep**: custom `routes.tsx` registry + `history` API router + `useReducer` workspace store | **0** | Perfect match; every byte is reviewable; no install risk on demo Wi-Fi | ✅ **Recommended** |
| B. `react-router-dom` v7 + hand-rolled workspace store | +1 (`react-router` ~30 kB gz) | Standard, well-known to judges; `NavLink`/`Outlet`/`useSearchParams` come free | ⚠️ Good fallback |
| C. B + `zustand` + `@tanstack/react-query` | +3 | Over-engineered for ~9 routes; introduces install + version risk mid-event | ❌ Not now |

**Recommendation: Option A.** A routes registry + `matchPath` + `useSyncExternalStore` over
`history` is ~150 lines, is fully type-safe against `shared/types`, and keeps `bun install` a no-op.
Option B is a drop-in upgrade later because the *registry* is the abstraction — swapping the
matcher is a single file.

### 6.1 Single source of truth kills the duplication

Right now the sidebar's `ROLE_AUTHORIZED_DESTINATIONS` and the server's `requireRole([...])` lists
are two hand-maintained mirrors. With a registry, **one** declaration drives:

- the sidebar nav list,
- the tab title/icon,
- the breadcrumb,
- route-level role guards,
- lazy-chunk boundaries.

```ts
// src/router/routes.tsx  (sketch)
export interface RouteDef {
  id: string;                      // 'case.detail'
  path: string;                    // '/cases/:caseId/:tab'
  label: string;                   // 'Acquisition Case'
  iconKey: IconKey;
  module: ModuleId;                // which sidebar destination this belongs to
  roles: UserRole[];               // single source of truth for authorisation
  keepAlive?: boolean;
  singleton?: boolean;
  dynamicTitle?: (params: Params) => string;   // 'RFCT/2026/114'
  element: React.LazyExoticComponent<React.FC<any>>;
}
```

`ROLE_AUTHORIZED_DESTINATIONS` in `Sidebar.tsx` is then **deleted** and replaced by
`ROUTES.filter(r => r.roles.includes(role))`, and `Sidebar`'s `ActiveTab` union type is replaced by
deriving the active module from the current path (`matchRoute(pathname)?.module`).

---

## 7. File-by-file change plan

### 7.1 New files

| File | Purpose | Est. lines |
| :--- | :--- | :--- |
| `src/router/routes.tsx` | `RouteDef[]` registry — the single source of truth | ~180 |
| `src/router/matchPath.ts` | Tiny `:param` matcher (`/cases/:caseId/:tab?`) | ~60 |
| `src/router/RouterProvider.tsx` | `history` + `useSyncExternalStore`, `navigate`, `pushState`/`popstate` | ~90 |
| `src/router/useRoute.ts` | `useRoute()` → `{ route, params, pathname, query }`; `useQueryParams()` setter | ~70 |
| `src/router/Link.tsx` | `<Link>` + `<TabLink>` (forces new workspace tab) | ~70 |
| `src/router/RouteGuard.tsx` | `RequireRole` → redirects to `/403?from=` | ~40 |
| `src/router/RouteView.tsx` | `React.lazy` + `<Suspense>` + error boundary per route | ~80 |
| `src/workspace/types.ts` | `WorkspaceTab`, `WorkspaceState`, actions | ~60 |
| `src/workspace/WorkspaceProvider.tsx` | `useReducer` + `localStorage` v1 + `storage` event sync | ~220 |
| `src/workspace/TabStrip.tsx` | Scrollable tab strip, overflow, drag-reorder, `+` menu | ~260 |
| `src/workspace/TabItem.tsx` | Single tab: icon, title, dirty dot, close, middle-click, `aria` | ~130 |
| `src/workspace/TabContextMenu.tsx` | Pin / Duplicate / Copy link / Refresh / Close variants | ~150 |
| `src/workspace/KeepAliveHost.tsx` | Size-preserving hide + LRU(8) + `useKeepAliveVisibility` | ~120 |
| `src/workspace/SplitPane.tsx` | Two-pane compare with draggable divider *(Phase 4)* | ~120 |
| `src/workspace/useWorkspaceShortcuts.ts` | `Ctrl+T/W/Tab/1-9` | ~80 |
| `src/components/layout/Breadcrumbs.tsx` | Derived from matched route + case title | ~70 |
| `src/pages/SearchResultsPage.tsx` | Consumes `?q=`, fans out to cases/projects/villages | ~180 |
| `src/pages/SystemDiagnosticsPage.tsx` | `/api/health` + `/api/diagnostics` | ~150 |
| `src/pages/NotFoundPage.tsx`, `src/pages/ForbiddenPage.tsx` | 404 / 403 surfaces | ~60 |
| `src/context/RealtimeProvider.tsx` | Workspace-scoped case/notification channels | ~110 |
| `src/lib/events.ts` | ~40-line typed pub/sub for realtime fan-out | ~40 |

**Total new: ~2,600 lines, split into 22 reviewable files.** No new npm dependency.

### 7.2 Modified files

| File | Change | Risk |
| :--- | :--- | :--- |
| `src/App.tsx` (185 → ~120) | Becomes `AppShell`: `Header` → `TabStrip` → `Sidebar + <KeepAliveHost/>`; the 8-branch conditional chain is **deleted**. | Med |
| `src/main.tsx` | Wrap with `RouterProvider` → `WorkspaceProvider` → `RealtimeProvider` → `AuthProvider`. | Low |
| `src/components/layout/Sidebar.tsx` | `allDestinations` + `ROLE_AUTHORIZED_DESTINATIONS` → derived from `ROUTES`; nav buttons → `<Link>`; active state from path. | Low |
| `src/components/layout/Header.tsx` | Search → `navigate('/search?q=')` (fixes gap 5); add `+` tab button and open-count badge. | Low |
| `src/pages/CaseDetailPage.tsx` | `activeTab` local state → `:tab` param; `onBack` → `navigate(-1)`; add "Open in new tab" / "Copy link" / "Pin tab" actions; keep `normalizeTab()` as a redirect-alias map. | **Med-High** (745 lines) |
| `src/pages/CasesListPage.tsx` | Filter/sort/view state → query params; row click → `openInActiveTab`; ctrl/middle-click → `openInNewTab`. | Med |
| `src/pages/ProjectsPage.tsx` | `selectedProjectId` → `/projects/:projectId`. | Low |
| `src/pages/AnalyticsPage.tsx` | 4 tabs from `useState` → `/analytics/:view`; add **Delays** and **Bottlenecks** tabs using existing unwired endpoints. | Low |
| `src/pages/IntelligencePage.tsx` | `subTab` → `/intelligence/:view`. | Low |
| `src/pages/AdministrationPage.tsx` | `activeSubTab` → `/admin/:section`. | Low |
| `src/pages/NotificationsPage.tsx` | Filters → query params; add "open source case in new tab". | Low |
| `src/pages/GovernancePage.tsx` | **Resurrected** at `/governance/:view` (currently dead code). | Low |
| `src/components/dashboard/AttentionQueue.tsx` | Items become tab-aware links (new-tab affordance). | Low |
| `src/components/dashboard/GeographicDrilldownView.tsx` | Leaf nodes open case in new tab. | Low |
| `src/components/gis/CaseMapView.tsx` | Add `useKeepAliveVisibility()` → `invalidateSize()`; add the missing `ResizeObserver`. | Med |
| `src/components/dashboard/PortfolioMapView.tsx` | Same as above. | Med |
| `src/lib/api.ts` (1,300+) | Add a small in-flight **GET dedupe cache** so two tabs requesting `/api/cases` issue one network call; add `AbortSignal` support. | Low |
| `vite.config.ts` | Keep `manualChunks`; route-level chunks come free from `React.lazy`. | Low |

### 7.3 Deliberately **not** changed

`server/**`, `supabase/**`, `shared/types/index.ts`, `tests/**`, `scripts/**`.
The backend already exposes every endpoint this UI needs; this is a pure client-side restructure.

---

## 8. Core code sketches

### 8.1 Route matching (no dependency)

```ts
// src/router/matchPath.ts
export interface MatchResult { params: Record<string, string>; }
type Seg = { type: 'static' | 'param' | 'optional'; value: string };

const parse = (path: string): Seg[] =>
  path.split('/').filter(Boolean).map((raw) => {
    if (raw === '*') return { type: 'static', value: '*' };
    if (raw.startsWith(':')) {
      const optional = raw.endsWith('?');
      return { type: optional ? 'optional' : 'param', value: raw.replace(/^:|[?]$/g, '') };
    }
    return { type: 'static', value: raw };
  });

export function matchPath(pattern: string, pathname: string): MatchResult | null {
  const p = parse(pattern);
  const s = pathname.split('/').filter(Boolean);
  const params: Record<string, string> = {};

  for (let i = 0; i < p.length; i++) {
    const seg = p[i];
    if (seg.type === 'static' && seg.value === '*') return { params };
    if (seg.type === 'optional') {
      if (s[i] !== undefined) params[seg.value] = decodeURIComponent(s[i]);
      continue;
    }
    if (s[i] === undefined) return null;
    if (seg.type === 'param') params[seg.value] = decodeURIComponent(s[i]);
    else if (seg.value !== s[i]) return null;
  }
  if (s.length > p.length && p[p.length - 1]?.value !== '*') return null;
  return { params };
}
```

Ranking rule when multiple patterns match: **most static segments first**, then longest pattern.
This resolves `/cases/new` before `/cases/:caseId/:tab`.

### 8.2 History-backed router store

```tsx
// src/router/RouterProvider.tsx
interface Location { pathname: string; search: string; key: string; }
let current: Location = snapshot();
const listeners = new Set<() => void>();

function snapshot(): Location {
  return { pathname: location.pathname, search: location.search, key: String(history.state?.key ?? 'init') };
}
function emit() { current = snapshot(); listeners.forEach((l) => l()); }

window.addEventListener('popstate', emit);

export function navigate(to: string, opts: { replace?: boolean; state?: any } = {}) {
  if (opts.replace) history.replaceState({ ...opts.state }, '', to);
  else history.pushState({ ...opts.state }, '', to);
  emit();
}

const subscribe = (cb: () => void) => { listeners.add(cb); return () => { listeners.delete(cb); }; };
export const useLocationPath = () => useSyncExternalStore(subscribe, () => current.pathname);
export const useLocationSearch = () => useSyncExternalStore(subscribe, () => current.search);
```

`useSyncExternalStore` (React 18.3.1 is already in use) avoids tearing and is the correct primitive
here — it prevents a context re-render storm on every query-param keystroke.

### 8.3 Workspace reducer

```ts
// src/workspace/WorkspaceProvider.tsx (reducer core)
type Action =
  | { type: 'OPEN'; tab: Omit<WorkspaceTab, 'openedAt' | 'lastActiveAt'>; focus?: boolean }
  | { type: 'ACTIVATE'; id: string }
  | { type: 'CLOSE'; id: string }
  | { type: 'CLOSE_OTHERS'; id: string }
  | { type: 'CLOSE_TO_RIGHT'; id: string }
  | { type: 'PIN'; id: string; pinned: boolean }
  | { type: 'REORDER'; from: number; to: number }
  | { type: 'PATCH'; id: string; patch: Partial<WorkspaceTab> }
  | { type: 'HYDRATE'; state: WorkspaceState };

function reducer(state: WorkspaceState, action: Action): WorkspaceState {
  switch (action.type) {
    case 'OPEN': {
      const existing = state.tabs.find((t) => t.id === action.tab.id);
      if (existing) {
        // singleton module tab OR same case → update path (query may differ), focus it
        const tabs = state.tabs.map((t) =>
          t.id === action.tab.id
            ? { ...t, ...action.tab, openedAt: t.openedAt, lastActiveAt: Date.now() }
            : t
        );
        return touch({ ...state, tabs }, action.focus === false ? state.activeTabId : action.tab.id);
      }
      const tab: WorkspaceTab = { ...action.tab, openedAt: Date.now(), lastActiveAt: Date.now() };
      const insertAt = state.tabs.filter((t) => t.pinned).length; // keep pins left-aligned
      const tabs = [...state.tabs.slice(0, insertAt), tab, ...state.tabs.slice(insertAt)];
      return touch({ ...state, tabs }, action.focus === false ? state.activeTabId : tab.id);
    }
    case 'CLOSE': {
      const idx = state.tabs.findIndex((t) => t.id === action.id);
      if (idx < 0) return state;
      const closing = state.tabs[idx];
      if (!closing.closable) return state;
      const tabs = state.tabs.filter((t) => t.id !== action.id);
      if (tabs.length === 0) return { ...state, tabs, activeTabId: null, alive: [] };
      const others = tabs.filter((t) => t.id !== state.activeTabId);
      const mru = [...others].sort((a, b) => b.lastActiveAt - a.lastActiveAt)[0]; // MRU fallback
      return touch({ ...state, tabs }, closing.id === state.activeTabId ? mru.id : state.activeTabId!);
    }
    // CLOSE_OTHERS / CLOSE_TO_RIGHT / PIN / REORDER / PATCH are straightforward variants
    default: return state;
  }
}

// touch: bump lastActiveAt, sync browser URL, maintain the LRU keep-alive set
function touch(state: WorkspaceState, activeTabId: string | null): WorkspaceState {
  const active = state.tabs.find((t) => t.id === activeTabId);
  const tabs = state.tabs.map((t) =>
    t.id === activeTabId ? { ...t, lastActiveAt: Date.now() } : t
  );
  if (active && window.location.pathname + window.location.search !== active.path) {
    history.pushState({ key: active.id }, '', active.path);   // tab → URL
  }
  return { ...state, tabs, activeTabId, alive: keepAliveLru(tabs, activeTabId, 8) };
}
```

The reverse direction (URL → tab) is one `popstate` listener inside `WorkspaceProvider`: match the
pathname against `ROUTES`, synthesise a tab descriptor, `dispatch({ type: 'OPEN' })`. If that tab was
previously closed, back/forward **re-creates** it — exactly what a browser does.

### 8.4 Keep-alive host (Leaflet-safe)

```tsx
// src/workspace/KeepAliveHost.tsx
export const KeepAliveHost: React.FC = () => {
  const { alive, activeTabId, tabs } = useWorkspace();

  return (
    <div className="relative flex-1 min-w-0 h-full">
      {alive.map((id) => {
        const tab = tabs.find((t) => t.id === id);
        if (!tab) return null;
        const isActive = id === activeTabId;
        return (
          <div
            key={id}
            role="tabpanel"
            aria-hidden={!isActive}
            // IMPORTANT: never `display:none` — a 0x0 container blanks Leaflet tiles on return.
            className="absolute inset-0 overflow-y-auto"
            style={isActive
              ? { visibility: 'visible', zIndex: 1 }
              : { visibility: 'hidden', pointerEvents: 'none', zIndex: 0, contain: 'strict' }}
          >
            <KeepAliveVisibilityContext.Provider value={isActive}>
              <RouteView path={tab.path} />
            </KeepAliveVisibilityContext.Provider>
          </div>
        );
      })}
    </div>
  );
};

export const useKeepAliveVisibility = () => useContext(KeepAliveVisibilityContext);
```

```tsx
// src/components/gis/CaseMapView.tsx  (additions, ~12 lines)
const isVisible = useKeepAliveVisibility();
useEffect(() => {
  if (!isVisible) return;
  const t = window.setTimeout(() => mapInstanceRef.current?.invalidateSize(), 60);
  return () => window.clearTimeout(t);
}, [isVisible]);

// also fixes a pre-existing bug: remeasure on container resize (sidebar collapse, window resize)
useEffect(() => {
  const el = mapContainerRef.current;
  if (!el) return;
  const ro = new ResizeObserver(() => mapInstanceRef.current?.invalidateSize());
  ro.observe(el);
  return () => ro.disconnect();
}, []);
```

### 8.5 Tab strip (structure)

```tsx
// src/workspace/TabStrip.tsx
<div className="sticky top-16 z-30 bg-white border-b border-slate-200">
  <div className="mx-auto px-3 flex items-center gap-2">
    <div className="flex-1 flex items-center gap-1 overflow-x-auto" role="tablist">
      {tabs.map((t) => <TabItem key={t.id} tab={t} />)}
    </div>
    <button title="New tab (Ctrl+T)" onClick={openModuleTab}><Plus className="h-4 w-4" /></button>
    <button title="All tabs"><ChevronDown className="h-4 w-4" /></button>
  </div>
</div>
```

`TabItem` renders the route icon, title, a dirty dot when the tab registers unsaved work, a pin
glyph when pinned, and an `×` (hidden when `closable === false`). Styling reuses existing
institutional tokens: active `border-gov-navy text-gov-navy bg-white`, inactive
`text-slate-500 hover:bg-slate-50 border-transparent`.

---

## 9. Phased delivery plan

Each phase is independently shippable and leaves `bun x tsc --noEmit` and `bun test` **green**.
Phase 0–1 is the whole "multi-page + multi-tab" ask; 2–4 are additive.

### Phase 0 — Routing foundation (behaviour-preserving)
*Goal: pages get real URLs, but the UI looks identical.*
1. Add `src/router/{matchPath,RouterProvider,useRoute,Link,RouteGuard,RouteView}.tsx` + `routes.tsx`.
2. Rewrite `App.tsx` as `AppShell` using `ROUTES` instead of the 8-branch chain.
3. `Sidebar` derives nav from `ROUTES`; delete `ROLE_AUTHORIZED_DESTINATIONS`.
4. `main.tsx` wraps with `RouterProvider`.
5. Add `/403`, `/404`, redirects (`/` → `/dashboard`, `/cases/:id` → `/cases/:id/overview`).
6. Add `React.lazy` per route; verify `dist/assets/` now contains per-page chunks.

**Acceptance:** refresh on `/analytics/trends` keeps you there · back/forward work · role `viewer`
hitting `/admin` lands on `/403` · `tsc` clean · bundle split into ≥6 chunks.

### Phase 1 — Tab workspace
*Goal: multi-tab is real.*
7. `WorkspaceProvider` + reducer + `localStorage` v1 + cross-window `storage` sync.
8. `TabStrip` / `TabItem` / `TabContextMenu` between `Header` and the content area.
9. `Link`/`TabLink`, ctrl+click and middle-click wiring on `CasesListPage`,
   `AttentionQueue`, `GeographicDrilldownView`, `NotificationBell`.
10. `useWorkspaceShortcuts` (`Ctrl+T/W/Tab/1-9`).
11. Role-switch pruning of unauthorised tabs.

**Acceptance:** open 3 cases + GIS + analytics; switch tabs; reload → all 5 restored with the same
active tab · ctrl+click opens a 4th case in a new tab without disturbing the current tab ·
switching to `viewer` closes `/admin/*` tabs with a toast.

### Phase 2 — Page-level refactors (URL-driven in-page tabs)
12. `CaseDetailPage`: `:tab` param, `navigate(-1)` back, per-tab affordances, `normalizeTab` → redirect map.
13. `CasesListPage`: filters/sort/view in query params (a "Sonipat, delayed, by SLA" view becomes a link).
14. `AnalyticsPage`: 7 tabs; wire the orphaned `/api/portfolio/delays` + `/bottlenecks` endpoints.
15. `IntelligencePage`, `AdministrationPage`, `NotificationsPage`, `ProjectsPage`: same treatment.
16. `GovernancePage` resurrected at `/governance/:view`; add it to the registry + sidebar.
17. `Header` search → `/search`; new `SearchResultsPage`.

**Acceptance:** every in-page tab change updates the URL · header search returns grouped results and
can be opened as a tab · governance page reachable · all 7 analytics views render real data.

### Phase 3 — Keep-alive & realtime
18. `KeepAliveHost` + `useKeepAliveVisibility`; LRU(8).
19. `invalidateSize()` on reactivation + the missing `ResizeObserver` in both map components.
20. `RealtimeProvider` + `lib/events.ts`; case tabs show a "Updated · Refresh" affordance.
21. `api.ts` GET dedupe cache + `AbortSignal`.

**Acceptance:** open 2 tabs both showing a Leaflet map → tiles render correctly in **both** after
switching back and forth · collapsing the sidebar no longer leaves a mis-scaled map · a DB edit on
an open case surfaces an update badge, not a silent data swap.

### Phase 4 — Decision-support polish (optional; strongest demo value)
22. `SplitPane` compare mode (`Ctrl+\`): two cases' `TimelineGantt` side by side.
23. `CommandPalette` (`Ctrl+K`): jump to any case, project, village, or module.
24. Breadcrumbs, tab overflow dropdown, drag-to-reorder, "Copy link" with a toast.

---

## 10. Testing strategy

The repo already runs 28 test files under `tests/` via `bun test`, with a strong convention of
testing pure logic (`workflowEngine.test.ts`, `geojsonValidator.test.ts`,
`portfolioOperations.test.ts`). The new routing/workspace core is deliberately **pure and
dependency-free**, so it slots straight into that convention:

| New test file | Covers |
| :--- | :--- |
| `tests/routeMatching.test.ts` | `matchPath` precedence (`/cases/new` vs `/cases/:id/:tab`), optional segments, trailing slash, URL-decoding, wildcard |
| `tests/workspaceReducer.test.ts` | OPEN dedupe/re-focus, singleton module tabs, MRU close fallback, pinned-close refusal, CLOSE_OTHERS / CLOSE_TO_RIGHT, LRU(8) eviction, hydration of a corrupt or version-mismatched payload |
| `tests/roleRoutes.test.ts` | every `RouteDef.roles` matches the server's `requireRole([...])` for the corresponding endpoint — a regression guard against the two lists drifting apart again |
| `tests/caseTabAlias.test.ts` | `normalizeTab` aliases (`timeline`→`workflow`, `parcels`→`gis`, `info`→`overview`) still resolve |

None of these need a DOM, so **no `jsdom` / `@testing-library` dependency is required**.

---

## 11. Risks, trade-offs, and open decisions

| Risk | Mitigation |
| :--- | :--- |
| **Leaflet + keep-alive** is the highest-risk item (silent blank maps). | Size-preserving hide + `invalidateSize()` + `ResizeObserver` (Phase 3), proven by the Phase 3 acceptance check. If flaky, set `keepAlive: false` for the `gis` route only — everything else still benefits. |
| **`CaseDetailPage.tsx` is 745 lines** and is the most-touched file. | Change only its tab state (mechanical); do not restructure its markup in the same commit. |
| **Memory growth** from 8 live Leaflet/Recharts views. | Hard LRU cap of 8, `contain: strict` on hidden panes, per-route `keepAlive` opt-out. |
| **`CaseDetailPage`'s `initialTab` aliases** are used by today's `handleSelectCase` callers. | Keep the alias map through Phase 2, remove once all callers migrate. |
| **Multi-tab + realtime could resubscribe in a loop.** | Subscription owned by `RealtimeProvider`, keyed on a stable `openCaseIds.join('|')`, never on a per-render callback. |
| **Scope creep** — 22 new files is a lot for an event timeline. | Phase 0 + Phase 1 alone (~900 lines) delivers the complete multi-page + multi-tab frontend. Phases 2–4 are optional increments. |

### Decisions required before implementation

1. **Router approach** — zero-dependency registry + `history` (**recommended**: 0 installs, keeps
   `bun install` a no-op and the demo offline-safe) **or** `react-router-dom` v7 (conventional,
   +1 dependency; the registry approach still works underneath).
2. **Scope for the first implementation pass** — Phase 0 only · **Phase 0 + 1** (the full
   multi-page + multi-tab ask) · all four phases.
3. **Default workspace on first load** — dashboard only, or a role-based starter set
   (e.g. LAO opens *Dashboard + Cases + Notifications* pre-opened and pinned).

---

## 12. Summary

The backend is complete and needs no changes: 87 route handlers across 11 routers, with
`/api/portfolio/*` already exposing 7 analytics endpoints that the UI only half-uses, and a
reference-counted realtime layer that the UI does not use at all. The frontend bottleneck is
**structural**: everything is `useState`-switched, so nothing is addressable, selectable, or
parallelisable.

The proposal is therefore:

- **Multi-page** = a single `RouteDef[]` registry driving a 26-route URL contract, the sidebar, the
  breadcrumbs, role guards, and lazy chunk boundaries — replacing `ROLE_AUTHORIZED_DESTINATIONS`
  and the 8-branch conditional in `App.tsx`. Two hand-maintained role lists become one.
- **Multi-tab** = a serialisable `WorkspaceTab[]` in a `useReducer` store, bidirectionally synced
  with `history`, persisted to `localStorage`, with ctrl/middle-click "open in new tab",
  context menu, pinning, MRU close, role-aware pruning, keyboard shortcuts, an optional split
  compare view, and **Leaflet-safe keep-alive** that also fixes a latent map-resize bug.
- **Zero new dependencies**, ~2,600 lines across 22 new files, delivered in four independently
  shippable phases, with the routing and workspace cores unit-testable in the existing
  `bun test` style.

