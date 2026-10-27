// Every route beyond a plain read is either proved guarded by a matrix case or exempt with a
// stated reason, so a new write route cannot skip the governance guards unnoticed.
import { expect, test } from 'bun:test';
import { authWorkspace } from '../helpers/auth-workspace';
import { READ_ACTIONS } from '../../src/shared/auth/actions';
import { ROUTE_ACTIONS, type RouteAction } from '../../src/server/auth/route-actions';
import {
  ADMIN_EXEMPTION,
  type BuiltCase,
  GUARD_CASES,
  GUARD_EXEMPTIONS,
  GUARDED_ROUTES,
} from './guard-cases';

/** A plain read: a read action answered only to GET or HEAD. */
function plainRead(row: RouteAction) {
  const methods = row.methods ?? [row.method];
  const readOnly = methods.every(method => method === 'GET' || method === 'HEAD');
  return READ_ACTIONS.includes(row.action) && readOnly;
}

function exemption(row: RouteAction) {
  if (row.action === 'admin') return ADMIN_EXEMPTION;
  return GUARD_EXEMPTIONS[row.path];
}

test('every route beyond a plain read is guarded by a matrix case or exempt with a reason', () => {
  const rows = ROUTE_ACTIONS.filter(row => !row.public && !plainRead(row));
  for (const row of rows) {
    const guarded = row.path in GUARDED_ROUTES;
    const reason = exemption(row);
    const exempt = reason !== undefined;
    expect(guarded !== exempt, `${row.path} must be guarded or exempt, not both or neither`).toBe(
      true,
    );
    if (exempt) expect(reason.length).toBeGreaterThan(10);
  }
  const listed = [...Object.keys(GUARDED_ROUTES), ...Object.keys(GUARD_EXEMPTIONS)];
  const paths = new Set(rows.map(row => row.path));
  for (const path of listed)
    expect(paths.has(path), `${path} is a plain read or unknown`).toBe(true);
  for (const name of Object.values(GUARDED_ROUTES))
    expect(Object.keys(GUARD_CASES)).toContain(name);
});

test('agent clients are admitted only on rows whose action is a read', () => {
  const clientRows = ROUTE_ACTIONS.filter(row => row.clientAction);
  expect(clientRows.length).toBeGreaterThan(0);
  for (const row of clientRows) {
    expect(READ_ACTIONS, row.path).toContain(row.action);
  }
});

test('every guard case builder makes the case its name promises', async () => {
  for (const [name, build] of Object.entries(GUARD_CASES)) {
    using fixture = await authWorkspace();
    const item: BuiltCase = await build({ ws: fixture.ws, root: fixture.root });
    try {
      expect(item.name).toBe(name);
      expect(item.path.startsWith('/api/'), name).toBe(true);
    } finally {
      item.dispose?.();
    }
  }
}, 60000);
