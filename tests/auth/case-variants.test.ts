// A restricted folder stays restricted when a request spells it in another letter case, which a
// volume that ignores case (Azure Files over SMB) would open as the same folder.
import { expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { authWorkspace } from '../helpers/auth-workspace';
import { ontologyText } from '../helpers/git-fixtures';
import { person } from './access-fixture';
import { copyFolder, signedIn } from './working-copy-fixture';

const PROJECT = '/api/projects/sales-contracts';
const ORDERS = ontologyText('Sales extras', ['Discount']);

test('a case variant of a restricted folder is refused for every route that names a path', async () => {
  using fixture = await authWorkspace();
  const alice = signedIn(fixture.ws)(person('alice'));
  const variant = 'FINANCE/revenue-recognition.odcs.yaml';
  const created = 'FINANCE/new.odcs.yaml';

  const read = await alice.call(`${PROJECT}/files/${variant}`);
  const write = await alice.call(`${PROJECT}/files/${created}`, 'PUT', {
    baseHash: null,
    source: ORDERS,
  });
  const draft = await alice.call(`/api/drafts/sales-contracts/${created}`, 'PUT', {
    baseHash: null,
    text: ORDERS,
    patches: [],
  });
  const diff = await alice.call(`${PROJECT}/git/diff?repoPath=${variant}`);
  const history = await alice.call(`${PROJECT}/git/log?path=${variant}`);
  const staged = await alice.call(`${PROJECT}/git/stage`, 'POST', { paths: [created] });

  expect([read, write, draft, diff, history, staged].map(reply => reply.status)).toEqual([404, 404, 404, 404, 404, 404]);
  const base = join(fixture.ws.layout.projects, 'sales-contracts');
  expect(existsSync(join(base, 'FINANCE'))).toBe(false);
  const copy = copyFolder(fixture.ws, alice.principal.key, 'sales-contracts');
  expect(existsSync(join(copy, 'FINANCE'))).toBe(false);
});

test('a name in its exact case still saves', async () => {
  using fixture = await authWorkspace();
  const alice = signedIn(fixture.ws)(person('alice'));
  const saved = await alice.call(`${PROJECT}/files/new.odcs.yaml`, 'PUT', {
    baseHash: null,
    source: ORDERS,
  });
  expect(saved.status).toBe(200);
});
