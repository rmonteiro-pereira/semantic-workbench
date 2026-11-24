// Records how publishing from a personal copy behaves today in a repository of three projects, so
// that promoting a proposal can be shown to reuse it unchanged.
import { expect, test } from 'bun:test';
import { commitEdit, filePath, proposalFixture } from './helpers/proposal-fixture';
import { gitOutput } from './auth/working-copy-fixture';

test('publishing from a copy moves the default branch and refreshes every project of the repository', async () => {
  using fixture = await proposalFixture();
  const dave = fixture.dave();
  const { sales, billing, people } = fixture.projects;
  await commitEdit(dave, sales, '# edited\n');
  const published = await dave.call(`/api/projects/${sales.slug}/git/publish`, 'POST', {});
  expect(published.status, JSON.stringify(published.body)).toBe(200);
  const base = fixture.ws.worktrees.baseDir(fixture.repository);
  expect(gitOutput(base, ['rev-parse', 'refs/heads/main']).text).toBe(published.body.commit);
  expect(fixture.ws.state.published().repositories[fixture.repository].commit).toBe(published.body.commit);
  const event = fixture.ws.events.replay(0)!.find(candidate => candidate.event === 'published');
  expect([...(event!.tags.projects ?? [])].sort()).toEqual([billing.slug, people.slug, sales.slug].sort());
  expect((await dave.call(filePath(sales.slug, sales.file))).body.source).toContain('# edited');
});

test('publishing without authority over every project of the repository is refused and moves nothing', async () => {
  using fixture = await proposalFixture();
  const bob = fixture.bob();
  const { sales } = fixture.projects;
  await commitEdit(bob, sales, '# edited\n');
  const before = gitOutput(fixture.ws.worktrees.baseDir(fixture.repository), ['rev-parse', 'refs/heads/main']).text;
  const refused = await bob.call(`/api/projects/${sales.slug}/git/publish`, 'POST', {});
  expect([403, 404]).toContain(refused.status);
  expect(gitOutput(fixture.ws.worktrees.baseDir(fixture.repository), ['rev-parse', 'refs/heads/main']).text).toBe(before);
});
