// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

const state = vi.hoisted(() => ({
  catalog: {} as object, target: {} as object, resources: {} as object,
  partial: false, partialError: new Error('helm denied'),
}));
vi.mock('@omniviewdev/runtime', () => ({
  useResourceTypes: () => ({ resourceTypes: state.catalog }),
  useResolvedResourceTarget: ({ type }: { type: string }) =>
    state.partial && type.includes('helmreleases')
      ? { isLoading: false, error: state.partialError }
      : state.target,
  useResources: () => ({ resources: state.resources }),
  usePluginRouter: () => ({ navigate: vi.fn() }),
  useRightDrawer: () => ({}),
  valueToJSON: (value: unknown) => value,
  parseAppError: (error: Error) => ({ detail: error.message }),
}));
vi.mock('./FluxActions', () => ({ default: () => null }));
vi.mock('../useFluxControllers', () => ({ useFluxControllers: () => ({ known: false, controllers: [] }) }));
vi.mock('@omniviewdev/base-ui', () => {
  const component = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
  const segmented = Object.assign(component, { Item: component });
  return { Banner: Object.assign(component, { Content: component }), Chip: component, SegmentedControl: segmented, Stack: component, Table: Object.assign(component, { Head: component, Body: component, Row: component, Cell: component, HeaderCell: component }), Text: component };
});
vi.mock('./StatCard', () => ({
  default: ({ value, description }: { value: string | number; description: React.ReactNode }) => <div><span>{value}</span><div>{description}</div></div>,
}));
import FluxPage from './FluxPage';
import FluxWidget from './FluxWidget';

const key = 'k8s:kustomize.toolkit.fluxcd.io/kustomizations';
beforeEach(() => {
  state.catalog = { data: [{ type: key }], isLoading: false, isError: false };
  state.target = { data: { targetId: 'target', target: {} }, isLoading: false, isError: false };
  state.resources = { data: { records: [] }, isLoading: false, isError: false };
  state.partial = false;
});
afterEach(cleanup);

describe('Flux resource failures', () => {
  it('reports catalog failure instead of claiming Flux is not installed', () => {
    state.catalog = { isLoading: false, isError: true, error: new Error('catalog denied') };
    render(<FluxPage pluginID="flux" connectionID="cluster" subPath="kustomizations" />);
    expect(screen.getByText(/catalog denied/)).toBeTruthy();
    expect(screen.queryByText(/not available on this cluster/)).toBeNull();
  });
  it.each(['target', 'resources'] as const)('reports %s failure instead of an empty list', async (stage) => {
    state[stage] = { isLoading: false, isError: true, error: new Error(`${stage} denied`) };
    render(<FluxPage pluginID="flux" connectionID="cluster" subPath="kustomizations" />);
    expect(await screen.findByText(new RegExp(`${stage} denied`))).toBeTruthy();
    expect(screen.queryByText(/No Kustomization resources found/)).toBeNull();
  });
  it('shows the empty state only after a successful collection', async () => {
    render(<FluxPage pluginID="flux" connectionID="cluster" subPath="kustomizations" />);
    expect(await screen.findByText('No Kustomization resources found.')).toBeTruthy();
  });
  it.each(['page', 'widget'] as const)('shows readable data and a named partial failure in the %s', async (view) => {
    state.partial = true;
    state.catalog = { data: [{ type: key }, { type: 'k8s:helm.toolkit.fluxcd.io/helmreleases' }], isLoading: false };
    state.resources = {
      data: { records: [{ route: { connection: 'cluster' }, record: { body: { metadata: { name: 'example' }, status: { conditions: [{ type: 'Ready', status: 'True' }] } } } }] },
      isLoading: false,
    };
    render(view === 'page'
      ? <FluxPage pluginID="flux" connectionID="cluster" subPath="" />
      : <FluxWidget pluginID="flux" connectionID="cluster" />);
    expect(await screen.findByText(/HelmRelease: helm denied/)).toBeTruthy();
    expect(screen.getByText(view === 'page' ? 'All 1 readable Flux resources are ready.' : '1 ready')).toBeTruthy();
  });
});
