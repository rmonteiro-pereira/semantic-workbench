/** Read-only status of usage counters for the Admin Settings page. */
import { useEffect, useState } from 'react';
import { api } from '../projects/api';
import type { UsageAnswer } from '../../server/usage/usage-read';
import { periodWords } from './usage-wording';

/** What the page knows about the counters. `unknown` means no project exists to ask about. */
export type CountersState = { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'unknown' } | { kind: 'known'; counters: UsageAnswer['counters'] };

/** Reads the counter settings through the usage answer of the first project; they are the same for every project. */
export async function readCounters(): Promise<CountersState> {
  const [first] = await api.projects();
  if (!first) return { kind: 'unknown' };
  return { kind: 'known', counters: (await api.usage(first.slug)).counters };
}

/** The words for one state. */
export function CountersSummary({ state }: { state: CountersState }) {
  if (state.kind === 'loading') return <p role="status">Reading the state of usage counters</p>;
  if (state.kind === 'error') return <p role="alert">{`Usage counters: ${state.message}`}</p>;
  if (state.kind === 'unknown') return <p>The state of usage counters shows once a project exists.</p>;
  if (!state.counters.enabled) return <p>Usage counters are off. An operator turns them on with SW_USAGE_COUNTERS.</p>;
  return (
    <p>{`Usage counters are on. They count requests through this workbench and keep counts for ${periodWords(state.counters.retentionDays ?? 30)}. An operator sets this with SW_USAGE_RETENTION_DAYS.`}</p>
  );
}

/** Loads and shows the counter status; it changes nothing. */
export function UsageCountersStatus() {
  const [state, setState] = useState<CountersState>({ kind: 'loading' });
  useEffect(() => {
    let active = true;
    readCounters().then(
      value => active && setState(value),
      problem => active && setState({ kind: 'error', message: problem instanceof Error ? problem.message : 'could not be read.' }),
    );
    return () => {
      active = false;
    };
  }, []);
  return (
    <section aria-label="Usage counters">
      <h3>Usage counters</h3>
      <CountersSummary state={state} />
    </section>
  );
}
