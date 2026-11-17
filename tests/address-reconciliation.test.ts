/** Exercises reconciliation through the workspace with the real request authority and governance guards. */
import { expect, test } from 'bun:test';
import { createAccessControl } from '../src/server/auth/authorize';
import { requestAccess, requestReader } from '../src/server/auth/request-scope';
import { addressMigrationFile, readAddressMigrations } from '../src/server/projects/address-migrations';
import { dataLayout } from '../src/server/projects/paths';
import { LOCAL_READER } from '../src/server/projects/reader';
import { createHandler } from '../src/server/handler';
import { allowEveryRemote } from './helpers/remote-credentials-fixture';
import { authWorkspace } from './helpers/auth-workspace';
import { accessFixture, person } from './auth/access-fixture';
import type { TestUserName } from './helpers/auth-identities';
import { existsSync, readFileSync } from 'node:fs';

function requestFor(name: TestUserName) {
  const access = createAccessControl(accessFixture());
  const request = new Request('http://localhost/api');
  Object.assign(request, { [requestAccess]: access.forRequest(access.principalFor(person(name))) });
  return request;
}

const prefix = 'sw1:sales-metrics/sales.semantic.yaml#model:Sales%20semantic%20model/metric:';
const declaration = { operationId: 'reconcile-one', from: prefix + 'old_revenue', to: prefix + 'gross_revenue' };

test('an editor reconciles an approved guarded metric without changing it and retries the same operation once', async () => {
  using workspace = await authWorkspace();
  const layout = dataLayout(workspace.root);
  const original = workspace.ws.readFile('sales-metrics', 'sales.semantic.yaml').source;
  const request = requestFor('alice');
  const record = await workspace.ws.reconcileAddress(declaration, requestReader(request));
  expect(record).toMatchObject({ id: 'r-reconcile-one-0', kind: 'reconciliation', from: declaration.from, to: declaration.to });
  const stored = readFileSync(addressMigrationFile(layout, 'sales-metrics'));
  expect(await workspace.ws.reconcileAddress(declaration, requestReader(request))).toEqual(record);
  expect(readFileSync(addressMigrationFile(layout, 'sales-metrics'))).toEqual(stored);
  expect(readAddressMigrations(layout, 'sales-metrics', LOCAL_READER)).toEqual([record]);
  expect(workspace.ws.readFile('sales-metrics', 'sales.semantic.yaml').source).toBe(original);
  await expect(workspace.ws.reconcileAddress({ ...declaration, to: prefix + 'order_count' }, requestReader(request))).rejects.toThrow('different content');
  await expect(workspace.ws.reconcileAddress({ ...declaration, operationId: 'resolving-old', from: prefix + 'order_count' }, requestReader(request))).rejects.toThrow('still resolves');
  await expect(workspace.ws.reconcileAddress({ ...declaration, operationId: 'missing-new', to: prefix + 'absent' }, requestReader(request))).rejects.toThrow('uniquely');
  expect(readAddressMigrations(layout, 'sales-metrics', LOCAL_READER)).toEqual([record]);
});

test('read-only, hidden-project and hidden-file reconciliation attempts leave history absent', async () => {
  using workspace = await authWorkspace();
  const layout = dataLayout(workspace.root);
  const access = createAccessControl(accessFixture());
  const handler = createHandler(workspace.ws, {
    mode: 'server',
    access,
    principal: () => access.principalFor(person('carol')),
    publicOrigin: 'http://localhost',
    remoteCredentials: allowEveryRemote(),
  });
  const denied = await handler(
    new Request('http://localhost/api/projects/sales-metrics/item-addresses/reconcile/sales.semantic.yaml', {
      method: 'POST',
      body: JSON.stringify(declaration),
      headers: { Origin: 'http://localhost', 'X-SW-Request': '1' },
    }),
  );
  expect([403, 404]).toContain(denied.status);
  for (const hidden of ['sw1:hr-people/people.odcs.yaml#contract:People/object:old', 'sw1:sales-contracts/finance/revenue-recognition.semantic.yaml#model:Secret/metric:old']) {
    await expect(workspace.ws.reconcileAddress({ ...declaration, from: hidden }, requestReader(requestFor('alice')))).rejects.toThrow('not found');
  }
  expect(existsSync(addressMigrationFile(layout, 'sales-metrics'))).toBe(false);
});
