// Tests JSON item edits that preserve surrounding formatting.
import { test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { applyPatches } from '../src/shared/editor/patch';
import { valuePatches, insertPatches, removePatches, itemValue } from '../src/shared/edit/yaml-patch';
import { jsonTextPatches } from '../src/shared/edit/json-patch';
import { validateInput } from '../src/shared/validation/input';
// JSON item edits change only the edited value's text and keep the document's indentation style
// elsewhere; the file is never re-serialized.
const contract = (indent: string | number) => JSON.stringify(parse(readFileSync('public/examples/commerce/commerce.odcs.yaml', 'utf8')), null, indent) + '\n';
const set = (src: string, path: (string | number)[], value: any) => applyPatches(src, valuePatches(src, path, value, 'c.odcs.json'));
const lines = (before: string, after: string) => {
  const beforeLines = before.split('\n');
  const afterLines = after.split('\n');
  let prefixLength = 0;
  while (beforeLines[prefixLength] === afterLines[prefixLength]) prefixLength++;
  let suffixLength = 0;
  while (
    suffixLength < beforeLines.length - prefixLength &&
    suffixLength < afterLines.length - prefixLength &&
    beforeLines[beforeLines.length - 1 - suffixLength] === afterLines[afterLines.length - 1 - suffixLength]
  )
    suffixLength++;
  return { removed: beforeLines.slice(prefixLength, beforeLines.length - suffixLength), added: afterLines.slice(prefixLength, afterLines.length - suffixLength) };
};
for (const indent of [2, 4, '\t']) {
  const src = contract(indent);
  const pad = typeof indent === 'number' ? ' '.repeat(indent) : indent;
  test(`a changed value is the only changed line (indent ${JSON.stringify(indent)})`, () => {
    const out = set(src, ['schema', 0, 'properties', 0, 'description'], 'Customer identifier.');
    expect(lines(src, out).added).toEqual([
      `${pad.repeat(5)}"description": "Customer identifier."${
        src
          .split('\n')
          .find(l => l.includes('"description"') && l.startsWith(pad.repeat(5)))!
          .endsWith(',')
          ? ','
          : ''
      }`,
    ]);
    expect(lines(src, out).removed.length).toBe(1);
    expect(validateInput(out, 'c.odcs.json').valid).toBe(true);
  });
  test(`adding a key and a list entry uses the document's indentation (indent ${JSON.stringify(indent)})`, () => {
    const property = itemValue(src, ['schema', 0, 'properties', 0]);
    const out = set(src, ['schema', 0, 'properties', 0], {
      ...property,
      classification: 'restricted',
    });
    const lineDiff = lines(src, out);
    expect(lineDiff.added.at(-1)).toBe(`${pad.repeat(5)}"classification": "restricted"`);
    expect(lineDiff.added.length).toBe(2);
    expect(lineDiff.removed.length).toBe(1);
    const added = applyPatches(src, insertPatches(src, ['schema', 0, 'properties'], { name: 'segment', logicalType: 'string' }, undefined, 'c.odcs.json'));
    expect(lines(src, added).added).toEqual([`${pad.repeat(4)}},`, `${pad.repeat(4)}{`, `${pad.repeat(5)}"name": "segment",`, `${pad.repeat(5)}"logicalType": "string"`]);
    expect(JSON.parse(added).schema[0].properties.at(-1)).toEqual({
      name: 'segment',
      logicalType: 'string',
    });
    // Removing it again restores the original bytes.
    expect(applyPatches(added, removePatches(added, ['schema', 0, 'properties', JSON.parse(added).schema[0].properties.length - 1], 'c.odcs.json'))).toBe(src);
  });
}
test('removing a first, middle or last entry keeps commas valid', () => {
  const src = '{\n  "a": [1, 2, 3],\n  "b": {"x": 1, "y": 2},\n  "c": true\n}\n';
  for (const i of [0, 1, 2]) {
    const out = set(
      src,
      ['a'],
      [1, 2, 3].filter((_, j) => j !== i),
    );
    expect(JSON.parse(out).a).toEqual([1, 2, 3].filter((_, j) => j !== i));
    expect(out.split('\n').slice(2)).toEqual(src.split('\n').slice(2));
  }
  expect(set(src, ['b'], { x: 1 })).toBe(src.replace('{"x": 1, "y": 2}', '{"x": 1}'));
  expect(set(src, ['b'], { y: 2 })).toBe(src.replace('{"x": 1, "y": 2}', '{"y": 2}'));
  expect(set(src, ['b'], { x: 1, y: 2, z: [3] })).toBe(src.replace('{"x": 1, "y": 2}', '{"x": 1, "y": 2, "z": [3]}'));
  expect(applyPatches(src, removePatches(src, ['c'], 'x.json'))).toBe(src.replace(',\n  "c": true', ''));
  expect(applyPatches(src, removePatches(src, ['a'], 'x.json'))).toBe(src.replace('"a": [1, 2, 3],\n  ', ''));
});
test('a binding list written one per line gets one new line in sorted position', () => {
  const text = '{"schema": "semantic-workbench/mapping/v1", "kpi_bindings": [\n  {"metric":"a","measures":"A"},\n  {"metric":"c","measures":"C"}\n]}\n';
  const out = applyPatches(
    text,
    jsonTextPatches(
      text,
      ['kpi_bindings'],
      [
        { metric: 'a', measures: 'A' },
        { metric: 'b', measures: 'B' },
        { metric: 'c', measures: 'C' },
      ],
    ),
  );
  expect(out).toBe(text.replace('  {"metric":"c"', '  {"metric":"b","measures":"B"},\n  {"metric":"c"'));
});
