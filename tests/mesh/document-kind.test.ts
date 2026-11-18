/** Checks compiler classification for part files and dependency metadata. */
import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { classifyFile } from '../../src/shared/tessera/document-kind';
import { compileUnit } from '../../src/shared/tessera/compile-unit';

const encoder = new TextEncoder();
const part = 'tests/fixtures/tessera/mesh/units/three-parts/customers.json';
const file = { path: 'customers.json', bytes: new Uint8Array(readFileSync(part)) };

test('a headerless revision-three part is classified separately from a standard definition', () => {
  expect(classifyFile(file).kind).toBe('tessera-part');
  const data = JSON.parse(readFileSync(part, 'utf8'));
  expect(classifyFile({ ...file, bytes: encoder.encode(JSON.stringify({ ...data, version: '0.2.0.dev0' })) }).kind).toBe('invalid');
  expect(compileUnit([file], { lossPolicySha256: null }).failures).not.toHaveLength(0);
});

test('only the project metadata path is recognized as the dependency manifest', () => {
  const bytes = encoder.encode('{"manifestVersion":1,"root":"ontology.yaml","providers":[]}');
  expect(classifyFile({ path: 'tessera-dependencies.json', bytes }).kind).toBe('dependency-manifest');
  expect(classifyFile({ path: 'other.json', bytes }).kind).toBe('other');
});
