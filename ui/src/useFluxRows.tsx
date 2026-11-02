import React from 'react';
import { useResources, useResourceTypes, useResolvedResourceTarget, valueToJSON, type HostRecord } from '@omniviewdev/runtime';

import { KUBERNETES_PLUGIN, fluxState, resolveFluxKey, type FluxObject, type FluxState } from './flux';

/** Worst first, so the things that need attention sit at the top. */
const STATE_ORDER: FluxState[] = ['failed', 'stalled', 'reconciling', 'unknown', 'suspended', 'ready'];

export type Row = { resourceKey: string; kind: string; object: FluxObject; state: FluxState; record: HostRecord };

/**
 * Watches the given Flux kinds on a connection and returns their objects,
 * worst state first. `loaders` must be rendered: each one subscribes to a
 * resource type the cluster serves.
 */
export const useFluxRows = (connectionID: string, kinds: string[]) => {
  const { resourceTypes } = useResourceTypes({ pluginID: KUBERNETES_PLUGIN, route: { connection: connectionID } });
  const [objectsByKind, setObjectsByKind] = React.useState<Record<string, readonly HostRecord[]>>({});

  const served = kinds
    .map((kind) => ({ kind, resourceKey: resolveFluxKey(resourceTypes.data, kind) }))
    .filter((k): k is { kind: string; resourceKey: string } => !!k.resourceKey);

  const onObjects = React.useCallback((kind: string, objects: readonly HostRecord[]) => {
    setObjectsByKind((prev) => ({ ...prev, [kind]: objects }));
  }, []);

  const rows: Row[] = served
    .flatMap(({ kind, resourceKey }) =>
      // Listed objects may come without their kind, which the state rules rely on.
      (objectsByKind[kind] ?? []).filter((record) => record.route.connection === connectionID).map((record) => {
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
    <KindLoader key={`${connectionID}/${resourceKey}`} kind={kind} resourceKey={resourceKey} connectionID={connectionID} onObjects={onObjects} />
  ));

  return { loading: resourceTypes.isLoading, installed: served.length > 0, rows, loaders };
};

type KindLoaderProps = {
  kind: string;
  resourceKey: string;
  connectionID: string;
  onObjects: (kind: string, objects: readonly HostRecord[]) => void;
};

/** Subscribes to one resource type and reports its objects up; renders nothing. */
const KindLoader: React.FC<KindLoaderProps> = ({ kind, resourceKey, connectionID, onObjects }) => {
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

  React.useEffect(() => {
    onObjects(kind, result ?? []);
  }, [kind, result, onObjects]);

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
