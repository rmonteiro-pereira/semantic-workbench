import { describe, expect, test } from 'bun:test';
import { chooseMapping } from '../src/mappings/mapping-choice';
import { limitCovering, showMoreLabel, visibleCount } from '../src/mappings/list-window';

const mappings = [
  { id: 'ubl.mapping', project: 'ubl' },
  { id: 'mall.mapping', project: 'mall' },
  { id: 'mall.ontology#ontology_mappings/0', project: 'mall' },
];

describe('chooseMapping', () => {
  test('prefers a mapping defined in the open file', () => {
    expect(chooseMapping(mappings, 'mall.ontology', 'mall', '')).toBe(
      'mall.ontology#ontology_mappings/0',
    );
  });

  test('defaults to a mapping of the open file project, not another project', () => {
    expect(chooseMapping(mappings, 'mall.semantic', 'mall', '')).toBe('mall.mapping');
  });

  test('replaces a previous choice from another project', () => {
    expect(chooseMapping(mappings, 'mall.semantic', 'mall', 'ubl.mapping')).toBe('mall.mapping');
  });

  test('keeps a previous choice from the same project', () => {
    expect(
      chooseMapping(mappings, 'mall.semantic', 'mall', 'mall.ontology#ontology_mappings/0'),
    ).toBe('mall.ontology#ontology_mappings/0');
  });

  test('falls back to any mapping when the project has none', () => {
    expect(chooseMapping(mappings, 'other.file', 'other', '')).toBe('ubl.mapping');
    expect(chooseMapping([], undefined, undefined, '')).toBe('');
  });
});

describe('list window', () => {
  test('never shows more than the list holds', () => {
    expect(visibleCount(10, 4)).toBe(4);
    expect(visibleCount(5, 40)).toBe(5);
  });

  test('widens the limit to cover a selected item past it', () => {
    expect(limitCovering(5, 12)).toBe(13);
    expect(limitCovering(5, 2)).toBe(5);
    expect(limitCovering(5, -1)).toBe(5);
  });

  test('names the next step, or what remains when less than a step is hidden', () => {
    expect(showMoreLabel(40, 10)).toBe('Show 10 more');
    expect(showMoreLabel(3, 10)).toBe('Show 3 more');
  });
});
