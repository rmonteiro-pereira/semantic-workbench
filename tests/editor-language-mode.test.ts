/** Checks the highlighting contracts of reduced and mixed YAML modes. */
import { expect, test } from 'bun:test';
import { LanguageSupport, StreamLanguage } from '@codemirror/language';
import { highlightTree, tagHighlighter, tags } from '@lezer/highlight';
import { languageFor } from '../src/editor/languages';

function yamlSupport(largeDocument: boolean) {
  const support = languageFor('YAML', largeDocument);
  if (!(support instanceof LanguageSupport)) throw new Error('YAML must have language support');
  return support;
}

test('Large YAML uses streaming tokens with the same property definition tag as small YAML', () => {
  const source = 'name: example\n';
  const highlighter = tagHighlighter([
    { tag: tags.definition(tags.propertyName), class: 'yaml-key' },
  ]);
  for (const largeDocument of [true, false]) {
    const support = yamlSupport(largeDocument);
    expect(support.language instanceof StreamLanguage).toBe(largeDocument);
    const keys: string[] = [];
    highlightTree(support.language.parser.parse(source), highlighter, (from, to, tokenClass) => {
      if (tokenClass === 'yaml-key') keys.push(source.slice(from, to));
    });
    expect(keys).toContain('name');
  }
});

test('Small YAML retains embedded SQL and extension JSON parsing', () => {
  const source = [
    'quality:',
    '  - type: sql',
    '    query: SELECT total FROM orders',
    'custom_extensions:',
    '  - vendor_name: SEMANTIC_WORKBENCH',
    '    data: |',
    '      {"enabled": true}',
    '',
  ].join('\n');
  const tree = yamlSupport(false).language.parser.parse(source);
  const sqlNode = tree.resolveInner(source.indexOf('SELECT') + 1, 1);
  const jsonNode = tree.resolveInner(source.indexOf('true') + 1, 1);
  expect(sqlNode.name).toBe('Keyword');
  expect(jsonNode.name).toBe('True');
});
