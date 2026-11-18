// Checks the durable store: writing, reloading after a restart, the index by hash, retention and files that must be ignored.
import { afterEach, expect, spyOn, test } from 'bun:test';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ENDED_RETENTION_MS, openConnectionStore, type ConnectionRecord } from '../../src/server/connections/connection-store';
import { log } from '../../src/server/observability/log';

const roots: string[] = [];
afterEach(() => {
  while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true });
});

function temporaryDirectory() {
  const root = mkdtempSync(join(tmpdir(), 'connections-'));
  roots.push(root);
  return join(root, 'connections');
}

function record(id: string, change: Partial<ConnectionRecord> = {}): ConnectionRecord {
  return {
    formatVersion: 1,
    id,
    person: 'alice',
    personName: 'Alice',
    clientId: 'client-one',
    programName: 'Client one',
    scopes: ['read'],
    resource: 'https://wb.example/api/mcp',
    origin: 'mcp',
    sessionReference: 'reference',
    createdAt: 1,
    lastUsedAt: 1,
    access: { hash: `access-${id}`, expiresAt: 100 },
    refresh: `refresh-${id}`,
    retiredRefresh: [`retired-${id}`],
    generation: 0,
    state: 'active',
    ...change,
  };
}

const first = 'A'.repeat(22);
const second = 'B'.repeat(22);

test('a saved record is found by each hash and survives a restart', () => {
  const directory = temporaryDirectory();
  const store = openConnectionStore(directory);
  store.save(record(first));
  expect(store.byAccessHash(`access-${first}`)?.id).toBe(first);
  expect(store.byRefreshHash(`refresh-${first}`)?.id).toBe(first);
  expect(store.byRetiredHash(`retired-${first}`)?.id).toBe(first);
  expect(store.byAccessHash('other')).toBeUndefined();
  const reopened = openConnectionStore(directory);
  expect(reopened.get(first)?.person).toBe('alice');
  expect(reopened.byRefreshHash(`refresh-${first}`)?.id).toBe(first);
});

test('replacing a record removes its old hashes from the index', () => {
  const store = openConnectionStore(temporaryDirectory());
  store.save(record(first));
  store.save(record(first, { access: { hash: 'new-access', expiresAt: 200 }, refresh: 'new-refresh', retiredRefresh: [`refresh-${first}`] }));
  expect(store.byAccessHash(`access-${first}`)).toBeUndefined();
  expect(store.byRefreshHash(`refresh-${first}`)).toBeUndefined();
  expect(store.byRetiredHash(`refresh-${first}`)?.id).toBe(first);
  expect(store.byAccessHash('new-access')?.id).toBe(first);
});

test('the file holds hashes and never a token value', () => {
  const directory = temporaryDirectory();
  openConnectionStore(directory).save(record(first));
  const text = readFileSync(join(directory, `${first}.json`), 'utf8');
  expect(text).toContain(`access-${first}`);
  expect(readdirSync(directory)).toEqual([`${first}.json`]);
});

test('ended records are removed after the retention and active ones are kept', () => {
  const directory = temporaryDirectory();
  const store = openConnectionStore(directory);
  store.save(record(first, { state: 'ended', endedAt: 1_000, endReason: 'signed-out', access: null, refresh: null, retiredRefresh: [] }));
  store.save(record(second));
  expect(store.removeEndedBefore(1_000 - 1)).toBe(0);
  expect(store.removeEndedBefore(1_000 + ENDED_RETENTION_MS)).toBe(1);
  expect(store.get(first)).toBeUndefined();
  expect(store.get(second)).toBeDefined();
  expect(readdirSync(directory)).toEqual([`${second}.json`]);
});

test('a corrupt file, an unknown format version and a misnamed file are ignored with a log line that names no secret', () => {
  const directory = temporaryDirectory();
  const store = openConnectionStore(directory);
  store.save(record(first));
  writeFileSync(join(directory, `${second}.json`), '{ not json');
  writeFileSync(join(directory, `${'C'.repeat(22)}.json`), JSON.stringify({ ...record('C'.repeat(22)), formatVersion: 2 }));
  writeFileSync(join(directory, `${'D'.repeat(22)}.json`), JSON.stringify(record('E'.repeat(22))));
  const warning = spyOn(log, 'warn').mockImplementation(() => undefined);
  const reopened = openConnectionStore(directory);
  expect(reopened.all().map(entry => entry.id)).toEqual([first]);
  expect(warning).toHaveBeenCalledTimes(3);
  warning.mockRestore();
});
