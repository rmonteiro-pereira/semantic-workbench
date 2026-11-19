/** The words people read for traffic: every number carries its unit and its period. */

/** What a count measures, as the server labels it. */
export const TRAFFIC_UNIT = 'requests through this workbench';

const OPERATION_WORDS: Record<string, string> = {
  'agent.context.read': 'context requests',
  'agent.plan': 'query plan requests',
  'metrics.explain': 'metric explanation requests',
};

/** Names an operation in words, falling back to its id for one this version does not know. */
export function operationWords(operation: string): string {
  return OPERATION_WORDS[operation] ?? operation;
}

/** "the last 30 days" or "the last day". */
export function periodWords(days: number): string {
  return days === 1 ? 'the last day' : `the last ${days} days`;
}

/** A count with its unit and period, for example "1,200 requests through this workbench in the last 30 days". */
export function countWords(count: number, days: number): string {
  const noun = count === 1 ? 'request through this workbench' : TRAFFIC_UNIT;
  return `${count.toLocaleString('en-US')} ${noun} in ${periodWords(days)}`;
}

/** The split of a count by operation, in words: "31 context requests, 9 query plan requests". */
export function splitWords(byOperation: Record<string, number>): string {
  return Object.entries(byOperation)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([operation, count]) => `${count.toLocaleString('en-US')} ${operationWords(operation)}`)
    .join(', ');
}
