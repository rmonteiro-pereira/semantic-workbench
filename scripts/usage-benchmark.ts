// Measures what usage counting adds to a counted request: 5,000 agent context requests in process,
// first with counters off and then on, on isolated temporary data.
// Usage: bun scripts/usage-benchmark.ts
import { performance } from 'node:perf_hooks';
import { createHandler } from '../src/server/handler';
import { LOCAL_READER } from '../src/server/projects/reader';
import { configureLogging } from '../src/server/observability/log';
import { publishFixture } from '../tests/helpers/published-workspace';
import { testWorkspace } from '../tests/helpers/temp-data-dir';

const REQUESTS = 5_000;
const WARM_UP = 150;
const PROJECT = 'ungrouped';

configureLogging({ level: 'silent', format: 'json' });
using workspace = await testWorkspace();
for (const file of ['commerce.mapping.yaml', 'commerce.mapped-ontology.yaml', 'commerce.mapped-semantic.yaml']) {
  await workspace.ws.saveDocument(file, await Bun.file('public/examples/commerce/' + file).text(), LOCAL_READER);
}
await publishFixture(workspace);
const path = `/api/agent/context?project=${PROJECT}&mappingId=${encodeURIComponent(PROJECT + '/commerce.mapping.yaml')}`;

async function measure(label: string, usageSettings?: { enabled: boolean; retentionDays: number }) {
  const handler = createHandler(workspace.ws, { usageSettings });
  const durations: number[] = [];
  for (let index = 0; index < WARM_UP + REQUESTS; index++) {
    const started = performance.now();
    const response = await handler(new Request('http://localhost' + path));
    await response.text();
    if (response.status !== 200) throw new Error(`Request ${index} answered ${response.status}`);
    if (index >= WARM_UP) durations.push(performance.now() - started);
  }
  await handler.usage.settled();
  handler.usage.close();
  durations.sort((left, right) => left - right);
  return { label, requests: durations.length, medianMs: durations[Math.floor(REQUESTS / 2)], p95Ms: durations[Math.floor(REQUESTS * 0.95)] };
}

const off = await measure('counters off');
const on = await measure('counters on', { enabled: true, retentionDays: 30 });
console.log(JSON.stringify({ off, on, medianIncreasePercent: Math.round(((on.medianMs - off.medianMs) / off.medianMs) * 1000) / 10 }));
