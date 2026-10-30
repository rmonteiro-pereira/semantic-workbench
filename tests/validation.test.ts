// Tests document validation and actionable findings.
import { test, expect } from 'bun:test';
import { validateInput } from '../src/shared/validation/input';
import { inspect } from '../src/shared/core/model';
import { InputError, MAX_INPUT_BYTES } from '../src/shared/validation/diagnostics';
import { inheritanceCycle } from '../src/shared/validation/validation';
import { readdir } from 'node:fs/promises';
const ontology = {
  name: 'Test',
  version: '0.2.0.dev0',
  ontology: [
    { concept: 'Customer', type: 'EntityType', relationships: [{ name: 'orders', roles: [{ concept: 'Order' }], verbalizes: ['Customer places Order'] }] },
    { concept: 'Order', type: 'EntityType' },
  ],
};
const semantic = {
  name: 'Sales',
  version: '0.2.0.dev0',
  datasets: [
    {
      name: 'orders',
      source: 'db.orders',
      fields: [{ name: 'id', expression: { dialects: [{ dialect: 'ANSI_SQL', expression: 'id' }] } }],
      primary_key: ['id'],
    },
    {
      name: 'customers',
      source: 'db.customers',
      fields: [{ name: 'id', expression: { dialects: [{ dialect: 'ANSI_SQL', expression: 'id' }] } }],
    },
  ],
  relationships: [{ name: 'customer', from: 'orders', to: 'customers', from_columns: ['id'], to_columns: ['id'] }],
  metrics: [
    {
      name: 'count',
      expression: { dialects: [{ dialect: 'ANSI_SQL', expression: 'COUNT(orders.id)' }] },
    },
  ],
};
const asJson = (v: any) => JSON.stringify(v);
function bad(source: string, filename = 'test.yaml', code?: string) {
  const validation = validateInput(source, filename);
  expect(validation.valid).toBe(false);
  expect(validation.model).toBeNull();
  expect(validation.issues.some(i => i.severity === 'error')).toBe(true);
  if (code) expect(validation.issues.some(i => i.code === code)).toBe(true);
  return validation;
}
for (const [name, source, filename, code] of [
  ['empty', '', 'x.yaml', 'empty'],
  ['whitespace', ' \n\t', 'x.yaml', 'empty'],
  ['scalar', '42', 'x.yaml', 'structure'],
  ['null', 'null', 'x.yaml', 'structure'],
  ['array', '[]', 'x.yaml', 'structure'],
  ['unknown', 'foo: bar', 'x.yaml', 'format'],
  ['syntax', 'ontology: [', 'x.yaml', 'syntax'],
  ['duplicate YAML keys', 'ontology: []\nontology: []', 'x.yaml', 'syntax'],
  ['custom tag', 'ontology: !unexpected []', 'x.yaml', 'yaml-tag'],
  ['multi document', '---\nontology: []\n---\nontology: []', 'x.yaml', 'syntax'],
  ['cyclic alias', 'name: X\nontology: &x [{concept: A, properties: *x}]', 'x.yaml', 'serialization'],
  ['JSON comments', '{"ontology":[]} // comment', 'x.json', 'json'],
  ['JSON trailing comma', '{"ontology":[],}', 'x.json', 'json'],
  ['YAML with JSON filename', 'name: X\nontology: [{concept: A}]', 'x.json', 'json'],
  ['directory filename', asJson(ontology), '../bad.yaml', 'filename'],
  ['control filename', asJson(ontology), 'bad\n.yaml', 'filename'],
  ['long filename', asJson(ontology), 'a'.repeat(256), 'filename'],
  ['unsupported JSON-LD', asJson(ontology), 'x.jsonld', 'unsupported'],
  ['unsupported TriG', '<x> { <s> <p> <o> }', 'x.trig', 'unsupported'],
] as const)
  test(`rejects ${name} with actionable diagnostics`, () => {
    bad(source, filename, code);
  });
