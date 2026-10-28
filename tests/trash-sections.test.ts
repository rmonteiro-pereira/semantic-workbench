// Tests that the trash lists the selected project's files and the deleted projects apart.
import { expect, test } from 'bun:test';
import type { TrashItem } from '../src/app/projects/api';
import { otherProjectFilesLine, trashSections } from '../src/app/projects/trash-sections';

const entry = (entryId: string, kind: TrashItem['kind'], project: string) =>
  ({ entryId, kind, project, projectName: project }) as TrashItem;

test('files of other projects stay out of the list, and deleted projects get their own section', () => {
  const items = [
    entry('1', 'file', 'sales'),
    entry('2', 'file', 'billing'),
    entry('3', 'project', 'billing'),
    entry('4', 'repository', 'monorepo'),
  ];
  const { files, projects, otherProjectFiles } = trashSections(items, 'sales');
  expect(files.map(item => item.entryId)).toEqual(['1']);
  expect(projects.map(item => item.entryId)).toEqual(['3', '4']);
  expect(otherProjectFiles).toBe(1);
});

test('the note counts deleted files of other projects', () => {
  expect(otherProjectFilesLine(1)).toBe('1 deleted file in other projects is not listed.');
  expect(otherProjectFilesLine(3)).toBe('3 deleted files in other projects are not listed.');
});
