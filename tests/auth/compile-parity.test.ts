// Checks that check and compile give the same status, body and audit record over HTTP and through the operation boundary for every kind of caller, and that a hidden file looks like a missing one.
import { expect, test } from 'bun:test';
import { join } from 'node:path';
import { createHandler } from '../../src/server/handler';
import { createAccessControl } from '../../src/server/auth/authorize';
import { createAuditLog } from '../../src/server/auth/audit';
import { mintCaller } from '../../src/server/auth/caller';
import { clientFromToken } from '../../src/server/auth/principal';
import { buildTwinRequest } from '../../src/server/auth/twin-request';
import { allowEveryRemote } from '../helpers/remote-credentials-fixture';
import { COMPILE_PROJECT, compileWorkspace } from '../helpers/compile-workspace';
import { accessFixture, person } from './access-fixture';

const origin = 'http://localhost:5312';

type Operation = { id: 'compile.check' | 'compile.run'; body: unknown };
const operations: Operation[] = [
  { id: 'compile.check', body: { source: 'published' } },
  { id: 'compile.run', body: {} },
];

type Caller = 'alice' | 'bob' | 'carol' | 'dave' | 'frank' | 'viewer' | 'application';

function normalized(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalized);
  if (typeof value === 'string') return value.replace(/\b[0-9a-f]{40,64}\b/g, '<hash>');
  if (!value || typeof value !== 'object') return value;
  const volatile = ['at', 'prev', 'requestId', 'origin', 'tool', 'connection', 'op'];
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !volatile.includes(key))
      .map(([key, item]) => [key, normalized(item)]),
  );
}

function accessFor(caller: Caller) {
  const options = accessFixture();
  if (caller === 'viewer') {
    options.config.projects.projects[COMPILE_PROJECT].restricted = [];
    options.config.grants.push({
      id: 'g-erin-viewer',
      roleId: 'viewer',
      member: { kind: 'email', email: 'erin@example.org' },
      scope: { kind: 'domains', domains: ['sales'] },
      addedBy: 'bootstrap',
      addedAt: '2026-10-21T09:00:00Z',
    } as never);
  }
  const access = createAccessControl(options);
  if (caller === 'application') return { access, principal: access.principalFor(clientFromToken({ tid: 'tenant', idtyp: 'app', azp: 'sw-agent' }, 'tenant')) };
  return { access, principal: access.principalFor(person(caller === 'viewer' ? 'erin' : caller)) };
}

async function invoke(workspace: Awaited<ReturnType<typeof compileWorkspace>>, caller: Caller, operation: Operation, project: string, twin: boolean, label: string) {
  const { access, principal } = accessFor(caller);
  const audit = createAuditLog({ dir: join(workspace.fixture.root, `compile-audit-${label}-${twin ? 'twin' : 'http'}`) });
  const handler = createHandler(workspace.ws, { mode: 'server', access, audit, principal: () => principal, publicOrigin: origin, port: 5312, remoteCredentials: allowEveryRemote() });
  const request = buildTwinRequest(operation.id, { params: { slug: project }, body: operation.body });
  const response = twin
    ? (await handler.boundary.operate({ caller: mintCaller({ principal, origin: 'mcp' }), request })).response
    : await handler(
        new Request(origin + new URL(request.url).pathname, {
          method: request.method,
          body: await request.text(),
          headers: { ...Object.fromEntries(request.headers), Origin: origin, 'X-SW-Request': '1' },
        }),
      );
  const payload = await response.json().catch(() => null);
  return { status: response.status, body: normalized(payload), audit: audit.recent(10).map(normalized) };
}

const expectedStatus: Record<Caller, number> = { alice: 404, bob: 200, carol: 404, dave: 200, frank: 200, viewer: 200, application: 403 };

for (const operation of operations) {
  test(`${operation.id} gives HTTP and the boundary the same status, body and audit record for every kind of caller`, async () => {
    using workspace = await compileWorkspace();
    for (const caller of Object.keys(expectedStatus) as Caller[]) {
      const http = await invoke(workspace, caller, operation, COMPILE_PROJECT, false, caller);
      const twin = await invoke(workspace, caller, operation, COMPILE_PROJECT, true, caller);
      expect(twin, `${operation.id} ${caller}`).toEqual(http);
      expect(http.status, `${operation.id} ${caller}`).toBe(expectedStatus[caller]);
      expect(http.audit.length, `${operation.id} ${caller} audit`).toBeLessThanOrEqual(1);
    }
  }, 120000);

  test(`${operation.id} answers a hidden file of the unit exactly as it answers a missing project`, async () => {
    using workspace = await compileWorkspace();
    const hidden = await invoke(workspace, 'alice', operation, COMPILE_PROJECT, false, 'hidden');
    const missing = await invoke(workspace, 'alice', operation, 'missing', false, 'missing');
    expect(hidden.status).toBe(404);
    expect(hidden.status).toBe(missing.status);
    expect(hidden.body).toEqual(missing.body);
    expect(JSON.stringify(hidden.body)).not.toContain('finance');
  }, 60000);
}

test('a compile is audited once as an export and a check once as a read', async () => {
  using workspace = await compileWorkspace();
  const run = await invoke(workspace, 'dave', operations[1], COMPILE_PROJECT, false, 'audited');
  expect(run.audit).toMatchObject([{ action: 'export', decision: 'allow', outcome: 'ok' }]);
  const check = await invoke(workspace, 'dave', operations[0], COMPILE_PROJECT, false, 'checked');
  expect(check.audit).toMatchObject([{ action: 'read', decision: 'allow' }]);
});
