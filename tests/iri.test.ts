import { test, expect } from 'bun:test';
import { parse, stringify } from 'yaml';
import { validateInput } from '../src/input';
import { inspect } from '../src/model';
import { modelOverview } from '../src/overview';
import { expandIri, namespaceOf } from '../src/iri';
import { buildContext, type StoredDocument } from '../server/agent/runtime';
const uriSource = await Bun.file('tests/fixtures/issue-2/uri.ontology.yaml').text();
const iriSource = uriSource.replaceAll('uri:', 'iri:');
const edit = (source: string, change: (d: any) => void) => {
  const d = parse(source);
  change(d);
  return stringify(d);
};
test('issue 2: uri is rejected with a rename hint, iri with prefixes is accepted', () => {
  const bad = validateInput(uriSource, 'uri.ontology.yaml');
  expect(bad.valid).toBe(false);
  expect(bad.issues.map(i => i.path)).toEqual([
    '/ontology/0/uri',
    '/ontology/1/uri',
    '/ontology/1/relationships/0/uri',
  ]);
  expect(bad.issues.every(i => i.message.includes('rename uri to iri'))).toBe(true);
  expect(bad.issues.some(i => i.path === '/prefixes')).toBe(false);
  const good = validateInput(iriSource, 'iri.ontology.yaml');
  expect(good.valid).toBe(true);
  expect(good.issues).toEqual([]);
  const unversioned = validateInput(
    edit(uriSource, d => delete d.version),
    'u.yaml',
  );
  expect(unversioned.valid).toBe(true);
  expect(
    unversioned.issues.filter(i => i.path.endsWith('/uri')).every(i => i.severity === 'warning'),
  ).toBe(true);
});
test('QName IRIs require a declared prefix; full IRIs and duplicate expansions are checked', () => {
  const undeclared = validateInput(
    edit(iriSource, d => (d.prefixes = { other: 'https://other.example/' })),
    'x.yaml',
  );
  expect(undeclared.valid).toBe(false);
  expect(undeclared.issues[0].message).toContain('Prefix "ex" is not declared');
  for (const iri of ['https://example.org/ns#Code', 'urn:example:code', 'mailto:a@example.org'])
    expect(
      validateInput(
        edit(iriSource, d => (d.ontology[0].iri = iri)),
        'x.yaml',
      ).valid,
    ).toBe(true);
  const dup = validateInput(
    edit(iriSource, d => (d.ontology[1].iri = 'https://example.org/ns#Code')),
    'x.yaml',
  );
  expect(dup.valid).toBe(false);
  expect(dup.issues[0].message).toContain('Duplicate concept IRI https://example.org/ns#Code');
  expect(
    validateInput(
      edit(iriSource, d => {
        delete d.version;
        d.prefixes.ex = 'not an iri';
      }),
      'x.yaml',
    ).valid,
  ).toBe(false);
  expect(expandIri('ex:Code', { ex: 'https://example.org/ns#' })).toEqual({
    iri: 'https://example.org/ns#Code',
    prefix: 'ex',
  });
  expect(expandIri(':Code', { '': 'https://example.org/' })).toEqual({
    iri: 'https://example.org/Code',
    prefix: '',
  });
  expect('error' in expandIri('Code')).toBe(true);
  expect(
    namespaceOf('https://a.example/x/y#Z', {
      a: 'https://a.example/',
      ax: 'https://a.example/x/y#',
    }),
  ).toEqual({ prefix: 'ax', iri: 'https://a.example/x/y#' });
  expect(namespaceOf('https://b.example/terms/Z')).toEqual({ iri: 'https://b.example/terms/' });
});
test('issue 2 request: modular ontologies group by declared namespace prefix', () => {
  const modular = edit(iriSource, d => {
    d.prefixes.lease = 'https://example.org/lease#';
    d.ontology.push(
      {
        concept: 'Lease',
        type: 'EntityType',
        iri: 'lease:Lease',
        relationships: [
          {
            name: 'thing',
            roles: [{ concept: 'Thing' }],
            multiplicity: 'ManyToOne',
            verbalizes: ['{Lease} covers {Thing}'],
          },
        ],
      },
      { concept: 'Note', type: 'EntityType' },
    );
  });
  const m = inspect(modular, 'm.yaml');
  const o = modelOverview(m.entities, m.edges, m.name);
  expect(o.mode).toBe('namespaces');
  expect(
    Object.fromEntries(o.groups.map(g => [g.name, g.entities.map(e => e.name).sort()])),
  ).toEqual({
    'ex:': ['Code', 'Thing'],
    'lease:': ['Lease'],
    'No IRI': ['Note'],
    'Built-in concepts': ['String'],
  });
  expect(modelOverview(m.entities, m.edges, m.name, false, { mode: 'types' }).mode).toBe('types');
});
test('issue 3: a legacy semantic_model wrapper resolves by its inner model name', async () => {
  const names = ['sales.mapping.yaml', 'sales.ontology.yaml', 'sales.semantic_model.yaml'];
  const docs: StoredDocument[] = await Promise.all(
    names.map(async (filename, i) => ({
      id: String(i),
      filename,
      revision: 1,
      source: await Bun.file('tests/fixtures/issue-3/' + filename).text(),
    })),
  );
  for (const d of docs) expect(validateInput(d.source, d.filename).valid).toBe(true);
  const c = buildContext(docs, '0');
  expect(c.findings).toEqual([]);
  expect(c.datasets.map(d => d.name)).toEqual(['orders']);
  const b = c.bindings.find(b => b.expression === 'orders.order_id')!;
  expect(b.rootConcept).toBe('Order');
  expect(b.fields).toEqual(['["orders","order_id"]']);
  expect(c.fields[0].evidence.path).toEqual(['semantic_model', 0, 'datasets', 0, 'fields', 0]);
  const flat = docs.map(d =>
    d.id === '2'
      ? { ...d, source: stringify({ version: '0.2.0.dev0', ...parse(d.source).semantic_model[0] }) }
      : d,
  );
  expect(buildContext(flat, '0').findings).toEqual([]);
  const renamed = docs.map(d =>
    d.id === '2' ? { ...d, source: d.source.replace('name: sales', 'name: retail') } : d,
  );
  const message = buildContext(renamed, '0').findings[0].message;
  expect(message).toContain('resolves to 0 local documents');
  expect(message).toContain('"retail" in sales.semantic_model.yaml#/semantic_model/0');
  expect(buildContext(docs.slice(0, 2), '0').findings[0].message).toContain(
    'No semantic model documents are loaded',
  );
});
