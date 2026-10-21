import { test, expect } from 'bun:test';
import { issueFeature, sourceLineRange } from '../src/editor/feature';
test('feature paths decode pointer escapes and identify list entries', () => {
  expect(issueFeature('/schema/2/properties/0/name')).toBe(
    'schema → item 3 → properties → item 1 → name',
  );
  expect(issueFeature('/a~1b/~0label')).toBe('a/b → ~label');
  expect(issueFeature('/')).toBe('Document');
});
test('line location selects the full offending line without adjacent content', () => {
  const source = 'name: example\nproperties:\n  bad: missing\nnext: fine';
  const range = sourceLineRange(source, 3);
  expect(source.slice(range.start, range.end)).toBe('  bad: missing');
  expect(range.line).toBe(3);
});
test('line navigation clamps stale locations and handles blank and final lines', () => {
  expect(sourceLineRange('one\n\n', 2)).toEqual({ start: 4, end: 4, line: 2 });
  expect(sourceLineRange('one\n\n', 500)).toEqual({ start: 5, end: 5, line: 3 });
  expect(sourceLineRange('one', 0)).toEqual({ start: 0, end: 3, line: 1 });
  expect(sourceLineRange('', 1)).toEqual({ start: 0, end: 0, line: 1 });
});
test('feature labels identify named ontology objects and relationships', () => {
  const source =
    'ontology:\n  - name: Customer\n    relationships:\n      - name: orders\n        target: Missing\n';
  expect(issueFeature('/ontology/0/relationships/0/target', source)).toBe(
    'ontology → Customer (item 1) → relationships → orders (item 1) → target',
  );
  expect(issueFeature('/roles/0', 'roles: [Missing]')).toBe('roles → Missing (item 1)');
});
test('feature labels safely fall back for malformed source or missing nodes', () => {
  expect(issueFeature('/ontology/0/relationships/2', 'ontology: [broken')).toBe(
    'ontology → item 1 → relationships → item 3',
  );
  expect(issueFeature('/ontology/8/name', 'ontology: []')).toBe('ontology → item 9 → name');
});
test('named feature traversal decodes escaped JSON pointer keys', () => {
  const source = '{"a/b":[{"name":"Order"}],"~names":["missing"]}';
  expect(issueFeature('/a~1b/0/name', source)).toBe('a/b → Order (item 1) → name');
  expect(issueFeature('/~0names/0', source)).toBe('~names → missing (item 1)');
});
