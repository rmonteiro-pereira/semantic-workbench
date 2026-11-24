// The rows of the proposals list: name, status, declared projects, contributors and last movement,
// each wrapping so a long name never gets cut.
import type { ProposalSummary } from '../../shared/proposals/proposal';
import { STATUS_LABEL } from './proposal-wording';

const movement = (time: string) => new Date(time).toLocaleString();

/** Lists proposals as buttons that open one. */
export function ProposalList({ items, onOpen }: { items: ProposalSummary[]; onOpen: (id: string) => void }) {
  return (
    <ul className="proposal-list" aria-label="Proposals">
      {items.map(item => (
        <li key={item.id}>
          <button className="proposal-row" onClick={() => onOpen(item.id)}>
            <span className="proposal-name">{item.name}</span>
            <span className={`proposal-status status-${item.status}`}>{STATUS_LABEL[item.status]}</span>
            <small className="proposal-meta">{item.projects.map(project => project.name).join(', ')}</small>
            <small className="proposal-meta">
              {item.contributors.length ? `Contributors: ${item.contributors.join(', ')}` : 'No contributions yet'} · Last moved {movement(item.lastMovementAt)}
            </small>
          </button>
        </li>
      ))}
    </ul>
  );
}
