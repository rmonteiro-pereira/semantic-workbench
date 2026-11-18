import { expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';

test('the mesh modules and user guide named by the project documentation exist', () => {
  const text = ['README.md', 'ARCHITECTURE.md'].map(path => readFileSync(path, 'utf8')).join('\n');
  const paths = [...text.matchAll(/(?:`|\()((?:src|scripts|docs)\/[^)`#\s]+mesh[^)`#\s]*)(?:`|\))/g)].map(match => match[1]);
  expect(paths).toContain('src/server/mesh/provider-resolution.ts');
  expect(paths).toContain('src/server/mesh/dependents-registry.ts');
  for (const path of paths) expect(existsSync(path)).toBe(true);
  expect(readFileSync('docs/user-guide.md', 'utf8')).toContain('### Ontology units and imports');
  const commands = JSON.parse(readFileSync('package.json', 'utf8')).scripts;
  expect(commands['test:mesh']).toBe('bun scripts/mesh-browser-check.ts');
});
