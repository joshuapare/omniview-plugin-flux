import React from 'react';
import { Button, Stack } from '@omniviewdev/base-ui';
import { jsonToValue, useResource, useResourceMutations, useResourceTypes, valueToJSON, type ResourceReference, type ResolvedResourceReference } from '@omniviewdev/runtime';
import { ResourceClient } from '@omniviewdev/runtime/api';
import { LuPause, LuPlay, LuRefreshCw } from 'react-icons/lu';

import {
  KUBERNETES_PLUGIN,
  isSuspendable,
  resolveFluxKey,
  sourceRefOf,
  withReconcileRequest,
  withSuspend,
  type FluxObject,
  type SourceRef,
} from '../flux';

type Props = {
  connectionID: string;
  reference: ResourceReference;
  object: FluxObject;
  /** Table-row layout: only the single-object actions. */
  dense?: boolean;
  /** Called after a change has been written, for callers whose data is not watched. */
  onChanged?: () => void;
};

const buttonStyle: React.CSSProperties = { whiteSpace: 'nowrap' };
const rowStyle: React.CSSProperties = { gap: 6 };

/**
 * Reconcile / suspend / resume controls for a Flux object. Changes are written
 * through the Kubernetes plugin's connection, so they use the same credentials
 * as every other edit in the cluster view.
 */
const FluxActions: React.FC<Props> = ({ connectionID, reference, object, dense, onChanged }) => {
  const { mutate } = useResourceMutations({ pluginID: KUBERNETES_PLUGIN });
  const [busy, setBusy] = React.useState(false);

  const suspended = !!object.spec?.suspend;
  const source = sourceRefOf(object);

  const apply = React.useCallback(
    async (next: FluxObject) => {
      setBusy(true);
      try {
        await mutate({
          route: { connection: connectionID }, reference, operation: 'update', input: jsonToValue(next),
        });
        onChanged?.();
      } catch {
        // The mutation hook already reports the failure to the user.
      } finally {
        setBusy(false);
      }
    },
    [mutate, connectionID, reference, onChanged],
  );

  const stop = (e: React.MouseEvent) => e.stopPropagation();

  return (
    <Stack direction="row" spacing={0} wrap onClick={stop} style={rowStyle}>
      <Button
        size="sm"
        variant="outline"
        color="brand"
        disabled={busy || suspended}
        startDecorator={<LuRefreshCw size={14} />}
        onClick={() => void apply(withReconcileRequest(object))}
        style={buttonStyle}
      >
        Reconcile
      </Button>
      {!dense && source && (
        <ReconcileWithSource
          connectionID={connectionID}
          source={source}
          disabled={busy || suspended}
          onSourceRequested={() => apply(withReconcileRequest(object))}
        />
      )}
      {isSuspendable(object) && (
        <Button
          size="sm"
          variant="outline"
          color={suspended ? 'success' : 'warning'}
          disabled={busy}
          startDecorator={suspended ? <LuPlay size={14} /> : <LuPause size={14} />}
          onClick={() => void apply(withSuspend(object, !suspended))}
          style={buttonStyle}
        >
          {suspended ? 'Resume' : 'Suspend'}
        </Button>
      )}
    </Stack>
  );
};

type WithSourceProps = {
  connectionID: string;
  source: SourceRef;
  disabled: boolean;
  onSourceRequested: () => Promise<void>;
};

/** Asks the source to fetch first, then reconciles the object that uses it. */
const ReconcileWithSource: React.FC<WithSourceProps> = ({ connectionID, source, disabled, onSourceRequested }) => {
  const { resourceTypes } = useResourceTypes({ pluginID: KUBERNETES_PLUGIN, route: { connection: connectionID } });
  const sourceKey = resolveFluxKey(resourceTypes.data, source.kind);

  if (!sourceKey) return null;

  return (
    <ReconcileWithSourceButton
      connectionID={connectionID}
      sourceKey={sourceKey}
      source={source}
      disabled={disabled}
      onSourceRequested={onSourceRequested}
    />
  );
};

const ReconcileWithSourceButton: React.FC<WithSourceProps & { sourceKey: string }> = ({
  connectionID,
  sourceKey,
  source,
  disabled,
  onSourceRequested,
}) => {
  const [resolved, setResolved] = React.useState<ResolvedResourceReference>();
  React.useEffect(() => {
    let active = true;
    setResolved(undefined);
    void ResourceClient.ResolveReference(KUBERNETES_PLUGIN, {
      route: { connection: connectionID }, type: sourceKey, id: source.name,
      scope: [{ dimension: 'namespace', value: source.namespace }],
    }).then((value) => { if (active) setResolved(value); }).catch(() => {});
    return () => { active = false; };
  }, [connectionID, sourceKey, source.name, source.namespace]);
  const { resource, mutate } = useResource({
    pluginID: KUBERNETES_PLUGIN,
    request: resolved && {
      targetId: resolved.targetId,
      request: { route: resolved.route, reference: resolved.reference, representation: resolved.representation },
    },
  });
  const [busy, setBusy] = React.useState(false);
  const sourceObject = resource.data ? valueToJSON(resource.data.record.body) as FluxObject : undefined;

  const run = async () => {
    if (!sourceObject) return;
    setBusy(true);
    try {
      await mutate({ operation: 'update', input: jsonToValue(withReconcileRequest(sourceObject)) });
      await onSourceRequested();
    } catch {
      // The mutation hook already reports the failure to the user.
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button
      size="sm"
      variant="outline"
      color="brand"
      disabled={disabled || busy || !sourceObject}
      startDecorator={<LuRefreshCw size={14} />}
      onClick={() => void run()}
      style={buttonStyle}
    >
      Reconcile with source
    </Button>
  );
};

export default FluxActions;
