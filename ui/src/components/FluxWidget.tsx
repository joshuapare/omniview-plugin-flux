import React from 'react';
import { parseAppError, usePluginRouter } from '@omniviewdev/runtime';
import { LuGitBranch } from 'react-icons/lu';

import StatCard, { type StatCardColor } from './StatCard';
import { FLUX_PAGE_PATH, OVERVIEW_KINDS } from '../flux';
import { useFluxControllers } from '../useFluxControllers';
import { countStates, useFluxRows } from '../useFluxRows';

type Props = {
  pluginID: string;
  connectionID: string;
};

const ICON = <LuGitBranch size={14} />;

/**
 * Flux health on the cluster dashboard: how many Flux resources are ready,
 * failing or suspended. Clicking it opens the Flux page. Renders nothing on
 * clusters without Flux.
 */
const FluxWidget: React.FC<Props> = ({ connectionID }) => {
  const { navigate } = usePluginRouter();
  const { loading, error, installed, rows, loaders } = useFluxRows(connectionID, OVERVIEW_KINDS);
  const { known, controllers } = useFluxControllers(connectionID);

  if (error) return (
    <div style={{ height: '100%' }}>
      {loaders}
      <StatCard value="—" label="Flux" description={parseAppError(error).detail} icon={ICON} color="danger"
        onClick={() => navigate(`/cluster/${connectionID}/resources/page/${FLUX_PAGE_PATH}`)} />
    </div>
  );
  if (loading || !installed) return <>{loaders}</>;

  const { total, ready, failing, pending, suspended } = countStates(rows);
  const controllersDown = controllers.filter((c) => !c.ready).length;
  const noControllers = known && controllers.length === 0;

  const parts = [
    ready > 0 && `${ready} ready`,
    failing > 0 && `${failing} failing`,
    pending > 0 && `${pending} reconciling`,
    suspended > 0 && `${suspended} suspended`,
    controllersDown > 0 && `${controllersDown} of ${controllers.length} controllers not ready`,
    noControllers && 'no controllers running',
  ].filter(Boolean);

  let color: StatCardColor = 'brand';
  if (failing > 0 || controllersDown > 0 || noControllers) color = 'danger';
  else if (suspended > 0) color = 'warning';

  return (
    <div style={{ height: '100%' }}>
      {loaders}
      <StatCard
        value={total}
        label="Flux"
        description={parts.length > 0 ? parts.join(', ') : 'No Flux resources'}
        icon={ICON}
        color={color}
        onClick={() => navigate(`/cluster/${connectionID}/resources/page/${FLUX_PAGE_PATH}`)}
      />
    </div>
  );
};

export default FluxWidget;
