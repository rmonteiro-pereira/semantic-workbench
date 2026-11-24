// Measures how long listing projects takes as the number of projects grows, over HTTP, through the operation boundary and through the agent tool.
// Usage: bun scripts/project-listing-latency.ts [count ...]. Each count builds a temporary workspace with that many small projects.
import { mintCaller } from '../src/server/auth/caller';
import { localPrincipal } from '../src/server/auth/principal';
import { buildTwinRequest } from '../src/server/auth/twin-request';
import { createCursorCodec } from '../src/server/mcp/cursors';
import { createReceiptStore } from '../src/server/mcp/receipts';
import { TOOLS } from '../src/server/mcp/tool-registry';
import { createTwinCall } from '../src/server/mcp/twin-dispatch';
import { testWorkspace, example } from '../tests/helpers/temp-data-dir';
import { join } from 'node:path';

const counts = process.argv.slice(2).map(Number).filter(Number.isFinite);
const RUNS = 30;

function summary(samples: number[]) {
  const sorted = [...samples].sort((left, right) => left - right);
  return { median: sorted[Math.floor(sorted.length / 2)], p95: sorted[Math.floor(sorted.length * 0.95)] };
}

async function measure(count: number) {
  using workspace = await testWorkspace();
  const source = await example('commerce', 'commerce.mapped-ontology.yaml');
  for (let index = 0; index < count; index++) await workspace.seed([{ path: 'definitions.ontology.yaml', source }], `project-${index}`);
  const handler = workspace.handler;
  const caller = mintCaller({ principal: localPrincipal(), origin: 'mcp', connection: 'local' });
  const twin = createTwinCall(handler.boundary, caller);
  const tool = TOOLS.find(candidate => candidate.name === 'list_projects')!;
  const context = { twin, cursors: createCursorCodec(), receipts: createReceiptStore(join(workspace.root, 'receipts')), principalId: 'local', signal: new AbortController().signal };
  const timed = async (run: () => Promise<unknown>) => {
    await run();
    const samples: number[] = [];
    for (let round = 0; round < RUNS; round++) {
      const started = performance.now();
      await run();
      samples.push(performance.now() - started);
    }
    return summary(samples);
  };
  const http = await timed(() => handler(new Request('http://localhost/api/projects')));
  const boundary = await timed(() => handler.boundary.operate({ caller, request: buildTwinRequest('projects.list', { params: {} }) }));
  const agentTool = await timed(() => tool.run({}, context));
  const round = (value: number) => Number(value.toFixed(1));
  console.log(
    JSON.stringify({
      projects: count,
      httpMedianMs: round(http.median),
      httpP95Ms: round(http.p95),
      boundaryMedianMs: round(boundary.median),
      boundaryP95Ms: round(boundary.p95),
      toolMedianMs: round(agentTool.median),
      toolP95Ms: round(agentTool.p95),
    }),
  );
}

for (const count of counts.length ? counts : [10, 100, 120, 200]) await measure(count);
