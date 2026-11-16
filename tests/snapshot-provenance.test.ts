// Checks provenance against real ref histories in both supported object formats.
import { expect, test } from 'bun:test';
import { createGit } from '../src/server/projects/git';
import { createState } from '../src/server/projects/state';
import { dataLayout } from '../src/server/projects/paths';
import { createPublishedPointers } from '../src/server/projects/published-pointer';
import { createPublishedSnapshots } from '../src/server/projects/published-snapshot';
import { publicationRepository } from './helpers/git-fixtures';

for (const format of ['sha1', 'sha256'] as const) {
  test(`${format} revisions require full published ancestry or an inside-history tag`, async () => {
    const fixture = publicationRepository('history', format);
    try {
      const layout = dataLayout(fixture.dir);
      const git = createGit({ projectsRoot: layout.projects });
      const pointers = createPublishedPointers(createState(layout));
      pointers.complete('definitions', 'main', fixture.published!);
      const published = createPublishedSnapshots({
        git,
        pointers,
        directory: () => fixture.repository,
        projects: () => [{ slug: 'definitions', name: 'Definitions', origin: '', createdAt: '' }],
        gitAvailable: () => true,
      });
      await git.run(fixture.repository, ['tag', 'inside', fixture.previous!]);
      await git.run(fixture.repository, ['tag', '-a', 'outside', fixture.foreign!, '-m', 'Outside history']);
      await git.run(fixture.repository, ['branch', 'proposal/review', fixture.foreign!]);
      const blob = (await git.lsTree(fixture.repository, fixture.published!))[0].id;
      const refused = [fixture.published!.slice(0, 12), 'main', 'work/local', 'work/other', 'proposal/review', fixture.authoring, fixture.foreign!, blob, 'outside'];
      for (const revision of refused) {
        expect(await published.resolveRevision(revision)).toBeNull();
        await expect(published.documentsAt(revision, 'definitions')).rejects.toMatchObject({ reason: 'unavailable' });
      }
      expect(fixture.published!.length).toBe(format === 'sha1' ? 40 : 64);
      expect(await published.resolveRevision(fixture.previous!)).toBe(fixture.previous!);
      expect(await published.resolveRevision('inside')).toBe(fixture.previous!);
      expect((await published.documentsAt('inside', 'definitions'))[0].source).toContain('Previous publication');
      expect((await published.documentsAt(fixture.published!, 'definitions'))[0].source).toContain('Published');
    } finally {
      fixture.dispose();
    }
  });
}
