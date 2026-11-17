// git_commit commits exactly the listed files at the listed versions, leaves other staged work alone, refuses a moved branch, head or version, and holds up against a person working at the same time.
import { afterAll, beforeAll, expect, test } from 'bun:test';
import { seededRandom } from '../helpers/seeded-random';
import { startLocalServer, type LocalServer } from './helpers/local-server';

const PROJECT = 'mapped-commerce';
const FIRST = 'commerce.mapped-ontology.yaml';
const SECOND = 'commerce.mapped-semantic.yaml';
const THIRD = 'commerce.mapping.yaml';
let server: LocalServer;
let client: Awaited<ReturnType<LocalServer['connect']>>;
let counter = 0;
beforeAll(async () => {
  server = await startLocalServer({ examples: ['mapped-commerce'] });
  client = await server.connect();
}, 120_000);
afterAll(async () => {
  await server.close();
});

async function call(name: string, args: Record<string, unknown>): Promise<any> {
  return ((await client.callTool({ name, arguments: args })) as any).structuredContent;
}
const http = (path: string, init: RequestInit = {}) =>
  server.handler(new Request(server.url + path, { ...init, headers: { host: `127.0.0.1:${server.port}`, 'content-type': 'application/json', 'sec-fetch-site': 'same-origin' } }));
const json = async (path: string, init?: RequestInit) => (await http(path, init)).json() as Promise<any>;
const key = () => `commit-key-${String(++counter).padStart(8, '0')}`;

async function edit(path: string, note: string) {
  const file = await json(`/api/projects/${PROJECT}/files/${path}`);
  const saved = await call('save_file', { project: PROJECT, path, baseVersion: file.hash, patches: [{ from: 0, to: 0, insert: `# ${note}\n` }] });
  expect(saved.ok).toBe(true);
  return saved.data.version as string;
}
async function state() {
  const branches = await json(`/api/projects/${PROJECT}/git/branches`);
  const log = await json(`/api/projects/${PROJECT}/git/log`);
  return { branch: branches.current as string, head: log[0].commit as string };
}
const commitFiles = async (message: string, files: { path: string; version: string }[], expected: { branch: string; head: string | null }) =>
  call('git_commit', { project: PROJECT, message, files, expectedBranch: expected.branch, expectedHead: expected.head, idempotencyKey: key() });
const changed = async () =>
  ((await json(`/api/projects/${PROJECT}/git/status`)).changes as { path: string; index: string; worktree: string }[]).map(entry => ({ path: entry.path, staged: entry.index !== '.' }));

test('exactly the listed paths are committed, other staged work stays staged, and the author is the configured identity', async () => {
  const firstVersion = await edit(FIRST, 'one');
  await edit(SECOND, 'two');
  await http(`/api/projects/${PROJECT}/git/stage`, { method: 'POST', body: JSON.stringify({ paths: [SECOND] }) });
  const expected = await state();
  const result = await commitFiles('Agent change', [{ path: FIRST, version: firstVersion }], expected);
  expect(result.ok).toBe(true);
  expect(result.data.files).toEqual([FIRST]);
  expect(await changed()).toEqual([{ path: SECOND, staged: true }]);
  const log = await json(`/api/projects/${PROJECT}/git/log`);
  expect(log[0]).toMatchObject({ commit: result.data.commit, message: 'Agent change', author: 'Workbench Test' });
  expect(JSON.stringify(log[0])).not.toMatch(/agent marker|co-authored|claude|mcp/i);
  const retry = await commitFiles('Agent change', [{ path: FIRST, version: firstVersion }], expected);
  expect(retry.ok).toBe(false);
});

test('a moved head, a changed version and a wrong branch answer precondition_failed and commit nothing', async () => {
  const version = await edit(THIRD, 'three');
  const expected = await state();
  const wrongHead = await commitFiles('x', [{ path: THIRD, version }], { ...expected, head: 'f'.repeat(40) });
  expect(wrongHead.error).toMatchObject({ code: 'precondition_failed', details: { changed: { head: { expected: 'f'.repeat(40), actual: expected.head } } } });
  const wrongBranch = await commitFiles('x', [{ path: THIRD, version }], { ...expected, branch: 'elsewhere' });
  expect(wrongBranch.error.details.changed.branch.actual).toBe(expected.branch);
  const newer = await edit(THIRD, 'three again');
  const stale = await commitFiles('x', [{ path: THIRD, version }], expected);
  expect(stale.error.details.changed.files).toEqual([THIRD]);
  expect((await state()).head).toBe(expected.head);
  const good = await commitFiles('Third', [{ path: THIRD, version: newer }], expected);
  expect(good.ok).toBe(true);
});

