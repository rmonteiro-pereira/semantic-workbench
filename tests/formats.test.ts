// Tests document format detection and parsing.
import { test, expect } from 'bun:test';
import { inspect } from '../src/shared/core/model';
import { graphView } from '../src/app/graph/graph-view';
import { readdir } from 'node:fs/promises';
test('all commerce formats import and preserve full definitions', async () => {
  for (const filename of await readdir('public/examples/commerce')) {
    if (filename.endsWith('.md')) continue;
    const source = await Bun.file('public/examples/commerce/' + filename).text();
    const model = inspect(source, filename);
    console.log(filename, model.kind, model.entities.length, model.edges.length);
    // The sales mapping maps the four concepts that have sales tables.
    if (filename === 'sales.mapping.yaml') {
      expect(model.kind).toBe('Ossie mappings');
      expect(model.entities).toHaveLength(4);
      continue;
    }
    expect(model.entities.length).toBeGreaterThan(0);
    if (filename === 'commerce-scale.ttl') {
      expect(model.entities).toHaveLength(1000);
      expect(model.edges).toHaveLength(5000);
      const view = graphView(model.entities, model.edges, '');
      expect(view.entities.length).toBeLessThanOrEqual(40);
      expect(view.edges.length).toBeGreaterThan(0);
    }
  }
});
test('RDF identity, typed literals and SHACL blank-node constraints remain inspectable', () => {
  const m = inspect(
    '@prefix sh: <http://www.w3.org/ns/shacl#> .\n@prefix c: <https://example.org/> .\nc:S a sh:NodeShape; sh:targetClass c:Customer; sh:property [sh:path c:email; sh:minCount 1] .',
    'shape.ttl',
  );
  expect(m.kind).toBe('SHACL');
  expect(m.entities.some(e => JSON.stringify(e.definition).includes('minCount'))).toBe(true);
  expect(m.edges.some(e => e.label === 'property')).toBe(true);
});
test('invalid RDF is rejected, not silently treated as YAML', () => {
  expect(() => inspect('@prefix c: <https://example.org/> . c:X c:bad', 'bad.ttl')).toThrow();
});

test('OWL Turtle and RDF/XML examples preserve the same named IRIs and restriction', async () => {
  const ttl = inspect(
    await Bun.file('public/examples/commerce/commerce.owl.ttl').text(),
    'commerce.owl.ttl',
  );
  const xml = inspect(
    await Bun.file('public/examples/commerce/commerce.owl').text(),
    'commerce.owl',
  );
  expect(
    xml.entities
      .filter(e => e.id.startsWith('https://example.org/'))
      .map(e => e.id)
      .sort(),
  ).toEqual(
    ttl.entities
      .filter(e => e.id.startsWith('https://example.org/'))
      .map(e => e.id)
      .sort(),
  );
  expect(xml.entities.filter(e => e.kind === 'Blank node')).toHaveLength(1);
  expect(ttl.entities.filter(e => e.kind === 'Blank node')).toHaveLength(1);
  expect(JSON.stringify(xml.entities)).toContain('someValuesFrom');
});
test('official schemas reject malformed versioned contracts and semantic models', () => {
  expect(() =>
    inspect('apiVersion: v3.1.0\nkind: DataContract\nid: test\nversion: 1.0.0\nschema: []'),
  ).toThrow();
  expect(() => inspect('version: 0.2.0.dev0\nname: Invalid\ndatasets: [{name: orders}]')).toThrow();
});
