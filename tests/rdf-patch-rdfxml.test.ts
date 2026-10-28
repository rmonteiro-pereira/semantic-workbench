// Tests RDF/XML resource edits and refusal of unsupported constructs.
import { test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import {
  readRdfItem,
  editRdfItem,
  deleteRdfItem,
  addRdfItem,
} from '../src/app/edit/rdf-patch/index';
// RDF/XML item edits change the subject's node element in place; constructs that span more than
// one element are refused with their line.
const src = readFileSync('public/examples/commerce/commerce.owl', 'utf8');
const C = 'https://example.org/commerce#';
const pairs = (s: string, subject: string) =>
  readRdfItem(s, 'c.owl', subject).pairs.map(p => ({
    id: p.id,
    predicateText: p.predicateText,
    objectText: p.objectText,
  }));
test("a changed literal and a new property element touch only those lines, at the siblings' indentation", () => {
  const r = editRdfItem(src, 'c.owl', C + 'Order', [
    ...pairs(src, C + 'Order').map(p =>
      p.predicateText === 'rdfs:label' ? { ...p, objectText: '"Purchase order"@en' } : p,
    ),
    { predicateText: 'rdfs:seeAlso', objectText: '<https://example.org/docs/order>' },
  ]);
  expect(r.ok && r.text).toBe(
    src.replace(
      '        <rdfs:label>Order</rdfs:label>\n    </owl:Class>',
      '        <rdfs:label xml:lang="en">Purchase order</rdfs:label>\n        <rdfs:seeAlso rdf:resource="https://example.org/docs/order"/>\n    </owl:Class>',
    ),
  );
});
test('the element type is locked; a nested description can be removed but not rewritten here', () => {
  const order = readRdfItem(src, 'c.owl', C + 'Order');
  expect(order.pairs[0]).toMatchObject({ predicateText: 'a', objectText: 'owl:Class' });
  expect(editRdfItem(src, 'c.owl', C + 'Order', pairs(src, C + 'Order').slice(1)).ok).toBe(false);
  const paid = readRdfItem(src, 'c.owl', C + 'PaidOrder');
  const nested = paid.pairs.find(p => p.nested)!;
  expect(nested.objectText).toBe(
    '[ a owl:Restriction ; owl:onProperty <https://example.org/commerce#invoice> ; owl:someValuesFrom <https://example.org/commerce#Invoice> ]',
  );
  const r = editRdfItem(
    src,
    'c.owl',
    C + 'PaidOrder',
    pairs(src, C + 'PaidOrder').filter(p => p.id !== nested.id),
  );
  expect(r.ok && r.text).toBe(
    src.replace(/        <rdfs:subClassOf>\n[\s\S]*?<\/rdfs:subClassOf>\n/, ''),
  );
  expect(r.ok && [r.removed, r.added]).toEqual([4, 0]);
  expect(
    editRdfItem(src, 'c.owl', C + 'PaidOrder', [
      ...pairs(src, C + 'PaidOrder'),
      { predicateText: 'rdfs:subClassOf', objectText: '[ a owl:Restriction ]' },
    ]).ok,
  ).toBe(false);
});
test('parse-type collections, reified statements and rdf:li are refused with their line', () => {
  const add = (xml: string) => src.replace('</rdf:RDF>', xml + '\n</rdf:RDF>');
  const collection = add(
    '    <owl:Class rdf:about="/commerce#Either">\n        <owl:unionOf rdf:parseType="Collection">\n            <owl:Class rdf:about="/commerce#Order"/>\n        </owl:unionOf>\n    </owl:Class>',
  );
  const item = readRdfItem(collection, 'c.owl', C + 'Either');
  expect(item.refusal?.reason).toContain('parse-type collection');
  expect(collection.split('\n')[item.refusal!.line - 1]).toContain('owl:unionOf');
  expect(editRdfItem(collection, 'c.owl', C + 'Either', []).ok).toBe(false);
  const reified = add(
    '    <rdf:Description rdf:about="/commerce#R">\n        <rdfs:label rdf:ID="stmt1">R</rdfs:label>\n    </rdf:Description>',
  );
  expect(readRdfItem(reified, 'c.owl', C + 'R').refusal?.reason).toContain('reified statement');
});
test('attribute properties, self-closing elements, delete with references and a new typed element', () => {
  const x = src.replace(
    '</rdf:RDF>',
    '    <rdf:Description rdf:about="/commerce#Tag" rdfs:label="Tag"/>\n</rdf:RDF>',
  );
  const r = editRdfItem(x, 'c.owl', C + 'Tag', [
    { ...pairs(x, C + 'Tag')[0], objectText: '"Label"' },
    { predicateText: 'rdfs:comment', objectText: '"Free text"' },
  ]);
  expect(r.ok && r.text).toBe(
    x.replace(
      '<rdf:Description rdf:about="/commerce#Tag" rdfs:label="Tag"/>',
      '<rdf:Description rdf:about="/commerce#Tag" rdfs:label="Label">\n        <rdfs:comment>Free text</rdfs:comment>\n    </rdf:Description>',
    ),
  );
  const d = deleteRdfItem(src, 'c.owl', C + 'Payment');
  expect(d.ok && d.text).toBe(
    src
      .replace(/    <owl:Class rdf:about="\/commerce#Payment">\n[\s\S]*?<\/owl:Class>\n/, '')
      .replace('        <rdfs:range rdf:resource="/commerce#Payment"/>\n', ''),
  );
  const n = addRdfItem(src, 'c.owl', C + 'Refund', [
    { predicateText: 'a', objectText: 'owl:Class' },
    { predicateText: 'rdfs:label', objectText: '"Refund"' },
  ]);
  expect(n.ok && n.text).toBe(
    src.replace(
      '</rdf:RDF>',
      '    <owl:Class rdf:about="https://example.org/commerce#Refund">\n        <rdfs:label>Refund</rdfs:label>\n    </owl:Class>\n</rdf:RDF>',
    ),
  );
});
