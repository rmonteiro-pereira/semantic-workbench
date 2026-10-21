// Tests workspace indexing and file format recognition.
import { test, expect } from 'bun:test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createCache } from '../server/projects/cache';
import { createGit } from '../server/projects/git';
import { dataLayout } from '../server/projects/paths';
import { createScanner, serializationOf, indexBytes } from '../server/projects/scanner';
import { encode } from '../server/projects/atomic';
import { tempDataDir } from './helpers/temp-data-dir';
test('serializations come from extensions, with .owl sniffed', () => {
  expect(
    [
      'a.yaml',
      'a.yml',
      'a.odcs',
      'a.ossie',
      'a.json',
      'a.ttl',
      'a.shacl',
      'a.nt',
      'a.n3',
      'a.rdf',
      'a.xml',
      '.gitignore',
      'dir/.gitignore',
      'a.csv',
      'README.md',
      'a.yaml.workbench-tmp',
    ].map(p => serializationOf(p)),
  ).toEqual([
    'yaml',
    'yaml',
    'yaml',
    'yaml',
    'json',
    'turtle',
    'turtle',
    'ntriples',
    'n3',
    'rdfxml',
    'rdfxml',
    'gitignore',
    'gitignore',
    'unsupported',
    'unsupported',
    'unsupported',
  ]);
  expect(serializationOf('a.owl', '@prefix ex: <https://e/> .')).toBe('turtle');
  expect(serializationOf('a.owl', '<?xml version="1.0"?><rdf:RDF/>')).toBe('rdfxml');
});
test('indexing validates with the shared rules and keeps invalid supported files visible', () => {
  const ok = indexBytes('p', 'a.yaml', encode('name: T\nontology: [{concept: A}]'));
  expect(ok.file).toMatchObject({
    valid: true,
    visible: true,
    docType: 'Ossie ontology',
    serialization: 'yaml',
  });
  expect(ok.entities.map(e => e.name)).toContain('A');
  const bad = indexBytes('p', 'b.yaml', encode('name: [unclosed'));
  expect(bad.file).toMatchObject({ valid: false, visible: true });
  expect(bad.findings[0].severity).toBe('error');
  expect(indexBytes('p', 'c.csv', encode('a,b')).file).toMatchObject({
    visible: false,
    docType: 'unsupported',
  });
  expect(indexBytes('p', '.gitignore', encode('*.csv\n')).file).toMatchObject({
    visible: true,
    valid: true,
    docType: 'gitignore',
  });
  expect(indexBytes('p', 'd.yaml', new Uint8Array([0xff, 0xfe])).findings[0].code).toBe('encoding');
});
test('the scanner lists files through git ls-files, honours .gitignore and hides unsupported types', async () => {
  const d = tempDataDir();
  try {
    const layout = dataLayout(d.root);
    const git = createGit({ projectsRoot: layout.projects });
    const cache = createCache(layout.cache);
    const dir = join(layout.projects, 'p');
    mkdirSync(join(dir, 'nested'), { recursive: true });
    await git.init(dir);
    writeFileSync(join(dir, 'a.yaml'), 'name: T\nontology: [{concept: A}]');
    writeFileSync(join(dir, 'broken.ttl'), '@prefix ex: <https://e/> . ex:a ex:b');
    writeFileSync(join(dir, 'notes.csv'), 'a,b');
    writeFileSync(join(dir, 'ignored.yaml'), 'name: I\nontology: [{concept: I}]');
    writeFileSync(join(dir, 'nested', 'deep.yaml'), 'name: D\nontology: [{concept: D}]');
    writeFileSync(join(dir, '.gitignore'), 'ignored.yaml\n');
    const scanner = createScanner(layout, cache, git, () => true);
    const first = await scanner.scan('p');
    expect(first.changed.sort()).toEqual([
      '.gitignore',
      'a.yaml',
      'broken.ttl',
      'nested/deep.yaml',
      'notes.csv',
    ]);
    const files = Object.fromEntries(cache.files('p').map(f => [f.path, f]));
    expect(files['ignored.yaml']).toBeUndefined();
    expect(files['notes.csv'].visible).toBe(false);
    expect(files['broken.ttl']).toMatchObject({ visible: true, valid: false });
    expect(files['a.yaml']).toMatchObject({ valid: true, gitState: 'untracked' });
    expect((await scanner.scan('p')).changed).toEqual([]);
    writeFileSync(join(dir, '.gitignore'), 'ignored.yaml\n*.csv\n');
    const second = await scanner.scan('p');
    expect(second.removed).toEqual(['notes.csv']);
    expect(second.changed).toEqual(['.gitignore']);
    cache.close();
  } finally {
    d.cleanup();
  }
});
test('without Git the scanner walks the folder and skips .git', async () => {
  const d = tempDataDir();
  try {
    const layout = dataLayout(d.root);
    const cache = createCache(layout.cache);
    const dir = join(layout.projects, 'p');
    mkdirSync(join(dir, '.git'), { recursive: true });
    writeFileSync(join(dir, '.git', 'config'), 'x');
    writeFileSync(join(dir, 'a.yaml'), 'name: T\nontology: [{concept: A}]');
    const scanner = createScanner(
      layout,
      cache,
      createGit({ projectsRoot: layout.projects, binary: '/nonexistent/git' }),
      () => false,
    );
    expect((await scanner.scan('p')).changed).toEqual(['a.yaml']);
    expect(cache.file('p', 'a.yaml')!.gitState).toBe('unknown');
    cache.close();
  } finally {
    d.cleanup();
  }
});
