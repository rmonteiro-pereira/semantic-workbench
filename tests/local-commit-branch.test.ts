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

test('a default named work/local is preserved until another authoring branch is selected', async () => {
  const repository = publicationRepository();
  const checkout = Bun.spawnSync(['git', 'checkout', '-q', 'work/local'], { cwd: repository.repository });
  expect(checkout.exitCode).toBe(0);
  createState(dataLayout(repository.dir)).writeRegistry([{ slug: 'definitions', name: 'Definitions', origin: '', createdAt: '' }]);
  using fixture = await testWorkspace({ root: repository.dir });
  const previous = await fixture.ws.git.head(repository.repository);
  const path = join(repository.repository, 'new.ontology.yaml');
  const source = ontologyText('New', ['Item']);
  writeFileSync(path, source);
  const commit = () =>
    fixture.handler(
      new Request('http://localhost/api/projects/definitions/git/commit', {
        method: 'POST',
        body: JSON.stringify({ message: 'Add definition', paths: ['new.ontology.yaml'] }),
      }),
    );
  const refused = await commit();
  expect(refused.status).not.toBe(200);
  expect((await refused.json()).error).toContain('another authoring branch');
  expect(await fixture.ws.git.revParse(repository.repository, 'refs/heads/work/local')).toBe(previous);
  expect(await Bun.file(path).text()).toBe(source);
  await fixture.ws.git.run(repository.repository, ['switch', '-c', 'authoring']);
  const accepted = await commit();
  expect(accepted.status).toBe(200);
  const result = await accepted.json();
  expect(result.branch).toBe('authoring');
  expect(await fixture.ws.git.revParse(repository.repository, 'refs/heads/work/local')).toBe(previous);
  const publication = await fixture.handler(new Request('http://localhost/api/projects/definitions/git/publish', { method: 'POST', body: '{}' }));
  expect(publication.status).toBe(200);
  expect((await publication.json()).previous).toBe(previous);
  expect(await fixture.ws.git.revParse(repository.repository, 'refs/heads/work/local')).toBe(result.commit);
});
