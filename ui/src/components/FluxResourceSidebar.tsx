import React from 'react';
import { Chip, Stack, Text } from '@omniviewdev/base-ui';
import { useResource, valueToJSON, type DrawerContext } from '@omniviewdev/runtime';
import { LuBox, LuClock } from 'react-icons/lu';

import FluxActions from './FluxActions';
import { KustomizationDetails, HelmReleaseDetails } from './sidebar/deployers';
import { ImagePolicyDetails, ImageRepositoryDetails, ImageUpdateAutomationDetails } from './sidebar/image';
import { AlertDetails, ProviderDetails, ReceiverDetails } from './sidebar/notification';
import { ChipList, ConditionRow, Section, type DetailProps } from './sidebar/parts';
import {
  BucketDetails,
  GitRepositoryDetails,
  HelmChartDetails,
  HelmRepositoryDetails,
  OCIRepositoryDetails,
} from './sidebar/sources';
import {
  KUBERNETES_PLUGIN,
  STATE_LABEL,
  fluxKindForType,
  fluxState,
  isStatic,
  readyCondition,
  type FluxObject,
  type FluxState,
} from '../flux';

type Props = {
  ctx: DrawerContext;
};

/** The body of the panel for each Flux kind. */
const DETAILS: Record<string, React.FC<DetailProps>> = {
  GitRepository: GitRepositoryDetails,
  OCIRepository: OCIRepositoryDetails,
  HelmRepository: HelmRepositoryDetails,
  HelmChart: HelmChartDetails,
  Bucket: BucketDetails,
  Kustomization: KustomizationDetails,
  HelmRelease: HelmReleaseDetails,
  ImageRepository: ImageRepositoryDetails,
  ImagePolicy: ImagePolicyDetails,
  ImageUpdateAutomation: ImageUpdateAutomationDetails,
  Alert: AlertDetails,
  Provider: ProviderDetails,
  Receiver: ReceiverDetails,
};

const STATE_COLOR: Record<FluxState, 'success' | 'danger' | 'info' | 'warning' | 'neutral'> = {
  ready: 'success',
  failed: 'danger',
  stalled: 'danger',
  reconciling: 'info',
  suspended: 'warning',
  unknown: 'neutral',
};

const iconStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  color: 'var(--ov-color-brand-500)',
};

/**
 * Side panel for any Flux object: identity, actions and status are common,
 * the middle is specific to the kind.
 */
const FluxResourceSidebar: React.FC<Props> = ({ ctx }) => {
  const resource = ctx.resource;
  const connectionID = resource?.route.connection ?? '';
  const initial = (ctx.data ?? {}) as FluxObject;

  // The drawer hands us a snapshot; follow the live object so status and the
  // suspend state update after an action without reopening the panel.
  const { resource: live } = useResource({
    pluginID: KUBERNETES_PLUGIN,
    request: resource && {
      targetId: resource.targetId,
      request: { route: resource.route, reference: resource.reference, representation: resource.representation },
    },
  });
  const kind = initial.kind ?? fluxKindForType(resource?.reference.address.type ?? '') ?? '';
  // Lists may hand over objects without their kind; the panel bodies rely on it.
  const data: FluxObject = { ...(live.data ? valueToJSON(live.data.record.body) as FluxObject : initial), kind };

  // Single-object queries are not watched, so poll briefly after an action to
  // pick up the controller's response.
  const refetch = live.refetch;
  const timers = React.useRef<number[]>([]);
  React.useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);
  const onChanged = React.useCallback(() => {
    void refetch();
    timers.current.push(...[2000, 6000, 15000].map((ms) => window.setTimeout(() => void refetch(), ms)));
  }, [refetch]);

  const name = data.metadata?.name;
  const namespace = data.metadata?.namespace;
  const labels = data.metadata?.labels ?? {};
  const conditions = data.status?.conditions ?? [];
  const state = fluxState(data);
  const ready = readyCondition(data);
  const interval = data.spec?.interval as string | undefined;
  const Details = DETAILS[kind];

  return (
    <Stack direction="column" spacing={3} style={{ width: '100%' }}>
      <Stack direction="column" spacing={1}>
        <Stack direction="row" spacing={2} align="center">
          <span style={iconStyle}>
            <LuBox size={18} />
          </span>
          <Text weight="semibold" size="md">{name}</Text>
        </Stack>
        {namespace && (
          <Text size="xs" tone="muted">Namespace: {namespace}</Text>
        )}
        <Text size="xs" tone="muted">{kind}</Text>
      </Stack>

      {resource && connectionID && name && (
        <FluxActions connectionID={connectionID} reference={resource.reference} object={data} onChanged={onChanged} />
      )}

      <Section title="Status">
        <Stack direction="row" spacing={1} wrap>
          {isStatic(data) && state !== 'suspended' ? (
            <Chip size="sm" color="neutral" variant="soft">No status reported</Chip>
          ) : (
            <Chip size="sm" color={STATE_COLOR[state]} variant="soft">{STATE_LABEL[state]}</Chip>
          )}
          {interval && (
            <Chip size="sm" color="neutral" variant="soft" startDecorator={<LuClock size={14} />}>{interval}</Chip>
          )}
        </Stack>
        {ready?.message && (
          <Text as="div" size="xs" tone="muted" style={{ marginTop: 4 }}>
            {ready.message}
          </Text>
        )}
      </Section>

      {Details && <Details connectionID={connectionID} object={data} />}

      {conditions.length > 0 && (
        <Section title="Conditions">
          <Stack direction="column" spacing={2}>
            {conditions.map((c, i) => (
              <ConditionRow key={`${c.type}-${i}`} condition={c} />
            ))}
          </Stack>
        </Section>
      )}

      {Object.keys(labels).length > 0 && (
        <Section title="Labels">
          <ChipList values={Object.entries(labels).map(([k, v]) => `${k}: ${v}`)} />
        </Section>
      )}
    </Stack>
  );
};

export default FluxResourceSidebar;
