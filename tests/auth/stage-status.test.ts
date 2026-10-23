// Staging answers with the caller's own view of the repository, never the unfiltered status.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'bun:test';
import { authWorkspace } from '../helpers/auth-workspace';
import { person } from './access-fixture';
import { copyFolder, openCopy, signedIn } from './working-copy-fixture';

const PROJECT = '/api/projects/sales-contracts';
const ORDERS = 'orders.odcs.yaml';

test('staging and unstaging a file do not list changes in a folder the person cannot read', async () => {
  using fixture = await authWorkspace();
  const alice = signedIn(fixture.ws)(person('alice'));
  expect((await openCopy(alice.call, 'sales-contracts')).status).toBe(200);
  const copy = copyFolder(fixture.ws, alice.principal.key, 'sales-contracts');
  // A file that arrived in the restricted folder by some other route, such as a merge.
  mkdirSync(join(copy, 'finance'), { recursive: true });
  writeFileSync(join(copy, 'finance', 'budget-draft.txt'), 'hidden');
  writeFileSync(join(copy, ORDERS), '# touched\n' + (await Bun.file(join(copy, ORDERS)).text()));

  const staged = await alice.call(`${PROJECT}/git/stage`, 'POST', { paths: [ORDERS] });
  expect(staged.status).toBe(200);
  expect(staged.body.changes.map((change: { path: string }) => change.path)).toEqual([ORDERS]);
  expect(JSON.stringify(staged.body)).not.toContain('finance');

  const unstaged = await alice.call(`${PROJECT}/git/unstage`, 'POST', { paths: [ORDERS] });
  expect(unstaged.status).toBe(200);
  expect(JSON.stringify(unstaged.body)).not.toContain('finance');
});

test('staging everything is refused while a change the person may not stage is waiting', async () => {
  using fixture = await authWorkspace();
  const alice = signedIn(fixture.ws)(person('alice'));
  expect((await openCopy(alice.call, 'sales-contracts')).status).toBe(200);
  const copy = copyFolder(fixture.ws, alice.principal.key, 'sales-contracts');
  mkdirSync(join(copy, 'finance'), { recursive: true });
  writeFileSync(join(copy, 'finance', 'budget-draft.txt'), 'hidden');
  const all = await alice.call(`${PROJECT}/git/stage`, 'POST', { all: true });
  expect(all.status).toBe(404);
  expect(JSON.stringify(all.body)).not.toContain('finance');
});
