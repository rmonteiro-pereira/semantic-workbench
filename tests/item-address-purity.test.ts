/** Keeps the address grammar independent of runtime and application state. */
import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

test('address grammar modules use only pure shared dependencies', () => {
  for (const filename of ['address-kinds', 'item-address', 'model-addresses', 'address-migration']) {
    const source = readFileSync(`src/shared/core/${filename}.ts`, 'utf8');
    expect(source).not.toMatch(/\b(?:fetch|Date)\b|node:/);
    const imports = [...source.matchAll(/import\s+(type\s+)?[^;]*?from\s+['"]([^'"]+)['"]/g)];
    for (const match of imports) {
      if (match[1]) expect(match[2]).toBe('../edit/item-model');
      else expect(['./address-kinds', './item-address', '../validation/iri']).toContain(match[2]);
    }
  }
});
