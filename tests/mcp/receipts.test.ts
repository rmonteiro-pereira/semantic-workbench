// Receipts make delete, restore and commit safe to retry: the original result comes back, a different request with the key is refused, a crash at any step never causes a second effect, and no file text is stored.
import { afterAll, beforeAll, expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { localPrincipal } from '../../src/server/auth/principal';
import { createReceiptStore, RECEIPT_RETENTION_MS, type ReceiptStore } from '../../src/server/mcp/receipts';
import { TOOLS } from '../../src/server/mcp/tool-registry';
import { succeed } from '../../src/server/mcp/tool-results';
import { toolRunner } from './helpers/in-process-tools';
import { startLocalServer, type LocalServer } from './helpers/local-server';

const PROJECT = 'mapped-commerce';
let server: LocalServer;
let receiptsDirectory: string;
beforeAll(async () => {
  server = await startLocalServer({ examples: ['mapped-commerce'] });
  receiptsDirectory = join(server.root, 'receipts-under-test');
});
afterAll(async () => {
  await server.close();
});

const runner = (store: ReceiptStore) => toolRunner(server.handler, localPrincipal(), store);
const current = async (path: string) => (await (await server.handler(new Request(`${server.url}/api/projects/${PROJECT}/files/${path}`))).json()) as { hash: string };
const trashed = async () => ((await (await server.handler(new Request(`${server.url}/api/trash`))).json()) as { entryId: string; path?: string }[]).filter(entry => entry.path);

test('the same key and arguments return the original result, other arguments are refused, and no file text is stored', async () => {
  const run = runner(createReceiptStore(receiptsDirectory));
  const path = 'commerce.mapping.yaml';
  const { hash } = await current(path);
  const args = { project: PROJECT, path, baseVersion: hash, idempotencyKey: 'delete-once-key-0001' };
  const first = await run.run('delete_file', args);
  expect(first.ok).toBe(true);
  const again = await run.run('delete_file', args);
  expect(again).toEqual(first);
  expect((await trashed()).filter(entry => entry.path === path)).toHaveLength(1);
  const different = await run.run('delete_file', { ...args, path: 'commerce.mapped-semantic.yaml' });
  expect(different).toMatchObject({ ok: false, error: { code: 'key_reused' } });
  const stored = readdirSync(receiptsDirectory).map(name => readFileSync(join(receiptsDirectory, name), 'utf8')).join('');
  expect(stored).toContain('delete_file');
  expect(stored).not.toContain('Mapped commerce');
  const restored = await run.run('restore_file', { entry: (first as { data: { entry: string } }).data.entry, idempotencyKey: 'restore-once-key-001' });
  expect(restored.ok).toBe(true);
  expect(await run.run('restore_file', { entry: (first as { data: { entry: string } }).data.entry, idempotencyKey: 'restore-once-key-001' })).toEqual(restored);
});

test('two calls with one key at once run the effect once and the second is told to wait', async () => {
  const store = createReceiptStore(join(server.root, 'receipts-concurrent'));
  let effects = 0;
  const request = (finish: Promise<void>) => ({
    principalId: 'local',
    tool: 'delete_file',
    idempotencyKey: 'concurrent-key-000001',
    args: { a: 1 },
    effect: async () => {
      effects++;
      await finish;
      return succeed({ done: true });
    },
    verify: async () => null,
  });
  let release!: () => void;
  const gate = new Promise<void>(resolve => (release = resolve));
  const first = store.run(request(gate));
  await Bun.sleep(20);
  const second = await store.run(request(gate));
  expect(second).toMatchObject({ ok: false, error: { code: 'rate_limited' } });
  release();
  expect((await first).ok).toBe(true);
  expect(effects).toBe(1);
});

test('a crash after the effect and a crash before it never cause a second effect', async () => {
  const directory = join(server.root, 'receipts-crash');
  const path = 'commerce.mapped-semantic.yaml';
  const { hash } = await current(path);
  const args = { project: PROJECT, path, baseVersion: hash, idempotencyKey: 'crash-after-key-00001' };
  const crashing = createReceiptStore(directory);
  const tool = TOOLS.find(candidate => candidate.name === 'delete_file')!;
  const original = tool.run;
  // The effect completes, then the process "dies" before the receipt is completed.
  const dying = { ...crashing, run: (request: Parameters<ReceiptStore['run']>[0]) => crashing.run({ ...request, effect: async () => { await request.effect(); throw new Error('simulated crash'); } }) };
  await expect(runner(dying).run('delete_file', args)).rejects.toThrow('simulated crash');
  const restarted = createReceiptStore(directory);
  const recovered = await runner(restarted).run('delete_file', args);
  expect(recovered).toMatchObject({ ok: true });
  expect((await trashed()).filter(entry => entry.path === path)).toHaveLength(1);
  // A crash before the effect leaves a pending receipt with no way to prove anything, so the answer is uncertain.
  const other = 'commerce.mapped-ontology.yaml';
  const otherArgs = { project: PROJECT, path: other, baseVersion: (await current(other)).hash, idempotencyKey: 'crash-before-key-0001' };
  const before = createReceiptStore(directory);
  const early = { ...before, run: (request: Parameters<ReceiptStore['run']>[0]) => before.run({ ...request, effect: async () => { throw new Error('simulated crash'); } }) };
  await expect(runner(early).run('delete_file', otherArgs)).rejects.toThrow('simulated crash');
  const afterRestart = await runner(createReceiptStore(directory)).run('delete_file', otherArgs);
  expect(afterRestart).toMatchObject({ ok: false, error: { code: 'uncertain' } });
  expect((await trashed()).filter(entry => entry.path === other)).toHaveLength(0);
  expect(tool.run).toBe(original);
});

test('retention removes expired receipts and an expired key is a new call', async () => {
  let now = new Date('2026-11-01T00:00:00Z');
  const directory = join(server.root, 'receipts-retention');
  const store = createReceiptStore(directory, () => now);
  let effects = 0;
  const request = () => ({ principalId: 'local', tool: 'git_commit', idempotencyKey: 'retention-key-0000001', args: { m: 1 }, effect: async () => (effects++, succeed({ n: effects })), verify: async () => null });
  await store.run(request());
  now = new Date(now.getTime() + RECEIPT_RETENTION_MS + 1000);
  store.prune();
  expect(readdirSync(directory)).toEqual([]);
  await store.run(request());
  expect(effects).toBe(2);
});
