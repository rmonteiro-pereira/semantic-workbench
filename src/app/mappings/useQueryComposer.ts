/** The state behind the query composer of one mapping: the choices, and the SQL plan the server previews. */
import { useRef, useState } from 'react';
import { apiFetch } from '../projects/api';

type Plan = { sql: string } & Record<string, unknown>;

/** Holds the chosen metrics and group-by fields and asks the server for an unexecuted plan. */
export function useQueryComposer(project: string, mappingId: string, concept: string) {
  const requestVersion = useRef(0);
  const [metrics, setMetrics] = useState<string[]>([]);
  const [dimensions, setDimensions] = useState<string[]>([]);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  function clearPlan() {
    requestVersion.current++;
    setLoading(false);
    setPlan(null);
    setError('');
  }

  /** Forgets the choices, as when another concept is opened. */
  function reset() {
    clearPlan();
    setMetrics([]);
    setDimensions([]);
  }

  function toggle(id: string, chosen: string[], set: (next: string[]) => void) {
    clearPlan();
    set(chosen.includes(id) ? chosen.filter(value => value !== id) : [...chosen, id]);
  }

  async function preview() {
    const version = ++requestVersion.current;
    setLoading(true);
    setError('');
    setPlan(null);
    try {
      const response = await apiFetch('/api/agent/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project, mappingId, concepts: concept ? [concept] : [], metrics, dimensions }),
      });
      const data = await response.json();
      if (!response.ok) throw Error(data.error);
      if (version === requestVersion.current) setPlan(data);
    } catch (failure) {
      if (version === requestVersion.current) setError((failure as Error).message);
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
  }

  return {
    metrics,
    dimensions,
    plan,
    error,
    loading,
    reset,
    toggleMetric: (id: string) => toggle(id, metrics, setMetrics),
    toggleDimension: (id: string) => toggle(id, dimensions, setDimensions),
    preview,
  };
}
