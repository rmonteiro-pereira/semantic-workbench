// Verifies durable sign-in records and stable branch handles on temporary data roots.
import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createState } from '../../src/server/projects/state';
import { dataLayout } from '../../src/server/projects/paths';
import { localPrincipal } from '../../src/server/auth/principal';
import { tempDataDir } from '../helpers/temp-data-dir';

test('sign-ins retain only identity fields and atomically update a stable unique handle', () => {
  const directory = tempDataDir();
  try {
    const state = createState(dataLayout(directory.root));
    expect(state.users().users).toEqual([]);
    const first = {
      ...localPrincipal(),
      username: 'Alice.Smith@example.org',
      accessToken: 'never-store-me',
    };
    state.recordUser(first, '2026-10-21T00:00:00Z');
    state.recordUser({ ...first, id: 'second', key: 'second' }, '2026-10-21T01:00:00Z');
    state.recordUser(
      { ...first, username: 'renamed', grants: [], deactivated: true },
      '2026-10-21T02:00:00Z',
    );
    const records = state.users().users;
    expect(records.map(record => record.handle)).toEqual(['alice-smith', 'alice-smith-2']);
    expect(records[0].access).toBe('none');
    expect(records[0].lastSignInAt).toBe('2026-10-21T02:00:00Z');
    expect(readFileSync(join(directory.root, 'state/users.json'), 'utf8')).not.toContain(
      'never-store-me',
    );
    expect(createState(dataLayout(directory.root)).users()).toEqual(state.users());
  } finally {
    directory.cleanup();
  }
});
