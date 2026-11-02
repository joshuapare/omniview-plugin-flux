import { useResources, useResolvedResourceTarget, valueToJSON } from '@omniviewdev/runtime';

import { KUBERNETES_PLUGIN } from './flux';

const DEPLOYMENT_KEY = 'k8s:apps/deployments';

/** Controller Deployments as `flux install` / `flux bootstrap` name them. */
const CONTROLLER_NAMES = [
  'source-controller',
  'kustomize-controller',
  'helm-controller',
  'notification-controller',
  'image-reflector-controller',
  'image-automation-controller',
];

type Deployment = {
  metadata?: { name?: string; namespace?: string; uid?: string; labels?: Record<string, string> };
  spec?: { replicas?: number; template?: { spec?: { containers?: Array<{ image?: string }> } } };
  status?: { readyReplicas?: number };
};

export type FluxController = {
  id: string;
  name: string;
  namespace: string;
  /** Image tag of the controller, e.g. `v1.4.1`. */
  version?: string;
  replicas: number;
  readyReplicas: number;
  ready: boolean;
};

const imageOf = (d: Deployment): string => d.spec?.template?.spec?.containers?.[0]?.image ?? '';

const imageTag = (image: string): string | undefined => {
  const withoutDigest = image.split('@')[0];
  const tag = withoutDigest.slice(withoutDigest.lastIndexOf('/') + 1).split(':')[1];
  return tag || undefined;
};

const isController = (d: Deployment): boolean =>
  d.metadata?.labels?.['app.kubernetes.io/part-of'] === 'flux' ||
  (CONTROLLER_NAMES.includes(d.metadata?.name ?? '') && imageOf(d).includes('flux'));

/**
 * The Flux controllers running on a cluster, in the order Flux lists them,
 * and the distribution version they were installed from when it is labelled.
 */
export const useFluxControllers = (connectionID: string) => {
  const target = useResolvedResourceTarget({
    pluginID: KUBERNETES_PLUGIN, route: { connection: connectionID }, type: DEPLOYMENT_KEY,
  });
  const { resources } = useResources({
    pluginID: KUBERNETES_PLUGIN,
    collection: true,
    request: target.data && { targetId: target.data.targetId, request: { target: target.data.target, pageSize: 256 } },
    enabled: !!target.data,
  });

  const deployments = (resources.data?.records ?? []).map(({ record }) => valueToJSON(record.body) as Deployment).filter(isController);
  const rank = (name: string) => {
    const index = CONTROLLER_NAMES.indexOf(name);
    return index < 0 ? CONTROLLER_NAMES.length : index;
  };

  const controllers: FluxController[] = deployments
    .map((d) => {
      const replicas = d.spec?.replicas ?? 1;
      const readyReplicas = d.status?.readyReplicas ?? 0;
      return {
        id: d.metadata?.uid ?? `${d.metadata?.namespace}/${d.metadata?.name}`,
        name: d.metadata?.name ?? '',
        namespace: d.metadata?.namespace ?? '',
        version: imageTag(imageOf(d)),
        replicas,
        readyReplicas,
        ready: replicas > 0 && readyReplicas >= replicas,
      };
    })
    .sort((a, b) => rank(a.name) - rank(b.name) || a.name.localeCompare(b.name));

  const fluxVersion = deployments
    .map((d) => d.metadata?.labels?.['app.kubernetes.io/version'])
    .find((v): v is string => !!v);

  return {
    /** False until the Deployment list has been read (or could not be). */
    known: resources.isSuccess,
    controllers,
    fluxVersion,
  };
};
