// Proves the pinned upstream Ossie files are byte for byte the ones whose SHA-256 the schema README records.
import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SCHEMAS = join(import.meta.dir, '../../schemas');
const PINNED_FILES = ['ossie-0.3.0.dev0.json', 'ossie-spec-0.3.0.dev0.yaml', 'ossie-ontology-0.3.0.dev0.json', 'ossie-mapping-0.3.0.dev0.json'];

/** Reads the README's provenance table rows of the form | `upstream path` | `file` | `sha256` |. */
function recordedHashes(readme: string): Map<string, string> {
  const hashes = new Map<string, string>();
  for (const match of readme.matchAll(/^\| `[^`]+` \| `([^`]+)` \| `([0-9a-f]{64})` \|$/gm)) hashes.set(match[1], match[2]);
  return hashes;
}

function sha256Of(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

const recorded = recordedHashes(readFileSync(join(SCHEMAS, 'README.md'), 'utf8'));

test('the README records a hash for every pinned file and for nothing else', () => {
  expect([...recorded.keys()].sort()).toEqual([...PINNED_FILES].sort());
});

for (const file of PINNED_FILES) {
  test(`${file} matches its recorded SHA-256`, () => {
    expect(sha256Of(readFileSync(join(SCHEMAS, file)))).toBe(recorded.get(file)!);
  });
}

test('changing one byte of a pinned file changes its hash', () => {
  const bytes = new Uint8Array(readFileSync(join(SCHEMAS, PINNED_FILES[0])));
  bytes[0] = bytes[0] ^ 1;
  expect(sha256Of(bytes)).not.toBe(recorded.get(PINNED_FILES[0])!);
});

test('the pinned files declare the 0.3.0.dev0 development version', () => {
  for (const file of PINNED_FILES.filter(name => name.endsWith('.json'))) {
    const schema = JSON.parse(readFileSync(join(SCHEMAS, file), 'utf8'));
    expect(schema.properties.version.const).toBe('0.3.0.dev0');
  }
  expect(readFileSync(join(SCHEMAS, 'ossie-spec-0.3.0.dev0.yaml'), 'utf8')).toMatch(/^version: 0\.3\.0\.dev0$/m);
});