for (const [name, mutate, code] of [
  ['empty ontology', (d: any) => (d.ontology = []), 'structure'],
  ['non-array ontology', (d: any) => (d.ontology = {}), 'structure'],
  ['null concept', (d: any) => (d.ontology[0] = null), 'structure'],
  ['blank name', (d: any) => (d.ontology[0].concept = ' '), 'structure'],
  ['duplicate concept', (d: any) => (d.ontology[1].concept = 'Customer'), 'duplicate'],
  [
    'duplicate IRI',
    (d: any) => {
      d.ontology[0].iri = 'urn:c';
      d.ontology[1].iri = 'urn:c';
    },
    'duplicate',
  ],
  ['relative IRI', (d: any) => (d.ontology[0].iri = 'relative'), 'structure'],
  ['non-string description', (d: any) => (d.ontology[0].description = { x: 1 }), 'structure'],
  ['invalid properties', (d: any) => (d.ontology[0].properties = {}), 'structure'],
  ['duplicate properties', (d: any) => (d.ontology[0].properties = [{ name: 'id' }, { name: 'id' }]), 'duplicate'],
  ['non-array relationships', (d: any) => (d.ontology[0].relationships = {}), 'structure'],
  ['null relationship', (d: any) => (d.ontology[0].relationships = [null]), 'structure'],
  ['unnamed relationship', (d: any) => delete d.ontology[0].relationships[0].name, 'structure'],
  ['null role', (d: any) => (d.ontology[0].relationships[0].roles = [null]), 'structure'],
  ['missing role target', (d: any) => (d.ontology[0].relationships[0].roles[0].concept = 'Missing'), 'reference'],
  ['invalid verbalizations', (d: any) => (d.ontology[0].relationships[0].verbalizes = [4]), 'structure'],
  ['unknown parent', (d: any) => (d.ontology[0].extends = ['Unknown']), 'reference'],
  ['invalid extends', (d: any) => (d.ontology[0].extends = 'Order'), 'structure'],
  ['self inheritance', (d: any) => (d.ontology[0].extends = ['Customer']), 'inheritance-cycle'],
  [
    'inheritance cycle',
    (d: any) => {
      d.ontology[0].extends = ['Order'];
      d.ontology[1].extends = ['Customer'];
    },
    'inheritance-cycle',
  ],
  ['ambiguous format', (d: any) => (d.datasets = []), 'format'],
] as [string, (data: any) => void, string][])
  test(`ontology: ${name}`, () => {
    const clone = structuredClone(ontology);
    mutate(clone);
    bad(asJson(clone), 'ontology.json', code);
  });
for (const [name, mutate, code] of [
  ['empty datasets', (d: any) => (d.datasets = []), 'structure'],
  ['duplicate dataset', (d: any) => (d.datasets[1].name = 'orders'), 'duplicate'],
  ['missing source', (d: any) => delete d.datasets[0].source, 'structure'],
  ['invalid fields', (d: any) => (d.datasets[0].fields = {}), 'structure'],
  ['duplicate field', (d: any) => d.datasets[0].fields.push(d.datasets[0].fields[0]), 'duplicate'],
  ['unknown dataset', (d: any) => (d.relationships[0].to = 'missing'), 'reference'],
  ['unknown source join field', (d: any) => (d.relationships[0].from_columns = ['missing']), 'reference'],
  ['unknown target join field', (d: any) => (d.relationships[0].to_columns = ['missing']), 'reference'],
  ['mismatched composite join', (d: any) => (d.relationships[0].from_columns = ['id', 'id']), 'join'],
  ['empty join keys', (d: any) => (d.relationships[0].from_columns = []), 'structure'],
  ['duplicate relationship', (d: any) => d.relationships.push(d.relationships[0]), 'duplicate'],
  ['duplicate metric', (d: any) => d.metrics.push(d.metrics[0]), 'duplicate'],
  ['metric dataset collision', (d: any) => (d.metrics[0].name = 'orders'), 'duplicate'],
  ['missing metric expression', (d: any) => delete d.metrics[0].expression, 'structure'],
  ['malformed dialects', (d: any) => (d.metrics[0].expression.dialects = 'SQL'), 'structure'],
  ['empty expression', (d: any) => (d.metrics[0].expression.dialects[0].expression = ''), 'structure'],
  ['official schema extra property', (d: any) => (d.unrecognized = true), 'schema'],
] as [string, (data: any) => void, string][])
  test(`semantic: ${name}`, () => {
    const clone = structuredClone(semantic);
    mutate(clone);
    bad(asJson(clone), 'sales.json', code);
  });
