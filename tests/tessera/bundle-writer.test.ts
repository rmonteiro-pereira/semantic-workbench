// Checks the bundle writer refuses unsafe output folders, never leaves a partial bundle and writes the files at their relative paths.
import { afterEach, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkTarget, writeBundle, writeFileDurably, type BundleTarget } from '../../src/server/tessera/bundle-writer';
import { TesseraRefusal } from '../../src/server/tessera/refusal';

const encoder = new TextEncoder();
const files = [
  { path: 'manifest.json', bytes: encoder.encode('{}\n') },
  { path: 'loss-report.json', bytes: encoder.encode('{}\n') },
  { path: 'retail/ontology.yaml', bytes: encoder.encode('name: Retail\n') },
];

const cleanups: string[] = [];
afterEach(() => {
  while (cleanups.length) rmSync(cleanups.pop()!, { recursive: true, force: true });
});

function scratch(): string {
  const folder = mkdtempSync(join(tmpdir(), 'tessera-bundle-'));
  cleanups.push(folder);
  return folder;
}

function setup() {
  const base = scratch();
  const repository = join(base, 'repository');
  const dataRoot = join(base, 'data');
  for (const folder of [repository, join(dataRoot, 'projects'), join(dataRoot, 'worktrees')]) mkdirSync(folder, { recursive: true });
  const target = (folder: string): BundleTarget => ({ folder, repository, dataRoot });
  return { base, repository, dataRoot, target };
}

test('a bundle is written at its relative paths into a new folder', () => {
  const { base, target } = setup();
  const out = join(base, 'out');
  writeBundle(target(out), files);
  expect(readdirSync(out).sort()).toEqual(['loss-report.json', 'manifest.json', 'retail']);
  expect(readFileSync(join(out, 'retail/ontology.yaml'), 'utf8')).toBe('name: Retail\n');
  expect(readdirSync(base).filter(name => name.includes('tessera-'))).toEqual([]);
});

test('an existing empty folder is accepted', () => {
  const { base, target } = setup();
  const out = join(base, 'empty');
  mkdirSync(out);
  writeBundle(target(out), files);
  expect(existsSync(join(out, 'manifest.json'))).toBe(true);
});

test('a folder that holds files is refused and left as it was', () => {
  const { base, target } = setup();
  const out = join(base, 'full');
  mkdirSync(out);
  writeFileSync(join(out, 'keep.txt'), 'keep');
  expect(() => writeBundle(target(out), files)).toThrow(TesseraRefusal);
  expect(readdirSync(out)).toEqual(['keep.txt']);
});

test('a path that is a file is refused', () => {
  const { base, target } = setup();
  const out = join(base, 'a-file');
  writeFileSync(out, 'x');
  expect(() => writeBundle(target(out), files)).toThrow('not a folder');
});

test('a folder inside the repository is refused and nothing is written', () => {
  const { repository, target } = setup();
  expect(() => writeBundle(target(join(repository, 'dist')), files)).toThrow('inside the repository');
  expect(readdirSync(repository)).toEqual([]);
});

test('a folder inside the data root projects or working copies is refused', () => {
  const { dataRoot, target } = setup();
  expect(() => writeBundle(target(join(dataRoot, 'projects', 'out')), files)).toThrow('projects folder');
  expect(() => writeBundle(target(join(dataRoot, 'worktrees', 'someone', 'out')), files)).toThrow('working copies');
});

test('a link into the repository cannot hide the real place of the output', () => {
  const { base, repository, target } = setup();
  const link = join(base, 'link');
  symlinkSync(repository, link);
  expect(() => writeBundle(target(join(link, 'dist')), files)).toThrow('inside the repository');
});

test('containment checks whole path components through direct paths and links', () => {
  const { base, repository, dataRoot, target } = setup();
  const parentLink = join(base, 'parent-link');
  symlinkSync(base, parentLink);
  for (const parent of [base, parentLink]) {
    expect(() => checkTarget(target(parent))).toThrow('not empty');
  }

  const sources = [repository, join(dataRoot, 'projects'), join(dataRoot, 'worktrees')];
  for (const [index, source] of sources.entries()) {
    for (const name of ['exports', '..exports']) {
      const child = join(source, name);
      const childLink = join(base, `link-${index}-${name}`);
      mkdirSync(child);
      symlinkSync(child, childLink);
      for (const folder of [child, childLink]) {
        expect(() => checkTarget(target(folder))).toThrow('inside');
      }
    }
  }
});

test('an interrupted write leaves nothing under the output name and removes the temporary folder', () => {
  const { base, target } = setup();
  const out = join(base, 'out');
  let writes = 0;
  const failing = (path: string, bytes: Uint8Array) => {
    if (++writes === 2) throw new Error('disk full');
    writeFileDurably(path, bytes);
  };
  expect(() => writeBundle(target(out), files, failing)).toThrow('disk full');
  expect(existsSync(out)).toBe(false);
  expect(readdirSync(base).filter(name => name.startsWith('.out'))).toEqual([]);
});

test('a path that leaves the bundle is refused', () => {
  const { base, target } = setup();
  const out = join(base, 'out');
  expect(() => writeBundle(target(out), [{ path: '../escape.txt', bytes: encoder.encode('x') }])).toThrow('not a safe path');
  expect(existsSync(out)).toBe(false);
});
