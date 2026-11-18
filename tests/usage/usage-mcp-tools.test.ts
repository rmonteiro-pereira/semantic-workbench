// Tests that the agent endpoint's published-context tools are counted through the operation boundary
// under the `mcp` origin, and that the tools which read nothing about items are not counted.
import { afterAll, beforeAll, expect, test } from 'bun:test';
import { startLocalServer, type LocalServer } from '../mcp/helpers/local-server';

const PROJECT = 'mapped-commerce';
let server: LocalServer;
let client: Awaited<ReturnType<LocalServer['connect']>>;
beforeAll(async () => {
  server = await startLocalServer({ examples: [PROJECT], handlerOptions: { usageSettings: { enabled: true, retentionDays: 30 } } });
  client = await server.connect();
  const published = await server.handler(
    new Request(`${server.url}/api/projects/${PROJECT}/git/publish`, {
      method: 'POST',
      body: '{}',
      headers: { host: `127.0.0.1:${server.port}`, 'content-type': 'application/json', 'sec-fetch-site': 'same-origin' },
    }),
  );
  expect(published.status).toBe(200);
}, 120_000);
afterAll(async () => {
  server.served.usage.close();
  await server.close();
});

async function call(name: string, args: Record<string, unknown>): Promise<any> {
  return ((await client.callTool({ name, arguments: args })) as any).structuredContent;
}

/** The origins each operation was counted under, summed over every item and day of the project. */
async function countedOrigins(): Promise<Record<string, Record<string, number>>> {
  await server.served.usage.settled();
  const totals: Record<string, Record<string, number>> = {};
  for (const day of server.served.usage.pending(PROJECT)) {
    for (const item of Object.values(day.counts)) {
      for (const [operation, origins] of Object.entries(item['workbench-requests'] ?? {})) {
        for (const [origin, count] of Object.entries(origins)) {
          totals[operation] ??= {};
          totals[operation][origin] = (totals[operation][origin] ?? 0) + count;
        }
      }
    }
  }
  return totals;
}

test('the context, plan and explain tools are counted under the mcp origin and the listing tools are not', async () => {
  const catalog = await call('get_mapping_catalog', { project: PROJECT });
  expect(await countedOrigins()).toEqual({});
  const mappingId = catalog.data.items[0].id;
  const context = await call('get_mapping_context', { project: PROJECT, mappingId });
  expect(context.ok).toBe(true);
  const metric = context.data.context.metrics[0].id;
  expect((await call('plan_query', { project: PROJECT, mappingId, metrics: [metric], dimensions: [] })).ok).toBe(true);
  const files = (await call('list_files', { project: PROJECT })).data.items as { path: string }[];
  const semanticModel = files.find(file => file.path.endsWith('semantic.yaml'))!;
  const explained = await call('explain_metric', { project: PROJECT, path: semanticModel.path, metric });
  expect(explained.ok, JSON.stringify(explained)).toBe(true);
  const totals = await countedOrigins();
  expect(Object.keys(totals).sort()).toEqual(['agent.context.read', 'agent.plan', 'metrics.explain']);
  for (const origins of Object.values(totals)) expect(Object.keys(origins)).toEqual(['mcp']);
});
