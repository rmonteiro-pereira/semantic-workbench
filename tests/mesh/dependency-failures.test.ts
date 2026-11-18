import { expect, test } from 'bun:test';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { LOCAL_READER } from '../../src/server/projects/reader';
import { workspaceUnitSource } from '../../src/server/tessera/workspace-unit-source';
import { DEPENDENCY_MANIFEST_PATH, parseDependencyManifest, printDependencyManifest } from '../../src/shared/tessera/dependency-manifest';
import { meshWorkspace, publishDependent } from '../helpers/mesh-workspace';
import { publishFixture } from '../helpers/published-workspace';

test.each(['trashed', 'absent object', 'unexported concept'] as const)('compilation fails closed for a %s provider', async problem => {
  using fixture = await meshWorkspace('separate');
  await publishDependent(fixture);
  if (problem === 'trashed') {
    await fixture.ws.trash.deleteProject('finance');
  } else {
    // Simulate inconsistent persisted history after normal publication has already succeeded.
    const directory = fixture.projectDirectory('retail');
    const manifestPath = join(directory, DEPENDENCY_MANIFEST_PATH);
    const manifest = parseDependencyManifest(readFileSync(manifestPath, 'utf8'));
    const entry = manifest.providers[0];
    if (entry.sameRepository) throw new Error('The finance repository must be independent.');
    if (problem === 'absent object') {
      entry.commit = 'b'.repeat(entry.commit.length);
    } else {
      const root = join(directory, 'ontology.yaml');
      const data = JSON.parse(readFileSync(root, 'utf8'));
      data.tessera_imports[0].concepts = ['PrivateLedger'];
      entry.concepts = ['PrivateLedger'];
      writeFileSync(root, JSON.stringify(data));
    }
    writeFileSync(manifestPath, printDependencyManifest(manifest));
    await publishFixture(fixture.fixture);
  }
  const expected = {
    trashed: 'A locked provider is unavailable.',
    'absent object': 'A locked provider version is unavailable.',
    'unexported concept': 'A locked concept is not exported by its provider.',
  };
  await expect(workspaceUnitSource(fixture.ws, 'retail', LOCAL_READER).read('published')).rejects.toThrow(expected[problem]);
  const response = await fixture.fixture.handler(new Request('http://localhost:4310/api/projects/retail/compile', { method: 'POST', body: '{}' }));
  expect(response.status).toBe(400);
  expect(await response.text()).toContain(expected[problem]);
  const agent = await fixture.fixture.handler(new Request('http://localhost:4310/api/agent/catalog?project=retail'));
  expect(agent.status).toBe(400);
  expect(await agent.text()).toContain(expected[problem]);
});
