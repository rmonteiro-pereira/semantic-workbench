/** Loads what the agent API returns for one concept of a mapping. */
import { useEffect, useState } from 'react';
import type { SelectedContext } from '../../server/agent/runtime';
import { api } from '../projects/api';

type Loaded = { key: string; context?: SelectedContext; error?: string };

/**
 * Returns the context the agent API gives for the concept, or the whole mapping when no concept is
 * selected. The answer is null while the request is in flight, so the page never shows another
 * concept's data under this concept's name.
 */
export function useConceptContext(project: string, mappingId: string, concept: string, whole: SelectedContext, revisionKey: string) {
  const key = `${mappingId}|${concept}|${revisionKey}`;
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  useEffect(() => {
    if (!concept) return;
    const abort = new AbortController();
    api
      .agentContext(project, mappingId, concept, abort.signal)
      .then(context => setLoaded({ key, context }))
      .catch(error => {
        if (error.name !== 'AbortError') setLoaded({ key, error: error.message });
      });
    return () => abort.abort();
  }, [project, mappingId, concept, revisionKey]);
  if (!concept) return { context: whole, error: '' };
  if (loaded?.key !== key) return { context: null, error: '' };
  return { context: loaded.context ?? null, error: loaded.error ?? '' };
}
