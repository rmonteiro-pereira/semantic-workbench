// Appends whitelisted decision records to durable monthly files that form one hash chain, and
// checks that chain.
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
  /** How many refusals of this kind from this source were left out since the last record. */
  suppressed?: number;
  [key: string]: unknown;
};
/** A stored record including its UTC timestamp and previous-line digest. */
export type AuditEntry = AuditInput & { type: 'audit'; at: string; prev: string };
const ZERO_HASH = '0'.repeat(64);

/** Written to the mirror when a month closes: the hash of that month's last record. */
export type AuditAnchor = { type: 'audit-anchor'; month: string; tail: string };

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
  if (input.suppressed) entry.suppressed = input.suppressed;
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
  let chain = { month: '', lastHash: ZERO_HASH };
  // The first record of a month continues the chain from the newest earlier month, so a month
  // file cannot be removed or replaced without breaking the link. The closed month's last hash
  // goes to the mirror, which keeps it where a person with the data folder cannot rewrite it.
  function startMonth(month: string) {
    const own = lines(month).at(-1);
    if (own !== undefined) return sha256(own);
    const earlier = months()
      .filter(stored => stored < month)
      .at(-1);
    const tail = earlier === undefined ? undefined : lines(earlier).at(-1);
    if (earlier === undefined || tail === undefined) return ZERO_HASH;
    const anchor: AuditAnchor = { type: 'audit-anchor', month: earlier, tail: sha256(tail) };
    options.mirror?.(JSON.stringify(anchor) + '\n');
    return anchor.tail;
  }
  function append(input: AuditInput): AuditEntry {
    const at = now().toISOString();
    const month = at.slice(0, 7);
    if (chain.month !== month) chain = { month, lastHash: startMonth(month) };
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

/** One stored month: its name, such as `2026-10`, and its record lines in order. */
export type StoredMonth = { month: string; lines: string[] };

/** Reads every month file of an audit folder in order, without pruning or changing anything. */
export function readStoredMonths(dir: string): StoredMonth[] {
  return readdirSync(dir)
    .filter(name => /^\d{4}-(0[1-9]|1[0-2])\.jsonl$/.test(name))
    .sort()
    .map(name => ({
      month: name.slice(0, 7),
      lines: readFileSync(join(dir, name), 'utf8').trimEnd().split('\n').filter(Boolean),
    }));
}

/** Where the chain stops being valid, and why. */
export type ChainBreak = {
  month: string;
  /** The 1-based line of the month's file; 0 when the whole month is the problem. */
  line: number;
  reason:
    | 'unreadable'
    | 'broken-link'
    | 'anchor-mismatch'
    | 'anchor-month-missing'
    | 'mirror-line-missing';
};

/** The outcome of checking a stored audit chain. */
export type ChainCheck =
  | { ok: true; records: number; months: number }
  | ({ ok: false } & ChainBreak);

/** Whether a line has the `prev` of the line before it; the first line of all is not checked. */
function linkBroken(line: string, previous: string | undefined): boolean {
  let entry: { prev?: unknown };
  try {
    entry = JSON.parse(line);
  } catch {
    return true;
  }
  return previous !== undefined && entry.prev !== sha256(previous);
}

/** Splits a copy of the mirrored output into its anchors and its audit records. */
export function parseMirror(text: string): { anchors: AuditAnchor[]; records: string[] } {
  const anchors: AuditAnchor[] = [];
  const records: string[] = [];
  for (const line of text.split('\n')) {
    if (line.includes('"audit-anchor"')) {
      try {
        const parsed = JSON.parse(line);
        if (parsed.type === 'audit-anchor') anchors.push(parsed);
      } catch {
        // Not an anchor: some other output that mentions the word.
      }
    } else if (line.startsWith('{"') && line.includes('"type":"audit"')) records.push(line);
  }
  return { anchors, records };
}

/** What the chain check compares the stored months with besides themselves. */
export type ChainChecks = {
  /** Lines the server mirrored; each of them must still be stored. */
  mirrored?: string[];
  /** The retention period in force, which decides which months must still exist. */
  retentionDays?: number;
  now?: Date;
};

/** The oldest month that retention still keeps, such as `2026-10`. */
export function oldestRetainedMonth(retentionDays = 400, now = new Date()): string {
  return new Date(now.getTime() - retentionDays * 86_400_000).toISOString().slice(0, 7);
}

function mirrorBreak(stored: StoredMonth[], mirrored: string[], oldest: string): ChainBreak | null {
  const known = new Set(stored.flatMap(item => item.lines.map(line => sha256(line))));
  for (const [index, line] of mirrored.entries()) {
    const month = /"at":"(\d{4}-\d{2})/.exec(line)?.[1];
    if (month === undefined || month < oldest) continue;
    if (!known.has(sha256(line.trimEnd()))) {
      return { month, line: index + 1, reason: 'mirror-line-missing' };
    }
  }
  return null;
}

/**
 * Checks that every record names the hash of the record before it, across month files; that each
 * anchor from the mirror matches the last record of its month and that its month still exists
 * when retention keeps it; and that every record the mirror saw is still stored. The first record
 * that retention left names a record that was pruned, so it cannot be checked.
 */
export function verifyAuditChain(
  stored: StoredMonth[],
  anchors: AuditAnchor[] = [],
  checks: ChainChecks = {},
): ChainCheck {
  const filled = stored.filter(item => item.lines.length > 0);
  let previous: string | undefined;
  let records = 0;
  for (const { month, lines } of filled) {
    for (const [index, line] of lines.entries()) {
      if (linkBroken(line, previous)) {
        const reason = isReadable(line) ? 'broken-link' : 'unreadable';
        return { ok: false, month, line: index + 1, reason };
      }
      previous = line;
      records++;
    }
  }
  const oldest = oldestRetainedMonth(checks.retentionDays, checks.now);
  for (const anchor of anchors) {
    const found = filled.find(item => item.month === anchor.month);
    if (!found && anchor.month >= oldest) {
      return { ok: false, month: anchor.month, line: 0, reason: 'anchor-month-missing' };
    }
    if (found && sha256(found.lines.at(-1)!) !== anchor.tail) {
      return {
        ok: false,
        month: anchor.month,
        line: found.lines.length,
        reason: 'anchor-mismatch',
      };
    }
  }
  const lost = mirrorBreak(stored, checks.mirrored ?? [], oldest);
  if (lost) return { ok: false, ...lost };
  return { ok: true, records, months: filled.length };
}

function isReadable(line: string): boolean {
  try {
    JSON.parse(line);
    return true;
  } catch {
    return false;
  }
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
