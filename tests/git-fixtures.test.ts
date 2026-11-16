// Confirms the publication fixtures have the histories their consumers require.
import { expect, test } from 'bun:test';
import { publicationRepository } from './helpers/git-fixtures';

function git(cwd: string, args: string[]) {
  return Bun.spawnSync(['git', ...args], { cwd });
}
for (const kind of ['history', 'unborn', 'outside-forward', 'outside-diverged'] as const) {
  test(`publication fixture represents ${kind}`, () => {
    const fixture = publicationRepository(kind);
    try {
      const ref = git(fixture.repository, ['rev-parse', '--verify', 'refs/heads/main']);
      if (kind === 'unborn') {
        expect(ref.exitCode).not.toBe(0);
        expect(git(fixture.repository, ['rev-parse', 'work/local']).stdout.toString().trim()).toBe(fixture.authoring);
        return;
      }
      const expected = { history: fixture.published, 'outside-forward': fixture.authoring, 'outside-diverged': fixture.previous }[kind];
      expect(ref.stdout.toString().trim()).toBe(expected!);
      expect(git(fixture.repository, ['merge-base', '--is-ancestor', fixture.published!, fixture.authoring]).exitCode).toBe(0);
      expect(git(fixture.repository, ['merge-base', '--is-ancestor', fixture.foreign!, fixture.authoring]).exitCode).toBe(1);
      expect(git(fixture.repository, ['merge-base', '--is-ancestor', fixture.published!, fixture.previous!]).exitCode).toBe(1);
    } finally {
      fixture.dispose();
    }
  });
}
