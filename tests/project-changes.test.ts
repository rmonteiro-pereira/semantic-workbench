// Tests that Source Control lists only the selected project's changes in a shared repository.
import { expect, test } from 'bun:test';
import type { GitChange } from '../src/projects/api';
import { changesOfProject, elsewhereLine } from '../src/scm/project-changes';

const change = (path: string, outside = false) => ({ path, repoPath: path, outside }) as GitChange;

test('changes of other projects and of no project are counted, not listed', () => {
  const changes = [
    change('finance.ontology.yaml'),
    change('domains/sales/sales.ontology.yaml', true),
    change('README.md', true),
  ];
  const { inProject, elsewhere } = changesOfProject(changes);
  expect(inProject.map(c => c.path)).toEqual(['finance.ontology.yaml']);
  expect(elsewhere).toBe(2);
});

test('the note names the count and keeps the repository-level actions honest', () => {
  expect(elsewhereLine(1)).toContain('1 change in other projects of this repository is not listed');
  expect(elsewhereLine(3)).toContain('3 changes');
  expect(elsewhereLine(3)).toContain('whole repository');
});
