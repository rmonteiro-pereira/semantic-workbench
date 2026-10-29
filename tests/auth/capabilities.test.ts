// UI permissions are API capabilities, including custom roles with unexpected names.
import { expect, test } from 'bun:test';
import { can, requiredRole } from '../../src/auth/Capabilities';
import type { Me } from '../../src/auth/useMe';

const me: Me = {
  mode: 'server',
  name: 'Reviewer',
  verifiedEmail: null,
  roles: { workspace: ['admin'], projects: {} },
  roleNames: {},
  can: { admin: false },
  requires: { commit: 'Requires Editor', publish: 'Requires Steward', purge: 'Requires Admin' },
};

test('role labels never grant browser capabilities', () => {
  expect(can(me, [], 'edit', 'sales')).toBe(false);
  expect(can(me, [], 'admin')).toBe(false);
  expect(can(me, [{ slug: 'sales', actions: ['approveMetric'] }], 'approveMetric', 'sales')).toBe(
    true,
  );
  expect(can(me, [{ slug: 'sales', actions: ['approveMetric'] }], 'edit', 'sales')).toBe(false);
  expect(can(null, [], 'edit')).toBe(false);
});

test('local mode retains every control and disabled controls name the needed role', () => {
  expect(can({ ...me, mode: 'local' }, [], 'edit', 'sales')).toBe(true);
  expect(requiredRole('commit', me)).toContain('Editor');
  expect(requiredRole('publish', me)).toContain('Steward');
  expect(requiredRole('purge', me)).toBe('Requires Admin');
});

test('creation APIs send the caller domain without consulting a global dialog', async () => {
  const { api, scm } = await import('../../src/projects/api');
  const originalFetch = globalThis.fetch;
  const bodies: unknown[] = [];
  globalThis.fetch = (async (_url, init) => {
    bodies.push(JSON.parse(String(init?.body)));
    return Response.json({});
  }) as typeof fetch;
  try {
    await api.importBatch([{ path: 'a.yaml', source: 'ontology: []' }], 'Import', 'sales');
    await api.example('ubl', 'sales');
    await scm.clone('/tmp/example.git', 'Clone', 'sales');
    expect(bodies).toEqual([
      { files: [{ path: 'a.yaml', source: 'ontology: []' }], name: 'Import', domain: 'sales' },
      { domain: 'sales' },
      { url: '/tmp/example.git', name: 'Clone', domain: 'sales' },
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
