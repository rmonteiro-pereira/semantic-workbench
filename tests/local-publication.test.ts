// Verifies authoring transitions and publication against real Git indexes and refs.
import { expect, test } from 'bun:test';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { symbolicBranch } from '../src/server/projects/git';
import { moveToAuthoringBranch } from '../src/server/projects/local-publication';
import { localPublicationFixture as setup } from './helpers/local-publication-fixture';

for (const reuse of [false, true]) {
  test(`authoring switch ${reuse ? 'reuses' : 'creates'} work/local without changing staged or unstaged bytes`, async () => {
    using fixture = setup();
    if (!reuse) await fixture.git.run(fixture.repository, ['branch', '-D', 'work/local']);
    const path = join(fixture.repository, 'unrelated.txt');
    writeFileSync(path, 'staged');
    await fixture.git.stage(fixture.repository, ['unrelated.txt']);
    writeFileSync(path, 'unstaged');
    const staged = await fixture.git.blob(fixture.repository, '', 'unrelated.txt');
    const defaultTip = await fixture.git.revParse(fixture.repository, 'refs/heads/main');
    expect(await moveToAuthoringBranch(fixture.git, fixture.repository, 'main')).toEqual({ branch: 'work/local', movedFrom: 'main' });
    expect(await fixture.git.blob(fixture.repository, '', 'unrelated.txt')).toEqual(staged);
    expect(readFileSync(path, 'utf8')).toBe('unstaged');
    expect(await fixture.git.revParse(fixture.repository, 'refs/heads/main')).toBe(defaultTip);
  });
}

test('publishing moves only the default ref and pointer while preserving dirty files and index', async () => {
  using fixture = setup();
  await moveToAuthoringBranch(fixture.git, fixture.repository, 'main');
  const path = join(fixture.repository, 'shop.ontology.yaml');
  writeFileSync(path, 'unpublished dirty bytes');
  const index = readFileSync(join(fixture.repository, '.git', 'index'));
  const result = await fixture.publication.publishLocal('definitions', 'main', async () => {});
  expect(result).toEqual({ published: 'main', previous: fixture.published, commit: fixture.authoring });
  expect(await fixture.git.revParse(fixture.repository, 'refs/heads/main')).toBe(fixture.authoring);
  expect(await symbolicBranch(fixture.git, fixture.repository)).toBe('work/local');
  expect(readFileSync(path, 'utf8')).toBe('unpublished dirty bytes');
  expect(readFileSync(join(fixture.repository, '.git', 'index'))).toEqual(index);
  expect(fixture.pointers.get('definitions')?.commit).toBe(fixture.authoring);
});

test('first publication creates an unborn default and concurrent publications have one winner', async () => {
  using fixture = setup('unborn');
  const results = await Promise.allSettled([1, 2].map(() => fixture.publication.publishLocal('definitions', 'main', async () => {})));
  expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
  expect(await fixture.git.revParse(fixture.repository, 'refs/heads/main')).toBe(fixture.authoring);
  expect(fixture.pointers.get('definitions')).toEqual({ branch: 'main', commit: fixture.authoring });
});

test('detached and diverged authoring choices name the repair without changing HEAD', async () => {
  using fixture = setup();
  await fixture.git.run(fixture.repository, ['branch', '-f', 'work/local', fixture.foreign!]);
  await fixture.git.run(fixture.repository, ['commit', '--allow-empty', '-qm', 'Default-only commit']);
  const head = await fixture.git.head(fixture.repository);
  await expect(moveToAuthoringBranch(fixture.git, fixture.repository, 'main')).rejects.toThrow('Choose another authoring branch');
  expect(await fixture.git.head(fixture.repository)).toBe(head);
  await fixture.git.run(fixture.repository, ['checkout', '--detach', '-q']);
  await expect(moveToAuthoringBranch(fixture.git, fixture.repository, 'main')).rejects.toThrow('Choose an authoring branch');
});

test('an outside ref move during validation loses compare-and-swap without replacing the pointer', async () => {
  using fixture = setup();
  await moveToAuthoringBranch(fixture.git, fixture.repository, 'main');
  await expect(
    fixture.publication.publishLocal('definitions', 'main', async () => {
      await fixture.git.run(fixture.repository, ['update-ref', 'refs/heads/main', fixture.foreign!]);
    }),
  ).rejects.toThrow('fast-forward');
  expect(fixture.pointers.get('definitions')?.commit).toBe(fixture.published!);
  expect(await fixture.git.revParse(fixture.repository, 'refs/heads/main')).toBe(fixture.foreign!);
});

test('a non-descendant publication names the default and authoring branches to merge', async () => {
  using fixture = setup();
  await fixture.git.run(fixture.repository, ['checkout', '-q', 'work/other']);
  await fixture.git.run(fixture.repository, ['update-ref', 'refs/heads/main', fixture.authoring]);
  fixture.pointers.complete('definitions', 'main', fixture.authoring);
  await expect(fixture.publication.publishLocal('definitions', 'main', async () => {})).rejects.toThrow('Merge main into work/other first.');
  expect(fixture.pointers.get('definitions')?.commit).toBe(fixture.authoring);
});
