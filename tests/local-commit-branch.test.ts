// Commits through the existing HTTP boundary after opening a pre-change local repository.
import { expect, test } from 'bun:test';
import { join } from 'node:path';
import { writeFileSync } from 'node:fs';
import { createState } from '../src/server/projects/state';
import { dataLayout } from '../src/server/projects/paths';
import { ontologyText, publicationRepository } from './helpers/git-fixtures';
import { testWorkspace } from './helpers/temp-data-dir';

for (const branch of ['main', 'work/other']) {
  test(`a local commit on ${branch} reports authoring and leaves the published ref untouched`, async () => {
    const repository = publicationRepository();
    const state = createState(dataLayout(repository.dir));
    state.writeRegistry([{ slug: 'definitions', name: 'Definitions', origin: '', createdAt: '' }]);
    using fixture = await testWorkspace({ root: repository.dir });
    await fixture.ws.git.run(repository.repository, ['checkout', '-q', branch]);
    writeFileSync(join(repository.repository, 'new.ontology.yaml'), ontologyText('New', ['Item']));
    const response = await fixture.handler(
      new Request('http://localhost/api/projects/definitions/git/commit', {
        method: 'POST',
        body: JSON.stringify({ message: 'Add definition', paths: ['new.ontology.yaml'] }),
      }),
    );
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.branch).toBe(branch === 'main' ? 'work/local' : branch);
    if (branch === 'main') expect(result.movedFrom).toBe('main');
    else expect(result).not.toHaveProperty('movedFrom');
    expect(await fixture.ws.git.revParse(repository.repository, 'refs/heads/main')).toBe(repository.published!);
    expect(await fixture.ws.git.head(repository.repository)).toBe(result.commit);
  });
}

test('automatic import commits begin on authoring with an unborn default', async () => {
  using fixture = await testWorkspace();
  const { slug } = await fixture.seed([{ path: 'shop.ontology.yaml', source: ontologyText('Shop', ['Item']) }], 'Shop');
  const directory = join(fixture.root, 'projects', slug);
  expect(await fixture.ws.git.revParse(directory, 'refs/heads/main')).toBeNull();
  expect((await fixture.ws.git.run(directory, ['branch', '--show-current'])).stdout.trim()).toBe('work/local');
  expect(await fixture.ws.git.configValue(directory, 'workbench.defaultBranch', 'local')).toBe('main');
});

test('importing into an upgraded default checkout commits on authoring without moving its snapshot', async () => {
  const repository = publicationRepository();
  createState(dataLayout(repository.dir)).writeRegistry([{ slug: 'definitions', name: 'Definitions', origin: '', createdAt: '' }]);
  using fixture = await testWorkspace({ root: repository.dir });
  await fixture.ws.importInto('definitions', [{ path: 'new.ontology.yaml', source: ontologyText('New', ['Item']) }], undefined, (await import('../src/server/projects/reader')).LOCAL_READER);
  expect(await fixture.ws.git.revParse(repository.repository, 'refs/heads/main')).toBe(repository.published!);
  expect((await fixture.ws.git.run(repository.repository, ['branch', '--show-current'])).stdout.trim()).toBe('work/local');
});
