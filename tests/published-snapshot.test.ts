// Exercises request pins, bounded retention and registry-sensitive immutable indexes.
import { expect, test } from 'bun:test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createGit } from '../src/server/projects/git';
import { createState, type ProjectEntry } from '../src/server/projects/state';
import { dataLayout } from '../src/server/projects/paths';
import { createPublishedPointers } from '../src/server/projects/published-pointer';
import { createPublishedSnapshots } from '../src/server/projects/published-snapshot';
import { publicationRepository } from './helpers/git-fixtures';
const initialProject = { slug: 'definitions', name: 'Definitions', createdAt: '', origin: '' };

function setup() {
  const fixture = publicationRepository();
  const layout = dataLayout(fixture.dir);
  mkdirSync(layout.state, { recursive: true });
  const pointers = createPublishedPointers(createState(layout));
  pointers.complete('definitions', 'main', fixture.published!);
  const git = createGit({ projectsRoot: layout.projects });
  let projects: ProjectEntry[] = [initialProject];
  const published = createPublishedSnapshots({ git, directory: () => fixture.repository, pointers, projects: () => projects, gitAvailable: () => true });
  return {
    fixture,
    git,
    pointers,
    published,
    registry: (next: ProjectEntry[]) => {
      projects = next;
    },
  };
}

test('a request pin keeps its commit and byte contents after publication moves', async () => {
  const { fixture, pointers, published } = setup();
  try {
    await published.withPin(async pin => {
      const before = await published.documents(pin, 'definitions');
      pointers.complete('definitions', 'main', fixture.authoring);
      published.supersede();
      expect(await published.documents(pin, 'definitions')).toEqual(before);
      expect(pin.commits.get('definitions')?.commit).toBe(fixture.published!);
      const after = await published.documents(published.pin(), 'definitions');
      expect(after[0].source).not.toBe(before[0].source);
      const bytes = (await published.fileBytes(pin, 'definitions', before[0].path))!;
      bytes.fill(0);
      expect((await published.fileBytes(pin, 'definitions', before[0].path))![0]).not.toBe(0);
      expect(await published.fileBytes(pin, 'definitions', 'absent')).toBeNull();
    });
  } finally {
    fixture.dispose();
  }
});

test('fifty publications retain only current and previous indexes plus the active pin', async () => {
  const { fixture, pointers, published, git } = setup();
  try {
    await published.withPin(async pin => {
      const first = await published.documents(pin, 'definitions');
      for (let index = 0; index < 50; index++) {
        await git.commit(fixture.repository, `Publication ${index}`, true);
        pointers.complete('definitions', 'main', (await git.head(fixture.repository))!);
        published.supersede();
        await published.documents(published.pin(), 'definitions');
        expect(published.retainedCount()).toBeLessThanOrEqual(3);
      }
      expect(await published.documents(pin, 'definitions')).toEqual(first);
    });
    expect(published.retainedCount()).toBeLessThanOrEqual(2);
    expect((await published.documentsAt(fixture.published!, 'definitions'))[0].source).toContain('Published');
  } finally {
    fixture.dispose();
  }
});

test('registry changes rebuild the project layout without restarting', async () => {
  const { fixture, pointers, published, registry, git } = setup();
  try {
    mkdirSync(join(fixture.repository, 'nested'));
    writeFileSync(join(fixture.repository, 'nested', 'nested.yaml'), 'name: Nested\nontology: [{concept: Nested}]\n');
    await git.addAll(fixture.repository);
    await git.commit(fixture.repository, 'Nested project');
    pointers.complete('definitions', 'main', (await git.head(fixture.repository))!);
    const pin = published.pin();
    const root = await published.documents(pin, 'definitions');
    expect(root).toHaveLength(2);
    registry([{ ...initialProject, folder: 'definitions/nested', repo: 'definitions' }]);
    const nested = await published.documents(pin, 'definitions');
    expect(nested).toHaveLength(1);
    expect(nested[0].path).toBe('nested.yaml');
    expect(nested[0].source).toContain('Nested');
    registry([]);
    await expect(published.documents(pin, 'definitions')).rejects.toThrow('no published snapshot');
  } finally {
    fixture.dispose();
  }
});

test('remembered revisions rebuild only published history and refuse missing objects', async () => {
  const { fixture, published, git } = setup();
  try {
    expect((await published.documentsAt(fixture.previous!, 'definitions'))[0].source).toContain('Previous');
    await expect(published.documentsAt(fixture.foreign!, 'definitions')).rejects.toThrow('no published snapshot');
    const blob = git.catFileBatch;
    git.catFileBatch = async () => {
      throw Error('Missing object');
    };
    await expect(published.documentsAt(fixture.published!, 'definitions')).rejects.toThrow('no published snapshot');
    git.catFileBatch = blob;
  } finally {
    fixture.dispose();
  }
});
