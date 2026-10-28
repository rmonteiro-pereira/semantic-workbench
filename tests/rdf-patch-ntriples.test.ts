// Tests whole-line N-Triples edits that preserve other lines.
import { test, expect } from 'bun:test';
import {
  readRdfItem,
  editRdfItem,
  deleteRdfItem,
  addRdfItem,
} from '../src/app/edit/rdf-patch/index';
// N-Triples item edits are whole-line edits; other lines keep their bytes.
const src =
  '# people\r\n<https://e/a>  <http://www.w3.org/2000/01/rdf-schema#label>   "Alice" .\r\n<https://e/b> <http://www.w3.org/2000/01/rdf-schema#label> "Bob" .\r\n<https://e/a> <https://e/knows> <https://e/b> .\r\n<https://e/a> <https://e/address> _:addr .\r\n_:addr <https://e/city> "Lisbon" .\r\n';
const pairs = (s: string, subject: string) =>
  readRdfItem(s, 'p.nt', subject).pairs.map(p => ({
    id: p.id,
    predicateText: p.predicateText,
    objectText: p.objectText,
  }));
test('a changed object rewrites only its line; spacing and CRLF elsewhere stay', () => {
  const r = editRdfItem(
    src,
    'p.nt',
    'https://e/b',
    pairs(src, 'https://e/b').map(p => ({ ...p, objectText: '"Robert"@en' })),
  );
  expect(r.ok && r.text).toBe(src.replace('"Bob" .', '"Robert"@en .'));
  const a = pairs(src, 'https://e/a');
  expect(a.map(p => p.predicateText)).toEqual([
    'rdfs:label',
    '<https://e/knows>',
    '<https://e/address>',
  ]);
  const r2 = editRdfItem(
    src,
    'p.nt',
    'https://e/a',
    a.map(p => (p.predicateText === 'rdfs:label' ? { ...p, objectText: '"Alicia"' } : p)),
  );
  expect(r2.ok && r2.text).toBe(
    src.replace(
      '<https://e/a>  <http://www.w3.org/2000/01/rdf-schema#label>   "Alice" .',
      '<https://e/a> <http://www.w3.org/2000/01/rdf-schema#label> "Alicia" .',
    ),
  );
});
test("a new statement is a new line after the resource's last line, with the file's line break", () => {
  const r = editRdfItem(src, 'p.nt', 'https://e/b', [
    ...pairs(src, 'https://e/b'),
    { predicateText: 'rdfs:comment', objectText: '"Friend"' },
  ]);
  expect(r.ok && r.text).toBe(
    src.replace(
      '"Bob" .\r\n',
      '"Bob" .\r\n<https://e/b> <http://www.w3.org/2000/01/rdf-schema#comment> "Friend" .\r\n',
    ),
  );
  expect(r.ok && [r.removed, r.added]).toEqual([0, 1]);
});
test('removing a statement removes its line, and the lines of a blank node only it described', () => {
  const r = editRdfItem(
    src,
    'p.nt',
    'https://e/a',
    pairs(src, 'https://e/a').filter(p => p.predicateText !== '<https://e/address>'),
  );
  expect(r.ok && r.text).toBe(
    src.replace(
      '<https://e/a> <https://e/address> _:addr .\r\n_:addr <https://e/city> "Lisbon" .\r\n',
      '',
    ),
  );
  const d = deleteRdfItem(src, 'p.nt', 'https://e/b');
  expect(d.ok && d.text).toBe(
    src
      .replace('<https://e/b> <http://www.w3.org/2000/01/rdf-schema#label> "Bob" .\r\n', '')
      .replace('<https://e/a> <https://e/knows> <https://e/b> .\r\n', ''),
  );
  expect(d.dependents?.map(x => x.pairs)).toEqual([['<https://e/knows> <https://e/b>']]);
});
test('nested descriptions and unknown prefixes are refused; a new resource goes at the end', () => {
  expect(
    editRdfItem(src, 'p.nt', 'https://e/b', [
      ...pairs(src, 'https://e/b'),
      { predicateText: 'rdfs:seeAlso', objectText: '[ rdfs:label "x" ]' },
    ]).ok,
  ).toBe(false);
  expect(
    editRdfItem(src, 'p.nt', 'https://e/b', [
      ...pairs(src, 'https://e/b'),
      { predicateText: 'foo:bar', objectText: '"x"' },
    ]).ok,
  ).toBe(false);
  const n = addRdfItem(src, 'p.nt', 'https://e/c', [
    { predicateText: 'a', objectText: '<https://e/Person>' },
  ]);
  expect(n.ok && n.text).toBe(
    src +
      '<https://e/c> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <https://e/Person> .\r\n',
  );
});
