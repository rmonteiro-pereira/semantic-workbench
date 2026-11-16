/** Exercises reconciliation through the workspace with the real request authority and governance guards. */
import { expect, test } from 'bun:test';
import { createAccessControl } from '../src/server/auth/authorize';
import { requestAccess } from '../src/server/auth/request-scope';
import { addressMigrationFile, readAddressMigrations } from '../src/server/projects/address-migrations';
import { dataLayout } from '../src/server/projects/paths';
import { LOCAL_READER } from '../src/server/projects/reader';
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
  const record = await workspace.ws.reconcileAddress(request, declaration);
  expect(record).toMatchObject({ id: 'm-reconcile-one-0', kind: 'reconciliation', from: declaration.from, to: declaration.to });
  const stored = readFileSync(addressMigrationFile(layout, 'sales-metrics'));
  expect(await workspace.ws.reconcileAddress(request, declaration)).toEqual(record);
  expect(readFileSync(addressMigrationFile(layout, 'sales-metrics'))).toEqual(stored);
  expect(readAddressMigrations(layout, 'sales-metrics', LOCAL_READER)).toEqual([record]);
  expect(workspace.ws.readFile('sales-metrics', 'sales.semantic.yaml').source).toBe(original);
  await expect(workspace.ws.reconcileAddress(request, { ...declaration, to: prefix + 'order_count' })).rejects.toThrow('different content');
  await expect(workspace.ws.reconcileAddress(request, { ...declaration, operationId: 'resolving-old', from: prefix + 'order_count' })).rejects.toThrow('still resolves');
  await expect(workspace.ws.reconcileAddress(request, { ...declaration, operationId: 'missing-new', to: prefix + 'absent' })).rejects.toThrow('uniquely');
  expect(readAddressMigrations(layout, 'sales-metrics', LOCAL_READER)).toEqual([record]);
});

test('read-only, hidden-project and hidden-file reconciliation attempts leave history absent', async () => {
  using workspace = await authWorkspace();
  const layout = dataLayout(workspace.root);
  await expect(workspace.ws.reconcileAddress(requestFor('carol'), declaration)).rejects.toThrow();
  for (const hidden of ['sw1:hr-people/people.odcs.yaml#contract:People/object:old', 'sw1:sales-contracts/finance/revenue-recognition.semantic.yaml#model:Secret/metric:old']) {
    await expect(workspace.ws.reconcileAddress(requestFor('alice'), { ...declaration, from: hidden })).rejects.toThrow('not found');
  }
  expect(existsSync(addressMigrationFile(layout, 'sales-metrics'))).toBe(false);
});
