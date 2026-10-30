/** Shows the context the agent API returns for the selected concept, fetched from that API. */
import { useEffect, useState } from 'react';
import { apiFetch } from '../projects/api';
import type { RuntimeContext } from '../../server/agent/runtime';
import { agentContextPath } from './agent-paths';

type Props = {
  project: string;
  mappingId: string;
  concept: string;
  revisionKey: string | number;
  /** The whole-mapping context the tab already loaded; it is what the API returns without a concept. */
  fullContext: RuntimeContext;
};

/** Renders the "AI context" disclosure; it asks the server only once opened and only for a selected concept. */
export function AiContextPanel({ project, mappingId, concept, revisionKey, fullContext }: Props) {
  const [open, setOpen] = useState(false);
  const [narrowed, setNarrowed] = useState<RuntimeContext | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setNarrowed(null);
    setError('');
    if (!open || !concept) return;
    const abort = new AbortController();
    apiFetch(agentContextPath(project, mappingId, concept), { signal: abort.signal })
      .then(async response => {
        const body = await response.json();
        if (!response.ok) throw Error(body.error || `The agent context could not be loaded (HTTP ${response.status}).`);
        setNarrowed(body);
      })
      .catch(failure => {
        if (failure.name !== 'AbortError') setError(failure.message);
      });
    return () => abort.abort();
  }, [open, project, mappingId, concept, revisionKey]);

  const shown = concept ? narrowed : fullContext;
  return (
    <details onToggle={event => setOpen(event.currentTarget.open)}>
      <summary>AI context · the metadata an agent receives</summary>
      {error && (
        <p role="alert" className="mapping-error">
          {error}
        </p>
      )}
      {open && !shown && !error && <p role="status">Loading the context…</p>}
      {open && shown && <pre>{JSON.stringify(shown, null, 2)}</pre>}
    </details>
  );
}
