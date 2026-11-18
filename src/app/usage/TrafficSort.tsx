/** The Sort by traffic switch of the entity and metric lists. */
import { ShowToggle } from '../graph/GraphOptions';
import { useTraffic } from './use-usage';
import { TRAFFIC_UNIT, periodWords } from './usage-wording';
import './usage.css';

/** Shown only while Traffic is on and has counts to order by, so a list without Traffic is unchanged. */
export function TrafficSort({ sorted, onToggle }: { sorted: boolean; onToggle: () => void }) {
  const { on, status, days } = useTraffic();
  if (!on || (status !== 'ready' && status !== 'partial')) return null;
  return (
    <div className="traffic-sort">
      <ShowToggle on={sorted} onToggle={onToggle} title={`Busiest first by ${TRAFFIC_UNIT} in ${periodWords(days)}; equal counts keep their order`}>
        Sort by traffic
      </ShowToggle>
    </div>
  );
}
