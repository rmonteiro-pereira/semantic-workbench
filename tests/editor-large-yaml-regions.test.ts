/** Checks shared detection and sparse viewport context against full mixed parsing. */
import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { Text } from '@codemirror/state';
import { LanguageSupport } from '@codemirror/language';
import { yamlLanguage } from '@codemirror/lang-yaml';
import { languageFor } from '../src/app/editor/languages';
import { findYamlRegions, visibleYamlRegions } from '../src/app/editor/viewportYaml';

function fullSqlRanges(source: string) {
  const support = languageFor('YAML');
  if (!(support instanceof LanguageSupport)) throw new Error('Expected YAML language');
  const mixed = support.language.parser.parse(source);
  const ranges: { from: number; to: number; language: 'sql' }[] = [];
  yamlLanguage.parser.parse(source).iterate({
    enter(node) {
      if (!['Literal', 'QuotedLiteral', 'BlockLiteralContent'].includes(node.name)) return;
      const quoted = node.name === 'QuotedLiteral';
      const from = node.from + Number(quoted);
      const to = node.to - Number(quoted);
      let inner = mixed.resolveInner(from + 1, 1);
      while (inner.parent && inner.name !== 'Script') inner = inner.parent;
      if (inner.name === 'Script') ranges.push({ from, to, language: 'sql' });
    },
  });
  return ranges;
}

for (const filename of ['commerce/sales.ossie.yaml', 'mall/mall.semantic.yaml']) {
  test(`SQL ranges match full parsing in ${filename}`, () => {
    const source = readFileSync(`public/examples/${filename}`, 'utf8');
    const expected = fullSqlRanges(source);
    expect(expected.length).toBeGreaterThan(0);
    expect(findYamlRegions(source).filter(region => region.language === 'sql')).toEqual(expected);
    const doc = Text.of(source.split('\n'));
    for (const region of expected) {
      expect(visibleYamlRegions(doc, region.from, region.to)).toContainEqual(region);
    }
  });
}

test('Viewport context includes later dialects and excludes non-SQL expressions', () => {
  const source = [
    'datasets:',
    '  - fields:',
    '      - expression:',
    '          dialects:',
    '            - expression: SELECT total',
    '              dialect: MDX',
    '            - expression: SELECT amount',
    '              dialect: ANSI_SQL',
  ].join('\n');
  const doc = Text.of(source.split('\n'));
  for (const number of [5, 7]) {
    const line = doc.line(number);
    const regions = visibleYamlRegions(doc, line.from, line.to);
    expect(regions.length).toBe(number === 5 ? 0 : 1);
  }
});

test('Viewport JSON finds an offscreen vendor and clips a long block to the visible range', () => {
  const source = [
    'custom_extensions:',
    '  - vendor_name: SEMANTIC_WORKBENCH',
    '    data: |',
    '      {',
    ...Array.from({ length: 200 }, (_, index) => `        "field${index}": true,`),
    '        "last": false',
    '      }',
  ].join('\n');
  const doc = Text.of(source.split('\n'));
  const line = doc.line(150);
  const regions = visibleYamlRegions(doc, line.from, line.to);
  expect(regions.length).toBeGreaterThan(0);
  expect(regions.every(region => region.language === 'json')).toBe(true);
  expect(regions.every(region => region.from >= line.from && region.to <= line.to)).toBe(true);
});
