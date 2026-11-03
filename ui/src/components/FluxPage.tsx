import React from 'react';
import { Banner, Chip, SegmentedControl, Stack, Table, Text } from '@omniviewdev/base-ui';
import { parseAppError, usePluginRouter, useRightDrawer } from '@omniviewdev/runtime';

import FluxActions from './FluxActions';
import {
  KUBERNETES_PLUGIN,
  OVERVIEW_GROUPS,
  OVERVIEW_KINDS,
  STATE_LABEL,
  fluxRevision,
  readyCondition,
  shortRevision,
  timeAgo,
  type FluxState,
} from '../flux';
import { useFluxControllers } from '../useFluxControllers';
import { countStates, useFluxRows, type Row } from '../useFluxRows';
import styles from './FluxPage.module.css';

type Props = {
  pluginID: string;
  connectionID: string;
  /** Set when one of the page's sub-entries is selected. */
  subPath?: string;
};

/** Sub-pages listed under Flux in the cluster navigation. */
export const FLUX_SUB_PAGES = [
  { path: 'kustomizations', label: 'Kustomization', kind: 'Kustomization' },
  { path: 'helmreleases', label: 'HelmRelease', kind: 'HelmRelease' },
] as const;

const STATE_COLOR: Record<FluxState, 'success' | 'danger' | 'info' | 'warning' | 'neutral'> = {
  ready: 'success',
  failed: 'danger',
  stalled: 'danger',
  reconciling: 'info',
  suspended: 'warning',
  unknown: 'neutral',
};

const centeredStyle: React.CSSProperties = { padding: 32, width: '100%', textAlign: 'center', boxSizing: 'border-box' };
const pageStyle: React.CSSProperties = { width: '100%', height: '100%', minHeight: 0, padding: 12, gap: 12, boxSizing: 'border-box' };
// The cluster view clips its main area, so lists scroll on their own.
const scrollStyle: React.CSSProperties = { flex: 1, minHeight: 0, overflow: 'auto' };
const wrapRowStyle: React.CSSProperties = { gap: 6 };
const nowrapStyle: React.CSSProperties = { whiteSpace: 'nowrap' };

const FluxPage: React.FC<Props> = ({ connectionID, subPath }) => {
  const subPage = FLUX_SUB_PAGES.find((p) => p.path === subPath);
  const kinds = React.useMemo(() => (subPage ? [subPage.kind] : OVERVIEW_KINDS), [subPage]);
  const { loading, error, installed, rows, loaders } = useFluxRows(connectionID, kinds);

  let body: React.ReactNode;
  if (error) {
    body = <Text as="div" tone="danger" style={centeredStyle}>{parseAppError(error).detail}</Text>;
  } else if (loading) {
    body = <Text as="div" tone="muted" style={centeredStyle}>Loading…</Text>;
  } else if (!installed) {
    body = <NotInstalled kind={subPage?.kind} />;
  } else if (subPage) {
    body = <KindList connectionID={connectionID} label={subPage.label} rows={rows} />;
  } else {
    body = <Overview connectionID={connectionID} rows={rows} />;
  }

  return (
    <Stack direction="column" spacing={0} style={pageStyle}>
      {loaders}
      {body}
    </Stack>
  );
};

/** Shown when the cluster serves none of the resource types the page needs. */
const NotInstalled: React.FC<{ kind?: string }> = ({ kind }) => (
  <Stack direction="column" spacing={1} align="center" style={centeredStyle}>
    <Text as="div" size="md" weight="medium">
      {kind ? `${kind} is not available on this cluster` : 'Flux is not installed on this cluster'}
    </Text>
    <Text as="div" size="sm" tone="muted">
      {kind
        ? `The cluster does not serve the ${kind} resource type. The Flux controller that provides it may not be installed.`
        : 'None of the Flux resource types were found. Install Flux with `flux bootstrap` or `flux install`, then reopen this page.'}
    </Text>
  </Stack>
);

/** Controller versions and readiness, so a broken install is visible before its symptoms. */
const Controllers: React.FC<{ connectionID: string }> = ({ connectionID }) => {
  const { known, controllers, fluxVersion } = useFluxControllers(connectionID);

  if (!known) return null;

  if (controllers.length === 0) {
    return (
      <Banner color="warning" variant="soft">
        <Banner.Content>
          Flux resource types exist on this cluster, but no Flux controllers were found. Nothing will be reconciled.
        </Banner.Content>
      </Banner>
    );
  }

  return (
    <Stack direction="row" spacing={0} wrap align="center" style={wrapRowStyle}>
      <Text size="sm" weight="medium" tone="muted" style={{ marginRight: 4 }}>
        Controllers{fluxVersion ? ` (Flux ${fluxVersion})` : ''}
      </Text>
      {controllers.map((c) => (
        <Chip
          key={c.id}
          size="sm"
          variant="outline"
          color={c.ready ? 'success' : 'danger'}
          title={`${c.namespace}/${c.name}: ${c.readyReplicas}/${c.replicas} replicas ready`}
        >
          {`${c.name}${c.version ? ` ${c.version}` : ''}${c.ready ? '' : ` · ${c.readyReplicas}/${c.replicas} ready`}`}
        </Chip>
      ))}
    </Stack>
  );
};