test('there is no push and no commit-all, and a commit from the default branch lands on the authoring branch and never moves what is read', async () => {
  const expected = await state();
  for (const extra of [{ push: true }, { all: true }]) {
    const refused = await call('git_commit', {
      project: PROJECT,
      message: 'x',
      files: [{ path: FIRST, version: 'a'.repeat(64) }],
      expectedBranch: expected.branch,
      expectedHead: expected.head,
      idempotencyKey: key(),
      ...extra,
    });
    expect(refused.error.code).toBe('invalid_input');
  }
  const published = await http(`/api/projects/${PROJECT}/git/publish`, { method: 'POST', body: '{}' });
  expect(published.status).toBe(200);
  const status = await json(`/api/projects/${PROJECT}/git/status`);
  const version = await edit(FIRST, 'after publish');
  const onPublishedName = await commitFiles('After publish', [{ path: FIRST, version }], { branch: status.published.branch, head: expected.head });
  expect(onPublishedName).toMatchObject({ ok: false, error: { code: 'precondition_failed' } });
  expect((await commitFiles('On the authoring branch', [{ path: FIRST, version }], await state())).ok).toBe(true);
  // Earlier tests left work in the tree, and a switch refuses to carry it.
  await http(`/api/projects/${PROJECT}/git/stage`, { method: 'POST', body: JSON.stringify({ paths: (await changed()).map(entry => entry.path) }) });
  await http(`/api/projects/${PROJECT}/git/commit`, { method: 'POST', body: JSON.stringify({ message: 'Leftover work' }) });
  const switched = await http(`/api/projects/${PROJECT}/git/switch`, { method: 'POST', body: JSON.stringify({ branch: status.published.branch }) });
  expect(switched.status).toBe(200);
  const created = await call('create_file', { project: PROJECT, path: 'scratch.ontology.yaml', source: (await json(`/api/projects/${PROJECT}/files/${FIRST}`)).source });
  expect(created.ok, JSON.stringify(created)).toBe(true);
  const onDefault = await commitFiles('From the default branch', [{ path: 'scratch.ontology.yaml', version: created.data.version }], await state());
  expect(onDefault, JSON.stringify(onDefault)).toMatchObject({ ok: true, data: { branch: 'work/local', movedFrom: status.published.branch } });
  expect((await json(`/api/projects/${PROJECT}/git/status`)).published.commit).toBe(status.published.commit);
});

test('200 randomized interleavings with a person never commit a path or version that was not listed', async () => {
  const random = seededRandom(20261117);
  const paths = [FIRST, SECOND, THIRD];
  let committed = 0;
  let refused = 0;
  for (let round = 0; round < 200; round++) {
    const listed = paths[Math.floor(random() * paths.length)];
    const other = paths.find(path => path !== listed)!;
    const version = await edit(listed, `round ${round}`);
    const expected = await state();
    const otherVersion = (await json(`/api/projects/${PROJECT}/files/${other}`)).hash as string;
    const person = [
      () => http(`/api/projects/${PROJECT}/git/stage`, { method: 'POST', body: JSON.stringify({ paths: [other] }) }),
      () => edit(other, `person ${round}`),
      () => http(`/api/projects/${PROJECT}/files/${listed}`, { method: 'PUT', body: JSON.stringify({ baseHash: version, patches: [{ from: 0, to: 0, insert: '# person\n' }] }) }),
      () => http(`/api/projects/${PROJECT}/git/commit`, { method: 'POST', body: JSON.stringify({ message: `person ${round}`, paths: [other] }) }),
      () => Promise.resolve(),
    ][Math.floor(random() * 5)];
    const [result] = await Promise.all([commitFiles(`Agent ${round}`, [{ path: listed, version }], expected), person()]);
    if (!result.ok) {
      refused++;
      expect(['precondition_failed', 'refused'], JSON.stringify(result)).toContain(result.error.code);
      continue;
    }
    committed++;
    const bytes = await json(`/api/projects/${PROJECT}/git/show?commit=${result.data.commit}&path=${listed}`);
    expect(bytes.hash, `round ${round}: the commit holds the listed version`).toBe(version);
    const otherBytes = await json(`/api/projects/${PROJECT}/git/show?commit=${result.data.commit}&path=${other}`);
    const parentOther = await json(`/api/projects/${PROJECT}/git/show?commit=${expected.head}&path=${other}`);
    expect(otherBytes.hash, `round ${round}: the unlisted file was not committed`).toBe(parentOther.hash);
    expect(otherVersion).toBeDefined();
  }
  expect(committed).toBeGreaterThan(50);
  console.log(`commit races: ${committed} committed, ${refused} refused of 200`);
}, 280_000);
