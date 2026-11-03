import React from 'react';
import { useResources, useResourceTypes, useResolvedResourceTarget, valueToJSON, type HostRecord } from '@omniviewdev/runtime';

import { KUBERNETES_PLUGIN, fluxState, resolveFluxKey, type FluxObject, type FluxState } from './flux';

/** Worst first, so the things that need attention sit at the top. */
const STATE_ORDER: FluxState[] = ['failed', 'stalled', 'reconciling', 'unknown', 'suspended', 'ready'];

export type Row = { resourceKey: string; kind: string; object: FluxObject; state: FluxState; record: HostRecord };
type KindResult = { objects: readonly HostRecord[] | undefined; loading: boolean; error: unknown };


/**
 * Watches the given Flux kinds on a connection and returns their objects,
 * worst state first. `loaders` must be rendered: each one subscribes to a
 * resource type the cluster serves.
 */
export const useFluxRows = (connectionID: string, kinds: string[]) => {
  const { resourceTypes } = useResourceTypes({ pluginID: KUBERNETES_PLUGIN, route: { connection: connectionID } });
  const [results, setResults] = React.useState<Record<string, KindResult>>({});

  const served = kinds
    .map((kind) => ({ kind, resourceKey: resolveFluxKey(resourceTypes.data, kind) }))
    .filter((k): k is { kind: string; resourceKey: string } => !!k.resourceKey);

  const onResult = React.useCallback((key: string, result: KindResult) => {
    setResults((prev) => {
      const old = prev[key];
      if (old && old.objects === result.objects && old.loading === result.loading && old.error === result.error) return prev;
      return { ...prev, [key]: result };
    });
  }, []);

  const rows: Row[] = served
    .flatMap(({ kind, resourceKey }) =>
      // Listed objects may come without their kind, which the state rules rely on.
      (results[`${connectionID}/${resourceKey}`]?.objects ?? []).filter((record) => record.route.connection === connectionID).map((record) => {
        const object = { ...(valueToJSON(record.record.body) as FluxObject), kind };
        return { resourceKey, kind, object, state: fluxState(object), record };
      }),
    )
    .sort(
      (a, b) =>
        STATE_ORDER.indexOf(a.state) - STATE_ORDER.indexOf(b.state) ||
        a.kind.localeCompare(b.kind) ||
        (a.object.metadata?.namespace ?? '').localeCompare(b.object.metadata?.namespace ?? '') ||
        (a.object.metadata?.name ?? '').localeCompare(b.object.metadata?.name ?? ''),
    );

  const loaders = served.map(({ kind, resourceKey }) => (
    <KindLoader key={`${connectionID}/${resourceKey}`} kind={kind} resourceKey={resourceKey} connectionID={connectionID} onResult={onResult} />
  ));
  const activeResults = served.map(({ resourceKey }) => results[`${connectionID}/${resourceKey}`]);
  const error = resourceTypes.error ?? activeResults.find((result) => result?.error)?.error;

  return {
    loading: resourceTypes.isLoading || served.some((_, i) => !activeResults[i] || activeResults[i].loading),
    error,
    installed: served.length > 0,
    rows,
    loaders,
  };
};

type KindLoaderProps = {
  kind: string;
  resourceKey: string;
  connectionID: string;
  onResult: (key: string, result: KindResult) => void;
};

/** Subscribes to one resource type and reports its objects up; renders nothing. */
const KindLoader: React.FC<KindLoaderProps> = ({ resourceKey, connectionID, onResult }) => {
  const target = useResolvedResourceTarget({
    pluginID: KUBERNETES_PLUGIN, route: { connection: connectionID }, type: resourceKey,
  });
  const { resources } = useResources({
    pluginID: KUBERNETES_PLUGIN,
    collection: true,
    request: target.data && { targetId: target.data.targetId, request: { target: target.data.target, pageSize: 256 } },
    enabled: !!target.data,
  });
  const result = resources.data?.records;
  const error = target.error ?? resources.error;
  const loading = !error && (!target.data || resources.isLoading);

  React.useEffect(() => {
    onResult(`${connectionID}/${resourceKey}`, { objects: result, loading, error });
  }, [connectionID, resourceKey, result, loading, error, onResult]);

  return null;
};

/** Tallies rows into the buckets the overview and the dashboard widget show. */
export const countStates = (rows: Row[]) => {
  const count = (...states: FluxState[]) => rows.filter((row) => states.includes(row.state)).length;
  return {
    total: rows.length,
    ready: count('ready'),
    failing: count('failed', 'stalled'),
    pending: count('reconciling', 'unknown'),
    suspended: count('suspended'),
  };
};
