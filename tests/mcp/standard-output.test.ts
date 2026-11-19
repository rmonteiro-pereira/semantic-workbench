// The two standard Ossie tools: the same answers as the compile routes, a loss accepted only by the caller's digest, output read in commit-bound parts, and nothing unpublished in a compile.
import { afterAll, beforeAll, expect, test } from 'bun:test';
import { TESSERA_FILES } from '../helpers/compile-workspace';
import { startLocalServer, type LocalServer } from './helpers/local-server';

const PROJECT = 'retail-standard';
const UNPUBLISHED_PROJECT = 'retail-draft';
const UNPUBLISHED_MARKER = 'UNPUBLISHED-STANDARD-MARKER';

let server: LocalServer;
let client: Awaited<ReturnType<LocalServer['connect']>>;
beforeAll(async () => {
  server = await startLocalServer();
  const files = Object.entries(TESSERA_FILES).map(([path, source]) => ({ path, source }));
  expect((await server.seed(files, PROJECT)).slug).toBe(PROJECT);
  expect((await server.seed(files, UNPUBLISHED_PROJECT)).slug).toBe(UNPUBLISHED_PROJECT);
  client = await server.connect();
  expect((await http(`/api/projects/${PROJECT}/git/publish`, { method: 'POST', body: '{}' })).status).toBe(200);
}, 120_000);
afterAll(async () => {
  await server.close();
});

async function call(name: string, args: Record<string, unknown>): Promise<any> {
  return ((await client.callTool({ name, arguments: args })) as any).structuredContent;
}

function http(path: string, init: RequestInit = {}) {
  const headers = { host: `127.0.0.1:${server.port}`, 'content-type': 'application/json', 'sec-fetch-site': 'same-origin' };
  return server.handler(new Request(server.url + path, { ...init, headers }));
}

async function route(path: string, body: unknown) {
  return (await http(`/api/projects/${PROJECT}/${path}`, { method: 'POST', body: JSON.stringify(body) })).json();
}

test('check answers the findings and loss report of the check route, with the lost entries paged', async () => {
  const twin = await route('compile/check', { source: 'published' });
  const first = await call('check_standard', { project: PROJECT, limit: 1 });
  expect(first.ok).toBe(true);
  expect(first.data.result).toBe(twin.result);
  expect(first.data.source).toEqual(twin.source);
  expect(first.data.report.digest).toBe(twin.report.digest);
  expect(first.data.report.counts).toEqual(twin.report.counts);
  expect(first.data.files).toEqual(twin.files);
  expect(first.data.report.losses).toEqual(twin.report.losses.slice(0, 1));
  const second = await call('check_standard', { project: PROJECT, limit: 1, cursor: first.data.report.nextCursor });
  expect(second.data.report.losses).toEqual(twin.report.losses.slice(1, 2));
  expect(JSON.stringify(first)).not.toContain('"bundle"');
});

test('check of the working copy says it is unpublished', async () => {
  const answer = await call('check_standard', { project: UNPUBLISHED_PROJECT, source: 'working' });
  expect(answer.ok).toBe(true);
  expect(answer.data.source).toMatchObject({ kind: 'working-copy', unpublished: true });
});

test('compile without a digest returns the report summary and digest and no content', async () => {
  const answer = await call('compile_standard', { project: PROJECT });
  expect(answer.ok).toBe(true);
  expect(answer.data.result).toBe('loss-needs-acceptance');
  expect(answer.data.digest).toMatch(/^sha256:[0-9a-f]{64}$/);
  expect(answer.data.report.digest).toBe(answer.data.digest);
  expect(answer.data.manifest).toBeUndefined();
  expect(answer.data.files).toBeUndefined();
});

test('with the digest the manifest is listed and a file is read in parts bound to the commit', async () => {
  const { digest } = (await call('compile_standard', { project: PROJECT })).data;
  const released = await call('compile_standard', { project: PROJECT, acceptDigest: digest });
  expect(released.data.result).toBe('released');
  const commit = released.data.source.commit;
  expect(commit).toMatch(/^[0-9a-f]{40}$/);
  expect(released.data.files.map((file: { path: string }) => file.path)).toContain('manifest.json');
  const part = await call('compile_standard', { project: PROJECT, acceptDigest: digest, commit, path: 'manifest.json' });
  expect(part.data.part.text).toContain('"manifestVersion"');
  expect(Buffer.byteLength(part.data.part.text)).toBeLessThanOrEqual(32_768);
});

test('a part needs the commit, and a commit that is not the published one answers version_changed', async () => {
  const { digest } = (await call('compile_standard', { project: PROJECT })).data;
  const withoutCommit = await call('compile_standard', { project: PROJECT, acceptDigest: digest, path: 'manifest.json' });
  expect(withoutCommit.error.code).toBe('invalid_input');
  const moved = await call('compile_standard', { project: PROJECT, acceptDigest: digest, commit: 'e'.repeat(40) });
  expect(moved.error.code).toBe('version_changed');
});

test('a wrong digest is not accepted, and an unpublished project answers not_published', async () => {
  const wrong = await call('compile_standard', { project: PROJECT, acceptDigest: 'sha256:' + '0'.repeat(64) });
  expect(wrong.data.result).toBe('loss-needs-acceptance');
  const unpublished = await call('compile_standard', { project: UNPUBLISHED_PROJECT });
  expect(unpublished.error.code).toBe('not_published');
  const check = await call('check_standard', { project: UNPUBLISHED_PROJECT });
  expect(check.error.code).toBe('not_published');
});

test('an unpublished edit never appears in a compile', async () => {
  const path = Object.keys(TESSERA_FILES)[0];
  const current = await (await http(`/api/projects/${PROJECT}/files/${path}`)).json();
  const source = current.source.replace(/^name: .*$/m, `name: ${UNPUBLISHED_MARKER}`);
  expect(source).toContain(UNPUBLISHED_MARKER);
  expect((await call('save_file', { project: PROJECT, path, baseVersion: current.hash, source })).ok).toBe(true);
  const { digest } = (await call('compile_standard', { project: PROJECT })).data;
  const released = await call('compile_standard', { project: PROJECT, acceptDigest: digest });
  const commit = released.data.source.commit;
  const parts = await Promise.all(released.data.files.map((file: { path: string }) => call('compile_standard', { project: PROJECT, acceptDigest: digest, commit, path: file.path })));
  expect(JSON.stringify([released, parts])).not.toContain(UNPUBLISHED_MARKER);
  expect(JSON.stringify(await call('check_standard', { project: PROJECT, source: 'working' }))).toContain('"unpublished":true');
});
