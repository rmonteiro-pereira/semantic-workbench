import type { CloneEvent } from '../projects/api';

/** What a finished clone says about the definitions it brought, without overstating validity. */
export function definitionsSummary(event: Extract<CloneEvent, { phase: 'done' }>): string {
  if (!event.hasCommits) return 'Repository cloned; no commits or definitions yet.';
  if (event.definitions === 0) return 'Repository cloned; no definitions yet.';
  return 'Every definition file is valid.';
}
