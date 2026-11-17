// Read tools equal their twin routes on every shipped example, page and range correctly, refuse stale cursors and versions, and keep answers under the cap.
import { afterAll, beforeAll, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { RESULT_CAP_BYTES } from '../../src/server/mcp/tool-results';
import { startLocalServer, type LocalServer } from './helpers/local-server';

const EXAMPLES = ['ubl', 'commerce', 'mapped-commerce', 'flights', 'billing', 'mall'];
let server: LocalServer;
let client: Awaited<ReturnType<LocalServer['connect']>>;
beforeAll(async () => {
  server = await startLocalServer({ examples: EXAMPLES });
  client = await server.connect();
}, 120_000);
afterAll(async () => {
  await server.close();
});

async function call(name: string, args: Record<string, unknown>): Promise<any> {
  return ((await client.callTool({ name, arguments: args })) as any).structuredContent;
}

async function twin(path: string) {
  const response = await server.handler(new Request(server.url + path, { headers: { host: `127.0.0.1:${server.port}` } }));
  return response.json() as Promise<any>;
}

test('list_projects, list_files, read_file ranges and get_findings equal the twin routes for every example', async () => {
  const projects = await call('list_projects', {});
  const twinProjects = (await twin('/api/projects')) as { slug: string }[];
  expect(projects.data.items.map((item: { project: string }) => item.project).sort()).toEqual(twinProjects.map(project => project.slug).sort());
  let filesChecked = 0;
  for (const { project } of projects.data.items) {
    let cursor: string | undefined;
    const files: { path: string; version: string; size: number }[] = [];
    do {
      const page = await call('list_files', { project, ...(cursor ? { cursor } : {}) });
      files.push(...page.data.items);
      cursor = page.data.nextCursor;
    } while (cursor);
    const index = (await twin(`/api/documents?project=${project}`)) as { path: string; hash: string; size: number }[];
    expect(files.map(file => [file.path, file.version, file.size])).toEqual(index.map(file => [file.path, file.hash, file.size]).sort((left, right) => (left[0] < right[0] ? -1 : 1)));
    for (const file of files.slice(0, 6)) {
      const full = await twin(`/api/projects/${project}/files/${file.path}`);
      let text = '';
      let offset = 0;
      while (true) {
        const range = (await call('read_file', { project, path: file.path, offset, length: 4096, expectedVersion: file.version })).data;
        text += range.text;
        expect(range.findingCount).toBe(full.findings.length);
        if (range.nextOffset === undefined) break;
        offset = range.nextOffset;
      }
      expect(createHash('sha256').update(text).digest('hex')).toBe(full.hash);
      const findings = (await call('get_findings', { project, path: file.path })).data;
      expect(findings.items.length).toBe(Math.min(full.findings.length, 50));
      filesChecked++;
    }
    const log = (await call('git_log', { project })).data.commits;
    const twinLog = (await twin(`/api/projects/${project}/git/log`)) as { commit: string }[];
    expect(log.map((commit: { commit: string }) => commit.commit)).toEqual(twinLog.map(commit => commit.commit));
  }
  expect(filesChecked).toBeGreaterThan(20);
}, 120_000);

test('a range against an old version answers version_changed and a stale cursor answers cursor_expired', async () => {
  const project = 'mapped-commerce';
  const files = (await call('list_files', { project })).data.items;
  const target = files.find((file: { path: string }) => file.path.endsWith('mapped-semantic.yaml'));
  const stale = await call('read_file', { project, path: target.path, expectedVersion: 'f'.repeat(64) });
  expect(stale.error).toMatchObject({ code: 'version_changed', details: { currentVersion: target.version } });
  const first = await call('list_files', { project, limit: 1 });
  expect(first.data.nextCursor).toBeDefined();
  const other = await call('list_files', { project, limit: 1, cursor: first.data.nextCursor + 'x' });
  expect(other.error.code).toBe('cursor_expired');
  const wrongQuery = await call('list_files', { project: 'billing', limit: 1, cursor: first.data.nextCursor });
  expect(wrongQuery.error.code).toBe('cursor_expired');
  const beforeSave = first.data.nextCursor;
  const current = await twin(`/api/projects/${project}/files/${target.path}`);
  await server.handler(
    new Request(server.url + `/api/projects/${project}/files/${target.path}`, {
      method: 'PUT',
      headers: { host: `127.0.0.1:${server.port}`, 'content-type': 'application/json' },
      body: JSON.stringify({ baseHash: current.hash, source: current.source + '\n# touched\n' }),
    }),
  );
  const afterSave = await call('list_files', { project, limit: 1, cursor: beforeSave });
  expect(afterSave.error.code).toBe('cursor_expired');
});

test('every read answer stays under the result cap', async () => {
  for (const project of ['mall', 'billing', 'ubl']) {
    for (const file of (await call('list_files', { project, limit: 3 })).data.items) {
      const read = await call('read_file', { project, path: file.path });
      expect(Buffer.byteLength(read.data.text)).toBeLessThanOrEqual(RESULT_CAP_BYTES);
    }
    expect(Buffer.byteLength(JSON.stringify(await call('git_status', { project })))).toBeLessThan(RESULT_CAP_BYTES * 2);
  }
});

test('an unknown project answers not_found and Git inspection keeps working', async () => {
  expect((await call('list_files', { project: 'no-such-project' })).error.code).toBe('not_found');
  expect((await call('git_status', { project: 'no-such-project' })).error.code).toBe('not_found');
  expect((await call('git_diff', { project: 'mapped-commerce', path: 'commerce.mapping.yaml' })).ok).toBe(true);
});
