/** The Traffic entry of the graph toolbars' Show menu. */
import type { ShowItem } from '../graph/ShowMenu';
import { useTraffic, useTrafficStore } from './use-usage';
import { TRAFFIC_UNIT, periodWords } from './usage-wording';

/**
 * Off by default and remembered for each model in this browser. It appears once a graph has told the
 * store which project and model it shows, and nothing is requested until a person switches it on.
 */
export function useTrafficShowItem(): ShowItem | null {
  const store = useTrafficStore();
  const { on, project, modelName, days } = useTraffic();
  if (!project || !modelName) return null;
  return {
    name: 'Traffic',
    summary: `Shade items by the ${TRAFFIC_UNIT} that asked about them in ${periodWords(days)}`,
    on,
    onToggle: () => void store.setOn(!on),
  };
}
