import { expect, test } from 'bun:test';
import { footerCounts } from '../src/app/workspace/StatusFooter';

test('an ontology reports entities and relationships', () => {
  expect(footerCounts('Ossie ontology', 45, 277)).toBe('45 entities · 277 relationships');
  expect(footerCounts(undefined, 1, 1)).toBe('1 entity · 1 relationship');
});

test('a mapping file reports its concept mappings, not an empty relationship count', () => {
  expect(footerCounts('Ossie mappings', 167, 0)).toBe('167 concept mappings');
  expect(footerCounts('Ossie mappings', 1, 0)).toBe('1 concept mapping');
});
