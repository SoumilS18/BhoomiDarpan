import { describe, expect, it } from 'bun:test';
import { buildPath, getRouteById, resolveRouteFrom, ROUTES } from '../src/router';
import {
  EMPTY_WORKSPACE_STATE,
  workspaceItemFromRoute,
  workspaceReducer,
  type WorkspaceItem,
} from '../src/workspace/workspace';

function item(id: string, routeId = 'module.dashboard'): WorkspaceItem {
  return {
    id,
    routeId,
    pathname: `/${id}`,
    search: '',
    title: id,
    closable: id !== 'dashboard',
    lastAccessedAt: 1,
  };
}

describe('Workspace reducer', () => {
  it('opens items and deduplicates repeated entity navigation', () => {
    const first = item('case:abc', 'case.detail');
    const second = { ...first, pathname: '/cases/abc/intelligence', lastAccessedAt: 2 };
    const opened = workspaceReducer(EMPTY_WORKSPACE_STATE, { type: 'OPEN_WORKSPACE', item: first });
    const updated = workspaceReducer(opened, { type: 'OPEN_WORKSPACE', item: second });

    expect(updated.items).toHaveLength(1);
    expect(updated.items[0].pathname).toBe('/cases/abc/intelligence');
    expect(updated.activeId).toBe('case:abc');
  });

  it('activates existing items without creating a second route', () => {
    const state = workspaceReducer(
      workspaceReducer(EMPTY_WORKSPACE_STATE, { type: 'OPEN_WORKSPACE', item: item('dashboard') }),
      { type: 'OPEN_WORKSPACE', item: item('case:abc', 'case.detail') }
    );
    const activated = workspaceReducer(state, { type: 'ACTIVATE_WORKSPACE', id: 'dashboard' });

    expect(activated.items).toHaveLength(2);
    expect(activated.activeId).toBe('dashboard');
  });

  it('closes inactive and active items deterministically', () => {
    let state = EMPTY_WORKSPACE_STATE;
    for (const workspaceItem of [item('dashboard'), item('case:a'), item('case:b')]) {
      state = workspaceReducer(state, { type: 'OPEN_WORKSPACE', item: workspaceItem });
    }

    state = workspaceReducer(state, { type: 'CLOSE_WORKSPACE', id: 'case:a' });
    expect(state.items.map((entry) => entry.id)).toEqual(['dashboard', 'case:b']);
    expect(state.activeId).toBe('case:b');

    state = workspaceReducer(state, { type: 'CLOSE_WORKSPACE', id: 'case:b' });
    expect(state.items.map((entry) => entry.id)).toEqual(['dashboard']);
    expect(state.activeId).toBe('dashboard');
  });

  it('closes other items, restores a fallback, and updates metadata', () => {
    let state = EMPTY_WORKSPACE_STATE;
    for (const workspaceItem of [item('dashboard'), item('case:a'), item('case:b')]) {
      state = workspaceReducer(state, { type: 'OPEN_WORKSPACE', item: workspaceItem });
    }

    state = workspaceReducer(state, { type: 'CLOSE_OTHER_WORKSPACES', id: 'case:b' });
    expect(state.items.map((entry) => entry.id)).toEqual(['case:b']);

    state = workspaceReducer(state, {
      type: 'UPDATE_WORKSPACE_METADATA',
      id: 'case:b',
      patch: { title: 'Case from loaded data' },
    });
    expect(state.items[0].title).toBe('Case from loaded data');

    const fallback = item('dashboard');
    state = workspaceReducer(state, { type: 'CLOSE_ALL_WORKSPACES', fallback });
    expect(state).toEqual({ items: [fallback], activeId: 'dashboard' });
  });

  it('ignores invalid activation and attempts to close the non-closable dashboard', () => {
    const state = workspaceReducer(EMPTY_WORKSPACE_STATE, {
      type: 'OPEN_WORKSPACE',
      item: item('dashboard'),
    });
    expect(workspaceReducer(state, { type: 'ACTIVATE_WORKSPACE', id: 'missing' })).toBe(state);
    expect(workspaceReducer(state, { type: 'CLOSE_WORKSPACE', id: 'dashboard' })).toBe(state);
  });
});

describe('Route to workspace identity', () => {
  it('uses one stable identity across case views and reconstructs deep links', () => {
    const route = getRouteById('case.detail');
    const overview = workspaceItemFromRoute(
      route,
      { caseId: 'abc', tab: 'overview' },
      '/cases/abc/overview',
      ''
    );
    const intelligence = workspaceItemFromRoute(
      route,
      { caseId: 'abc', tab: 'intelligence' },
      '/cases/abc/intelligence',
      ''
    );

    expect(overview.id).toBe('case:abc');
    expect(intelligence.id).toBe(overview.id);
    expect(resolveRouteFrom(ROUTES, '/cases/abc/intelligence')?.route.id).toBe('case.detail');
  });

  it('uses one stable identity across project views and preserves query state', () => {
    const route = getRouteById('project.detail');
    const path = buildPath(route.path, { projectId: 'project-1', view: 'cases' });
    const match = resolveRouteFrom(ROUTES, path);
    const workspaceItem = workspaceItemFromRoute(
      route,
      match?.params ?? {},
      path,
      '?q=delayed'
    );

    expect(workspaceItem.id).toBe('project:project-1');
    expect(workspaceItem.pathname).toBe('/projects/project-1/cases');
    expect(workspaceItem.search).toBe('?q=delayed');
  });

  it('keeps global page routes distinct and query changes on one page deduplicated', () => {
    const route = getRouteById('module.cases');
    const first = workspaceItemFromRoute(route, {}, '/cases', '?q=abc');
    const second = workspaceItemFromRoute(route, {}, '/cases', '?q=xyz');
    expect(first.id).toBe('route:module.cases');
    expect(second.id).toBe(first.id);
  });
});
