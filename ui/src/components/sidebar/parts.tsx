import React from 'react';
import { Chip, Separator, Stack, Text } from '@omniviewdev/base-ui';
import { useResourceTypes, useRightDrawer } from '@omniviewdev/runtime';
import { ResourceClient } from '@omniviewdev/runtime/api';

import { KUBERNETES_PLUGIN, resolveRefKey, type FluxCondition, type FluxObject } from '../../flux';
import styles from './parts.module.css';

/** What every per-kind panel body receives. */
export type DetailProps = { connectionID: string; object: FluxObject };

/** A titled block of the panel, separated from the one above it. */
export const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <>
    <Separator />
    <Stack direction="column" spacing={1}>
      <Text weight="semibold" size="sm" tone="muted">{title}</Text>
      {children}
    </Stack>
  </>
);

/** A label and its value; rows whose value is empty are left out. */
export type Field = [label: string, value: React.ReactNode];

const isShown = (value: React.ReactNode): boolean =>
  value !== undefined && value !== null && value !== false && value !== '';

const valueStyle: React.CSSProperties = { fontFamily: 'var(--ov-font-mono)', wordBreak: 'break-all' };
const labelStyle: React.CSSProperties = { flexShrink: 0 };
const fieldRowStyle: React.CSSProperties = { gap: 6 };

/** A section of label/value rows; renders nothing when every row is empty. */
export const FieldSection: React.FC<{ title: string; rows: Field[]; children?: React.ReactNode }> = ({
  title,
  rows,
  children,
}) => {
  const shown = rows.filter(([, value]) => isShown(value));
  if (shown.length === 0 && !children) return null;

  return (
    <Section title={title}>
      {shown.map(([label, value]) => (
        <Stack key={label} direction="row" spacing={0} align="baseline" style={fieldRowStyle}>
          <Text size="xs" tone="muted" style={labelStyle}>{label}:</Text>
          {typeof value === 'string' || typeof value === 'number' ? (
            <Text size="xs" style={valueStyle}>{value}</Text>
          ) : (
            value
          )}
        </Stack>
      ))}
      {children}
    </Section>
  );
};

/** `yes` / `no` for a flag that is set, nothing when it is left to its default. */
export const flag = (value: unknown): string | undefined =>
  value === undefined || value === null ? undefined : value ? 'yes' : 'no';

type RefLinkProps = {
  connectionID: string;
  kind: string;
  name: string;
  namespace: string;
  /** Namespace of the object holding the reference; shown only when it differs. */
  home?: string;
  /** Prefix the name with the kind. */
  showKind?: boolean;
};

/** A referenced object; opens its side panel when the cluster serves the kind. */
export const RefLink: React.FC<RefLinkProps> = ({ connectionID, kind, name, namespace, home, showKind }) => {
  const { resourceTypes } = useResourceTypes({ pluginID: KUBERNETES_PLUGIN, route: { connection: connectionID } });
  const { showResourceSidebar } = useRightDrawer();
  const resourceKey = resolveRefKey(resourceTypes.data, kind);
  const label = `${showKind ? `${kind}/` : ''}${name}${home !== undefined && namespace !== home ? ` (${namespace})` : ''}`;

  // Wildcards in event sources match many objects, so there is nothing to open.
  if (!resourceKey || name === '*') {
    return <Text size="xs" style={valueStyle}>{label}</Text>;
  }

  return (
    <span
      role="link"
      tabIndex={0}
      className={styles.RefLink}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.currentTarget as HTMLElement).click();
      }}
      onClick={() => {
        void ResourceClient.ResolveReference(KUBERNETES_PLUGIN, {
          route: { connection: connectionID }, type: resourceKey, id: name,
          scope: [{ dimension: 'namespace', value: namespace }],
        }).then((resolved) => showResourceSidebar({
          pluginID: KUBERNETES_PLUGIN, ...resolved, resourceName: name,
        }));
      }}
    >
      {label}
    </span>
  );
};

type ObjectRef = { kind?: string; name?: string; namespace?: string };

/** References listed one per line, e.g. dependsOn or an alert's event sources. */
export const RefList: React.FC<{
  connectionID: string;
  refs: ObjectRef[] | undefined;
  /** Kind to assume when the reference does not carry one. */
  kind?: string;
  home: string;
}> = ({ connectionID, refs, kind, home }) => (
  <Stack direction="column" spacing={0} style={{ gap: 2 }}>
    {(refs ?? []).map((ref, i) => (
      <RefLink
        key={`${ref.kind}/${ref.namespace}/${ref.name}/${i}`}
        connectionID={connectionID}
        kind={ref.kind ?? kind ?? ''}
        name={ref.name ?? ''}
        namespace={ref.namespace ?? home}
        home={home}
        showKind={!kind}
      />
    ))}
  </Stack>
);

/** Short values shown as a wrapping row of chips. */
export const ChipList: React.FC<{ values: string[] | undefined }> = ({ values }) => (
  <Stack direction="row" spacing={1} wrap>
    {(values ?? []).map((value) => (
      <Chip key={value} size="sm" variant="outline">{value}</Chip>
    ))}
  </Stack>
);

const conditionStyle: React.CSSProperties = {
  padding: 6,
  borderRadius: 4,
  backgroundColor: 'var(--ov-color-bg-base)',
};

export const ConditionRow: React.FC<{ condition: FluxCondition }> = ({ condition }) => {
  const isTrue = condition.status === 'True';
  return (
    <div style={conditionStyle}>
      <Stack direction="row" spacing={1} align="center" style={{ marginBottom: 2 }}>
        <Chip size="sm" color={isTrue ? 'success' : 'danger'} variant="soft">{condition.type}</Chip>
        {condition.reason && <Text size="xs" tone="muted">{condition.reason}</Text>}
      </Stack>
      {condition.message && (
        <Text as="div" size="xs" tone="muted" style={{ paddingLeft: 4 }}>
          {condition.message}
        </Text>
      )}
      {condition.lastTransitionTime && (
        <Text as="div" size="xs" tone="subtle" style={{ paddingLeft: 4, marginTop: 2 }}>
          {condition.lastTransitionTime}
        </Text>
      )}
    </div>
  );
};
