import { expect, test } from 'bun:test';
import { join } from 'node:path';
import { boundaryReader } from '../auth/access-fixture';
import { itemDiffBaselineWorkspace } from '../helpers/item-diff-baseline';
import { sh } from '../helpers/scm';

const project = 'finance';
const reader = boundaryReader({ readableProjects: new Set([project]), canRead: () => true, roles: () => [] }, 'reader');

test('a visible branch and its full commit identify the same immutable files', async () => {
  using fixture = await itemDiffBaselineWorkspace();
  const directory = join(fixture.root, 'projects', project);
  sh(directory, ['switch', '-c', 'review/finance']);
  sh(directory, ['add', '.']);
  sh(directory, ['commit', '-m', 'Share test definition']);
  const branch = await fixture.ws.itemDiffSides.revision(project, 'branch', 'review/finance', reader);
  const commit = await fixture.ws.itemDiffSides.revision(project, 'commit', branch.version.version, reader);
  expect(commit.version.version).toBe(branch.version.version);
  expect(commit.documents).toEqual(branch.documents);
  expect(branch.documents.find(document => document.path === 'finance.ontology.yaml')?.source).toContain('An unpublished buyer.');
  sh(directory, ['switch', 'work/comparison']);
  sh(directory, ['branch', '-D', 'review/finance']);
  await expect(fixture.ws.itemDiffSides.revision(project, 'branch', 'review/finance', reader)).rejects.toMatchObject({ reason: 'unavailable' });
});

test('a commit reachable only through another person’s branch is unavailable', async () => {
  using fixture = await itemDiffBaselineWorkspace();
  const directory = join(fixture.root, 'projects', project);
  sh(directory, ['switch', '-c', 'work/another']);
  sh(directory, ['add', '.']);
  sh(directory, ['commit', '-m', 'Keep this definition private']);
  const privateTip = await fixture.ws.git.head(directory);
  await expect(fixture.ws.itemDiffSides.revision(project, 'branch', 'work/another', reader)).rejects.toMatchObject({ reason: 'unavailable' });
  await expect(fixture.ws.itemDiffSides.revision(project, 'commit', privateTip!, reader)).rejects.toMatchObject({ reason: 'unavailable' });
});
