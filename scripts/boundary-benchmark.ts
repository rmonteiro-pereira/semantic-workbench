// Measures full in-process requests without opening a port or contacting a remote.
// Usage: bun scripts/boundary-benchmark.ts
import { performance } from 'node:perf_hooks';
import { join } from 'node:path';
import { createHandler } from '../src/server/handler';
import { createAccessControl } from '../src/server/auth/authorize';
import { createAuditLog } from '../src/server/auth/audit';
import { accessFixture, person } from '../tests/auth/access-fixture';
import { testWorkspace } from '../tests/helpers/temp-data-dir';
import { allowEveryRemote } from '../tests/helpers/remote-credentials-fixture';
import { configureLogging } from '../src/server/observability/log';

configureLogging({ level: 'silent', format: 'json' });
using workspace = await testWorkspace();
const access = createAccessControl(accessFixture());
const allowed = access.principalFor(person('dave'));
const denied = access.principalFor(person('erin'));
let principal = allowed;
const handler = createHandler(workspace.ws, {
  mode: 'server',
  access,
  principal: () => principal,
  audit: createAuditLog({ dir: join(workspace.root, 'benchmark-audit') }),
  remoteCredentials: allowEveryRemote(),
  publicOrigin: 'http://localhost:5312',
  requestLimits: { requests: { burst: 100_000, perSecond: 100_000 }, signIn: { burst: 100_000, perSecond: 100_000 } },
});

async function request(index: number): Promise<number> {
  principal = index % 3 === 1 ? denied : allowed;
  const method = index % 3 === 2 ? 'POST' : 'GET';
  const started = performance.now();
  const response = await handler(
    new Request('http://localhost:5312/api/projects', {
      method,
      headers: { Origin: 'http://localhost:5312', 'X-SW-Request': '1', 'Content-Type': 'application/json' },
      ...(method === 'POST' ? { body: '{}' } : {}),
    }),
  );
  await response.text();
  const expectedStatus = [200, 403, 400][index % 3];
  if (response.status !== expectedStatus) throw new Error(`Request ${index}: expected ${expectedStatus}, received ${response.status}`);
  return performance.now() - started;
}

for (let index = 0; index < 150; index++) await request(index);
const durations = [];
for (let index = 0; index < 5_000; index++) durations.push(await request(index));
durations.sort((left, right) => left - right);
console.log(JSON.stringify({ requests: durations.length, medianMs: durations[2_500], p95Ms: durations[4_749] }));
