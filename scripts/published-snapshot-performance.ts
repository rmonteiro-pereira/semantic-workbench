import { join } from 'node:path';
import { cpSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
const source = process.argv[2];
const { openWorkspace } = await import(join(source, 'src/server/projects/workspace.ts'));
const { createHandler } = await import(join(source, 'src/server/handler.ts'));
const fixture = join(tmpdir(), 'published-snapshot-performance', 'fixture');
const root = join(tmpdir(), 'published-snapshot-performance', 'active');
const requests = [
  ['/api/agent/catalog?project=mapped-commerce'],
  ['/api/agent/context?project=mapped-commerce&mappingId=mapped-commerce/commerce.mapping.yaml'],
  ['/api/agent/plan', { project: 'mapped-commerce', mappingId: 'mapped-commerce/commerce.mapping.yaml', concepts: ['Revenue'], metrics: ['gross_revenue'], dimensions: [] }],
] as const;
const samples: Record<string, number[]> = {};
async function measure(handler: any, path: string, body?: object) {
  const started = performance.now();
  const response = await handler(new Request('http://localhost' + path, body ? { method: 'POST', body: JSON.stringify(body) } : {}));
  const text = await response.text();
  if (response.status !== 200) throw new Error(`${path}: ${response.status} ${text}`);
  return performance.now() - started;
}
for (let iteration = 0; iteration < 12; iteration++) {
  rmSync(root, { recursive: true, force: true });
  cpSync(fixture, root, { recursive: true });
  for (const [path, body] of requests) {
    const workspace = await openWorkspace({ root, watch: false });
    const handler = createHandler(workspace);
    const key = path.split('?')[0];
    (samples[`cold ${key}`] ??= []).push(await measure(handler, path, body));
    for (let warm = 0; warm < 100; warm++) (samples[`warm ${key}`] ??= []).push(await measure(handler, path, body));
    workspace.close();
  }
}
for (const [key, values] of Object.entries(samples)) {
  values.sort((a, b) => a - b);
  console.log(JSON.stringify({ key, count: values.length, p95ms: values[Math.ceil(values.length * 0.95) - 1], medianMs: values[Math.floor(values.length / 2)] }));
}
rmSync(root, { recursive: true, force: true });
