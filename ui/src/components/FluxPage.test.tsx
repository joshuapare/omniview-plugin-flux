// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

const state = vi.hoisted(() => ({ catalog: {} as object, target: {} as object, resources: {} as object }));
vi.mock('@omniviewdev/runtime', () => ({
  useResourceTypes: () => ({ resourceTypes: state.catalog }),
  useResolvedResourceTarget: () => state.target,
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
  return { Banner: component, Chip: component, SegmentedControl: segmented, Stack: component, Table: Object.assign(component, { Head: component, Body: component, Row: component, Cell: component, HeaderCell: component }), Text: component };
});
import FluxPage from './FluxPage';

const key = 'k8s:kustomize.toolkit.fluxcd.io/kustomizations';
beforeEach(() => {
  state.catalog = { data: [{ type: key }], isLoading: false, isError: false };
  state.target = { data: { targetId: 'target', target: {} }, isLoading: false, isError: false };
  state.resources = { data: { records: [] }, isLoading: false, isError: false };
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
});
