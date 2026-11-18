// The durable record of each connection: one JSON file per connection, written atomically, with an in-memory index by the hash of each token. A record holds hashes only, so a copy of the folder proves nothing to a program.
import { existsSync, readdirSync, readFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { atomicWriteJson } from '../projects/atomic';
import { log } from '../observability/log';
import type { ConnectionOrigin } from './pending-grants';
import type { Scope } from './scopes';

/** Why a connection ended. */
export const END_REASONS = [
  'session-ended',
  'signed-out',
  'expired',
  'deactivated',
  'no-access',
  'revoked-by-person',
  'revoked-by-admin',
  'program-removed',
  'scope-removed',
  'replay',
  'code-reuse',
] as const;
export type EndReason = (typeof END_REASONS)[number];

/** How many retired refresh hashes a connection remembers. Assumed: it covers a client that retries a few times after a crash. */
export const RETIRED_REFRESH_LIMIT = 8;
/** How long an ended record stays listed. Assumed: a week matches the retention of tool-call receipts. */
export const ENDED_RETENTION_MS = 7 * 24 * 3_600_000;

/** What is written to `state/connections/<id>.json`. Nothing here can be used as a credential. */
export type ConnectionRecord = {
  formatVersion: 1;
  id: string;
  person: string;
  personName: string;
  clientId: string;
  programName: string;
  scopes: Scope[];
  resource: string;
  origin: ConnectionOrigin;
  sessionReference: string;
  createdAt: number;
  lastUsedAt: number;
  access: { hash: string; expiresAt: number } | null;
  refresh: string | null;
  retiredRefresh: string[];
  generation: number;
  state: 'active' | 'ended';
  endedAt?: number;
  endReason?: EndReason;
};

const ID_PATTERN = /^[A-Za-z0-9_-]{22}$/;

function isConnectionRecord(value: unknown): value is ConnectionRecord {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  const texts = ['id', 'person', 'personName', 'clientId', 'programName', 'resource', 'sessionReference'];
  return (
    record.formatVersion === 1 &&
    texts.every(name => typeof record[name] === 'string') &&
    ID_PATTERN.test(record.id as string) &&
    Array.isArray(record.scopes) &&
    Array.isArray(record.retiredRefresh) &&
    (record.origin === 'mcp' || record.origin === 'acp') &&
    (record.state === 'active' || record.state === 'ended') &&
    Number.isFinite(record.createdAt) &&
    Number.isFinite(record.lastUsedAt) &&
    Number.isFinite(record.generation)
  );
}

/** Opens the store and reads every record once. A file that cannot be read or has another format version is left alone and logged by name. */
export function openConnectionStore(directory: string) {
  const records = new Map<string, ConnectionRecord>();
  const byAccess = new Map<string, string>();
  const byRefresh = new Map<string, string>();
  const byRetired = new Map<string, string>();
  const fileOf = (id: string) => join(directory, `${id}.json`);

  function indexRecord(record: ConnectionRecord) {
    if (record.access) byAccess.set(record.access.hash, record.id);
    if (record.refresh) byRefresh.set(record.refresh, record.id);
    for (const hash of record.retiredRefresh) byRetired.set(hash, record.id);
  }
  function unindexRecord(record: ConnectionRecord) {
    if (record.access) byAccess.delete(record.access.hash);
    if (record.refresh) byRefresh.delete(record.refresh);
    for (const hash of record.retiredRefresh) byRetired.delete(hash);
  }
  function load() {
    if (!existsSync(directory)) return;
    for (const name of readdirSync(directory)) {
      if (!name.endsWith('.json') || !ID_PATTERN.test(name.slice(0, -5))) continue;
      try {
        const value: unknown = JSON.parse(readFileSync(join(directory, name), 'utf8'));
        if (!isConnectionRecord(value) || value.id !== name.slice(0, -5)) throw new Error('unsupported record');
        records.set(value.id, value);
        indexRecord(value);
      } catch {
        log.warn('connections.record-ignored', { file: name });
      }
    }
  }
  load();

  const lookup = (index: Map<string, string>, hash: string) => {
    const id = index.get(hash);
    return id ? records.get(id) : undefined;
  };
  return {
    /** Writes a record and replaces its index entries. The caller passes a changed copy, never the stored object. */
    save(record: ConnectionRecord): void {
      const previous = records.get(record.id);
      atomicWriteJson(fileOf(record.id), record);
      if (previous) unindexRecord(previous);
      records.set(record.id, structuredClone(record));
      indexRecord(record);
    },
    get: (id: string) => records.get(id),
    byAccessHash: (hash: string) => lookup(byAccess, hash),
    byRefreshHash: (hash: string) => lookup(byRefresh, hash),
    byRetiredHash: (hash: string) => lookup(byRetired, hash),
    all: () => [...records.values()],
    /** Removes ended records older than the retention. Returns how many were removed. */
    removeEndedBefore(time: number): number {
      let removed = 0;
      for (const record of [...records.values()]) {
        if (record.state !== 'ended' || (record.endedAt ?? 0) > time) continue;
        unindexRecord(record);
        records.delete(record.id);
        if (existsSync(fileOf(record.id))) unlinkSync(fileOf(record.id));
        removed += 1;
      }
      return removed;
    },
  };
}

export type ConnectionStore = ReturnType<typeof openConnectionStore>;
