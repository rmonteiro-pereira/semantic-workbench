/** Reviews public interface differences before writing an ontology's dependency manifest. */
import React, { useState } from 'react';
import { updateDependencies, type DependencyChange, type DependencyPreview } from './api';

/** Describes changed concepts and leaves compatibility to the author. */
export function InterfaceChange({ change }: { change: DependencyChange }) {
  const groups = [
    { label: 'Added', concepts: change.added },
    { label: 'Removed', concepts: change.removed },
    { label: 'Changed', concepts: change.changed },
  ];
  return (
    <li>
      <strong>
        {change.project} / {change.ontology}
      </strong>
      {groups.every(group => !group.concepts.length) && <p>No public concepts changed.</p>}
      {groups
        .filter(group => group.concepts.length)
        .map(group => (
          <p key={group.label}>
            {group.label} · {group.concepts.join(', ')}
          </p>
        ))}
      <p>Compatibility {change.compatibility}</p>
    </li>
  );
}

/** Shows preview results and requires explicit confirmation before saving the lock. */
export function DependencyUpdate({ project, baseHash, onUpdated }: { project: string; baseHash: string | null; onUpdated: () => void }) {
  const [preview, setPreview] = useState<DependencyPreview>();
  const [error, setError] = useState('');
  const [working, setWorking] = useState(false);

  async function update(confirm?: string) {
    setWorking(true);
    setError('');
    try {
      const next = await updateDependencies(project, baseHash, confirm);
      setPreview(next);
      if (confirm) onUpdated();
    } catch (failure) {
      setPreview(undefined);
      setError((failure as Error).message);
    } finally {
      setWorking(false);
    }
  }

  return (
    <div aria-label="Dependency update">
      <button disabled={working} type="button" onClick={() => void update()}>
        Update dependencies
      </button>
      {working && <p role="status">Checking dependency versions…</p>}
      {error && <p role="alert">{error}</p>}
      {preview && (
        <>
          <ul className="mesh-import-list">
            {preview.changes.map(change => (
              <InterfaceChange key={JSON.stringify([change.project, change.ontology])} change={change} />
            ))}
          </ul>
          <button disabled={working} type="button" onClick={() => void update(preview.preview)}>
            Save dependency manifest
          </button>
          <button disabled={working} type="button" onClick={() => setPreview(undefined)}>
            Cancel
          </button>
        </>
      )}
    </div>
  );
}
