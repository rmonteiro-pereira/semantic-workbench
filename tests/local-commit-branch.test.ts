// Commits through the existing HTTP boundary after opening a pre-change local repository.
import { expect, test } from 'bun:test';
import { join } from 'node:path';
import { writeFileSync } from 'node:fs';
import { createState } from '../src/server/projects/state';
import { dataLayout } from '../src/server/projects/paths';
import { publicationRepository } from './helpers/git-fixtures';
import { testWorkspace } from './helpers/temp-data-dir';

for (const branch of ['main', 'work/other']) {
  test(`a local commit on ${branch} reports authoring and leaves the published ref untouched`, async () => {
    const repository = publicationRepository();
    const state = createState(dataLayout(repository.dir));
    state.writeRegistry([{ slug: 'definitions', name: 'Definitions', origin: '', createdAt: '' }]);
    using fixture = await testWorkspace({ root: repository.dir });
    await fixture.ws.git.run(repository.repository, ['checkout', '-q', branch]);
    writeFileSync(join(repository.repository, 'new.ontology.yaml'), 'name: New\nontology: []\n');
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
