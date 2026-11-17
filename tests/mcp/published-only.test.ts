// The four published-only tools answer from the immutable published snapshot: never an unpublished edit, always the snapshot id, and the same bytes the agent HTTP API gives.
import { afterAll, beforeAll, expect, test } from 'bun:test';
import { startLocalServer, type LocalServer } from './helpers/local-server';

const PROJECT = 'mapped-commerce';
let server: LocalServer;
let client: Awaited<ReturnType<LocalServer['connect']>>;
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

test('before the first publish every published-only tool answers not_published with a reason', async () => {
  for (const [name, args] of [
    ['get_mapping_catalog', { project: PROJECT }],
    ['get_mapping_context', { project: PROJECT, mappingId: 'x' }],
    ['plan_query', { project: PROJECT, mappingId: 'x' }],
  ] as const) {
    const answer = await call(name, args);
    expect(answer.error, name).toMatchObject({ code: 'not_published', details: { reason: expect.any(String) } });
  }
});

test('after publishing, results carry the snapshot id, equal the agent API and ignore later edits', async () => {
  const published = await http(`/api/projects/${PROJECT}/git/publish`, { method: 'POST', body: '{}' });
  expect(published.status).toBe(200);
  const catalog = await call('get_mapping_catalog', { project: PROJECT });
  expect(catalog.ok).toBe(true);
  expect(catalog.data.snapshot.id).toMatch(/^[0-9a-f]{40}$/);
  const agent = await (await http(`/api/agent/catalog?project=${PROJECT}`)).json();
  expect(catalog.data.items).toEqual(agent.mappings);
  const mappingId = catalog.data.items[0].id;
  const context = await call('get_mapping_context', { project: PROJECT, mappingId });
  const agentContext = await (await http(`/api/agent/context?project=${PROJECT}&mappingId=${encodeURIComponent(mappingId)}`)).json();
  expect(context.data.context).toEqual(agentContext);
  expect(context.data.snapshot.id).toBe(catalog.data.snapshot.id);
  const metric = context.data.context.metrics[0].id;
  const plan = await call('plan_query', { project: PROJECT, mappingId, metrics: [metric], dimensions: [] });
  expect(plan.data.snapshot.id).toBe(catalog.data.snapshot.id);
  const agentPlan = await (await http('/api/agent/plan', { method: 'POST', body: JSON.stringify({ project: PROJECT, mappingId, metrics: [metric], dimensions: [], concepts: undefined }) })).json();
  expect(plan.data.plan).toEqual(agentPlan);
  const before = JSON.stringify(catalog.data);
  const file = (await call('list_files', { project: PROJECT })).data.items.find((entry: { path: string }) => entry.path.endsWith('commerce.mapping.yaml'));
  const current = await (await http(`/api/projects/${PROJECT}/files/${file.path}`)).json();
  const edited = await call('save_file', { project: PROJECT, path: file.path, baseVersion: current.hash, source: current.source.replace(/name: .*/, 'name: UNPUBLISHED-EDIT-MARKER') });
  expect(edited.ok).toBe(true);
  expect(JSON.stringify(await call('get_mapping_catalog', { project: PROJECT }))).toBe(JSON.stringify({ ok: true, data: JSON.parse(before) }));
  const everything = JSON.stringify([await call('get_mapping_catalog', { project: PROJECT }), await call('get_mapping_context', { project: PROJECT, mappingId }), plan]);
  expect(everything).not.toContain('UNPUBLISHED-EDIT-MARKER');
});

test('a plan with an expression or a metric override is refused', async () => {
  const withExpression = await call('plan_query', { project: PROJECT, mappingId: 'x', expression: '1+1' });
  expect(withExpression.error).toMatchObject({ code: 'invalid_input', details: { field: 'expression' } });
  const tooMany = await call('plan_query', { project: PROJECT, mappingId: 'x', metrics: Array.from({ length: 101 }, (_, index) => `m${index}`) });
  expect(tooMany.error.code).toBe('invalid_input');
});
