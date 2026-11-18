/** The Traffic option of the graph toolbars. */
import { ShowToggle } from '../graph/GraphOptions';
import { useTraffic, useTrafficStore } from './use-usage';
import { TRAFFIC_UNIT } from './usage-wording';

/**
 * Off by default and remembered for each model in this browser. It appears once a graph has told the
 * store which project and model it shows, and nothing is requested until a person switches it on.
 */
export function TrafficToggle() {
  const store = useTrafficStore();
  const { on, project, modelName } = useTraffic();
  if (!project || !modelName) return null;
  return (
    <ShowToggle on={on} onToggle={() => void store.setOn(!on)} title={`Shade items by the ${TRAFFIC_UNIT} that asked about them`}>
      Traffic
    </ShowToggle>
  );
}
