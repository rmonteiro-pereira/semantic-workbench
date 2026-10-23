// Another person's working branch stays theirs when no copy holds it, and a branch name is
// authorized as the very branch Git then checks out.
import { expect, test } from 'bun:test';
import { authWorkspace } from '../helpers/auth-workspace';
import { person } from './access-fixture';
import { copyFolder, gitOutput, openCopy, salesViewer, signedIn } from './working-copy-fixture';

const PROJECT = '/api/projects/sales-contracts';
const switchTo = (branch: string, create = false) =>
  [`${PROJECT}/git/switch`, 'POST', { branch, create }] as const;

test('a work branch of another person is refused even when no copy holds it', async () => {
  using fixture = await authWorkspace();
  const as = signedIn(fixture.ws);
  const alice = as(person('alice'));
  const frank = as(person('frank'));
  expect((await openCopy(alice.call, 'sales-contracts')).status).toBe(200);
  expect((await openCopy(frank.call, 'sales-contracts')).status).toBe(200);
  // Alice's copy goes away; her branch stays in the repository and is now held by nobody.
  await fixture.ws.worktrees.remove('sales-contracts', alice.principal.key);

  const refused = await frank.call(...switchTo('work/alice'));
  expect(refused.status).toBe(403);
  const created = await frank.call(...switchTo('work/someone-else', true));
  expect(created.status).toBe(403);
  const frankCopy = copyFolder(fixture.ws, frank.principal.key, 'sales-contracts');
  expect(gitOutput(frankCopy, ['branch', '--show-current']).text).toBe('work/frank');
  // The person's own branch is still theirs to use.
  expect((await frank.call(...switchTo('work/frank'))).status).toBe(200);
});

test('the branch list shows a person only their own work branch', async () => {
  using fixture = await authWorkspace();
  const as = signedIn(fixture.ws);
  const alice = as(person('alice'));
  const frank = as(person('frank'));
  const viewer = as(salesViewer());
  expect((await openCopy(alice.call, 'sales-contracts')).status).toBe(200);
  expect((await openCopy(frank.call, 'sales-contracts')).status).toBe(200);
  const base = copyFolder(fixture.ws, alice.principal.key, 'sales-contracts');
  gitOutput(base, ['update-ref', 'refs/remotes/origin/work/alice', 'HEAD']);

  const branchesOf = async (who: typeof alice) =>
    (await who.call(`${PROJECT}/git/branches`)).body as { local: string[]; remote: string[] };
  const seenByFrank = await branchesOf(frank);
  expect(seenByFrank.local).toContain('work/frank');
  expect(seenByFrank.local).not.toContain('work/alice');
  expect(seenByFrank.remote).not.toContain('origin/work/alice');
  const seenByAlice = await branchesOf(alice);
  expect(seenByAlice.local).toContain('work/alice');
  expect(seenByAlice.remote).toContain('origin/work/alice');
  const seenByViewer = await branchesOf(viewer);
  expect(seenByViewer.local.filter(name => name.startsWith('work/'))).toEqual([]);
});

test('a name that is not a branch is refused before Git acts on it', async () => {
  using fixture = await authWorkspace();
  const frank = signedIn(fixture.ws)(person('frank'));
  expect((await openCopy(frank.call, 'sales-contracts')).status).toBe(200);
  const copy = copyFolder(fixture.ws, frank.principal.key, 'sales-contracts');
  gitOutput(copy, ['tag', 'v1']);
  gitOutput(copy, ['branch', 'feature/a']);
  gitOutput(copy, ['update-ref', 'refs/remotes/origin/-x', 'HEAD']);
  expect((await frank.call(...switchTo('feature/a'))).status).toBe(200);
  expect((await frank.call(...switchTo('work/frank'))).status).toBe(200);

  for (const name of ['@{-1}', 'v1', 'origin/-x', 'no-such-branch']) {
    const refused = await frank.call(...switchTo(name));
    expect(refused.status, name).toBe(400);
  }
  expect(gitOutput(copy, ['branch', '--show-current']).text).toBe('work/frank');
});
