// Tests Turtle and N3 resource edits that preserve other statements.
import { test, expect } from 'bun:test';
import { readRdfItem, editRdfItem, deleteRdfItem, addRdfItem } from '../src/app/edit/rdf-patch/index';
// Turtle and N3 item edits rewrite the subject's statement blocks in place.
const src = `@prefix e: <https://e/> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .

# Classes
e:Party a owl:Class ; rdfs:label "Party" .
e:Person a owl:Class ; rdfs:label "Person" ;
  # people are parties
  rdfs:subClassOf e:Party ;
  rdfs:comment "A natural person." .
e:Org a owl:Class .

# Later statements about Person
e:Person rdfs:seeAlso <https://e/doc>, <https://e/doc2> .
`;
const pairs = (text: string, subject: string, file = 'x.ttl') =>
  readRdfItem(text, file, subject).pairs.map(pair => ({
    id: pair.id,
    predicateText: pair.predicateText,
    objectText: pair.objectText,
  }));
const PERSON = 'https://e/Person';
test('a changed object is replaced where it is; one-line blocks get new pairs on the same line', () => {
  const editResult = editRdfItem(src, 'x.ttl', 'https://e/Party', [
    ...pairs(src, 'https://e/Party').map(p => (p.predicateText === 'rdfs:label' ? { ...p, objectText: '"Party (legal or natural)"@en' } : p)),
    { predicateText: 'rdfs:comment', objectText: '"Any party."' },
  ]);
  expect(editResult.ok && editResult.text).toBe(
    src.replace('e:Party a owl:Class ; rdfs:label "Party" .', 'e:Party a owl:Class ; rdfs:label "Party (legal or natural)"@en ; rdfs:comment "Any party." .'),
  );
});
test('multi-line blocks get new pairs on a new line at their indentation; a predicate already there gets ", object"', () => {
  const editResult = editRdfItem(src, 'x.ttl', PERSON, [...pairs(src, PERSON), { predicateText: 'rdfs:subClassOf', objectText: 'e:Agent' }, { predicateText: 'owl:deprecated', objectText: 'false' }]);
  expect(editResult.ok && editResult.text).toBe(
    src
      .replace('  rdfs:subClassOf e:Party ;', '  rdfs:subClassOf e:Party, e:Agent ;')
      .replace('  rdfs:comment "A natural person." .', '  rdfs:comment "A natural person." ;\n  owl:deprecated false .'),
  );
});
test('statements spread over several blocks: each affected block changes in place, others stay', () => {
  const all = pairs(src, PERSON);
  const editResult = editRdfItem(
    src,
    'x.ttl',
    PERSON,
    all.filter(p => p.objectText !== '<https://e/doc2>'),
  );
  expect(editResult.ok && editResult.text).toBe(src.replace('<https://e/doc>, <https://e/doc2>', '<https://e/doc>'));
  const r2 = editRdfItem(
    src,
    'x.ttl',
    PERSON,
    all.filter(p => p.predicateText !== 'rdfs:seeAlso'),
  );
  expect(r2.ok && r2.text).toBe(src.replace('e:Person rdfs:seeAlso <https://e/doc>, <https://e/doc2> .\n', ''));
});
test('a removed pair whose text holds a comment warns; removing the first pair keeps the subject', () => {
  const editResult = editRdfItem(
    src,
    'x.ttl',
    PERSON,
    pairs(src, PERSON).filter(p => p.predicateText !== 'rdfs:subClassOf'),
  );
  expect(editResult.ok && editResult.text).toBe(src.replace(' ;\n  # people are parties\n  rdfs:subClassOf e:Party', ''));
  expect(editResult.ok && editResult.warnings).toEqual(['The comment "# people are parties" is inside a removed statement and is removed with it.']);
  const r2 = editRdfItem(
    src,
    'x.ttl',
    PERSON,
    pairs(src, PERSON).filter(p => p.predicateText !== 'a'),
  );
  expect(r2.ok && r2.text).toBe(src.replace('e:Person a owl:Class ; rdfs:label "Person" ;', 'e:Person rdfs:label "Person" ;'));
});
test('a well-known prefix used for the first time is declared after the others', () => {
  const editResult = editRdfItem(src, 'x.ttl', 'https://e/Org', [...pairs(src, 'https://e/Org'), { predicateText: 'skos:closeMatch', objectText: '<https://schema.org/Organization>' }]);
  expect(editResult.ok && editResult.text).toBe(
    src
      .replace('@prefix owl: <http://www.w3.org/2002/07/owl#> .\n', '@prefix owl: <http://www.w3.org/2002/07/owl#> .\n@prefix skos: <http://www.w3.org/2004/02/skos/core#> .\n')
      .replace('e:Org a owl:Class .', 'e:Org a owl:Class ; skos:closeMatch <https://schema.org/Organization> .'),
  );
  expect(editRdfItem(src, 'x.ttl', 'https://e/Org', [...pairs(src, 'https://e/Org'), { predicateText: 'zz:x', objectText: '"y"' }]).ok).toBe(false);
});
test('nested descriptions are edited as a whole with their parent statement', () => {
  const editResult = editRdfItem(src, 'x.ttl', 'https://e/Org', [
    ...pairs(src, 'https://e/Org'),
    {
      predicateText: 'rdfs:subClassOf',
      objectText: '[ a owl:Restriction ; owl:onProperty e:member ; owl:someValuesFrom e:Person ]',
    },
  ]);
  expect(editResult.ok && [editResult.removed, editResult.added]).toEqual([0, 4]);
  const back = pairs(editResult.ok ? editResult.text : '', 'https://e/Org');
  expect(back.at(-1)!.objectText).toBe('[ a owl:Restriction ; owl:onProperty e:member ; owl:someValuesFrom e:Person ]');
  const removed = editRdfItem(editResult.ok ? editResult.text : '', 'x.ttl', 'https://e/Org', back.slice(0, -1));
  expect(removed.ok && removed.text).toBe(src);
});
test('deleting a resource removes its blocks and, on request, the statements that name it', () => {
  const deletion = deleteRdfItem(src, 'x.ttl', 'https://e/Party');
  expect(deletion.ok && deletion.text).toBe(src.replace('e:Party a owl:Class ; rdfs:label "Party" .\n', '').replace(' ;\n  # people are parties\n  rdfs:subClassOf e:Party', ''));
  expect(deletion.dependents).toEqual([{ subject: 'e:Person', pairs: ['rdfs:subClassOf e:Party'] }]);
  const addition = addRdfItem(src, 'x.ttl', 'https://e/Company', [
    { predicateText: 'a', objectText: 'owl:Class' },
    { predicateText: 'rdfs:subClassOf', objectText: 'e:Org' },
  ]);
  expect(addition.ok && addition.text).toBe(src + 'e:Company a owl:Class ;\n  rdfs:subClassOf e:Org .\n');
});
test('N3: formulae and rules are Source-only; other resources stay editable', () => {
  const n3 = src + '{ ?x a e:Person } => { ?x a e:Party } .\n';
  expect(readRdfItem(n3, 'x.n3', PERSON).refusal?.reason).toContain('N3 formula');
  expect(editRdfItem(n3, 'x.n3', PERSON, pairs(n3, PERSON, 'x.n3')).ok).toBe(false);
  const editResult = editRdfItem(n3, 'x.n3', 'https://e/Org', [...pairs(n3, 'https://e/Org', 'x.n3'), { predicateText: 'rdfs:label', objectText: '"Org"' }]);
  expect(editResult.ok && editResult.text).toBe(n3.replace('e:Org a owl:Class .', 'e:Org a owl:Class ; rdfs:label "Org" .'));
});
