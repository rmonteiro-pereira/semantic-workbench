// Checks printing keeps scalar types, block text and key order, uses fixed line endings and reports numbers that cannot be held exactly.
import { expect, test } from 'bun:test';
import { parse, parseDocument } from 'yaml';
import { lossyNumbers, printJson, printYaml } from '../../src/shared/tessera/serialize';

function printedYaml(source: string) {
  const document = parseDocument(source);
  const before = document.toJS();
  const text = printYaml(document);
  return { before, text, data: parse(text) };
}

test('scalars that look like other types keep their type', () => {
  const { text, data, before } = printedYaml('a: 1e3\nb: "007"\nc: yes\nd: 2020-01-01\ne: "2020-01-01"\nf: 0x1F\ng: "true"\nh: ~\n');
  expect(data).toEqual(before);
  expect(typeof (data as Record<string, unknown>).b).toBe('string');
  expect(typeof (data as Record<string, unknown>).g).toBe('string');
  expect(text).toContain('b: "007"');
  expect(text).toContain('g: "true"');
});

test('block scalars, flow collections and aliases survive', () => {
  const source = 'text: |\n  first\n  second\nfolded: >-\n  one two\n  three\nlist: [1, 2]\nbase: &b {x: 1}\nuse: *b\n';
  const { text, data, before } = printedYaml(source);
  expect(data).toEqual(before);
  expect(text).toContain('text: |\n  first\n  second\n');
});

test('long text is not folded onto several lines', () => {
  const long = 'word '.repeat(80).trim();
  const { text, data } = printedYaml(`note: ${long}\n`);
  expect(text.trim().split('\n')).toHaveLength(1);
  expect(data).toEqual({ note: long });
});

test('key order is kept', () => {
  const { text } = printedYaml('zebra: 1\napple: 2\nmango: 3\n');
  expect(text.trim().split('\n')).toEqual(['zebra: 1', 'apple: 2', 'mango: 3']);
});

test('CRLF input prints with LF and one final newline, and a missing final newline is added', () => {
  const crlf = printedYaml('a: 1\r\nb:\r\n  - x\r\n  - y\r\n');
  expect(crlf.text).toBe('a: 1\nb:\n  - x\n  - y\n');
  const bare = printedYaml('a: 1');
  expect(bare.text).toBe('a: 1\n');
});

test('JSON prints with two spaces, LF and one final newline', () => {
  const text = printJson({ a: 1, b: ['x', { c: null }] });
  expect(text).toBe('{\n  "a": 1,\n  "b": [\n    "x",\n    {\n      "c": null\n    }\n  ]\n}\n');
  expect(JSON.parse(text)).toEqual({ a: 1, b: ['x', { c: null }] });
});

test('a 20-digit integer in JSON is reported because a double cannot hold it', () => {
  expect(lossyNumbers('json', '{ "id": 12345678901234567890, "small": 12, "text": "98765432109876543210" }')).toEqual(['12345678901234567890']);
});

test('numbers a double holds exactly are not reported', () => {
  expect(lossyNumbers('json', '[1, 1.50, 0.1, 1e3, 9007199254740991, -0.000100]')).toEqual([]);
});

test('a 20-digit integer in YAML is reported from the number as written', () => {
  const document = parseDocument('id: 12345678901234567890\nsmall: 12\nhex: 0x1F\n');
  expect(lossyNumbers('yaml', '', document)).toEqual(['12345678901234567890']);
});
