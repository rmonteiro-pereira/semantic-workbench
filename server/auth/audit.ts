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
  prune();
  return {
    append,
    prune,
    entries: (month: string): AuditEntry[] => lines(month).map(line => JSON.parse(line)),
  };
}
