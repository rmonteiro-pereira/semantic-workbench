// High-volume transport reads have a separate bounded replay sample.
import type { AuditEntry, AuditLog } from './audit';
import { isAction, READ_ACTIONS } from '../../shared/auth/actions';

/** Maximum ordinary audit snapshots retained for dry-run replay. */
export const MAX_AUDIT_SNAPSHOTS = 1000;
/** Maximum distinct non-HTTP read snapshots retained for dry-run replay. */
export const MAX_READ_SNAPSHOTS = 500;

/** Whether a stored record contains a policy action and the identity/resource snapshot to replay. */
export function isReplayable(entry: AuditEntry): boolean {
  return Boolean(entry.snapshot) && isAction(entry.action);
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, canonical(item)]),
  );
}

function readKey(entry: AuditEntry): string {
  const snapshot = entry.snapshot!;
  return JSON.stringify(
    canonical([
      entry.principal.id,
      entry.principal.kind,
      entry.principal.clientId,
      entry.action,
      { ...snapshot, grants: [...snapshot.grants].sort(), roles: [...snapshot.roles].sort(), groups: [...snapshot.groups].sort() },
    ]),
  );
}

function selection() {
  let ordinary = 0;
  const reads = new Set<string>();
  function keep(entry: AuditEntry): boolean {
    if (!isReplayable(entry)) return false;
    const read = entry.origin !== undefined && entry.origin !== 'http' && entry.decision === 'allow' && READ_ACTIONS.includes(entry.action as (typeof READ_ACTIONS)[number]);
    if (!read) {
      if (ordinary >= MAX_AUDIT_SNAPSHOTS) return false;
      ordinary++;
      return true;
    }
    if (reads.size >= MAX_READ_SNAPSHOTS) return false;
    const key = readKey(entry);
    if (reads.has(key)) return false;
    reads.add(key);
    return true;
  }
  return { keep, complete: () => ordinary >= MAX_AUDIT_SNAPSHOTS && reads.size >= MAX_READ_SNAPSHOTS };
}

/** Samples both replay strata in one backward scan, retaining chronological result order. */
export function replaySample(audit: AuditLog): AuditEntry[] {
  const selected = selection();
  return audit.recent(MAX_AUDIT_SNAPSHOTS + MAX_READ_SNAPSHOTS, selected.keep, selected.complete);
}

/** Applies the same strata to a caller-supplied audit history. */
export function sampleReplayEntries(entries: AuditEntry[]): AuditEntry[] {
  const selected = selection();
  const kept: AuditEntry[] = [];
  for (let index = entries.length - 1; index >= 0; index--) {
    if (selected.keep(entries[index])) kept.push(entries[index]);
    if (selected.complete()) break;
  }
  return kept.reverse();
}
