/** Loads what the agent API returns for one concept of a mapping. */
import { useEffect, useState } from 'react';
import type { RuntimeContext } from '../../server/agent/runtime';
import { apiFetch } from '../projects/api';
import { agentContextPath } from './agent-paths';

type Loaded = { key: string; context?: RuntimeContext; error?: string };

/**
 * Returns the context the agent API gives for the concept, or the whole mapping when no concept is
 * selected. The answer is null while the request is in flight, so the page never shows another
 * concept's data under this concept's name.
 */
export function useConceptContext(project: string, mappingId: string, concept: string, whole: RuntimeContext, revisionKey: string) {
  const key = `${mappingId}|${concept}|${revisionKey}`;
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  useEffect(() => {
    if (!concept) return;
    const abort = new AbortController();
    apiFetch(agentContextPath(project, mappingId, concept), { signal: abort.signal })
      .then(async response => {
        const body = await response.json();
        if (!response.ok) throw Error(body.error);
        setLoaded({ key, context: body });
      })
      .catch(error => {
        if (error.name !== 'AbortError') setLoaded({ key, error: error.message });
      });
    return () => abort.abort();
  }, [project, mappingId, concept, revisionKey]);
  if (!concept) return { context: whole, error: '' };
  if (loaded?.key !== key) return { context: null, error: '' };
  return { context: loaded.context ?? null, error: loaded.error ?? '' };
}
