// Drives the local agent endpoint through the scripted release acceptance run and its refused cases, with an isolated server on a spare port and a temporary data root.
// Usage: bun run test:mcp. It exits non-zero when any step fails or a refused case is accepted.
import assert from 'node:assert/strict';
import { startLocalServer } from '../tests/mcp/helpers/local-server';

const PROJECT = 'mapped-commerce';
const MAPPING = 'commerce.mapping.yaml';
const SEMANTIC = 'commerce.mapped-semantic.yaml';
const THIRD = 'commerce.mapped-ontology.yaml';

const server = await startLocalServer({ examples: [PROJECT] });
const client = await server.connect('acceptance-client');
let step = 0;

async function call(name: string, args: Record<string, unknown>): Promise<any> {
  return ((await client.callTool({ name, arguments: args })) as any).structuredContent;
}
function pass(description: string) {
  step++;
  console.log(`PASS ${String(step).padStart(2, '0')} ${description}`);
}
const http = (path: string, init: RequestInit = {}) =>
  server.handler(new Request(server.url + path, { ...init, headers: { host: `127.0.0.1:${server.port}`, 'content-type': 'application/json', 'sec-fetch-site': 'same-origin' } }));

try {
  const tools = (await client.listTools()).tools;
  assert.equal(tools.length, 21);
  assert.deepEqual(
    tools.map(tool => tool.name),
    tools.map(tool => tool.name).sort(),
  );
  assert.equal(tools.find(tool => tool.name === 'read_file')?.annotations?.readOnlyHint, true);
  pass('discovery and 21 sorted tools with hints');

  const projects = await call('list_projects', {});
  assert.equal(projects.data.items[0].project, PROJECT);
  const files = (await call('list_files', { project: PROJECT })).data.items;
  const mapping = files.find((file: { path: string }) => file.path === MAPPING);
  let text = '';
  let offset = 0;
  while (true) {
    const range = (await call('read_file', { project: PROJECT, path: MAPPING, offset, length: 512, expectedVersion: mapping.version })).data;
    text += range.text;
    if (range.nextOffset === undefined) break;
    offset = range.nextOffset;
  }
  assert.equal(Buffer.byteLength(text), mapping.size);
  pass('list and read in ranges reproduce the file');

  const broken = await call('validate_text', { project: PROJECT, path: SEMANTIC, source: 'datasets: [' });
  assert.equal(broken.data.valid, false);
  assert.ok(broken.data.findings.length > 0);
  pass('validation reports located findings and writes nothing');

  const semantic = files.find((file: { path: string }) => file.path === SEMANTIC);
  const first = await call('save_file', { project: PROJECT, path: SEMANTIC, baseVersion: semantic.version, patches: [{ from: 0, to: 0, insert: '# reviewed by an agent\n' }] });
  assert.equal(first.ok, true);
  assert.equal((await call('get_findings', { project: PROJECT, path: SEMANTIC })).data.version, first.data.version);
  pass('a patch is saved and the findings follow the new version');

  const mappingNow = (await call('list_files', { project: PROJECT })).data.items.find((file: { path: string }) => file.path === MAPPING);
  const second = await call('save_file', { project: PROJECT, path: MAPPING, baseVersion: mappingNow.version, patches: [{ from: 0, to: 0, insert: '# second\n' }] });
  assert.equal(second.ok, true);
  pass('a second file is saved');

  const status = (await call('git_status', { project: PROJECT })).data;
  assert.equal(status.changeCount, 2);
  const diff = await call('git_diff', { project: PROJECT, path: SEMANTIC });
  assert.equal(diff.ok, true);
  const branch = (await call('git_branches', { project: PROJECT })).data.current;
  const head = (await call('git_log', { project: PROJECT })).data.commits[0].commit;
  const key = 'acceptance-commit-0001';
  const commitArgs = {
    project: PROJECT,
    message: 'Review definitions',
    files: [
      { path: SEMANTIC, version: first.data.version },
      { path: MAPPING, version: second.data.version },
    ],
    expectedBranch: branch,
    expectedHead: head,
    idempotencyKey: key,
  };
  const committed = await call('git_commit', commitArgs);
  assert.equal(committed.ok, true);
  const log = (await call('git_log', { project: PROJECT })).data.commits;
  assert.equal(log[0].commit, committed.data.commit);
  assert.equal(log[0].author, (await http(`/api/projects/${PROJECT}/git/identity`).then(response => response.json())).name ?? log[0].author);
  assert.doesNotMatch(JSON.stringify(log[0]), /agent|mcp|claude/i);
  pass('one commit of both files, authored by the configured identity, in the log');

  assert.deepEqual(await call('git_commit', commitArgs), committed);
  assert.equal((await call('git_commit', { ...commitArgs, message: 'Another message' })).error.code, 'key_reused');
  pass('a retry returns the same commit and another message is refused');

  const third = (await call('list_files', { project: PROJECT })).data.items.find((file: { path: string }) => file.path === THIRD);
  const deleted = await call('delete_file', { project: PROJECT, path: THIRD, baseVersion: third.version, idempotencyKey: 'acceptance-delete-001' });
  assert.equal(deleted.ok, true);
  const restored = await call('restore_file', { entry: deleted.data.entry, idempotencyKey: 'acceptance-restore-01' });
  assert.equal(restored.data.version, third.version);
  pass('a deleted file returns with its bytes');

  assert.equal((await http(`/api/projects/${PROJECT}/git/publish`, { method: 'POST', body: '{}' })).status, 200);
  const catalog = await call('get_mapping_catalog', { project: PROJECT });
  const agent = await (await http(`/api/agent/catalog?project=${PROJECT}`)).json();
  assert.deepEqual(catalog.data.items, agent.mappings);
  assert.ok(catalog.data.snapshot.id);
  const context = await call('get_mapping_context', { project: PROJECT, mappingId: catalog.data.items[0].id });
  const plan = await call('plan_query', { project: PROJECT, mappingId: catalog.data.items[0].id, metrics: [context.data.context.metrics[0].id] });
  assert.equal(plan.data.snapshot.id, catalog.data.snapshot.id);
  pass('published context and plans carry the snapshot id and equal the agent API');

  // Refused cases: each must be refused, and none may reveal more than its status.
  const post = (headers: Record<string, string>, method = 'POST') =>
    fetch(server.endpoint, { method, headers: { 'content-type': 'application/json', ...headers }, ...(method === 'POST' ? { body: '{}' } : {}) });
  const bearer = { authorization: `Bearer ${server.capability()}` };
  const refusals: [string, Response, number][] = [
    ['no capability', await post({}), 401],
    ['a wrong capability', await post({ authorization: 'Bearer wrong' }), 401],
    ['a browser origin', await post({ ...bearer, origin: 'http://127.0.0.1:5173' }), 403],
    ['Origin null', await post({ ...bearer, origin: 'null' }), 403],
    ['a rebinding Host', await post({ ...bearer, host: 'localhost.evil.example' }), 403],
    ['a form post', await post({ ...bearer, 'content-type': 'application/x-www-form-urlencoded' }), 415],
    ['GET', await post(bearer, 'GET'), 405],
  ];
  for (const [label, response, status] of refusals) assert.equal(response.status, status, label);
  const stale = await call('save_file', { project: PROJECT, path: SEMANTIC, baseVersion: semantic.version, source: 'x: 1\n' });
  assert.equal(stale.error.code, 'conflict');
  const moved = await call('git_commit', { ...commitArgs, idempotencyKey: 'acceptance-moved-0001', expectedHead: head });
  assert.equal(moved.error.code, 'precondition_failed');
  const page = await call('list_files', { project: PROJECT, limit: 1 });
  assert.equal((await call('list_trash', { cursor: page.data.nextCursor })).error.code, 'cursor_expired');
  pass('every refused case is refused: access, stale version, moved head, stale cursor');
  console.log(`Acceptance run passed: ${step} steps.`);
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await server.close();
}