test('valid semantic model, legal business cycles and self links remain supported', () => {
  expect(validateInput(asJson(semantic), 'sales.json').valid).toBe(true);
  const clone = structuredClone(ontology);
  clone.ontology[1].relationships = [{ name: 'customer', roles: [{ concept: 'Customer' }], verbalizes: ['Order has Customer'] }];
  clone.ontology[0].relationships!.push({ name: 'self', roles: [{ concept: 'Customer' }], verbalizes: ['Customer is Customer'] });
  const validation = validateInput(asJson(clone));
  expect(validation.valid).toBe(true);
  expect(validation.model?.edges).toHaveLength(3);
});
test('inheritance DAG diamond is valid and deep chains are iterative', () => {
  const nodes = Array.from({ length: 20000 }, (_, i) => String(i));
  const parents = new Map(nodes.map((n, i) => [n, i + 1 < nodes.length ? [nodes[i + 1]] : []]));
  expect(inheritanceCycle(nodes, parents)).toEqual([]);
  parents.set(nodes.at(-1)!, ['0']);
  expect(inheritanceCycle(nodes, parents)).toHaveLength(nodes.length);
  expect(
    inheritanceCycle(
      ['a', 'b', 'c', 'd'],
      new Map([
        ['a', ['b', 'c']],
        ['b', ['d']],
        ['c', ['d']],
      ]),
    ),
  ).toEqual([]);
});
test('size limit uses UTF-8 bytes including multibyte input', () => {
  bad('#' + 'é'.repeat(MAX_INPUT_BYTES / 2), 'big.yaml', 'size');
  bad('x'.repeat(MAX_INPUT_BYTES + 1), 'big.yaml', 'size');
  const prefix = asJson(ontology) + '\n#';
  expect(validateInput(prefix + 'a'.repeat(MAX_INPUT_BYTES - prefix.length)).valid).toBe(true);
});
test('unknown versions and undeclared external fields are honest warnings', () => {
  const validation = validateInput('kind: DataContract\napiVersion: v99\nid: x\nversion: "1"\nschema: [{name: X}]');
  expect(validation.valid).toBe(true);
  expect(validation.issues.some(i => i.severity === 'warning' && i.path === '/apiVersion')).toBe(true);
  const externalValidation = validateInput('name: external\nversion: 0.2.0.dev0\ndatasets: [{name: x, source: db.x, primary_key: [id]}]');
  expect(externalValidation.valid).toBe(true);
  expect(externalValidation.issues.some(i => i.path.includes('/fields'))).toBe(true);
});
test('all shipped imports including benchmarks continue to validate', async () => {
  for (const dir of ['public/examples/commerce', 'public/examples/ubl', 'public/examples'])
    for (const file of await readdir(dir)) {
      if (!/\.(yaml|ttl|owl)$/.test(file) || file === 'summary.json') continue;
      const validation = validateInput(await Bun.file(`${dir}/${file}`).text(), file);
      expect({ file, errors: validation.issues.filter(i => i.severity === 'error') }).toEqual({
        file,
        errors: [],
      });
      expect(validation.valid).toBe(true);
    }
});
const pre = '@prefix ex: <https://example.org/> .\n@prefix sh: <http://www.w3.org/ns/shacl#> .\n@prefix owl: <http://www.w3.org/2002/07/owl#> .\n@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .\n';
for (const [name, body] of [
  ['missing path', 'ex:S a sh:PropertyShape .'],
  ['literal path', 'ex:S sh:path "name" .'],
  ['duplicate path', 'ex:S sh:path ex:a, ex:b .'],
  ['cyclic path', 'ex:S sh:path _:p . _:p sh:inversePath _:p .'],
  ['bad alternative path', 'ex:S sh:path [sh:alternativePath (ex:a)] .'],
  ['bad sequence path', 'ex:S sh:path (ex:a) .'],
  ['negative count', 'ex:S sh:path ex:p; sh:minCount -1 .'],
  ['string count', 'ex:S sh:path ex:p; sh:minCount "1" .'],
  ['repeated count', 'ex:S sh:path ex:p; sh:minCount 1,2 .'],
  ['contradictory counts', 'ex:S sh:path ex:p; sh:minCount 3; sh:maxCount 1 .'],
  ['invalid datatype', 'ex:S sh:path ex:p; sh:datatype "String" .'],
  ['invalid nodeKind', 'ex:S sh:path ex:p; sh:nodeKind sh:Unknown .'],
  ['invalid closed flag', 'ex:S a sh:NodeShape; sh:closed "true" .'],
  ['invalid node shape count', 'ex:S a sh:NodeShape; sh:minCount 1 .'],
  ['node with path', 'ex:S a sh:NodeShape; sh:path ex:p .'],
  ['literal property', 'ex:S sh:property "p" .'],
  ['missing restriction property', 'ex:R a owl:Restriction; owl:someValuesFrom ex:C .'],
  ['multiple restriction constraints', 'ex:R a owl:Restriction; owl:onProperty ex:p; owl:someValuesFrom ex:C; owl:allValuesFrom ex:C .'],
  ['negative cardinality', 'ex:R a owl:Restriction; owl:onProperty ex:p; owl:minCardinality -1 .'],
  ['literal range', 'ex:R a owl:Restriction; owl:onProperty ex:p; owl:someValuesFrom "class" .'],
  ['qualified restriction without class', 'ex:R a owl:Restriction; owl:onProperty ex:p; owl:minQualifiedCardinality 1 .'],
])
  test(`RDF definitions: ${name}`, () => {
    bad(pre + body, 'shapes.ttl', 'rdf-structure');
  });
