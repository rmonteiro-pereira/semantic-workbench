// Tests RDF graph equivalence and resource edit round trips.
import { test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { Writer } from 'n3';
import { applyPatches } from '../src/shared/editor/patch';
import { isomorphic, gate, description } from '../src/app/edit/rdf-patch/isomorphism';
import { parseGraph, termKey, formatOf, RDFS, SH, type Triple } from '../src/app/edit/rdf-patch/terms';
import { readRdfItem, editRdfItem, deleteRdfItem, addRdfItem, checkRdfSource } from '../src/app/edit/rdf-patch/index';
// Round trips must preserve the RDF graph, while a label edit changes exactly one triple belonging
// to the selected resource.
const bn = (v: string) => ({ termType: 'BlankNode' as const, value: v });
const nn = (v: string) => ({ termType: 'NamedNode' as const, value: v });
const lit = (value: string) => ({
  termType: 'Literal' as const,
  value,
  datatype: 'http://www.w3.org/2001/XMLSchema#string',
});
test('graphs compare up to blank-node renaming, and differ on any changed triple', () => {
  const original: Triple[] = [
    { s: nn('x'), p: nn('p'), o: bn('1') },
    { s: bn('1'), p: nn('q'), o: lit('v') },
    { s: bn('1'), p: nn('r'), o: bn('2') },
    { s: bn('2'), p: nn('q'), o: lit('w') },
  ];
  const reordered: Triple[] = [
    { s: bn('b'), p: nn('r'), o: bn('a') },
    { s: bn('a'), p: nn('q'), o: lit('w') },
    { s: nn('x'), p: nn('p'), o: bn('b') },
    { s: bn('b'), p: nn('q'), o: lit('v') },
  ];
  expect(isomorphic(original, reordered)).toBe(true);
  expect(
    isomorphic(
      original,
      reordered.map(t => (t.o.value === 'w' ? { ...t, o: lit('W') } : t)),
    ),
  ).toBe(false);
  expect(isomorphic(original, reordered.slice(1))).toBe(false);
  // Interchangeable blank nodes are matched by search, not only by hashes.
  const ring = (count: number, tag: string): Triple[] =>
    Array.from({ length: count }, (_, i) => ({
      s: bn(tag + i),
      p: nn('next'),
      o: bn(tag + ((i + 1) % count)),
    }));
  expect(isomorphic(ring(6, 'a'), ring(6, 'b'))).toBe(true);
  expect(isomorphic([...ring(3, 'a'), ...ring(3, 'c')], ring(6, 'b'))).toBe(false);
});
test('the gate refuses a change to another resource and reports removed and added triples', () => {
  const before = parseGraph('@prefix e: <https://e/> . e:a e:p "1" . e:b e:p "2" .', 'turtle');
  expect(gate(before, parseGraph('@prefix e: <https://e/> . e:a e:p "1", "3" . e:b e:p "2" .', 'turtle'), ['https://e/a'])).toEqual({ ok: true, removed: 0, added: 1 });
  expect(gate(before, parseGraph('@prefix e: <https://e/> . e:a e:p "1" . e:b e:p "9" .', 'turtle'), ['https://e/a']).ok).toBe(false);
  expect(
    checkRdfSource(
      '<https://e/a> <https://e/p> "1" .\n<https://e/b> <https://e/p> "2" .\n',
      '<https://e/a> <https://e/p> "1" .\n<https://e/b> <https://e/p> "2" .\n<https://e/c> <https://e/p> "3" .\n',
      'x.nt',
      'https://e/a',
    ).ok,
  ).toBe(false);
});
// Round trips use shipped examples to cover their actual RDF constructs.
const files = [
  'commerce/commerce.owl.ttl',
  'commerce/commerce.owl',
  'commerce/commerce.shacl.ttl',
  'commerce/commerce-data.ttl',
  'ubl/ubl.owl.ttl',
  'ubl/ubl.shacl.ttl',
  'mall/mall.owl.ttl',
  'mall/mall.shacl.ttl',
  'mall/mall-data.ttl',
];
const extra = (() => {
  const src = readFileSync('public/examples/commerce/commerce.owl.ttl', 'utf8');
  const writer = new Writer({ format: 'N-Triples' });
  writer.addQuads(new (require('n3').Parser)({ baseIRI: 'https://workbench.local/import/' }).parse(src));
  let nt = '';
  writer.end((_e: any, r: string) => {
    nt = r;
  });
  return [
    { name: 'commerce.owl.nt', source: nt },
    {
      name: 'commerce.n3',
      source: src + '\n{ ?x a <https://example.org/commerce#PaidOrder> } => { ?x a <https://example.org/commerce#Order> } .\n',
    },
  ];
})();
let seed = 7;
const random = () => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
};
const sample = <T>(xs: T[], count: number) => {
  const shuffled = [...xs];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, count);
};
const LABEL = [RDFS + 'label', SH + 'name'];
for (const { name, source } of [
  ...files.map(f => ({
    name: f.split('/')[1],
    source: readFileSync('public/examples/' + f, 'utf8'),
  })),
  ...extra,
]) {
  test(`round trips on ${name}`, () => {
    seed = [...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 2147483647, 7);
    const format = formatOf(name, source);
    const graph = parseGraph(source, format);
    const subjects = [...new Set(graph.filter(t => t.s.termType === 'NamedNode').map(t => t.s.value))];
    let checked = 0;
    for (const subject of sample(subjects, format === 'rdfxml' ? 10 : 8)) {
      const item = readRdfItem(source, name, subject);
      if (item.refusal) {
        expect(name).toBe('commerce.n3');
        continue;
      }
      if (!item.pairs.length) continue;
      const same = item.pairs.map(pair => ({
        id: pair.id,
        predicateText: pair.predicateText,
        objectText: pair.objectText,
      }));
      // No-op.
      const none = editRdfItem(source, name, subject, same);
      expect(none.ok && none.text).toBe(source);
      // A label change: one triple out, one in, and only inside this resource's statements.
      const label = item.pairs.find(p => LABEL.includes(p.predicate) && p.object?.termType === 'Literal' && !p.object.language);
      const desired = label
        ? same.map(d => (d.id === label.id ? { ...d, objectText: '"Changed by the round trip"' } : d))
        : [...same, { predicateText: 'rdfs:label', objectText: '"Changed by the round trip"' }];
      const editResult = editRdfItem(source, name, subject, desired);
      if (!editResult.ok) throw Error(`${name} ${subject}: ${editResult.error}`);
      expect([editResult.removed, editResult.added]).toEqual([label ? 1 : 0, 1]);
      for (const patch of editResult.patches) expect(item.ranges.some(x => patch.from >= x.from && patch.to <= x.to) || (patch.from === patch.to && patch.from === source.length)).toBe(true);
      const expected = graph
        .filter(triple => !(label && triple.s.value === subject && triple.p.value === label.predicate && triple.o.value === label.object!.value))
        .concat([
          {
            s: { termType: 'NamedNode', value: subject },
            p: { termType: 'NamedNode', value: label?.predicate ?? RDFS + 'label' },
            o: {
              termType: 'Literal',
              value: 'Changed by the round trip',
              datatype: 'http://www.w3.org/2001/XMLSchema#string',
            },
          },
        ]);
      expect(isomorphic(parseGraph(editResult.text, format), expected)).toBe(true);
      // Remove a statement, then add it back.
      const victim = item.pairs.find(p => !p.locked && !(format === 'rdfxml' && p.nested));
      if (victim) {
        const removal = editRdfItem(
          source,
          name,
          subject,
          same.filter(d => d.id !== victim.id),
        );
        if (!removal.ok) throw Error(`${name} ${subject}: ${removal.error}`);
        const back = readRdfItem(removal.text, name, subject);
        const readdition = editRdfItem(removal.text, name, subject, [
          ...back.pairs.map(pair => ({
            id: pair.id,
            predicateText: pair.predicateText,
            objectText: pair.objectText,
          })),
          { predicateText: victim.predicateText, objectText: victim.objectText },
        ]);
        if (!readdition.ok) throw Error(`${name} ${subject} re-add: ${readdition.error}`);
        expect(isomorphic(parseGraph(readdition.text, format), graph)).toBe(true);
      }
      // Labelled blank nodes omit their own statements from pair text, so they cannot
      // be restored by re-adding those pairs.
      if (!item.pairs.some(p => (p.locked && format === 'rdfxml' && p.nested) || (p.object?.termType === 'BlankNode' && !p.nested))) {
        const deletion = deleteRdfItem(source, name, subject, false);
        if (!deletion.ok) throw Error(`${name} ${subject} delete: ${deletion.error}`);
        const own = description(graph, new Set([termKey({ termType: 'NamedNode', value: subject })]));
        const rest = graph.filter(t => !own.has(t));
        expect(isomorphic(parseGraph(deletion.text, format), rest)).toBe(true);
        const again = addRdfItem(
          deletion.text,
          name,
          subject,
          item.pairs.map(p => ({ predicateText: p.predicateText, objectText: p.objectText })),
        );
        if (!again.ok) throw Error(`${name} ${subject} re-add item: ${again.error}`);
        expect(isomorphic(parseGraph(again.text, format), graph)).toBe(true);
      }
      checked++;
    }
    expect(checked).toBeGreaterThan(0);
  }, 60_000);
}
void applyPatches;
