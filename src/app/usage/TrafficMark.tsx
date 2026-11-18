/** Marks a graph card that was asked about: a ring whose weight grows with the count, a bar, and the count as text. */
import { useItemTraffic } from './use-usage';
import { countWords } from './usage-wording';
import './usage.css';

/**
 * Draws nothing unless Traffic is on and the item has requests, so a card without Traffic is exactly
 * what it was. The ring and the bar sit over the card's own box and never change its size.
 */
export function TrafficMark({ address }: { address: string | undefined }) {
  const traffic = useItemTraffic(address);
  if (!traffic || traffic.level === 0) return null;
  const style = { '--traffic-level': traffic.level } as React.CSSProperties;
  return (
    <span className="traffic-marks">
      <span className="traffic-ring" style={style} aria-hidden="true" />
      <span className="traffic-bar" style={style} aria-hidden="true" />
      <span className="traffic-sr">{countWords(traffic.total, traffic.days)}</span>
    </span>
  );
}
