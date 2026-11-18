import type { ItemChange } from '../../shared/item-diff/item-change';
import { ChangeMark } from './ChangeMark';
import type { ComparisonState } from './use-item-diff';

function groupsOf(changes: ItemChange[]) {
  const groups = new Map<string, ItemChange[]>();
  for (const change of changes) {
    const group = groups.get(change.kind);
    if (group) group.push(change);
    else groups.set(change.kind, [change]);
  }
  return [...groups].sort(([left], [right]) => left.localeCompare(right));
}

function ChangeRow({ change }: { change: ItemChange }) {
  return (
    <li className="item-change-surface">
      <strong>{change.name}</strong>
      <ChangeMark change={change.state} />
      {change.ambiguous > 1 && <p>{change.ambiguous} items share this address and could not be matched.</p>}
      {change.previousAddress && <p>Previous address: {change.previousAddress}</p>}
      {change.fields.length > 0 && (
        <dl>
          {change.fields.map(field => (
            <div key={field.field}>
              <dt>{field.field}</dt>
              <dd>Before: {field.before}</dd>
              <dd>After: {field.after}</dd>
            </div>
          ))}
        </dl>
      )}
    </li>
  );
}

/** Lists bounded changes and explains anything the comparison could not show. */
export function ChangeList({ result, onRetry }: { result: ComparisonState; onRetry: () => void }) {
  if (result.state === 'off') return <p>Turn on Unpublished work to compare saved items.</p>;
  if (result.state === 'loading') return <p role="status">Comparing saved items.</p>;
  if (result.state === 'error') {
    return (
      <div role="alert">
        <p>{result.message}</p>
        <button type="button" onClick={onRetry}>
          Try again
        </button>
      </div>
    );
  }
  if (!('diff' in result)) return null;
  if (result.state === 'empty') return <p>No unpublished item changes.</p>;
  const { changes, omitted, notCompared } = result.diff;
  return (
    <div className="item-change-list">
      {groupsOf(changes).map(([kind, items]) => (
        <section key={kind}>
          <h3>
            {kind.replaceAll('-', ' ')} ({items.length})
          </h3>
          <ul>
            {items.map(change => (
              <ChangeRow key={change.state + change.address} change={change} />
            ))}
          </ul>
        </section>
      ))}
      {omitted > 0 && <p>{omitted} more items are not shown.</p>}
      {notCompared.length > 0 && (
        <section>
          <h3>Files not compared</h3>
          <ul>
            {notCompared.map(file => (
              <li key={file.side + file.path}>
                {file.path} ({file.side === 'from' ? 'earlier side' : 'later side'}). {file.reason}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
