import { expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compileUnit } from '../../src/shared/tessera/compile-unit';
import { bundleFiles } from '../../src/server/tessera/bundle-files';

function file(path: string, data: object) {
  return { path, bytes: new TextEncoder().encode(JSON.stringify(data)) };
}

const version = '0.2.0.dev0';
const parts = ['orders.json', 'billing.json', 'returns.json', 'settlement.json'];
const files = [
  file('root.json', { tessera: 3, name: 'Retail', version, tessera_includes: parts, ontology: [] }),
  ...parts.map((path, index) => file(path, { tessera: 3, tessera_part: true, ontology: [{ type: 'EntityType', concept: 'Part' + index }] })),
];
const input = { kind: 'snapshot' } as const;

function orderedBundle(sequence: number, sourceFiles = files) {
  const permutation = [...sourceFiles].sort((left, right) => {
    const rank = (path: string) =>
      createHash('sha256')
        .update(JSON.stringify([sequence, path]))
        .digest('hex');
    return rank(left.path).localeCompare(rank(right.path));
  });
  const result = compileUnit(permutation, { lossPolicySha256: null, project: 'retail' });
  if (result.failures.length) throw new Error(JSON.stringify(result.failures));
  expect(result.findings.flatMap(file => file.issues)).toEqual([]);
  return bundleFiles(result, input, 'none');
}

const golden = new URL('../fixtures/tessera/mesh/golden/', import.meta.url);
if (process.env.WRITE_MESH_GOLDEN === '1') {
  for (const matching of orderedBundle(0)) await Bun.write(new URL(matching.path, golden), matching.bytes);
}

test('100 shuffled compilations from two folders produce the canonical mesh bundle', () => {
  const temporary = mkdtempSync(join(tmpdir(), 'mesh-determinism-'));
  try {
    const folders = ['first', 'second'].map(name => join(temporary, name));
    for (const folder of folders) {
      mkdirSync(folder);
      for (const file of files) writeFileSync(join(folder, file.path), file.bytes);
    }
    for (let index = 0; index < 100; index += 1) {
      const directory = folders[index % folders.length];
      const source = files.map(file => ({ path: file.path, bytes: readFileSync(join(directory, file.path)) }));
      for (const file of orderedBundle(index, source)) expect(Buffer.from(file.bytes)).toEqual(readFileSync(new URL(file.path, golden)));
    }
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

test('an unconnected root produces the legacy output', () => {
  const main = { name: 'Retail', version, ontology: [{ concept: 'Order', type: 'EntityType' }] };
  const older = compileUnit([file('root.json', { ...main, tessera: 2 })], { lossPolicySha256: null });
  const newer = compileUnit([file('root.json', { ...main, tessera: 3 })], { lossPolicySha256: null });
  expect(older.failures).toEqual([]);
  expect(newer.failures).toEqual([]);
  expect(newer.outputs).toEqual(older.outputs);
});
