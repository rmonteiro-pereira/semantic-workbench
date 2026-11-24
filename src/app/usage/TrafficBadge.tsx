/** Shows how many requests through the workbench asked about one item, with the period and the split by operation. */
import { useItemTraffic } from './use-usage';
import { TRAFFIC_UNIT, countWords, periodWords, splitWords } from './usage-wording';
import './usage.css';

/**
 * Renders nothing while Traffic is off or has no answer to show, so details panels look as before.
 * The same component serves entity, relationship and field rows.
 */
export function TrafficBadge({ address, compact = false }: { address: string | undefined; compact?: boolean }) {
  const traffic = useItemTraffic(address);
  if (!traffic) return null;
  if (traffic.total === 0) {
    return (
      <p className={`traffic-badge${compact ? ' compact' : ''}`} data-traffic-total="0">
        {`No ${TRAFFIC_UNIT} in ${periodWords(traffic.days)}`}
      </p>
    );
  }
  return (
    <p className={`traffic-badge${compact ? ' compact' : ''}`} data-traffic-total={traffic.total} data-traffic-level={traffic.level}>
      <strong>{countWords(traffic.total, traffic.days)}</strong>
      {!compact && <span className="traffic-split">{splitWords(traffic.byOperation)}</span>}
    </p>
  );
}
