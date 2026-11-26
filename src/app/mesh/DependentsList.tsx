/** Lists the published projects that use an ontology, for its publishers. */
import { useEffect, useState } from 'react';
import { readDependents, type DependentView } from './api';
import type { MeshRead } from './use-mesh';

/** Renders text descriptions of the list's loading, failure and completed states. */
export function DependentsContent({ state }: { state: MeshRead<DependentView[]> }) {
  if (state.status === 'loading') return <p role="status">Loading published dependents</p>;
  if (state.status === 'error') return <p role="alert">{state.message}</p>;
  if (!state.value.length) return <p>No published project imports this ontology.</p>;
  return (
    <ul className="mesh-import-list">
      {state.value.map((entry, index) => (
        <li key={index}>
          <strong>{entry.name}</strong>
          <div>{entry.domain ?? 'No domain'}</div>
          <div>{entry.items.join(', ')}</div>
          <div>Version {entry.version}</div>
        </li>
      ))}
    </ul>
  );
}

/** Reads cursor pages while the publisher has the disclosure panel open. */
export function DependentsList({ project }: { project: string }) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<MeshRead<DependentView[]>>({ status: 'loading' });
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    readDependents(project, controller.signal)
      .then(value => {
        if (!controller.signal.aborted) setState({ status: 'ready', value });
      })
      .catch(error => {
        if (!controller.signal.aborted) setState({ status: 'error', message: (error as Error).message });
      });
    return () => controller.abort();
  }, [open, project]);

  function toggle() {
    setState({ status: 'loading' });
    setOpen(!open);
  }
  return (
    <section className="mesh-imports" aria-label="Used by">
      <button type="button" aria-expanded={open} onClick={toggle}>
        Used by
      </button>
      {open && <DependentsContent state={state} />}
    </section>
  );
}
