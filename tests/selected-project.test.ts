// Tests that the selected project decides which documents the app shows.
import { expect, test } from 'bun:test';
import { documentsOfProject, firstDocumentOfProject } from '../src/shared/core/project-scope';
import { projectRevisionKey, resolveSelectedProject } from '../src/shared/core/selected-project';

const projects = [{ slug: 'sales' }, { slug: 'billing' }];
const documents = [
  { id: 'sales/a.yaml', project: 'sales' },
  { id: 'billing/b.yaml', project: 'billing' },
  { id: 'billing/c.yaml', project: 'billing' },
];

test('a recorded project that exists stays selected', () => {
  expect(resolveSelectedProject(projects, 'billing')).toBe('billing');
});

test('a missing or unset project falls back to the first project, and none to nothing', () => {
  expect(resolveSelectedProject(projects, 'gone')).toBe('sales');
  expect(resolveSelectedProject(projects, '')).toBe('sales');
  expect(resolveSelectedProject([], 'sales')).toBe('');
});

test('only the selected project documents are offered, never another project first file', () => {
  expect(documentsOfProject(documents, 'billing').map(d => d.id)).toEqual(['billing/b.yaml', 'billing/c.yaml']);
  expect(firstDocumentOfProject(documents, 'billing')?.id).toBe('billing/b.yaml');
  expect(firstDocumentOfProject(documents, 'empty')).toBeNull();
});

test('the mappings revision follows only the selected project documents', () => {
  const files = [
    { id: 'sales/a.yaml', project: 'sales', hash: 'h1' },
    { id: 'billing/b.yaml', project: 'billing', hash: 'h2' },
  ];
  const before = projectRevisionKey(files, 'sales');
  const otherChanged = files.map(f => (f.project === 'billing' ? { ...f, hash: 'h9' } : f));
  expect(projectRevisionKey(otherChanged, 'sales')).toBe(before);
  const ownChanged = files.map(f => (f.project === 'sales' ? { ...f, hash: 'h9' } : f));
  expect(projectRevisionKey(ownChanged, 'sales')).not.toBe(before);
});
