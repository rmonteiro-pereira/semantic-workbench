import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { testWorkspace } from './helpers/temp-data-dir';
import { LOCAL_READER } from '../src/server/projects/reader';
// Tests that the trash lists the selected project's files and the deleted projects apart.
import { expect, test } from 'bun:test';
import type { TrashItem } from '../src/app/projects/api';
import { otherProjectFilesLine, trashSections } from '../src/app/projects/trash-sections';

const entry = (entryId: string, kind: TrashItem['kind'], project: string) => ({ entryId, kind, project, projectName: project }) as TrashItem;

test('files of other projects get a separate list, and deleted projects get their own section', () => {
  const items = [entry('1', 'file', 'sales'), entry('2', 'file', 'billing'), entry('3', 'project', 'billing'), entry('4', 'repository', 'monorepo')];
  const { files, projects, otherProjectFiles, otherFiles } = trashSections(items, 'sales');
  expect(files.map(item => item.entryId)).toEqual(['1']);
  expect(projects.map(item => item.entryId)).toEqual(['3', '4']);
  expect(otherProjectFiles).toBe(1);
  expect(otherFiles.map(item => item.entryId)).toEqual(['2']);
});

test('the note counts deleted files of other projects', () => {
  expect(otherProjectFilesLine(1)).toBe('1 deleted file in other projects is not listed.');
  expect(otherProjectFilesLine(3)).toBe('3 deleted files in other projects are not listed.');
});

test('empty trash purges a file hidden by another selected project', async () => {
  const workspace = await testWorkspace();
  try {
    const source = 'name: Alpha\nontology: [{concept: Alpha}]\n';
    await workspace.ws.importBatch({ name: 'Alpha', files: [{ path: 'alpha.yaml', source }] }, LOCAL_READER);
    await workspace.ws.importBatch({ name: 'Beta', files: [{ path: 'beta.yaml', source }] }, LOCAL_READER);
    const { entryId } = await workspace.ws.trash.deleteFile('alpha', 'alpha.yaml', undefined, LOCAL_READER);
    const before = readdirSync(join(workspace.root, 'trash'));
    expect(before).toContain(entryId);
    const response = await workspace.handler(new Request('http://127.0.0.1:5252/api/trash'));
    const items = (await response.json()) as TrashItem[];
    expect(trashSections(items, 'beta').files).toEqual([]);
    const emptied = await workspace.handler(new Request('http://127.0.0.1:5252/api/trash', { method: 'DELETE', body: JSON.stringify({ confirm: true }) }));
    expect(emptied.status).toBe(204);
    expect(readdirSync(join(workspace.root, 'trash'))).not.toContain(entryId);
  } finally {
    workspace.dispose();
  }
});
