import { expect, test } from 'bun:test';
import { join } from 'node:path';
import { writeFileSync } from 'node:fs';
import { SNAPSHOT_LIMITS } from '../../src/server/projects/snapshot-index';
import { createGit } from '../../src/server/projects/git';
import { openWorkspace } from '../../src/server/projects/workspace';
import { LOCAL_READER } from '../../src/server/projects/reader';
import { itemDiffBaselineWorkspace } from '../helpers/item-diff-baseline';
import { publishFixture } from '../helpers/published-workspace';
import { testWorkspace } from '../helpers/temp-data-dir';

const project = 'finance';
const path = 'finance.ontology.yaml';

test('published sides are absent until a commit is published', async () => {
  using fixture = await testWorkspace({ gitBinary: 'unavailable-test-git', watch: false });
  const entry = await fixture.seed([{ path, source: 'name: Finance\nontology: [{concept: Customer}]' }], 'Finance');
  const git = createGit({ projectsRoot: fixture.ws.layout.projects });
  await git.init(join(fixture.ws.layout.projects, entry.slug));
  fixture.ws.close();
  const workspace = await openWorkspace({ root: fixture.root, watch: false });
  try {
    await expect(workspace.itemDiffSides.published(entry.slug, LOCAL_READER)).rejects.toMatchObject({ reason: 'no-commit' });
  } finally {
    workspace.close();
  }
});

test('the published side names the commit whose documents it read', async () => {
  using fixture = await itemDiffBaselineWorkspace();
  const initial = await fixture.ws.itemDiffSides.published(project, LOCAL_READER);
  expect(initial.version.version).toBe(fixture.ws.state.published().repositories[project].commit);
  expect(initial.documents.find(document => document.path === path)?.source).toContain('A buyer.');
  await publishFixture(fixture);
  const updated = await fixture.ws.itemDiffSides.published(project, LOCAL_READER);
  expect(updated.version.version).toBe(fixture.ws.state.published().repositories[project].commit);
  expect(updated.version.version).not.toBe(initial.version.version);
  expect(updated.documents.find(document => document.path === path)?.source).toContain('An unpublished buyer.');
});

test('working side refuses a file over the snapshot limit', async () => {
  using fixture = await itemDiffBaselineWorkspace();
  const directory = join(fixture.root, 'projects', project);
  writeFileSync(join(directory, 'large.ontology.yaml'), Buffer.alloc(SNAPSHOT_LIMITS.documentBytes + 1));
  await expect(fixture.ws.itemDiffSides.working(project, LOCAL_READER)).rejects.toMatchObject({ reason: 'unavailable' });
});

test('unsaved drafts do not change working comparison data or its version', async () => {
  using fixture = await itemDiffBaselineWorkspace();
  const before = await fixture.ws.itemDiffSides.working(project, LOCAL_READER);
  const saved = fixture.ws.readFile(project, path, LOCAL_READER);
  fixture.ws.state.writeDraft(project, path, { baseHash: saved.hash, text: 'draft bytes', patches: [] });
  expect(await fixture.ws.itemDiffSides.working(project, LOCAL_READER)).toEqual(before);
  expect(before.documents.find(document => document.path === path)?.source).toContain('An unpublished buyer.');
});
