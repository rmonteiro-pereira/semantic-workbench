// Appends whitelisted decision records to durable, independently chained monthly files.
import {
  mkdirSync,
  readdirSync,
  readFileSync,
  existsSync,
  openSync,
  writeSync,
  fsyncSync,
  closeSync,
  unlinkSync,
} from 'node:fs';
import { join } from 'node:path';
import { sha256 } from '../projects/atomic';
import type { ResourceRef } from './resource';

/** The public fields accepted by the audit boundary; unknown fields are discarded. */
export type AuditInput = {
  requestId: string;
  principal: { id: string; kind: string; name?: string; clientId?: string; [key: string]: unknown };
  action: string;
  resource: { type: string; [key: string]: unknown };
  decision: 'allow' | 'deny';
  rules: string[];
  reason?: string;
  outcome?: 'ok' | 'failed' | 'refused' | 'degraded';
  snapshot?: {
    grants: string[];
    roles: string[];
    groups: string[];
    emailMatched: boolean;
    resourceAttrs: Record<string, unknown>;
  };
  version?: string;
  [key: string]: unknown;
};
/** A stored record including its UTC timestamp and previous-line digest. */
export type AuditEntry = AuditInput & { type: 'audit'; at: string; prev: string };
/** Synchronous durable audit operations used by request middleware. */
export type AuditLog = ReturnType<typeof createAuditLog>;

function pick(value: Record<string, unknown>, keys: string[]) {
  return Object.fromEntries(
    keys.filter(key => value[key] !== undefined).map(key => [key, value[key]]),
  );
}
const resourceKeys = [
  'type',
  'project',
  'path',
  'branch',
  'metric',
  'entry',
  'area',
  'role',
  'grant',
];
function record(input: AuditInput, at: string, prev: string): AuditEntry {
  const entry = {
    ...pick(input, ['requestId', 'action', 'decision', 'rules', 'reason', 'outcome', 'version']),
    type: 'audit',
    at,
    prev,
    principal: pick(input.principal, ['id', 'kind', 'name', 'clientId']),
    resource: pick(input.resource, resourceKeys),
  } as AuditEntry;
  if (input.snapshot) {
    entry.snapshot = {
      grants: [...input.snapshot.grants],
      roles: [...input.snapshot.roles],
      groups: [...input.snapshot.groups],
      emailMatched: input.snapshot.emailMatched,
      resourceAttrs: pick(input.snapshot.resourceAttrs, [
        ...resourceKeys,
        'domain',
        'docType',
        'level',
        'protectedLevel',
        'protectedBranch',
      ]),
    };
  }
  return entry;
}

/** Opens an audit directory, pruning only months entirely beyond the retention window. */
export function createAuditLog(options: {
  dir: string;
  mirror?: (line: string) => void;
  retentionDays?: number;
  now?: () => Date;
}) {
  const now = options.now ?? (() => new Date());
  mkdirSync(options.dir, { recursive: true });
  function lines(month: string): string[] {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('Invalid audit month.');
    const path = join(options.dir, `${month}.jsonl`);
    if (!existsSync(path)) return [];
    return readFileSync(path, 'utf8').trimEnd().split('\n').filter(Boolean);
  }
  function prune(): string[] {
    const cutoff = now().getTime() - (options.retentionDays ?? 400) * 86_400_000;
    const removed: string[] = [];
    for (const name of readdirSync(options.dir).sort()) {
      const match = /^(\d{4})-(0[1-9]|1[0-2])\.jsonl$/.exec(name);
      if (!match || Date.UTC(Number(match[1]), Number(match[2]), 1) > cutoff) continue;
      unlinkSync(join(options.dir, name));
      removed.push(name);
    }
    return removed;
  }
  let chain = { month: '', lastHash: '0'.repeat(64) };
  function append(input: AuditInput): AuditEntry {
    const at = now().toISOString();
    const month = at.slice(0, 7);
    if (chain.month !== month) {
      const previous = lines(month).at(-1);
      chain = { month, lastHash: previous === undefined ? '0'.repeat(64) : sha256(previous) };
    }
    const entry = record(input, at, chain.lastHash);
    const line = JSON.stringify(entry) + '\n';
    const descriptor = openSync(join(options.dir, `${month}.jsonl`), 'a', 0o600);
    try {
      const bytes = Buffer.from(line);
      let offset = 0;
      while (offset < bytes.length) offset += writeSync(descriptor, bytes, offset);
      fsyncSync(descriptor);
    } finally {
      closeSync(descriptor);
    }
    chain.lastHash = sha256(line.slice(0, -1));
    options.mirror?.(line);
    return entry;
  }
  function entries(month: string): AuditEntry[] {
    return lines(month).map(line => JSON.parse(line));
  }
  /** Stored months in ascending order, such as `2026-10`. */
  function months(): string[] {
    return readdirSync(options.dir)
      .filter(name => /^\d{4}-\d{2}\.jsonl$/.test(name))
      .map(name => name.slice(0, 7))
      .sort();
  }
  /**
   * The newest `limit` records that `keep` accepts, oldest first. Month files are read from the
   * newest backwards and reading stops once enough records are found.
   */
  function recent(limit: number, keep: (entry: AuditEntry) => boolean = () => true) {
    let found: AuditEntry[] = [];
    for (const month of months().reverse()) {
      found = [...entries(month).filter(keep), ...found];
      if (found.length >= limit) break;
    }
    return found.slice(-limit);
  }
  /** Records of the months from `from` through `to` (ISO times); other months are not read. */
  function between(from: string, to?: string): AuditEntry[] {
    const first = from.slice(0, 7);
    const last = to?.slice(0, 7);
    const inRange = (month: string) => month >= first && (last === undefined || month <= last);
    return months().filter(inRange).flatMap(entries);
  }
  prune();
  return { append, recent, between, prune, entries };
}

