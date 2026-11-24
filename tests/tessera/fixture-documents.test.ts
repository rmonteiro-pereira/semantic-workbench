// Checks every Tessera fixture document parses as YAML or JSON and that the folder's README lists it.
import { expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';

const folder = join(import.meta.dir, '../fixtures/tessera/documents');
const documents = readdirSync(folder).filter(name => name !== 'README.md');
const readme = readFileSync(join(folder, 'README.md'), 'utf8');

for (const name of documents) {
  test(`${name} parses and is listed in the README`, () => {
    const text = readFileSync(join(folder, name), 'utf8');
    const data = name.endsWith('.json') ? JSON.parse(text) : parse(text);
    expect(typeof data).toBe('object');
    expect(readme).toContain('`' + name + '`');
  });
}
