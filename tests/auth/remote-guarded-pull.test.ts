// A guarded pull in server mode fetches with the person's own token, checks what it would bring
// in, and merges only the commit it checked.
import { afterAll, beforeAll, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { TEST_USERS } from '../helpers/auth-identities';
import {
  git,
  projectPath,
  publishSalesBranch,
  pushIncoming,
  salesFile,
  salesRepositories,
  startRemoteSetup,
  type RemoteSetup,
} from './remote-setup';

let setup: RemoteSetup;
const sales = projectPath('sales-contracts');

beforeAll(async () => {
  setup = await startRemoteSetup();
});

afterAll(() => setup.stop());

// The identities behind every fetch the Azure DevOps stand-in served since a point in its history.
function fetchIdentitiesSince(start: number) {
  return setup.azureDevOps.requests
    .slice(start)
    .filter(request => request.service === 'git-upload-pack')
    .map(request => request.identity);
}

function localHead() {
  return git(salesRepositories(setup).local, ['rev-parse', 'HEAD']).trim();
}

test('an Editor’s guarded pull and sync fetch with her own Azure DevOps token', async () => {
  const alice = await setup.signIn('alice');
  const clone = await publishSalesBranch(setup, alice, 'alice-incoming');
  const notes = join(dirname(salesFile(clone, 'orders.odcs.yaml')), 'incoming-notes.md');

  pushIncoming(clone, notes, () => 'First incoming note.\n');
  const beforePull = setup.azureDevOps.requests.length;
  const pulled = await setup.call(alice, 'POST', sales + '/git/pull');
  expect(pulled.status).toBe(200);
  expect(pulled.body.ok).toBe(true);
  const pullFetches = fetchIdentitiesSince(beforePull);
  expect(pullFetches.length).toBeGreaterThan(0);
  expect(new Set(pullFetches)).toEqual(new Set([TEST_USERS.alice.oid]));

  const tip = pushIncoming(clone, notes, text => text + 'Second incoming note.\n');
  const beforeSync = setup.azureDevOps.requests.length;
  const synced = await setup.call(alice, 'POST', sales + '/git/sync');
  expect(synced.status).toBe(200);
  expect(synced.body.ok).toBe(true);
  const syncFetches = fetchIdentitiesSince(beforeSync);
  expect(syncFetches.length).toBeGreaterThan(0);
  expect(new Set(syncFetches)).toEqual(new Set([TEST_USERS.alice.oid]));
  expect(localHead()).toBe(tip);
});

test('a refused pull leaves HEAD as it was, and a commit pushed after the fetch is not merged', async () => {
  const alice = await setup.signIn('alice');
  const clone = await publishSalesBranch(setup, alice, 'reclassified');
  const orders = salesFile(clone, 'orders.odcs.yaml');
  const reclassify = (text: string) =>
    text.replace('classification: internal', 'classification: public');
  pushIncoming(clone, orders, reclassify);

  // An Editor may not bring in a classification change, so nothing changes on her side.
  const head = localHead();
  const refused = await setup.call(alice, 'POST', sales + '/git/pull');
  expect(refused.status).toBe(403);
  expect(refused.body.guarded.length).toBeGreaterThan(0);
  expect(localHead()).toBe(head);

  // A Steward may. On a fresh branch, so the fetch has objects to download, a commit lands on the
  // remote while the fetch runs, after the branch tips were listed; it stays out of the merge.
  const bob = await setup.signIn('bob');
  const stewardClone = await publishSalesBranch(setup, bob, 'steward-pull');
  // A comment keeps this commit apart from the one the Editor's fetch already downloaded.
  const stewardTip = pushIncoming(stewardClone, orders, text => reclassify(text) + '# Steward\n');
  const late = join(dirname(orders), 'late-notes.md');
  let lateTip = '';
  setup.azureDevOps.beforeServe(request => {
    if (!request.path.endsWith('/git-upload-pack')) return;
    setup.azureDevOps.beforeServe(null);
    lateTip = pushIncoming(stewardClone, late, () => 'Pushed after the fetch.\n');
  });
  const pulled = await setup.call(bob, 'POST', sales + '/git/pull');
  setup.azureDevOps.beforeServe(null);
  expect(pulled.status).toBe(200);
  expect(pulled.body.ok).toBe(true);
  expect(lateTip).not.toBe('');
  expect(localHead()).toBe(stewardTip);
  expect(existsSync(join(salesRepositories(setup).local, late))).toBe(false);
});
