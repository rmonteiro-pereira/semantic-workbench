import { expect, test } from 'bun:test';
import { join } from 'node:path';
import { createHandler } from '../../src/server/handler';
import { createCursorCodec } from '../../src/server/mcp/cursors';
import { createReceiptStore } from '../../src/server/mcp/receipts';
import { checkToolInput, type ToolDefinition } from '../../src/server/mcp/tool-definition';
import { createTwinCall } from '../../src/server/mcp/twin-dispatch';
import { TEST_USERS, type TestUserName } from '../helpers/auth-identities';
import { createAuditLog } from '../../src/server/auth/audit';
import { createAccessControl } from '../../src/server/auth/authorize';
import { mintCaller } from '../../src/server/auth/caller';
import { createOperationBoundary } from '../../src/server/auth/operation-boundary';
import { operationById } from '../../src/server/auth/operation-inventory';
import { buildTwinRequest } from '../../src/server/auth/twin-request';
import { effectsOf, offeredScopes } from '../../src/server/connections/scopes';
import { TOOLS } from '../../src/server/mcp/tool-registry';
import { accessFixture, person } from '../auth/access-fixture';
import { allowEveryRemote } from '../helpers/remote-credentials-fixture';
import { authWorkspace } from '../helpers/auth-workspace';

function requestFor(operation: string) {
  const values: Record<string, string> = { slug: 'sales-contracts', '*': 'orders.odcs.yaml', metric: 'example', entry: 'missing-entry' };
  const template = operationById(operation)!.row;
  const names = [...template.matchAll(/:([a-z]+)|\*/g)].map(match => match[1] ?? '*');
  const params = Object.fromEntries(names.map(name => [name, values[name]]));
  return buildTwinRequest(operation, { params });
}

test('each tool twin refuses missing effects for every offered combination and representative role', async () => {
  using fixture = await authWorkspace();
  const access = createAccessControl(accessFixture());
  const audit = createAuditLog({ dir: join(fixture.root, 'scope-parity-audit') });
  const boundary = createOperationBoundary(fixture.ws, { mode: 'server', access, audit }, async () => new Response(null, { status: 418 }));
  const offered = offeredScopes();
  for (const name of ['alice', 'carol', 'bob', 'hank', 'erin', 'dave'] as const) {
    const principal = access.principalFor(person(name));
    const unscoped = mintCaller({ principal, origin: 'mcp', connection: 'reference-connection' });
    const unrestricted = new Set(boundary.availableOperations(unscoped));
    for (let mask = 0; mask < 2 ** offered.length; mask++) {
      const effects = effectsOf(offered.filter((_, index) => (mask & (1 << index)) !== 0));
      const caller = mintCaller({ principal, origin: 'mcp', connection: 'reference-connection', scope: effects });
      const listed = new Set(boundary.availableOperations(caller));
      for (const tool of TOOLS) {
        const entry = operationById(tool.operation)!.entry;
        const permittedEffects = entry.effects.every(effect => effects.includes(effect));
        expect(listed.has(tool.operation), `${name} ${tool.name} ${mask}`).toBe(unrestricted.has(tool.operation) && permittedEffects);
        const result = await boundary.operate({ caller, request: requestFor(tool.operation), operationId: tool.operation });
        if (!permittedEffects) expect(result.response.status, tool.name).not.toBe(418);
        const latest = audit.recent(1)[0];
        expect(latest.connection).toBe('reference-connection');
        expect(latest.principal.id).toBe(principal.id);
      }
    }
  }
}, 600000);

function argumentsFor(tool: ToolDefinition, operationKey: string): Record<string, unknown> {
  const candidates: Record<string, unknown> = {
    project: 'sales-contracts',
    path: 'orders.odcs.yaml',
    baseVersion: 'a'.repeat(64),
    source: 'x: 1\n',
    entry: 'missing-entry',
    idempotencyKey: operationKey,
    mappingId: 'missing-mapping',
    metric: 'missing-metric',
    commit: 'HEAD',
    message: 'Check selected files',
    files: [{ path: 'orders.odcs.yaml', version: 'a'.repeat(64) }],
    expectedBranch: 'main',
    expectedHead: 'a'.repeat(40),
  };
  const properties = tool.inputSchema.properties as Record<string, unknown>;
  return Object.fromEntries(Object.entries(candidates).filter(([name]) => name in properties));
}

test('every tool accepts schema-valid direct calls under each role and scope ceiling without bypassing a refusal', async () => {
  using fixture = await authWorkspace();
  const access = createAccessControl(accessFixture());
  const audit = createAuditLog({ dir: join(fixture.root, 'direct-tool-audit') });
  const handler = createHandler(fixture.ws, { mode: 'server', access, audit, remoteCredentials: allowEveryRemote() });
  const receipts = createReceiptStore(join(fixture.root, 'direct-tool-receipts'));
  const cursors = createCursorCodec();
  const offered = offeredScopes();
  let calls = 0;
  for (const name of Object.keys(TEST_USERS) as TestUserName[]) {
    const principal = access.principalFor(person(name));
    for (let mask = 0; mask < 2 ** offered.length; mask++) {
      const effects = effectsOf(offered.filter((_, index) => (mask & (1 << index)) !== 0));
      const caller = mintCaller({ principal, origin: 'mcp', connection: 'direct-connection', scope: effects });
      const listed = new Set(handler.boundary.availableOperations(caller));
      const twin = createTwinCall(handler.boundary, caller);
      for (const tool of TOOLS) {
        const args = argumentsFor(tool, `direct-${name}-${mask}-${tool.name}`);
        expect(checkToolInput(tool, args), tool.name).toBeNull();
        const result = await tool.run(args, { twin, cursors, receipts, principalId: principal.id, signal: new AbortController().signal });
        if (!listed.has(tool.operation)) expect(result.ok, `${name} ${mask} ${tool.name}`).toBe(false);
        expect(result.ok || result.error.code !== 'internal', `${name} ${mask} ${tool.name}`).toBe(true);
        calls++;
      }
    }
  }
  expect(calls).toBe(Object.keys(TEST_USERS).length * 2 ** offered.length * TOOLS.length);
}, 600000);
