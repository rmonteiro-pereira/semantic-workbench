/** Says what the Traffic shading means, and what state it is in: off, loading, failed, empty or partial. */
import { useTraffic, useTrafficAdmin, useTrafficStore } from './use-usage';
import { INTENSITY_LEVELS } from './usage-intensity';
import { TRAFFIC_UNIT, operationWords, periodWords } from './usage-wording';
import { COUNTED_OPERATIONS } from './counted-operations';
import './usage.css';

/** One line of text for each state, never cut: the legend grows and wraps instead. */
export function TrafficLegend({ admin }: { admin?: boolean }) {
  const store = useTrafficStore();
  const traffic = useTraffic();
  const isAdmin = useTrafficAdmin();
  const showsHowToEnable = admin ?? isAdmin;
  if (!traffic.on) return null;
  const sentence = (text: string) => (
    <p className="traffic-legend" role="status">
      {text}
    </p>
  );
  if (traffic.status === 'counters-off') return sentence(showsHowToEnable ? 'Counters are off. An operator turns them on with SW_USAGE_COUNTERS.' : 'Not collected');
  if (traffic.status === 'loading' || traffic.status === 'idle')
    return (
      <p className="traffic-legend traffic-loading" role="status">
        Loading {TRAFFIC_UNIT}
      </p>
    );
  if (traffic.status === 'error') {
    return (
      <p className="traffic-legend" role="alert">
        {`${TRAFFIC_UNIT[0].toUpperCase()}${TRAFFIC_UNIT.slice(1)} could not be loaded. ${traffic.error} `}
        <button onClick={() => void store.retry()}>Retry</button>
      </p>
    );
  }
  const period = periodWords(traffic.days);
  if (traffic.status === 'empty') return sentence(`No ${TRAFFIC_UNIT} counted yet in ${period}.`);
  const operations = COUNTED_OPERATIONS.map(operationWords).join(', ');
  const explanation =
    `Shading shows ${TRAFFIC_UNIT} in ${period}: ${operations}. ` +
    `A heavier outline and a longer bar mean more requests; ${INTENSITY_LEVELS} steps, relative to the busiest item shown. ` +
    'Browser views are not counted.';
  // The summary is the whole legend on a phone; what it counts opens below it, so the graph keeps its height.
  return (
    <>
      <details className="traffic-legend">
        <summary>{`Traffic: ${TRAFFIC_UNIT} in ${period}`}</summary>
        <p>{explanation}</p>
      </details>
      {traffic.status === 'partial' && (
        <p className="traffic-legend" role="status">
          {`Counts are unavailable for ${traffic.unavailableDays.length === 1 ? 'one day' : `${traffic.unavailableDays.length} days`} (${traffic.unavailableDays.join(', ')}) because their file could not be read.`}
        </p>
      )}
    </>
  );
}
