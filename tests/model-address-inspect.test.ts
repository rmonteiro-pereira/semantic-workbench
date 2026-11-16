/** Checks locator presence at the inspector boundary without assigning addresses to RDF. */
import { expect, test } from 'bun:test';
import { readFileSync, readdirSync } from 'node:fs';
import { inspect, isStructuredEntity, type Entity } from '../src/shared/core/model';
import { formatAddress } from '../src/shared/core/item-address';
const samples = readdirSync('public/examples', { recursive: true })
  .filter((path): path is string => typeof path === 'string' && /\.ya?ml$/.test(path))
  .map(path => ({ path }));

test('inspection gives structured entities and edges locators while RDF and built-ins carry none', () => {
  for (const { path } of samples) {
    const result = inspect(readFileSync(`public/examples/${path}`, 'utf8'), path.split('/').at(-1)!);
    const entities: Entity[] = result.entities;
    const structured = entities.filter(isStructuredEntity);
    expect(structured.length).toBe(result.entities.filter(entity => !entity.id.startsWith('builtin/')).length);
    expect(new Set(structured.map(entity => formatAddress(entity.address))).size).toBe(structured.length);
    for (const edge of result.edges) expect('address' in edge).toBe(true);
  }
  const rdf = inspect('@prefix ex: <https://example.org/> . ex:A ex:rel [ ex:value "x" ] .', 'sample.ttl');
  expect(rdf.entities).toHaveLength(2);
  expect(rdf.entities.every(entity => !isStructuredEntity(entity))).toBe(true);
  expect(rdf.edges.every(edge => !('address' in edge))).toBe(true);
  const builtins = inspect(
    'version: 0.2.0.dev0\nname: O\nontology:\n  - concept: C\n    type: EntityType\n    relationships:\n      - name: label\n        verbalizes: ["label"]\n        roles: [{ concept: String }]\n',
    'o.yaml',
  );
  const builtinEntities = builtins.entities.filter(entity => entity.id.startsWith('builtin/'));
  expect(builtinEntities).toHaveLength(1);
  expect(builtinEntities.every(entity => !isStructuredEntity(entity))).toBe(true);
}, 120_000);

test('accepted unnamed legacy roots remain inspectable with volatile locators', () => {
  const result = inspect('ontology: [{concept: A}]', 'legacy.yaml');
  const entity = result.entities.find(entity => entity.name === 'A')!;
  expect(isStructuredEntity(entity)).toBe(true);
  if (!isStructuredEntity(entity)) throw new Error('Expected a structured entity');
  expect(entity.address.chain).toEqual([
    { kind: 'ontology', position: 0 },
    { kind: 'concept', name: 'A' },
  ]);
});