const Overview: React.FC<{ connectionID: string; rows: Row[] }> = ({ connectionID, rows }) => {
  const { navigate } = usePluginRouter();
  const notReady = rows.filter((row) => row.state !== 'ready');

  return (
    <>
      <Stack direction="row" spacing={3} wrap>
        {OVERVIEW_GROUPS.map((group) => {
          const { total, ready, failing, pending, suspended } = countStates(
            rows.filter((row) => group.kinds.includes(row.kind)),
          );
          const subPath = group.subPath;

          return (
            <div
              key={group.title}
              className={subPath ? `${styles.GroupTile} ${styles.GroupTileLink}` : styles.GroupTile}
              role={subPath ? 'link' : undefined}
              tabIndex={subPath ? 0 : undefined}
              onClick={subPath ? () => navigate(subPath) : undefined}
              onKeyDown={subPath ? (e) => { if (e.key === 'Enter') navigate(subPath); } : undefined}
            >
              <Text as="div" size="sm" tone="muted">{group.title}</Text>
              <div className={styles.GroupTotal}>{total}</div>
              <Stack direction="row" spacing={1} wrap>
                <Chip size="sm" variant="outline" color="success">{`${ready} ready`}</Chip>
                {failing > 0 && <Chip size="sm" variant="outline" color="danger">{`${failing} failing`}</Chip>}
                {pending > 0 && <Chip size="sm" variant="outline" color="info">{`${pending} reconciling`}</Chip>}
                {suspended > 0 && <Chip size="sm" variant="outline" color="warning">{`${suspended} suspended`}</Chip>}
              </Stack>
            </div>
          );
        })}
      </Stack>

      <Controllers connectionID={connectionID} />

      <Text as="div" size="sm" weight="medium" tone="muted">Needs attention ({notReady.length})</Text>
      {notReady.length === 0 ? (
        <Text as="div" tone="muted" style={centeredStyle}>
          {rows.length === 0 ? 'No Flux resources found.' : `All ${rows.length} Flux resources are ready.`}
        </Text>
      ) : (
        <FluxTable connectionID={connectionID} rows={notReady} />
      )}
    </>
  );
};

const KindList: React.FC<{ connectionID: string; label: string; rows: Row[] }> = ({ connectionID, label, rows }) => {
  const [onlyNotReady, setOnlyNotReady] = React.useState(false);
  const notReady = rows.filter((row) => row.state !== 'ready');
  const visible = onlyNotReady ? notReady : rows;

  return (
    <>
      <SegmentedControl
        size="sm"
        value={onlyNotReady ? 'attention' : 'all'}
        onValueChange={(value) => setOnlyNotReady(value === 'attention')}
        style={{ alignSelf: 'flex-start' }}
      >
        <SegmentedControl.Item value="all">All ({rows.length})</SegmentedControl.Item>
        <SegmentedControl.Item value="attention">Not ready ({notReady.length})</SegmentedControl.Item>
      </SegmentedControl>

      {visible.length === 0 ? (
        <Text as="div" tone="muted" style={centeredStyle}>
          {rows.length === 0 ? `No ${label} resources found.` : `All ${rows.length} are ready.`}
        </Text>
      ) : (
        <FluxTable connectionID={connectionID} rows={visible} hideKind />
      )}
    </>
  );
};

const FluxTable: React.FC<{ connectionID: string; rows: Row[]; hideKind?: boolean }> = ({ connectionID, rows, hideKind }) => (
  <div style={scrollStyle}>
    <Table size="sm" stickyHeader hoverable>
      <Table.Head>
        <Table.Row>
          <Table.HeaderCell>Status</Table.HeaderCell>
          {!hideKind && <Table.HeaderCell>Kind</Table.HeaderCell>}
          <Table.HeaderCell>Namespace</Table.HeaderCell>
          <Table.HeaderCell>Name</Table.HeaderCell>
          <Table.HeaderCell>Revision</Table.HeaderCell>
          <Table.HeaderCell>Since</Table.HeaderCell>
          <Table.HeaderCell>Message</Table.HeaderCell>
          <Table.HeaderCell />
        </Table.Row>
      </Table.Head>
      <Table.Body>
        {rows.map((row) => (
          <FluxRow
            key={row.object.metadata?.uid ?? `${row.kind}/${row.object.metadata?.namespace}/${row.object.metadata?.name}`}
            connectionID={connectionID}
            row={row}
            hideKind={hideKind}
          />
        ))}
      </Table.Body>
    </Table>
  </div>
);

const FluxRow: React.FC<{ connectionID: string; row: Row; hideKind?: boolean }> = ({ connectionID, row, hideKind }) => {
  const { showResourceSidebar } = useRightDrawer();
  const { object, kind, state, record } = row;
  const ready = readyCondition(object);
  const revision = fluxRevision(object);
  const name = object.metadata?.name ?? '';
  const namespace = object.metadata?.namespace ?? '';

  return (
    <Table.Row
      interactive
      style={{ cursor: 'pointer' }}
      onClick={() =>
        showResourceSidebar({
          pluginID: KUBERNETES_PLUGIN,
          route: record.route,
          targetId: record.targetId,
          reference: record.record.reference,
          representation: record.record.representation.id,
          record,
          resourceName: name,
        })
      }
    >
      <Table.Cell>
        <Chip size="sm" variant="outline" color={STATE_COLOR[state]}>{STATE_LABEL[state]}</Chip>
      </Table.Cell>
      {!hideKind && <Table.Cell>{kind}</Table.Cell>}
      <Table.Cell>{namespace}</Table.Cell>
      <Table.Cell>{name}</Table.Cell>
      <Table.Cell mono style={nowrapStyle}>{revision ? shortRevision(revision) : ''}</Table.Cell>
      <Table.Cell style={nowrapStyle}>{timeAgo(ready?.lastTransitionTime)}</Table.Cell>
      <Table.Cell style={{ maxWidth: 420 }}>
        {state !== 'ready' && ready?.message && (
          <div className={styles.MessageClamp} title={ready.message}>
            {ready.message}
          </div>
        )}
      </Table.Cell>
      <Table.Cell align="right">
        <FluxActions dense connectionID={connectionID} reference={record.record.reference} object={object} />
      </Table.Cell>
    </Table.Row>
  );
};

export default FluxPage;
