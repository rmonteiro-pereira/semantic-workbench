import { expect, test } from 'bun:test';
import { compileUnit } from '../../src/shared/tessera/compile-unit';
import type { ResolvedImportInterface } from '../../src/shared/tessera/imports';

test('compiles 200 declared parts, 20 imports and 20 MB of source in the target time', () => {
  const base = '0.2.0.dev0';
  const encoder = new TextEncoder();
  const largeDescription = 'x'.repeat(100_000);
  const parts = Array.from({ length: 200 }, (_, index) => ({
    path: 'parts/' + index + '.json',
    bytes: encoder.encode(JSON.stringify({ tessera: 3, tessera_part: true, ontology: [{ concept: 'Local' + index, type: 'EntityType', description: largeDescription }] })),
  }));
  const providers: ResolvedImportInterface[] = Array.from({ length: 20 }, (_, index) => ({
    project: 'provider-' + index,
    ontology: 'ontology.json',
    version: 'a'.repeat(40),
    scope: base,
    exports: new Set(['Public']),
    concepts: new Map([['Public', { concept: 'Public', type: 'EntityType' }]]),
  }));
  const data = {
    tessera: 3,
    name: 'Large',
    version: base,
    ontology: [],
    tessera_includes: parts.map(part => part.path),
    tessera_imports: providers.map((provider, index) => ({ project: provider.project, alias: 'a' + index, concepts: ['Public'] })),
  };
  const first = { path: 'ontology.json', bytes: encoder.encode(JSON.stringify(data)) };
  const started = performance.now();
  const result = compileUnit([first, ...parts], { lossPolicySha256: null, providers: new Map([[first.path, providers]]) });
  const elapsed = performance.now() - started;
  console.log(`Mesh scale: ${Math.round(elapsed)} ms for 200 parts and 20 imports`);
  expect(result.failures).toEqual([]);
  expect(result.report.inputs).toHaveLength(201);
  expect(result.outputs).toHaveLength(1);
  expect(elapsed).toBeLessThan(30_000);
}, 35_000);
