/** Dialog for moving entities between groups; corrections live in workspace state, not files. */
import { useState } from 'react';
import { Modal } from '../projects/Modal';
import type { modelOverview, GroupingOptions } from './overview';

type Overview = ReturnType<typeof modelOverview>;
type Props = {
  overview: Overview;
  value: GroupingOptions;
  onChange: (next: GroupingOptions) => void;
  onClose: () => void;
};

const firstId = <T extends { id: string }>(items: T[], wanted: string) => (items.some(item => item.id === wanted) ? wanted : (items[0]?.id ?? ''));

/** Lists the current groups and moves one entity at a time to another or a new group. */
export function AdjustGroupingDialog({ overview, value, onChange, onClose }: Props) {
  const [entity, setEntity] = useState('');
  const [group, setGroup] = useState('');
  const [newName, setNewName] = useState('');
  const selected = firstId(overview.entities, entity);
  const destination = firstId(overview.groups, group);
  const corrections = Object.entries(value.assignments ?? {});
  const entityName = new Map(overview.entities.map(e => [e.id, e.name]));
  const groupName = new Map(overview.groups.map(g => [g.id, g.name]));

  function applyCorrection() {
    const title = newName.trim();
    const id = title ? 'custom:' + title : destination;
    onChange({
      ...value,
      assignments: { ...value.assignments, [selected]: id },
      // Keep the current names so a group keeps its name after its anchor entity moves away.
      names: {
        ...Object.fromEntries(overview.groups.map(g => [g.id, g.name])),
        ...value.names,
        ...(title ? { [id]: title } : {}),
      },
    });
    setNewName('');
  }

  function resetCorrections() {
    onChange({ mode: value.mode });
  }

  const footer = (
    <>
      <button type="button" disabled={!corrections.length} onClick={resetCorrections}>
        Reset grouping corrections
      </button>
      <span className="dialog-footer-spacer" />
      <button type="button" onClick={onClose}>
        Close
      </button>
      <button type="button" className="primary" disabled={!selected || (!destination && !newName.trim())} onClick={applyCorrection}>
        Apply grouping correction
      </button>
    </>
  );

  return (
    <Modal title="Adjust grouping" onCancel={onClose} footer={footer} className="adjust-grouping">
      <p className="adjust-grouping-intro">Corrections are saved with this document’s view in the workbench’s state folder, not in the file. Export keeps the original definition.</p>
      <div className="adjust-grouping-form">
        <label>
          <span>Entity</span>
          <select aria-label="Entity to regroup" value={selected} onChange={e => setEntity(e.target.value)}>
            {overview.entities.map(e => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Move to</span>
          <select aria-label="Move to group" value={destination} onChange={e => setGroup(e.target.value)}>
            {overview.groups.map(g => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Or create</span>
          <input aria-label="New group name" placeholder="New group name" maxLength={100} value={newName} onChange={e => setNewName(e.target.value)} />
        </label>
      </div>
      <h3>Groups</h3>
      <ul className="adjust-grouping-groups" aria-label="Current groups">
        {overview.groups.map(g => (
          <li key={g.id}>
            <span className="group-swatch" style={{ background: g.color }} aria-hidden="true" />
            <span className="group-name">{g.name}</span>
            <small>
              {g.entities.length} {g.entities.length === 1 ? 'entity' : 'entities'}
            </small>
          </li>
        ))}
      </ul>
      {corrections.length > 0 && (
        <>
          <h3>Corrections</h3>
          <ul className="adjust-grouping-corrections" aria-label="Grouping corrections">
            {corrections.map(([id, target]) => (
              <li key={id}>
                {entityName.get(id) ?? id} → {value.names?.[target] ?? groupName.get(target) ?? target}
              </li>
            ))}
          </ul>
        </>
      )}
    </Modal>
  );
}
