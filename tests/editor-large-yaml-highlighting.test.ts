/** Checks viewport token classes without starting a browser or opening a port. */
import { expect, test } from 'bun:test';
import { Text } from '@codemirror/state';
import { tags } from '@lezer/highlight';
import { syntaxHighlight } from '../src/editor/languages';
import { highlightVisibleYaml } from '../src/editor/largeYaml';
import { visibleYamlRegions } from '../src/editor/viewportYaml';

function marksFor(source: string, from = 0, to = source.length) {
  const doc = Text.of(source.split('\n'));
  const decorations = highlightVisibleYaml(doc, [{ from, to }], syntaxHighlight);
  const marks: { text: string; className: string }[] = [];
  for (let cursor = decorations.iter(); cursor.value; cursor.next()) {
    expect(cursor.from).toBeGreaterThanOrEqual(from);
    expect(cursor.to).toBeLessThanOrEqual(to);
    marks.push({ text: source.slice(cursor.from, cursor.to), className: cursor.value.spec.class });
  }
  return marks;
}

test('Multiline SQL retains comments and uses the existing keyword classes', () => {
  const source = [
    'quality:',
    '  - type: sql',
    '    query: |',
    '      SELECT /* start',
    '',
    '        still a comment */ amount',
    '      FROM orders',
  ].join('\n');
  const marks = marksFor(source);
  expect(marks).toContainEqual({
    text: 'SELECT',
    className: syntaxHighlight.style([tags.keyword])!,
  });
  expect(marks).toContainEqual({
    text: '/* start\n\n        still a comment */',
    className: syntaxHighlight.style([tags.comment])!,
  });
});

test('Extension JSON is colored with JSON tokens and decorations stay inside the viewport', () => {
  const source = [
    'custom_extensions:',
    '  - data: |',
    '      {"enabled": true}',
    '    vendor_name: SEMANTIC_WORKBENCH',
  ].join('\n');
  const from = source.indexOf('{');
  const to = source.indexOf('}') + 1;
  expect(marksFor(source, from, to)).toContainEqual({
    text: 'true',
    className: syntaxHighlight.style([tags.bool])!,
  });
});

test('A mapping with wider indentation finds its later SQL type', () => {
  const source = 'quality:\n    query: SELECT amount\n    type: sql';
  const doc = Text.of(source.split('\n'));
  const from = source.indexOf('SELECT');
  const to = source.indexOf('\n', from);
  expect(visibleYamlRegions(doc, from, to)).toEqual([{ from, to, language: 'sql' }]);
});
