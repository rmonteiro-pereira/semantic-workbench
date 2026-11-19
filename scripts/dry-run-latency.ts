// Measures the Admin POST over a loopback socket with disposable fixture data.
// Usage: bun [--cpu-prof --cpu-prof-dir=out/dry-run] scripts/dry-run-latency.ts [--profile] [runs] [multiplier ...]
import matrix from '../policies/matrix-cases.json';

const args = process.argv.slice(2).filter(argument => argument !== '--profile');
const profile = process.argv.includes('--profile');
const runs = Number(args[0] ?? 20);
const multipliers = args.slice(1).map(Number);
const cedar = require('@cedar-policy/cedar-wasm/nodejs');
const evaluate = cedar.statefulIsAuthorized;
let cedarMs = 0;
let cedarCalls = 0;
if (profile) {
  cedar.statefulIsAuthorized = (input: Parameters<typeof import('@cedar-policy/cedar-wasm/nodejs').statefulIsAuthorized>[0]) => {
    const started = performance.now();
    try {
      return evaluate(input);
    } finally {
      cedarMs += performance.now() - started;
      cedarCalls++;
    }
  };
}
if (!Number.isInteger(runs) || runs < 1) throw new Error('Runs must be a positive integer.');
const { createHandler } = await import('../src/server/handler');
const { createAccessControl } = await import('../src/server/auth/authorize');
const { openAdminRepository } = await import('../src/server/auth/admin-repo');
const { accessFixture, person } = await import('../tests/auth/access-fixture');
const { authWorkspace } = await import('../tests/helpers/auth-workspace');
const { allowEveryRemote } = await import('../tests/helpers/remote-credentials-fixture');
const { configureLogging } = await import('../src/server/observability/log');
configureLogging({ level: 'silent', format: 'json' });
const original = [...matrix.cases];

function summary(samples: number[]) {
  const sorted = [...samples].sort((left, right) => left - right);
  const round = (value: number) => Number(value.toFixed(2));
  return { medianMs: round((sorted[Math.floor((sorted.length - 1) / 2)] + sorted[Math.floor(sorted.length / 2)]) / 2), p95Ms: round(sorted[Math.ceil(sorted.length * 0.95) - 1]) };
}

using workspace = await authWorkspace();
const access = createAccessControl(accessFixture());
for (const name of ['dave', 'erin', 'hank', 'bob', 'alice'] as const) {
  workspace.ws.state.recordUser(access.principalFor(person(name)), new Date().toISOString());
}
const repository = openAdminRepository({ root: workspace.root });
await repository.ensure();
const origin = 'http://127.0.0.1:5461';
const handler = createHandler(workspace.ws, {
  mode: 'server',
  access,
  principal: () => access.principalFor(person('dave')),
  remoteCredentials: allowEveryRemote(),
  publicOrigin: origin,
  requestLimits: { requests: { burst: 100_000, perSecond: 100_000 }, signIn: { burst: 100_000, perSecond: 100_000 } },
});
const server = Bun.serve({ hostname: '127.0.0.1', port: 5461, fetch: handler });
const grants = repository.load().grants.filter(grant => grant.roleId !== 'r_metric_reviewer');
const body = JSON.stringify({ grants });

async function request() {
  const started = performance.now();
  const response = await fetch(`${origin}/api/admin/policies/dry-run`, {
    method: 'POST',
    headers: { Origin: origin, 'X-SW-Request': '1', 'Content-Type': 'application/json' },
    body,
  });
  const result = await response.json();
  if (response.status !== 200) throw new Error(`Dry run failed: ${response.status} ${JSON.stringify(result)}`);
  if (result.matrixCases !== matrix.cases.length * matrix.principals.length) throw new Error('Incomplete matrix replay.');
  return performance.now() - started;
}

try {
  for (const multiplier of multipliers.length ? multipliers : [1, 2]) {
    if (!Number.isInteger(multiplier) || multiplier < 1) throw new Error('Multipliers must be positive integers.');
    matrix.cases.splice(0, matrix.cases.length, ...Array.from({ length: multiplier }, () => original).flat());
    await request();
    cedarMs = 0;
    cedarCalls = 0;
    const samples: number[] = [];
    for (let index = 0; index < runs; index++) samples.push(await request());
    console.log(
      JSON.stringify({
        cases: matrix.cases.length,
        principals: matrix.principals.length,
        runs,
        ...summary(samples),
        ...(profile ? { cedarMsPerRun: Number((cedarMs / runs).toFixed(2)), cedarCallsPerRun: cedarCalls / runs } : {}),
      }),
    );
  }
} finally {
  matrix.cases.splice(0, matrix.cases.length, ...original);
  await server.stop(true);
  cedar.statefulIsAuthorized = evaluate;
}