for (const [name, source, file] of [
  ['Turtle', pre + 'ex:C a owl:Class .', 'x.ttl'],
  ['RDF', pre + 'ex:a ex:p ex:b .', 'x.rdf'],
  ['N3', pre + 'ex:a ex:p ex:b .', 'x.n3'],
  ['N-Triples', '<https://example.org/a> <https://example.org/p> "hi" .', 'x.nt'],
  ['SHACL', pre + 'ex:S sh:path [sh:inversePath ex:p]; sh:minCount 0; sh:maxCount 2 .', 'x.shacl'],
  ['SHACL sequence', pre + 'ex:S sh:path (ex:a ex:b) .', 'x.ttl'],
  ['SHACL alternative', pre + 'ex:S sh:path [sh:alternativePath (ex:a ex:b)] .', 'x.ttl'],
  ['OWL external classes', pre + 'ex:R a owl:Restriction; owl:onProperty ex:p; owl:someValuesFrom ex:External .', 'x.owl'],
  [
    'RDF XML',
    '<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns:e="https://example.org/"><rdf:Description rdf:about="https://example.org/a"><e:p>value</e:p></rdf:Description></rdf:RDF>',
    'x.xml',
  ],
])
  test(`accepts ${name}`, () => {
    expect(validateInput(source, file).valid).toBe(true);
  });