/** What an operator needs to find an operation whose audit record could not be written. */
export type AuditFailure = {
  requestId: string;
  action: string;
  /** The administration version the operation committed, when it made one. */
  version?: string;
  error: unknown;
};
/**
 * Writes one JSON line to stderr when an audit append fails after the operation already ran.
 * Such an operation cannot be undone, so the failure is logged for the operator instead.
 */
export function reportAuditFailure(failure: AuditFailure): void {
  const reason = failure.error instanceof Error ? failure.error.message : String(failure.error);
  const line = {
    type: 'audit-failure',
    at: new Date().toISOString(),
    requestId: failure.requestId,
    action: failure.action,
    ...(failure.version === undefined ? {} : { version: failure.version }),
    reason,
  };
  console.error(JSON.stringify(line));
}

/** The part of a request scope that decides which audit records are readable. */
type AuditScope = {
  authorize(action: 'readAudit' | 'read', resource: ResourceRef): { allow: boolean };
};
/** Projects whose audit records the request may read: a Steward's domains, or every project. */
export function auditableProjects(scope: AuditScope, projects: string[]): Set<string> {
  return new Set(
    projects.filter(project => scope.authorize('readAudit', { type: 'project', project }).allow),
  );
}

/**
 * True when the caller may see the resource an entry names. A restricted path stays hidden from a
 * Steward who cannot read it, because the record names the file and who opened it.
 */
function readableResource(entry: AuditEntry, scope: AuditScope): boolean {
  const { project, path } = entry.resource;
  if (typeof path !== 'string' || typeof project !== 'string') return true;
  return scope.authorize('read', { type: 'file', project, path }).allow;
}

/**
 * Selects audit entries the caller may read. `projects` is null for an Admin, who reads every
 * project's records; anyone else reads only the projects listed.
 */
export function queryAudit(
  entries: AuditEntry[],
  filters: Record<string, string>,
  access: { scope: AuditScope; projects: Set<string> | null },
) {
  const { scope, projects } = access;
  return entries.filter(entry => {
    if (projects && !projects.has(String(entry.resource.project ?? ''))) return false;
    if (!readableResource(entry, scope)) return false;
    if (filters.principal && entry.principal.id !== filters.principal) return false;
    if (filters.action && entry.action !== filters.action) return false;
    if (filters.project && entry.resource.project !== filters.project) return false;
    if (filters.decision && entry.decision !== filters.decision) return false;
    if (filters.from && entry.at < filters.from) return false;
    if (filters.to && entry.at > filters.to) return false;
    return true;
  });
}

/** Encodes filtered records for download without allowing spreadsheet formula execution. */
export function exportAudit(entries: AuditEntry[], format: 'csv' | 'jsonl'): string {
  if (format === 'jsonl') return entries.map(entry => JSON.stringify(entry) + '\n').join('');
  const keys = [
    'at',
    'requestId',
    'principal',
    'action',
    'resource',
    'decision',
    'outcome',
    'rules',
  ];
  const cell = (value: unknown) => {
    let text = typeof value === 'string' ? value : JSON.stringify(value ?? '');
    if (/^[=+@\-\t\r]/.test(text)) text = "'" + text;
    return '"' + text.replaceAll('"', '""') + '"';
  };
  return (
    [keys.join(','), ...entries.map(entry => keys.map(key => cell(entry[key])).join(','))].join(
      '\r\n',
    ) + '\r\n'
  );
}
