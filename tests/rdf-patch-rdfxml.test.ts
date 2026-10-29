// Tests RDF/XML resource edits and refusal of unsupported constructs.
import { test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { readRdfItem, editRdfItem, deleteRdfItem, addRdfItem } from '../src/app/edit/rdf-patch/index';
// RDF/XML item edits change the subject's node element in place; constructs that span more than
// one element are refused with their line.
const src = readFileSync('public/examples/commerce/commerce.owl', 'utf8');
const COMMERCE_NS = 'https://example.org/commerce#';
const pairs = (source: string, subject: string) =>
  readRdfItem(source, 'c.owl', subject).pairs.map(pair => ({
    id: pair.id,
    predicateText: pair.predicateText,
    objectText: pair.objectText,
  }));
test("a changed literal and a new property element touch only those lines, at the siblings' " + 'indentation', () => {
  const editResult = editRdfItem(src, 'c.owl', COMMERCE_NS + 'Order', [
    ...pairs(src, COMMERCE_NS + 'Order').map(p => (p.predicateText === 'rdfs:label' ? { ...p, objectText: '"Purchase order"@en' } : p)),
    { predicateText: 'rdfs:seeAlso', objectText: '<https://example.org/docs/order>' },
  ]);
  expect(editResult.ok && editResult.text).toBe(
    src.replace(
      '        <rdfs:label>Order</rdfs:label>\n    </owl:Class>',
      '        <rdfs:label xml:lang="en">Purchase order</rdfs:label>\n        <rdfs:seeAlso rdf:resource="https://example.org/docs/order"/>\n    </owl:Class>',
    ),
  );
});
test('the element type is locked; a nested description can be removed but not rewritten here', () => {
  const order = readRdfItem(src, 'c.owl', COMMERCE_NS + 'Order');
  expect(order.pairs[0]).toMatchObject({ predicateText: 'a', objectText: 'owl:Class' });
  expect(editRdfItem(src, 'c.owl', COMMERCE_NS + 'Order', pairs(src, COMMERCE_NS + 'Order').slice(1)).ok).toBe(false);
  const paid = readRdfItem(src, 'c.owl', COMMERCE_NS + 'PaidOrder');
  const nested = paid.pairs.find(p => p.nested)!;
  expect(nested.objectText).toBe('[ a owl:Restriction ; owl:onProperty <https://example.org/commerce#invoice> ; owl:someValuesFrom <https://example.org/commerce#Invoice> ]');
  const editResult = editRdfItem(
    src,
    'c.owl',
    COMMERCE_NS + 'PaidOrder',
    pairs(src, COMMERCE_NS + 'PaidOrder').filter(p => p.id !== nested.id),
  );
  expect(editResult.ok && editResult.text).toBe(src.replace(/        <rdfs:subClassOf>\n[\s\S]*?<\/rdfs:subClassOf>\n/, ''));
  expect(editResult.ok && [editResult.removed, editResult.added]).toEqual([4, 0]);
  expect(editRdfItem(src, 'c.owl', COMMERCE_NS + 'PaidOrder', [...pairs(src, COMMERCE_NS + 'PaidOrder'), { predicateText: 'rdfs:subClassOf', objectText: '[ a owl:Restriction ]' }]).ok).toBe(false);
});
test('parse-type collections, reified statements and rdf:li are refused with their line', () => {
  const add = (xml: string) => src.replace('</rdf:RDF>', xml + '\n</rdf:RDF>');
  const collection = add(
    '    <owl:Class rdf:about="/commerce#Either">\n        <owl:unionOf rdf:parseType="Collection">\n            <owl:Class rdf:about="/commerce#Order"/>\n        </owl:unionOf>\n    </owl:Class>',
  );
  const item = readRdfItem(collection, 'c.owl', COMMERCE_NS + 'Either');
  expect(item.refusal?.reason).toContain('parse-type collection');
  expect(collection.split('\n')[item.refusal!.line - 1]).toContain('owl:unionOf');
  expect(editRdfItem(collection, 'c.owl', COMMERCE_NS + 'Either', []).ok).toBe(false);
  const reified = add('    <rdf:Description rdf:about="/commerce#R">\n        <rdfs:label rdf:ID="stmt1">R</rdfs:label>\n    </rdf:Description>');
  expect(readRdfItem(reified, 'c.owl', COMMERCE_NS + 'R').refusal?.reason).toContain('reified statement');
});
test('attribute properties, self-closing elements, delete with references and a new typed element', () => {
  const x = src.replace('</rdf:RDF>', '    <rdf:Description rdf:about="/commerce#Tag" rdfs:label="Tag"/>\n</rdf:RDF>');
  const editResult = editRdfItem(x, 'c.owl', COMMERCE_NS + 'Tag', [
    { ...pairs(x, COMMERCE_NS + 'Tag')[0], objectText: '"Label"' },
    { predicateText: 'rdfs:comment', objectText: '"Free text"' },
  ]);
  expect(editResult.ok && editResult.text).toBe(
    x.replace(
      '<rdf:Description rdf:about="/commerce#Tag" rdfs:label="Tag"/>',
      '<rdf:Description rdf:about="/commerce#Tag" rdfs:label="Label">\n        <rdfs:comment>Free text</rdfs:comment>\n    </rdf:Description>',
    ),
  );
  const deletion = deleteRdfItem(src, 'c.owl', COMMERCE_NS + 'Payment');
  expect(deletion.ok && deletion.text).toBe(
    src.replace(/    <owl:Class rdf:about="\/commerce#Payment">\n[\s\S]*?<\/owl:Class>\n/, '').replace('        <rdfs:range rdf:resource="/commerce#Payment"/>\n', ''),
  );
  const addition = addRdfItem(src, 'c.owl', COMMERCE_NS + 'Refund', [
    { predicateText: 'a', objectText: 'owl:Class' },
    { predicateText: 'rdfs:label', objectText: '"Refund"' },
  ]);
  expect(addition.ok && addition.text).toBe(
    src.replace('</rdf:RDF>', '    <owl:Class rdf:about="https://example.org/commerce#Refund">\n        <rdfs:label>Refund</rdfs:label>\n    </owl:Class>\n</rdf:RDF>'),
  );
});