test('N-Triples is strict and malformed RDF/XML and DTDs are rejected', () => {
  bad(pre + 'ex:a ex:p ex:b .', 'x.nt', 'rdf-syntax');
  bad('<rdf:RDF', 'x.rdf', 'rdf-syntax');
  bad('<!DOCTYPE rdf:RDF><rdf:RDF/>', 'x.owl', 'xml-entity');
  bad('@prefix x: <http://x/> .', 'x.ttl');
  bad(pre + 'ex:a ex:p', 'x.ttl', 'rdf-syntax');
});
test('error is structured at the lower-level inspector boundary', () => {
  try {
    inspect(asJson({ ...ontology, ontology: [] }));
    throw Error('accepted');
  } catch (error) {
    expect(error).toBeInstanceOf(InputError);
    expect((error as InputError).issues[0].path).toBe('/ontology');
  }
});
const odcsFixture = JSON.parse(JSON.stringify((await import('yaml')).parse(await Bun.file('public/examples/commerce/commerce.odcs.yaml').text())));
for (const [name, mutate, code] of [
  ['wrong kind', (d: any) => (d.kind = 'Contract'), 'structure'],
  ['missing id', (d: any) => delete d.id, 'structure'],
  ['wrong version type', (d: any) => (d.version = 1), 'structure'],
  ['empty schema', (d: any) => (d.schema = []), 'structure'],
  ['duplicate table', (d: any) => d.schema.push(d.schema[0]), 'duplicate'],
  ['duplicate nested property', (d: any) => d.schema[0].properties.push(d.schema[0].properties[0]), 'duplicate'],
  ['invalid nested properties', (d: any) => (d.schema[0].properties[0].properties = {}), 'structure'],
  ['invalid status', (d: any) => (d.status = { invalid: true }), 'schema'],
  ['unknown logical type', (d: any) => (d.schema[0].properties[0].logicalType = 'imaginary'), 'schema'],
  ['missing required status', (d: any) => delete d.status, 'schema'],
  ['invalid boolean', (d: any) => (d.schema[0].properties[0].required = 'yes'), 'schema'],
  ['invalid URL', (d: any) => (d.schema[0].authoritativeDefinitions[0].url = 42), 'schema'],
] as [string, (data: any) => void, string][])
  test(`ODCS: ${name}`, () => {
    const clone = structuredClone(odcsFixture);
    mutate(clone);
    bad(asJson(clone), 'contract.json', code);
  });
test('RDF cannot bypass JSON extension validation', () => {
  bad(pre + 'ex:a ex:p ex:b .', 'wrong.json', 'json');
});
test('recoverable XML errors are rejected instead of silently repaired', () => {
  bad(
    '<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns:e="https://example.org/"><rdf:Description rdf:about="https://example.org/a"><e:p>value</rdf:Description></rdf:RDF>',
    'bad.rdf',
    'rdf-syntax',
  );
});
test('source diagnostics include the offending line and column', () => {
  const rejection = bad('version: 0.2.0.dev0\nname: Test\nontology:\n - concept: A\n   extends: [Missing]', 'test.yaml', 'reference');
  const issue = rejection.issues.find(i => i.code === 'reference')!;
  expect(issue.line).toBe(5);
  expect(issue.column).toBeGreaterThan(1);
});
test('SHACL allows multiple class constraints and valid signed nonnegative integers', () => {
  expect(validateInput(pre + 'ex:S sh:path ex:p; sh:class ex:A, ex:B; sh:minCount "-0"^^xsd:integer .', 'shape.ttl').valid).toBe(true);
});
test('OWL hasSelf requires boolean true', () => {
  bad(pre + 'ex:R a owl:Restriction; owl:onProperty ex:p; owl:hasSelf "yes" .', 'bad.owl', 'rdf-structure');
  expect(validateInput(pre + 'ex:R a owl:Restriction; owl:onProperty ex:p; owl:hasSelf true .', 'good.owl').valid).toBe(true);
});

test('empty filenames and object-valued model names cannot bypass shared validation', () => {
  bad(asJson(ontology), '', 'filename');
  bad(asJson({ ...ontology, name: { text: 'bad' } }), 'x.json', 'structure');
});

test('primary-key columns need not all be exposed as logical fields', () => {
  const clone = structuredClone(semantic);
  clone.datasets[0].primary_key = ['id', 'physical_ticket'];
  const validation = validateInput(asJson(clone), 'model.json');
  expect(validation.valid).toBe(true);
  expect(validation.issues.some(i => i.severity === 'warning' && i.path === '/datasets/0/primary_key/1')).toBe(true);
});
