import type { RouteDef } from '../router/routes';
import type { RouteParams } from '../router/matchPath';

export type WorkspaceEntityType = 'case' | 'project';

export interface WorkspaceItem {
  id: string;
  routeId: string;
  pathname: string;
  search: string;
  title: string;
  entityType?: WorkspaceEntityType;
  entityId?: string;
  closable: boolean;
  lastAccessedAt: number;
}

export interface WorkspaceState {
  items: WorkspaceItem[];
  activeId: string | null;
}

export type WorkspaceAction =
  | { type: 'OPEN_WORKSPACE'; item: WorkspaceItem }
  | { type: 'ACTIVATE_WORKSPACE'; id: string }
  | { type: 'CLOSE_WORKSPACE'; id: string }
  | { type: 'CLOSE_OTHER_WORKSPACES'; id: string }
  | { type: 'CLOSE_ALL_WORKSPACES'; fallback: WorkspaceItem }
  | { type: 'UPDATE_WORKSPACE_METADATA'; id: string; patch: Partial<WorkspaceItem> };

export const EMPTY_WORKSPACE_STATE: WorkspaceState = { items: [], activeId: null };

export function workspaceIdentity(route: RouteDef, params: RouteParams): string {
  if (route.workspace?.entityType && route.workspace.param) {
    const entityId = params[route.workspace.param];
    if (entityId) {
      return `${route.workspace.entityType}:${entityId}`;
    }
  }
  return `route:${route.id}`;
}

export function workspaceItemFromRoute(
  route: RouteDef,
  params: RouteParams,
  pathname: string,
  search: string,
  now = Date.now()
): WorkspaceItem {
  const entityType = route.workspace?.entityType;
  const entityId = route.workspace?.param ? params[route.workspace.param] : undefined;
  const id = workspaceIdentity(route, params);

  return {
    id,
    routeId: route.id,
    pathname,
    search,
    title: entityType && entityId ? `${route.workspace?.label ?? entityType} ${entityId}` : route.title,
    ...(entityType ? { entityType } : {}),
    ...(entityId ? { entityId } : {}),
    closable: route.id !== 'module.dashboard',
    lastAccessedAt: now,
  };
}

function touchItem(item: WorkspaceItem, now: number): WorkspaceItem {
  return { ...item, lastAccessedAt: now };
}

export function workspaceReducer(state: WorkspaceState, action: WorkspaceAction): WorkspaceState {
  switch (action.type) {
    case 'OPEN_WORKSPACE': {
      const existingIndex = state.items.findIndex((item) => item.id === action.item.id);
      if (existingIndex < 0) {
        return {
          items: [...state.items, action.item],
          activeId: action.item.id,
        };
      }

      const items = state.items.map((item, index) =>
        index === existingIndex ? touchItem({ ...item, ...action.item }, action.item.lastAccessedAt) : item
      );
      return { items, activeId: action.item.id };
    }

    case 'ACTIVATE_WORKSPACE': {
      if (!state.items.some((item) => item.id === action.id)) {
        return state;
      }
      return {
        items: state.items.map((item) =>
          item.id === action.id ? touchItem(item, Date.now()) : item
        ),
        activeId: action.id,
      };
    }

    case 'CLOSE_WORKSPACE': {
      const index = state.items.findIndex((item) => item.id === action.id);
      if (index < 0 || !state.items[index].closable) {
        return state;
      }
      const items = state.items.filter((item) => item.id !== action.id);
      if (state.activeId !== action.id) {
        return { ...state, items };
      }
      const next = items[Math.min(index, items.length - 1)] ?? null;
      return { items, activeId: next?.id ?? null };
    }

    case 'CLOSE_OTHER_WORKSPACES': {
      const active = state.items.find((item) => item.id === action.id);
      return active ? { items: [active], activeId: active.id } : state;
    }

    case 'CLOSE_ALL_WORKSPACES':
      return { items: [action.fallback], activeId: action.fallback.id };

    case 'UPDATE_WORKSPACE_METADATA':
      return {
        ...state,
        items: state.items.map((item) =>
          item.id === action.id ? { ...item, ...action.patch } : item
        ),
      };

    default:
      return state;
  }
}
